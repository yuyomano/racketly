import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { AppError } from '../middleware/error.middleware'
import { io } from '../index'

const router = Router()
const prisma = new PrismaClient()

// PUT /api/matches/:id/score — actualizar marcador (REST fallback para live scoring)
router.put('/:id/score', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sets, isFinished } = req.body
    const match = await prisma.match.findUnique({ where: { id: req.params.id } })
    if (!match) throw new AppError('Partido no encontrado', 404)

    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data: {
        score: sets,
        isLive: !isFinished,
        status: isFinished ? 'completed' : 'in_progress',
        finishedAt: isFinished ? new Date().toISOString() : undefined,
      },
    })

    // Emitir via WebSocket
    io.of('/live').to(`match:${req.params.id}`).emit('score:updated', {
      matchId: req.params.id,
      sets,
      isLive: !isFinished,
    })

    return res.json({ success: true, data: updated })
  } catch (err) { return next(err) }
})

// GET /api/matches/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        player1: { select: { displayName: true, avatarUrl: true, eloPadel: true, category: true } },
        player2: { select: { displayName: true, avatarUrl: true, eloPadel: true, category: true } },
        tournament: { select: { name: true, sport: true } },
      },
    })
    if (!match) throw new AppError('Partido no encontrado', 404)
    return res.json({ success: true, data: match })
  } catch (err) { return next(err) }
})

export { router as matchesRouter }
