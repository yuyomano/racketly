import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { AppError } from '../middleware/error.middleware'

const router = Router()
const prisma = new PrismaClient()

// POST /api/match-requests — publicar solicitud de pareja
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const request = await prisma.matchRequest.create({
      data: { ...req.body, status: 'open', expiresAt: expiresAt.toISOString() },
    })
    return res.status(201).json({ success: true, data: request })
  } catch (err) { return next(err) }
})

// GET /api/match-requests
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sport, city, date } = req.query
    const where: Record<string, unknown> = { status: 'open', expiresAt: { gt: new Date() } }
    if (sport) where.sport = sport
    if (city) where.city = { contains: city as string, mode: 'insensitive' }
    if (date) where.preferredDate = date

    const requests = await prisma.matchRequest.findMany({
      where,
      include: {
        requester: { select: { id: true, playerProfile: { select: { displayName: true, avatarUrl: true, category: true, eloPadel: true } } } },
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return res.json({ success: true, data: requests })
  } catch (err) { return next(err) }
})

// GET /api/match-requests/mine?userId= — mis solicitudes publicadas (con aplicantes)
router.get('/mine', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.query
    if (!userId) throw new AppError('userId es requerido', 400)

    const requests = await prisma.matchRequest.findMany({
      where: { requesterId: userId as string },
      include: {
        applications: {
          include: {
            applicant: { select: { id: true, playerProfile: { select: { displayName: true, avatarUrl: true, category: true, eloPadel: true } } } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    return res.json({ success: true, data: requests })
  } catch (err) { return next(err) }
})

// POST /api/match-requests/:id/apply — aplicar a una solicitud
router.post('/:id/apply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { applicantId, message } = req.body
    const request = await prisma.matchRequest.findUnique({ where: { id: req.params.id } })
    if (!request) throw new AppError('Solicitud no encontrada', 404)
    if (request.status !== 'open') throw new AppError('Esta solicitud ya no está disponible', 400)
    if (request.requesterId === applicantId) throw new AppError('No puedes aplicar a tu propia solicitud', 400)

    const existing = await prisma.matchApplication.findFirst({
      where: { requestId: req.params.id, applicantId },
    })
    if (existing) throw new AppError('Ya aplicaste a esta solicitud', 409)

    const application = await prisma.matchApplication.create({
      data: { requestId: req.params.id, applicantId, message, status: 'pending' },
    })
    return res.status(201).json({ success: true, data: application })
  } catch (err) { return next(err) }
})

// PUT /api/match-applications/:id/respond — aceptar o rechazar aplicación
router.put('/applications/:id/respond', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body // 'accepted' | 'rejected'
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
  } catch (err) { return next(err) }
})

export { router as partnerRouter }
