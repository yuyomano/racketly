import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { AppError } from '../middleware/error.middleware'
import { requireAuth } from '../middleware/auth.middleware'

const router = Router()
const prisma = new PrismaClient({ adapter: createPgAdapter() })

// Campos editables de una solicitud (creación y edición comparten las mismas reglas)
async function buildRequestData(req: Request) {
  const {
    sport,
    levelMin,
    levelMax,
    city,
    maxDistanceKm,
    preferredDate,
    timePreference,
    courtId,
    tournamentId,
    message,
  } = req.body

  if (tournamentId) {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } })
    if (!tournament) throw new AppError('Torneo no encontrado', 404)
  }

  return {
    ...(sport && { sport }),
    ...(levelMin && { levelMin }),
    ...(levelMax && { levelMax }),
    ...(city && { city }),
    ...(maxDistanceKm !== undefined && { maxDistanceKm: Number(maxDistanceKm) }),
    preferredDate: preferredDate || null,
    timePreference: timePreference || null,
    courtId: courtId || null,
    tournamentId: tournamentId || null,
    message: message || null,
  }
}

const tournamentSelect = {
  select: { id: true, name: true, startDate: true, category: true, genderCategory: true },
}

// POST /api/match-requests — publicar solicitud de pareja
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.body.sport || !req.body.levelMin || !req.body.levelMax || !req.body.city)
      throw new AppError('Faltan campos requeridos', 400)

    const data = await buildRequestData(req)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const request = await prisma.matchRequest.create({
      data: {
        ...data,
        requesterId: req.userId!,
        sport: req.body.sport,
        levelMin: req.body.levelMin,
        levelMax: req.body.levelMax,
        city: req.body.city,
        status: 'open',
        expiresAt,
      },
      include: { tournament: tournamentSelect },
    })
    return res.status(201).json({ success: true, data: request })
  } catch (err) {
    return next(err)
  }
})

// PUT /api/match-requests/:id — editar una solicitud propia (solo mientras sigue abierta)
router.put('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.matchRequest.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError('Solicitud no encontrada', 404)
    if (existing.requesterId !== req.userId)
      throw new AppError('No puedes editar la solicitud de otra persona', 403)
    if (existing.status !== 'open')
      throw new AppError('Solo puedes editar una solicitud mientras sigue abierta', 400)

    const data = await buildRequestData(req)
    const request = await prisma.matchRequest.update({
      where: { id: req.params.id },
      data,
      include: { tournament: tournamentSelect },
    })
    return res.json({ success: true, data: request })
  } catch (err) {
    return next(err)
  }
})

// GET /api/match-requests
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sport, city, date, tournamentId } = req.query
    const where: Record<string, unknown> = { status: 'open', expiresAt: { gt: new Date() } }
    if (sport) where.sport = sport
    if (city) where.city = { contains: city as string, mode: 'insensitive' }
    if (date) where.preferredDate = date
    if (tournamentId) where.tournamentId = tournamentId

    const requests = await prisma.matchRequest.findMany({
      where,
      include: {
        requester: {
          select: {
            id: true,
            playerProfile: {
              select: { displayName: true, avatarUrl: true, category: true, eloPadel: true },
            },
          },
        },
        tournament: tournamentSelect,
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return res.json({ success: true, data: requests })
  } catch (err) {
    return next(err)
  }
})

// GET /api/match-requests/mine — mis solicitudes publicadas (con aplicantes)
router.get('/mine', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requests = await prisma.matchRequest.findMany({
      where: { requesterId: req.userId },
      include: {
        tournament: tournamentSelect,
        applications: {
          include: {
            applicant: {
              select: {
                id: true,
                playerProfile: {
                  select: { displayName: true, avatarUrl: true, category: true, eloPadel: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    return res.json({ success: true, data: requests })
  } catch (err) {
    return next(err)
  }
})

// POST /api/match-requests/:id/apply — aplicar a una solicitud
router.post('/:id/apply', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body
    const applicantId = req.userId!
    const request = await prisma.matchRequest.findUnique({ where: { id: req.params.id } })
    if (!request) throw new AppError('Solicitud no encontrada', 404)
    if (request.status !== 'open') throw new AppError('Esta solicitud ya no está disponible', 400)
    if (request.requesterId === applicantId)
      throw new AppError('No puedes aplicar a tu propia solicitud', 400)

    const existing = await prisma.matchApplication.findFirst({
      where: { requestId: req.params.id, applicantId },
    })
    if (existing) throw new AppError('Ya aplicaste a esta solicitud', 409)

    const application = await prisma.matchApplication.create({
      data: { requestId: req.params.id, applicantId, message, status: 'pending' },
    })
    return res.status(201).json({ success: true, data: application })
  } catch (err) {
    return next(err)
  }
})

// PUT /api/match-applications/:id/respond — aceptar o rechazar aplicación
router.put(
  '/applications/:id/respond',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body // 'accepted' | 'rejected'
      if (!['accepted', 'rejected'].includes(status)) throw new AppError('Estado inválido', 400)

      const existing = await prisma.matchApplication.findUnique({
        where: { id: req.params.id },
        include: { request: { select: { requesterId: true } } },
      })
      if (!existing) throw new AppError('Aplicación no encontrada', 404)
      if (existing.request.requesterId !== req.userId)
        throw new AppError('No puedes responder aplicaciones de otra persona', 403)

      const application = await prisma.matchApplication.update({
        where: { id: req.params.id },
        data: { status, respondedAt: new Date().toISOString() },
      })

      // Si se acepta: cerrar la solicitud y rechazar automáticamente las otras aplicaciones
      if (status === 'accepted') {
        await prisma.matchRequest.update({
          where: { id: application.requestId },
          data: { status: 'matched' },
        })
        await prisma.matchApplication.updateMany({
          where: {
            requestId: application.requestId,
            id: { not: req.params.id },
            status: 'pending',
          },
          data: { status: 'rejected', respondedAt: new Date().toISOString() },
        })
      }

      return res.json({ success: true, data: application })
    } catch (err) {
      return next(err)
    }
  }
)

export { router as partnerRouter }
