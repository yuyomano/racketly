import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import multer from 'multer'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { authenticate } from '../middleware/auth.middleware'
import { AppError } from '../middleware/error.middleware'
import { validate, updateProfileSchema } from '../validators/auth.validators'
import { eloToCategory } from '@racketly/utils'
import { uploadImage } from '@racketly/utils/s3-media'
import { encodePlusCode, decodePlusCode } from '@racketly/utils/plus-code'

const router = Router()
const prisma = new PrismaClient({ adapter: createPgAdapter() })

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new AppError('Formato de imagen no soportado (usa JPG, PNG o WebP)', 400))
    }
    cb(null, true)
  },
})

// GET /api/profile/:userId — perfil público
router.get('/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.playerProfile.findUnique({
      where: { userId: req.params.userId },
      include: {
        user: { select: { subscriptionTier: true, createdAt: true } },
      },
    })
    if (!profile) throw new AppError('Perfil no encontrado', 404)
    return res.json({ success: true, data: profile })
  } catch (err) {
    return next(err)
  }
})

// PUT /api/profile — actualizar mi perfil
router.put(
  '/',
  authenticate,
  validate(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Whitelist explícita: nunca permitir que el cliente modifique ELO, category, level o xpPoints
      const {
        displayName,
        bio,
        city,
        country,
        sport,
        avatarUrl,
        preferredSide,
        instagramHandle,
        whatsapp,
        latitude,
        longitude,
        plusCode,
      } = req.body
      const data: Record<string, unknown> = {}
      if (displayName !== undefined) data.displayName = displayName
      if (bio !== undefined) data.bio = bio
      if (city !== undefined) data.city = city
      if (country !== undefined) data.country = country
      if (sport !== undefined) data.sport = sport
      if (avatarUrl !== undefined) data.avatarUrl = avatarUrl
      if (preferredSide !== undefined) data.preferredSide = preferredSide
      if (instagramHandle !== undefined) data.instagramHandle = instagramHandle
      if (whatsapp !== undefined) data.whatsapp = whatsapp

      // Ubicación: un Plus Code entrante manda sobre lat/long (se decodifica), y si en
      // cambio llegan lat/long sin Plus Code, se deriva uno para poder compartir la
      // ubicación como código corto.
      if (plusCode !== undefined) {
        if (plusCode === null) {
          data.plusCode = null
        } else {
          const decoded = decodePlusCode(plusCode)
          if (!decoded) throw new AppError('Plus Code inválido', 400)
          data.plusCode = plusCode.trim().toUpperCase()
          data.latitude = decoded.latitude
          data.longitude = decoded.longitude
        }
      } else if (latitude !== undefined && longitude !== undefined) {
        data.latitude = latitude
        data.longitude = longitude
        data.plusCode = encodePlusCode(latitude, longitude)
      }

      const updated = await prisma.playerProfile.update({
        where: { userId: req.user!.userId },
        data,
      })
      return res.json({ success: true, data: updated })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/profile/avatar — subir foto de perfil
router.post(
  '/avatar',
  authenticate,
  avatarUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError('No se recibió ninguna imagen', 400)

      const avatarUrl = await uploadImage(
        req.file.buffer,
        req.file.mimetype,
        `avatars/${req.user!.userId}`
      )

      const updated = await prisma.playerProfile.update({
        where: { userId: req.user!.userId },
        data: { avatarUrl },
      })
      return res.json({ success: true, data: updated })
    } catch (err) {
      return next(err)
    }
  }
)

// GET /api/profile/:userId/stats
router.get('/:userId/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.playerProfile.findUnique({
      where: { userId: req.params.userId },
    })
    if (!profile) throw new AppError('Perfil no encontrado', 404)

    const category = eloToCategory(profile.eloPadel)

    // Estadísticas de partidos
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ player1Id: req.params.userId }, { player2Id: req.params.userId }],
        status: 'completed',
      },
    })

    const wins = matches.filter((m) => m.winnerId === req.params.userId).length
    const losses = matches.length - wins

    return res.json({
      success: true,
      data: {
        profile,
        category,
        stats: {
          totalMatches: matches.length,
          wins,
          losses,
          winRate: matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0,
        },
      },
    })
  } catch (err) {
    return next(err)
  }
})

export { router as profileRouter }
