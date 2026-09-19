import { Server, Socket } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import {
  calculateElo,
  eloToCategory,
  determineWinner,
  applyLivePoint,
  initLiveMatchState,
  type LiveMatchState,
  type DeuceRule,
} from '@racketly/utils'
import type { SetScore } from '@racketly/shared-types'
import { propagateKnockoutWinner } from '../routes/tournaments.routes'
import { resolveFormatForMatch } from '../services/match-format.service'

const prisma = new PrismaClient({ adapter: createPgAdapter() })

// Estado punto a punto en memoria por partido — no se persiste (ver comentario en
// `LiveMatchState` en @racketly/utils). Si el proceso se reinicia, el marcador
// punto a punto se pierde pero los sets ya cerrados siguen en `Match.score`.
// `pointHistory` guarda el lado de cada punto jugado, solo para poder deshacer
// (`point:undo`) rejugando desde cero — más simple que un stack de estados.
const liveStates = new Map<string, { state: LiveMatchState; pointHistory: (1 | 2)[] }>()

/**
 * Live Scoring via Socket.IO
 *
 * Rooms: match:{matchId}
 *
 * Events emitidos por árbitro/jugador:
 *   point:add     → { matchId, side }               — punto a punto (nuevo)
 *   point:undo    → { matchId }                      — deshacer el último punto
 *   score:update  → { matchId, sets, isLive }         — marcador por sets (compatibilidad con app)
 *   match:finish  → { matchId, sets }                 — finalizar a mano (walkover, etc.)
 *
 * Events enviados a espectadores:
 *   live:state     → { matchId, ...LiveMatchState, deuceRule, format }
 *   score:updated  → { matchId, sets, isLive }
 *   match:finished → { matchId, winnerId, sets, eloChanges }
 */
export function setupLiveScoring(io: Server) {
  const scoreNs = io.of('/live')

  async function loadLiveState(matchId: string) {
    const existing = liveStates.get(matchId)
    if (existing) return existing

    const match = await prisma.match.findUnique({ where: { id: matchId } })
    if (!match) return null

    const initialServer = match.initialServer === 2 ? 2 : 1
    let state = initLiveMatchState(initialServer)
    const persistedSets = Array.isArray(match.score) ? (match.score as unknown as SetScore[]) : []
    state = { ...state, completedSets: persistedSets }
    if (match.status === 'completed' || match.status === 'walkover') {
      state = { ...state, matchWinner: match.winningSide === 2 ? 2 : match.winningSide === 1 ? 1 : null }
    }

    const entry = { state, pointHistory: [] as (1 | 2)[] }
    liveStates.set(matchId, entry)
    return entry
  }

  async function emitLiveState(matchId: string) {
    const entry = liveStates.get(matchId)
    if (!entry) return
    const match = await prisma.match.findUnique({ where: { id: matchId } })
    if (!match) return
    const format = await resolveFormatForMatch(prisma, match)
    scoreNs.to(`match:${matchId}`).emit('live:state', {
      matchId,
      ...entry.state,
      deuceRule: match.deuceRule as DeuceRule,
      format,
    })
  }

  async function finalizeMatch(matchId: string, sets: SetScore[]) {
    const match = await prisma.match.findUnique({ where: { id: matchId } })
    if (!match) return null

    const winnerPos = determineWinner(sets)
    const winnerId = winnerPos === 1 ? match.player1Id : match.player2Id

    await prisma.match.update({
      where: { id: matchId },
      data: {
        score: sets as object[],
        status: 'completed',
        isLive: false,
        finishedAt: new Date().toISOString(),
        winnerId: winnerId ?? undefined,
        winningSide: winnerPos ?? undefined,
      },
    })

    let eloChanges = null
    if (match.player1Id && match.player2Id && winnerId) {
      const [p1, p2] = await Promise.all([
        prisma.playerProfile.findUnique({ where: { userId: match.player1Id } }),
        prisma.playerProfile.findUnique({ where: { userId: match.player2Id } }),
      ])

      if (p1 && p2) {
        const player1Won = winnerId === match.player1Id
        const { newElo1, newElo2, delta1, delta2 } = calculateElo(p1.eloPadel, p2.eloPadel, player1Won)

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
              { playerId: p1.userId, matchId, eloBefore: p1.eloPadel, eloAfter: newElo1, delta: delta1 },
              { playerId: p2.userId, matchId, eloBefore: p2.eloPadel, eloAfter: newElo2, delta: delta2 },
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

    liveStates.delete(matchId)
    scoreNs.to(`match:${matchId}`).emit('match:finished', { matchId, winnerId, sets, eloChanges })
    return { winnerId, eloChanges }
  }

  scoreNs.on('connection', (socket: Socket) => {
    console.info(`[LiveScoring] Client connected: ${socket.id}`)

    socket.on('match:join', async (matchId: string) => {
      socket.join(`match:${matchId}`)
      console.info(`[LiveScoring] Socket ${socket.id} joined match:${matchId}`)
      const entry = await loadLiveState(matchId)
      if (!entry) return
      const match = await prisma.match.findUnique({ where: { id: matchId } })
      if (!match) return
      const format = await resolveFormatForMatch(prisma, match)
      socket.emit('live:state', {
        matchId,
        ...entry.state,
        deuceRule: match.deuceRule as DeuceRule,
        format,
      })
    })

    // Punto a punto — nuevo protocolo. `side` es 1 o 2.
    socket.on('point:add', async ({ matchId, side }: { matchId: string; side: 1 | 2 }) => {
      try {
        const entry = await loadLiveState(matchId)
        if (!entry) {
          socket.emit('error', { message: 'Partido no encontrado' })
          return
        }
        const match = await prisma.match.findUnique({ where: { id: matchId } })
        if (!match) return
        const format = await resolveFormatForMatch(prisma, match)
        const deuceRule = match.deuceRule as DeuceRule

        const nextState = applyLivePoint(entry.state, side, format, deuceRule)
        entry.state = nextState
        entry.pointHistory.push(side)

        // Persistir los sets cerrados igual que hacía score:update, para que
        // Match.score y la app de mobile (que solo lee sets) sigan funcionando.
        await prisma.match.update({
          where: { id: matchId },
          data: { score: nextState.completedSets as object[], isLive: true, status: 'in_progress' },
        })

        if (nextState.matchWinner) {
          await finalizeMatch(matchId, nextState.completedSets)
          return
        }

        await emitLiveState(matchId)
      } catch (err) {
        console.error('[LiveScoring] point:add error', err)
        socket.emit('error', { message: 'Error registrando el punto' })
      }
    })

    // Deshacer el último punto — se rejuega el historial completo desde cero (simple
    // y siempre consistente; el historial de un partido nunca es tan largo como para
    // que esto sea costoso).
    socket.on('point:undo', async ({ matchId }: { matchId: string }) => {
      try {
        const entry = await loadLiveState(matchId)
        if (!entry || entry.pointHistory.length === 0) return
        const match = await prisma.match.findUnique({ where: { id: matchId } })
        if (!match) return
        const format = await resolveFormatForMatch(prisma, match)
        const deuceRule = match.deuceRule as DeuceRule

        const history = entry.pointHistory.slice(0, -1)
        let state = initLiveMatchState(match.initialServer === 2 ? 2 : 1)
        for (const side of history) {
          state = applyLivePoint(state, side, format, deuceRule)
        }
        liveStates.set(matchId, { state, pointHistory: history })

        await prisma.match.update({
          where: { id: matchId },
          data: { score: state.completedSets as object[] },
        })

        await emitLiveState(matchId)
      } catch (err) {
        console.error('[LiveScoring] point:undo error', err)
        socket.emit('error', { message: 'Error deshaciendo el punto' })
      }
    })

    // Árbitro actualiza el marcador por sets (flujo previo, sigue disponible para
    // la app de mobile mientras no migre al protocolo punto a punto).
    socket.on('score:update', async ({ matchId, sets }: { matchId: string; sets: SetScore[] }) => {
      try {
        await prisma.match.update({
          where: { id: matchId },
          data: { score: sets as object[], isLive: true, status: 'in_progress' },
        })
        liveStates.delete(matchId)
        scoreNs.to(`match:${matchId}`).emit('score:updated', { matchId, sets, isLive: true })
      } catch (err) {
        console.error('[LiveScoring] score:update error', err)
        socket.emit('error', { message: 'Error actualizando marcador' })
      }
    })

    // Partido finalizado a mano (walkover, o flujo por sets de mobile)
    socket.on('match:finish', async ({ matchId, sets }: { matchId: string; sets: SetScore[] }) => {
      try {
        await finalizeMatch(matchId, sets)
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
