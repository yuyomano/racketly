import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { AppError } from '../middleware/error.middleware'
import { assertClubAdmin } from '../middleware/club-auth.middleware'

const router = Router()
const prisma = new PrismaClient()

// ─── GET /api/professors/:clubId — profesores de un club (staff + externos) ──
router.get('/:clubId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeInactive = req.query.all === '1'
    const professors = await prisma.clubProfessor.findMany({
      where: { clubId: req.params.clubId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    })
    return res.json({ success: true, data: professors })
  } catch (err) {
    return next(err)
  }
})

// ─── POST /api/professors — dar de alta un profesor (club o externo) ─────────
// Un profesor "del club" (isExternal=false) debe estar atado a un jugador
// registrado (userId) — así tiene datos completos (contacto, perfil) y cuenta
// como jugador activo en el club. Solo un profesor "externo" (invitado sin
// cuenta) puede quedar con nombre libre y sin userId.
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clubId, userId, name, avatarUrl, bio, phone, sport, isExternal, hourlyRate, currency } =
      req.body
    if (!clubId) throw new AppError('clubId es requerido', 400)
    if (typeof hourlyRate !== 'number' || hourlyRate < 0)
      throw new AppError('Tarifa por hora inválida', 400)
    await assertClubAdmin(req.headers['x-user-id'] as string | undefined, clubId)

    let resolvedName = name?.trim()
    if (!isExternal) {
      if (!userId) throw new AppError('Selecciona el jugador que será el profesor', 400)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true },
      })
      if (!user) throw new AppError('Jugador no encontrado', 404)
      const fullName =
        user.firstName || user.lastName
          ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
          : null
      resolvedName = resolvedName || fullName || user.email?.split('@')[0] || ''
    }
    if (!resolvedName) throw new AppError('El nombre del profesor es requerido', 400)

    const professor = await prisma.clubProfessor.create({
      data: {
        clubId,
        userId: isExternal ? null : userId,
        name: resolvedName,
        avatarUrl,
        bio,
        phone,
        sport: sport || 'padel',
        isExternal: !!isExternal,
        hourlyRate,
        currency: currency || 'USD',
      },
    })
    return res.status(201).json({ success: true, data: professor })
  } catch (err) {
    return next(err)
  }
})

// ─── PATCH /api/professors/:id — editar / activar / desactivar ───────────────
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      userId,
      name,
      avatarUrl,
      bio,
      phone,
      sport,
      isExternal,
      hourlyRate,
      currency,
      isActive,
    } = req.body

    const existing = await prisma.clubProfessor.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError('Profesor no encontrado', 404)
    await assertClubAdmin(req.headers['x-user-id'] as string | undefined, existing.clubId)
    const nextIsExternal = isExternal !== undefined ? !!isExternal : existing.isExternal
    const nextUserId = userId !== undefined ? userId : existing.userId

    // Solo se valida el vínculo con el jugador cuando el request realmente toca
    // userId/isExternal — así un PATCH que solo activa/desactiva o cambia la
    // tarifa no rompe profesores legacy que quedaron sin userId antes de este cambio.
    const data: Record<string, unknown> = {}
    if (userId !== undefined || isExternal !== undefined) {
      if (!nextIsExternal && !nextUserId)
        throw new AppError('Selecciona el jugador que será el profesor', 400)
      if (nextIsExternal) data.userId = null
      else if (userId !== undefined) data.userId = userId
    }
    if (name !== undefined) data.name = name
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl
    if (bio !== undefined) data.bio = bio
    if (phone !== undefined) data.phone = phone
    if (sport !== undefined) data.sport = sport
    if (isExternal !== undefined) data.isExternal = nextIsExternal
    if (hourlyRate !== undefined) data.hourlyRate = hourlyRate
    if (currency !== undefined) data.currency = currency
    if (isActive !== undefined) data.isActive = !!isActive

    const professor = await prisma.clubProfessor.update({ where: { id: req.params.id }, data })
    return res.json({ success: true, data: professor })
  } catch (err) {
    return next(err)
  }
})

export { router as professorsRouter }
