import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import { PrismaClient } from '@prisma/client'
import { AppError } from '../middleware/error.middleware'
import { requireAuth } from '../middleware/auth.middleware'
import { io } from '../index'

const router = Router()
const prisma = new PrismaClient()

// PUT /api/matches/:id/score — actualizar marcador (REST fallback para live scoring).
// Autorizado: cualquiera de los 4 jugadores en cancha (singles o dobles), el árbitro
// asignado, o el organizador del torneo (si el partido pertenece a uno).
router.put('/:id/score', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sets, isFinished } = req.body
    const match = await prisma.match.findUnique({ where: { id: req.params.id } })
    if (!match) throw new AppError('Partido no encontrado', 404)

    const allowedIds = new Set(
      [
        match.player1Id,
        match.player1PartnerId,
        match.player2Id,
        match.player2PartnerId,
        match.refereeId,
      ].filter((x): x is string => !!x)
    )
    let authorized = allowedIds.has(req.userId!)
    if (!authorized && match.tournamentId) {
      const tournament = await prisma.tournament.findUnique({
        where: { id: match.tournamentId },
        select: { organizerId: true },
      })
      authorized = tournament?.organizerId === req.userId
    }
    if (!authorized) throw new AppError('No puedes actualizar el marcador de este partido', 403)

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
  } catch (err) {
    return next(err)
  }
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
  } catch (err) {
    return next(err)
  }
})

export { router as matchesRouter }
