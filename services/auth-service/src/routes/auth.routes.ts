import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import bcrypt from 'bcryptjs'
import axios from 'axios'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import {
  generateTokenPair,
  verifyAndRotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  issuePasswordResetToken,
  consumePasswordResetToken,
} from '../services/token.service'
import { authenticate } from '../middleware/auth.middleware'
import { AppError } from '../middleware/error.middleware'
import {
  validate,
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.validators'
import { INITIAL_ELO } from '@racketly/utils'
import { encryptPII, decryptPII } from '@racketly/utils/pii-crypto'

const router = Router()
const prisma = new PrismaClient({ adapter: createPgAdapter() })

// Límite más estricto que el global del servicio, solo para las rutas más sensibles
// a fuerza bruta / credential stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos. Intenta más tarde.' },
})

// El de forgot-password es más estricto — abusarlo significa bombardear de emails
// la bandeja de otra persona, no solo probar contraseñas propias.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos. Intenta más tarde.' },
})

// authLimiter no sirve para /refresh: todo el tráfico llega al auth-service desde la
// IP del gateway (proxy interno, sin trust proxy/X-Forwarded-For), así que por IP el
// límite queda compartido entre TODOS los usuarios de la plataforma — el refresh
// silencioso del middleware web (cada ~13 min por sesión) lo agota con poco tráfico y
// bloquea el refresh de usuarios random con 429. /refresh ya exige un refresh token
// válido (no es fuerza bruta de credenciales como /login), así que limitamos por
// usuario en vez de por IP.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos. Intenta más tarde.' },
  keyGenerator: (req) => {
    const decoded = jwt.decode(req.body?.refreshToken) as { userId?: string } | null
    return decoded?.userId || req.ip || 'unknown'
  },
})

const WEB_URL = process.env.WEB_URL || 'http://localhost:3010'
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006'

// POST /api/auth/register
router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, displayName, phone, country, city, sport } = req.body

      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) throw new AppError('Este email ya está registrado', 409)

      const passwordHash = await bcrypt.hash(password, 12)

      const user = await prisma.user.create({
        data: {
          email,
          phone: encryptPII(phone),
          passwordHash,
          subscriptionTier: 'free',
          playerProfile: {
            create: {
              displayName,
              country,
              city,
              sport,
              eloPadel: INITIAL_ELO,
              eloPickleball: INITIAL_ELO,
              category: 'C4',
              xpPoints: 0,
              level: 1,
            },
          },
        },
        include: { playerProfile: true },
      })

      const tokens = await generateTokenPair({
        userId: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
      })

      return res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            subscriptionTier: user.subscriptionTier,
            profile: user.playerProfile,
          },
          ...tokens,
        },
      })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/auth/invite — admin crea un jugador (nombre + email) y le envía invitación para completar su cuenta
router.post('/invite', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, invitedBy, sport } = req.body
    if (!name?.trim()) throw new AppError('El nombre es requerido', 400)
    if (!email?.trim()) throw new AppError('El email es requerido', 400)

    const normalizedEmail = email.trim().toLowerCase()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) throw new AppError('El email no es válido', 400)

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) throw new AppError('Ya existe un usuario registrado con ese email', 409)

    const [firstName, ...rest] = name.trim().split(/\s+/)
    const lastName = rest.join(' ') || null

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        firstName,
        lastName,
        subscriptionTier: 'free',
        playerProfile: {
          create: {
            displayName: name.trim(),
            country: '',
            city: '',
            sport: sport ?? 'padel',
            eloPadel: INITIAL_ELO,
            eloPickleball: INITIAL_ELO,
            category: 'C4',
            xpPoints: 0,
            level: 1,
          },
        },
        accountInvite: {
          create: {
            invitedBy: invitedBy ?? 'admin',
            expiresAt,
          },
        },
      },
      include: { playerProfile: true, accountInvite: true },
    })

    const inviteLink = `${WEB_URL}/invite/aceptar?token=${user.accountInvite!.token}`

    // Envío de email best-effort — si el notification-service no está disponible, el link sigue disponible en la respuesta
    try {
      await axios.post(
        `${NOTIFICATION_SERVICE_URL}/api/notifications/email`,
        {
          to: normalizedEmail,
          subject: 'Te invitaron a Racketly',
          html: `<p>Hola ${name.trim()},</p><p>Te han creado una cuenta en Racketly. Completa tu registro aquí:</p><p><a href="${inviteLink}">${inviteLink}</a></p><p>Este link expira en 7 días.</p>`,
        },
        { timeout: 3000 }
      )
    } catch {
      /* best-effort, el link queda disponible en la respuesta igualmente */
    }

    return res.status(201).json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, displayName: user.playerProfile?.displayName },
        invite: {
          token: user.accountInvite!.token,
          link: inviteLink,
          expiresAt: user.accountInvite!.expiresAt,
        },
      },
    })
  } catch (err) {
    return next(err)
  }
})

// GET /api/auth/invite/:token — datos de la invitación (para la pantalla de aceptar)
router.get('/invite/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invite = await prisma.accountInvite.findUnique({
      where: { token: req.params.token },
      include: { user: { include: { playerProfile: true } } },
    })
    if (!invite) throw new AppError('Invitación no encontrada', 404)
    if (invite.acceptedAt) throw new AppError('Esta invitación ya fue utilizada', 400)
    if (invite.expiresAt < new Date()) throw new AppError('Esta invitación expiró', 400)

    return res.json({
      success: true,
      data: { email: invite.user.email, name: invite.user.playerProfile?.displayName ?? '' },
    })
  } catch (err) {
    return next(err)
  }
})

// POST /api/auth/invite/:token/accept — el jugador define su contraseña y activa la cuenta
router.post('/invite/:token/accept', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body
    if (!password || password.length < 8)
      throw new AppError('La contraseña debe tener al menos 8 caracteres', 400)

    const invite = await prisma.accountInvite.findUnique({
      where: { token: req.params.token },
      include: { user: true },
    })
    if (!invite) throw new AppError('Invitación no encontrada', 404)
    if (invite.acceptedAt) throw new AppError('Esta invitación ya fue utilizada', 400)
    if (invite.expiresAt < new Date()) throw new AppError('Esta invitación expiró', 400)

    const passwordHash = await bcrypt.hash(password, 12)

    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: invite.userId },
        data: { passwordHash },
        include: { playerProfile: true },
      }),
      prisma.accountInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    ])

    const tokens = await generateTokenPair({
      userId: user.id,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
    })

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          subscriptionTier: user.subscriptionTier,
          profile: user.playerProfile,
        },
        ...tokens,
      },
    })
  } catch (err) {
    return next(err)
  }
})

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body

      const user = await prisma.user.findUnique({
        where: { email },
        include: { playerProfile: true },
      })

      if (!user) throw new AppError('Credenciales incorrectas', 401)
      if (user.deletedAt) throw new AppError('Credenciales incorrectas', 401)
      if (!user.passwordHash)
        throw new AppError('Esta cuenta usa Google Sign-In. Inicia sesión con Google.', 400)

      const isMatch = await bcrypt.compare(password, user.passwordHash)
      if (!isMatch) throw new AppError('Credenciales incorrectas', 401)

      const tokens = await generateTokenPair({
        userId: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
      })

      return res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            subscriptionTier: user.subscriptionTier,
            profile: user.playerProfile,
          },
          ...tokens,
        },
      })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/auth/refresh
router.post(
  '/refresh',
  refreshLimiter,
  validate(refreshSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body
      // Decodifica sin verificar todavía, solo para saber a quién buscar — la verificación
      // real (firma + vigencia en DB) ocurre dentro de verifyAndRotateRefreshToken.
      const unsafeDecoded = jwt.decode(refreshToken) as { userId?: string } | null
      if (!unsafeDecoded?.userId) throw new AppError('Refresh token inválido o expirado', 401)

      const user = await prisma.user.findUnique({ where: { id: unsafeDecoded.userId } })
      if (!user) throw new AppError('Refresh token inválido o expirado', 401)

      const tokens = await verifyAndRotateRefreshToken(refreshToken, {
        userId: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
      })

      return res.json({ success: true, data: tokens })
    } catch {
      return next(new AppError('Refresh token inválido o expirado', 401))
    }
  }
)

// POST /api/auth/forgot-password — siempre responde igual, exista o no el email,
// para no revelar qué correos están registrados.
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body
      const genericResponse = {
        success: true,
        message: 'Si el email está registrado, te enviamos un link para restablecer tu contraseña.',
      }

      const user = await prisma.user.findUnique({ where: { email } })
      if (!user || !user.passwordHash) {
        // Sin cuenta, o cuenta solo-Google (no tiene contraseña que resetear) — misma respuesta.
        return res.json(genericResponse)
      }

      const token = await issuePasswordResetToken(user.id)
      const resetLink = `${WEB_URL}/reset-password?token=${token}`

      try {
        await axios.post(
          `${NOTIFICATION_SERVICE_URL}/api/notifications/email`,
          {
            to: user.email,
            subject: 'Restablecer tu contraseña de Racketly',
            html: `<p>Recibimos una solicitud para restablecer tu contraseña.</p><p><a href="${resetLink}">${resetLink}</a></p><p>Este link expira en 1 hora. Si no fuiste tú, ignora este correo.</p>`,
          },
          { timeout: 3000 }
        )
      } catch {
        /* best-effort — no delatamos al usuario si el envío falla */
      }

      return res.json(genericResponse)
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, password } = req.body

      let userId: string
      try {
        userId = await consumePasswordResetToken(token)
      } catch {
        throw new AppError('Este link es inválido o ya expiró', 400)
      }

      const passwordHash = await bcrypt.hash(password, 12)
      const user = await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
        include: { playerProfile: true },
      })

      // Cambiar la contraseña cierra todas las sesiones activas — si alguien más
      // tenía acceso con la contraseña vieja, este es el momento de cortarlo.
      await revokeAllUserRefreshTokens(userId)

      const tokens = await generateTokenPair({
        userId: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
      })

      return res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            subscriptionTier: user.subscriptionTier,
            profile: user.playerProfile,
          },
          ...tokens,
        },
      })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/auth/google
// Acepta un accessToken de Google, obtiene los datos del usuario y hace find-or-create
router.post('/google', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { accessToken } = req.body
    if (!accessToken) throw new AppError('accessToken requerido', 400)

    // Obtener info del usuario desde Google
    const googleRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const { id: googleId, email, name, picture } = googleRes.data

    if (!email) throw new AppError('No se pudo obtener el email de Google', 400)

    // Buscar usuario existente por googleId o email
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
      include: { playerProfile: true },
    })

    if (user) {
      // Usuario existente — solo vincular automáticamente si NO tiene contraseña
      // (cuenta creada originalmente por Google, p.ej. sin googleId por algún motivo).
      // Si ya tiene passwordHash, vincular por email a ciegas permitiría un account
      // takeover: cualquiera que registre una cuenta Google con ese mismo email podría
      // apropiarse de la cuenta existente. En ese caso, pedimos loguearse con password.
      if (!user.googleId) {
        if (user.passwordHash) {
          throw new AppError(
            'Esta cuenta usa contraseña. Inicia sesión con tu contraseña para vincular Google desde tu perfil.',
            409
          )
        }
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId, avatarUrl: picture },
          include: { playerProfile: true },
        })
      }
    } else {
      // Usuario nuevo — crear con perfil inicial
      const displayName = name || email.split('@')[0]
      user = await prisma.user.create({
        data: {
          email,
          googleId,
          avatarUrl: picture,
          subscriptionTier: 'free',
          playerProfile: {
            create: {
              displayName,
              country: '',
              city: '',
              sport: 'padel',
              eloPadel: INITIAL_ELO,
              eloPickleball: INITIAL_ELO,
              category: 'C4',
              xpPoints: 0,
              level: 1,
            },
          },
        },
        include: { playerProfile: true },
      })
    }

    const tokens = await generateTokenPair({
      userId: user.id,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
    })

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          subscriptionTier: user.subscriptionTier,
          profile: user.playerProfile,
          avatarUrl: user.avatarUrl,
        },
        ...tokens,
        isNewUser: !user.playerProfile?.city, // frontend puede redirigir a completar perfil
      },
    })
  } catch (err: any) {
    if (err.response?.status === 401)
      return next(new AppError('Token de Google inválido o expirado', 401))
    return next(err)
  }
})

// PATCH /api/auth/me — cambiar email, contraseña y/o datos personales
router.patch('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      email,
      currentPassword,
      newPassword,
      firstName,
      lastName,
      phone,
      documentType,
      documentNumber,
      birthDate,
      pushToken,
      pushEnabled,
      units,
      language,
      profileVisibility,
    } = req.body
    const userId = req.user!.userId

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError('Usuario no encontrado', 404)

    if (units !== undefined && !['km', 'mi'].includes(units))
      throw new AppError('units inválido', 400)
    if (language !== undefined && !['es', 'en'].includes(language))
      throw new AppError('language inválido', 400)
    if (profileVisibility !== undefined && !['public', 'private'].includes(profileVisibility))
      throw new AppError('profileVisibility inválido', 400)

    const updateData: Record<string, unknown> = {}

    if (email && email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) throw new AppError('Este email ya está en uso', 409)
      updateData.email = email
    }

    if (newPassword) {
      if (!currentPassword) throw new AppError('Se requiere la contraseña actual', 400)
      if (!user.passwordHash)
        throw new AppError('Esta cuenta usa Google Sign-In. No puedes cambiar la contraseña.', 400)
      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!isMatch) throw new AppError('Contraseña actual incorrecta', 401)
      updateData.passwordHash = await bcrypt.hash(newPassword, 12)
    }

    if (firstName !== undefined) updateData.firstName = firstName || null
    if (lastName !== undefined) updateData.lastName = lastName || null
    if (phone !== undefined) updateData.phone = phone ? encryptPII(phone) : null
    if (documentType !== undefined) updateData.documentType = documentType || null
    if (documentNumber !== undefined)
      updateData.documentNumber = documentNumber ? encryptPII(documentNumber) : null
    if (birthDate !== undefined) updateData.birthDate = birthDate ? encryptPII(birthDate) : null
    if (pushToken !== undefined) updateData.pushToken = pushToken || null
    if (pushEnabled !== undefined) updateData.pushEnabled = !!pushEnabled
    if (units !== undefined) updateData.units = units
    if (language !== undefined) updateData.language = language
    if (profileVisibility !== undefined) updateData.profileVisibility = profileVisibility

    if (Object.keys(updateData).length === 0) {
      return res.json({ success: true, message: 'Sin cambios' })
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        documentType: true,
        documentNumber: true,
        birthDate: true,
        pushToken: true,
        pushEnabled: true,
        units: true,
        language: true,
        profileVisibility: true,
      },
    })

    return res.json({
      success: true,
      data: {
        ...updated,
        phone: decryptPII(updated.phone),
        documentNumber: decryptPII(updated.documentNumber),
        birthDate: decryptPII(updated.birthDate),
      },
    })
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/auth/me — baja de cuenta (soft delete: anonimiza PII, revoca sesiones,
// nunca borra la fila — evita romper FKs de reservas/torneos/posts históricos ya jugados).
router.delete('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body
    const userId = req.user!.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError('Usuario no encontrado', 404)
    if (user.deletedAt) throw new AppError('Esta cuenta ya fue eliminada', 400)

    if (user.passwordHash) {
      if (!password) throw new AppError('Se requiere la contraseña para eliminar la cuenta', 400)
      const isMatch = await bcrypt.compare(password, user.passwordHash)
      if (!isMatch) throw new AppError('Contraseña incorrecta', 401)
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          email: `deleted+${userId}@racketly.invalid`,
          passwordHash: null,
          googleId: null,
          phone: null,
          documentNumber: null,
          documentType: null,
          birthDate: null,
          avatarUrl: null,
          pushToken: null,
          deletedAt: new Date(),
        },
      }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ])

    return res.json({ success: true, message: 'Cuenta eliminada' })
  } catch (err) {
    return next(err)
  }
})

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  const { refreshToken } = req.body
  if (refreshToken) await revokeRefreshToken(refreshToken)
  return res.json({ success: true, message: 'Sesión cerrada' })
})

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { playerProfile: true, instructorProfile: true },
    })
    if (!user) throw new AppError('Usuario no encontrado', 404)

    return res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        phone: decryptPII(user.phone),
        firstName: user.firstName,
        lastName: user.lastName,
        documentType: user.documentType,
        documentNumber: decryptPII(user.documentNumber),
        birthDate: decryptPII(user.birthDate),
        avatarUrl: user.avatarUrl,
        subscriptionTier: user.subscriptionTier,
        pushEnabled: user.pushEnabled,
        units: user.units,
        language: user.language,
        profileVisibility: user.profileVisibility,
        playerProfile: user.playerProfile,
        instructorProfile: user.instructorProfile,
        createdAt: user.createdAt,
      },
    })
  } catch (err) {
    return next(err)
  }
})

export { router as authRouter }
