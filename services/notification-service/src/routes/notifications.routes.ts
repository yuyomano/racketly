import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { AppError } from '../middleware/error.middleware'

// Express 5 tipa los params de ruta como string | string[] (soporte para rutas con
// params repetidos, que este repo no usa) — angostamos a string.
type Request = ExpressRequest<Record<string, string>>

const prisma = new PrismaClient({ adapter: createPgAdapter() })
const router = Router()

// Exige x-user-id, inyectado por el gateway desde el JWT verificado — nunca confiar
// en un userId del body/query para no dejar leer/marcar notificaciones ajenas.
function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const userId = req.headers['x-user-id'] as string | undefined
  if (!userId) return next(new AppError('Autenticación requerida', 401))
  req.userId = userId
  next()
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

// GET /api/notifications — mis notificaciones, más recientes primero
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return res.json({ success: true, data: notifications })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } })
    if (!notification || notification.userId !== req.userId)
      throw new AppError('Notificación no encontrada', 404)
    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    })
    return res.json({ success: true, data: updated })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/notifications/read-all
router.patch('/read-all', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId, isRead: false },
      data: { isRead: true },
    })
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export { router as notificationsRouter }
