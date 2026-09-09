import { Server, Socket } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { calculateElo, eloToCategory } from '@racketly/utils'
import { determineWinner } from '@racketly/utils'
import type { SetScore } from '@racketly/shared-types'
import { propagateKnockoutWinner } from '../routes/tournaments.routes'

const prisma = new PrismaClient({ adapter: createPgAdapter() })

/**
 * Live Scoring via Socket.IO
 *
 * Rooms: match:{matchId}
 *
 * Events emitidos por árbitro/jugador:
 *   score:update  → { matchId, sets: SetScore[], isLive }
 *   match:finish  → { matchId, sets: SetScore[] }
 *
 * Events enviados a espectadores:
 *   score:updated → { matchId, sets, winnerId?, isLive }
 *   match:finished → { matchId, winnerId, sets, eloChanges }
 */
export function setupLiveScoring(io: Server) {
  const scoreNs = io.of('/live')

  scoreNs.on('connection', (socket: Socket) => {
    console.info(`[LiveScoring] Client connected: ${socket.id}`)

    // Unirse al room de un partido
    socket.on('match:join', (matchId: string) => {
      socket.join(`match:${matchId}`)
      console.info(`[LiveScoring] Socket ${socket.id} joined match:${matchId}`)
    })

    // Árbitro actualiza el marcador en tiempo real
    socket.on('score:update', async ({ matchId, sets }: { matchId: string; sets: SetScore[] }) => {
      try {
        await prisma.match.update({
          where: { id: matchId },
          data: { score: sets as object[], isLive: true, status: 'in_progress' },
        })

        // Broadcast a todos en el room
        scoreNs.to(`match:${matchId}`).emit('score:updated', { matchId, sets, isLive: true })
      } catch (err) {
        console.error('[LiveScoring] score:update error', err)
        socket.emit('error', { message: 'Error actualizando marcador' })
      }
    })

    // Partido finalizado — calcular ELO y guardar resultado
    socket.on('match:finish', async ({ matchId, sets }: { matchId: string; sets: SetScore[] }) => {
      try {
        const match = await prisma.match.findUnique({ where: { id: matchId } })
        if (!match) {
          socket.emit('error', { message: 'Partido no encontrado' })
          return
        }

        const winnerPos = determineWinner(sets)
        const winnerId = winnerPos === 1 ? match.player1Id : match.player2Id

        // Actualizar partido
        await prisma.match.update({
          where: { id: matchId },
          data: {
            score: sets as object[],
            status: 'completed',
            isLive: false,
            finishedAt: new Date().toISOString(),
            winnerId: winnerId ?? undefined,
          },
        })

        // Calcular nuevo ELO para ambos jugadores
        let eloChanges = null
        if (match.player1Id && match.player2Id && winnerId) {
          const [p1, p2] = await Promise.all([
            prisma.playerProfile.findUnique({ where: { userId: match.player1Id } }),
            prisma.playerProfile.findUnique({ where: { userId: match.player2Id } }),
          ])

          if (p1 && p2) {
            const player1Won = winnerId === match.player1Id
            const { newElo1, newElo2, delta1, delta2 } = calculateElo(
              p1.eloPadel,
              p2.eloPadel,
              player1Won
            )

            await Promise.all([
              prisma.playerProfile.update({
                where: { userId: p1.userId },
                data: { eloPadel: newElo1, category: eloToCategory(newElo1) },
              }),
              prisma.playerProfile.update({
                where: { userId: p2.userId },
                data: { eloPadel: newElo2, category: eloToCategory(newElo2) },
              }),
              prisma.eloHistory.createMany({
                data: [
                  {
                    playerId: p1.userId,
                    matchId,
                    eloBefore: p1.eloPadel,
                    eloAfter: newElo1,
                    delta: delta1,
                  },
                  {
                    playerId: p2.userId,
                    matchId,
                    eloBefore: p2.eloPadel,
                    eloAfter: newElo2,
                    delta: delta2,
                  },
                ],
              }),
            ])

            eloChanges = {
              [p1.userId]: { before: p1.eloPadel, after: newElo1, delta: delta1 },
              [p2.userId]: { before: p2.eloPadel, after: newElo2, delta: delta2 },
            }
          }
        }

        if (winnerId && match.tournamentId) {
          await propagateKnockoutWinner(match.tournamentId, matchId)
        }

        scoreNs
          .to(`match:${matchId}`)
          .emit('match:finished', { matchId, winnerId, sets, eloChanges })
      } catch (err) {
        console.error('[LiveScoring] match:finish error', err)
        socket.emit('error', { message: 'Error finalizando partido' })
      }
    })

    socket.on('disconnect', () => {
      console.info(`[LiveScoring] Client disconnected: ${socket.id}`)
    })
  })
}
