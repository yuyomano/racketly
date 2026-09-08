import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import { PrismaClient } from '@prisma/client'
import { AppError } from '../middleware/error.middleware'
import { requireAuth } from '../middleware/auth.middleware'
import {
  matchFormatDurationMinutes,
  resolveMatchFormat,
  knockoutStageKeyForRound,
  matchFormatMaxSets,
  pairKey,
  PairWorkloadTracker,
  findWorkloadEligibleStart,
  type MatchFormatOverrides,
} from '@racketly/utils'
import { sanitizeSchedulingWindows, windowsToMs, nextPlayable } from '../lib/scheduling-windows'

const router = Router()
const prisma = new PrismaClient()

// ─── GET /api/tournament-events?clubId=... — eventos de un club ──────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clubId, status } = req.query
    const where: Record<string, unknown> = {}
    if (clubId) where.clubId = clubId
    if (status) where.status = status
    const events = await prisma.tournamentEvent.findMany({
      where,
      orderBy: { startDate: 'asc' },
      include: {
        tournaments: {
          select: {
            id: true,
            name: true,
            category: true,
            genderCategory: true,
            status: true,
            sport: true,
          },
        },
      },
    })
    return res.json({ success: true, data: events })
  } catch (err) {
    return next(err)
  }
})

// ─── GET /api/tournament-events/:id — detalle con sus torneos ────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await prisma.tournamentEvent.findUnique({
      where: { id: req.params.id },
      include: { tournaments: true, club: { select: { id: true, name: true } } },
    })
    if (!event) throw new AppError('Evento no encontrado', 404)
    return res.json({ success: true, data: event })
  } catch (err) {
    return next(err)
  }
})

// ─── POST /api/tournament-events — crear evento (agrupador de torneos) ───────
// ponytail: no valida que req.userId administre `clubId` (mismo corte que en tournaments.routes.ts).
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clubId, name, description, startDate, endDate, schedulingWindows } = req.body
    if (!clubId) throw new AppError('clubId es requerido', 400)
    if (!name?.trim()) throw new AppError('El nombre del evento es requerido', 400)
    if (!startDate || !endDate) throw new AppError('startDate y endDate son requeridos', 400)
    if (new Date(endDate) < new Date(startDate))
      throw new AppError('endDate no puede ser anterior a startDate', 400)

    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true } })
    if (!club) throw new AppError('Club no encontrado', 404)

    const event = await prisma.tournamentEvent.create({
      data: {
        clubId,
        organizerId: req.userId!,
        name: name.trim(),
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        schedulingWindows: sanitizeSchedulingWindows(schedulingWindows) ?? undefined,
      },
    })
    return res.status(201).json({ success: true, data: event })
  } catch (err) {
    return next(err)
  }
})

// ─── PATCH /api/tournament-events/:id — editar datos / estado del evento ─────
router.patch('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, startDate, endDate, status, schedulingWindows } = req.body
    const existing = await prisma.tournamentEvent.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError('Evento no encontrado', 404)
    if (existing.organizerId !== req.userId)
      throw new AppError('Solo el organizador puede editar este evento', 403)

    const data: Record<string, unknown> = {}
    if (name !== undefined) {
      if (!name.trim()) throw new AppError('El nombre del evento no puede quedar vacío', 400)
      data.name = name.trim()
    }
    if (description !== undefined) data.description = description
    if (startDate !== undefined) data.startDate = new Date(startDate)
    if (endDate !== undefined) data.endDate = new Date(endDate)
    if (status !== undefined) data.status = status
    if (schedulingWindows !== undefined) {
      if (schedulingWindows === null) {
        data.schedulingWindows = null
      } else {
        const sanitized = sanitizeSchedulingWindows(schedulingWindows)
        if (!sanitized)
          throw new AppError(
            'schedulingWindows inválido — cada franja necesita date (YYYY-MM-DD), openTime y closeTime (HH:MM) con closeTime > openTime',
            400
          )
        data.schedulingWindows = sanitized
      }
    }

    const event = await prisma.tournamentEvent.update({ where: { id: req.params.id }, data })
    return res.json({ success: true, data: event })
  } catch (err) {
    return next(err)
  }
})

// ─── DELETE /api/tournament-events/:id — solo si no tiene torneos asociados ──
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await prisma.tournamentEvent.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { tournaments: true } } },
    })
    if (!event) throw new AppError('Evento no encontrado', 404)
    if (event.organizerId !== req.userId)
      throw new AppError('Solo el organizador puede eliminar este evento', 403)
    if (event._count.tournaments > 0) {
      throw new AppError(
        'No se puede eliminar un evento con torneos asociados — desvincúlalos primero',
        400
      )
    }
    await prisma.tournamentEvent.delete({ where: { id: req.params.id } })
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// ─── GET /api/tournament-events/:id/matches — agenda completa (pista + hora) ─
// Todos los partidos de todos los torneos del evento, con nombre de pista y
// duración resuelta, para pintar una grilla horas×pistas en el dashboard.
router.get('/:id/matches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await prisma.tournamentEvent.findUnique({
      where: { id: req.params.id },
      include: { tournaments: true },
    })
    if (!event) throw new AppError('Evento no encontrado', 404)

    const tournamentCtx = new Map<
      string,
      { baseFormat: string; overrides: MatchFormatOverrides | null; maxKnockoutRound: number }
    >()
    for (const t of event.tournaments) {
      const maxRoundAgg = await prisma.match.aggregate({
        where: { tournamentId: t.id, stage: 'knockout' },
        _max: { round: true },
      })
      tournamentCtx.set(t.id, {
        baseFormat: t.matchFormat,
        overrides: (t.matchFormatOverrides as MatchFormatOverrides | null) ?? null,
        maxKnockoutRound: maxRoundAgg._max.round ?? 0,
      })
    }

    const matches = await prisma.match.findMany({
      where: { tournamentId: { in: event.tournaments.map((t) => t.id) } },
      orderBy: [{ scheduledAt: 'asc' }],
      include: {
        player1: { select: { displayName: true } },
        player2: { select: { displayName: true } },
      },
    })

    // Nombre de pareja por jugador — solo torneos de tipo "pairs" tienen partnerId.
    const pairsTournamentIds = event.tournaments.filter((t) => t.type === 'pairs').map((t) => t.id)
    const participants = pairsTournamentIds.length
      ? await prisma.tournamentParticipant.findMany({
          where: { tournamentId: { in: pairsTournamentIds } },
          select: { playerId: true, partnerId: true, player: { select: { displayName: true } } },
        })
      : []
    const nameByPlayerId = new Map(participants.map((p) => [p.playerId, p.player?.displayName]))
    const partnerNameByPlayerId = new Map<string, string>()
    for (const p of participants) {
      if (p.partnerId && nameByPlayerId.has(p.partnerId)) {
        partnerNameByPlayerId.set(p.playerId, nameByPlayerId.get(p.partnerId)!)
      }
    }

    const courtIds = [...new Set(matches.map((m) => m.courtId).filter((x): x is string => !!x))]
    const courts = courtIds.length
      ? await prisma.court.findMany({
          where: { id: { in: courtIds } },
          select: { id: true, name: true },
        })
      : []
    const courtNameById = new Map(courts.map((c) => [c.id, c.name]))
    const tournamentById = new Map(event.tournaments.map((t) => [t.id, t]))

    const data = matches.map((m) => {
      const ctx = tournamentCtx.get(m.tournamentId!)!
      const t = tournamentById.get(m.tournamentId!)!
      const stageKey =
        m.stage === 'knockout' && m.round !== null
          ? knockoutStageKeyForRound(m.round, ctx.maxKnockoutRound)
          : null
      const format = resolveMatchFormat(
        { matchFormat: ctx.baseFormat as never, matchFormatOverrides: ctx.overrides },
        stageKey
      )
      return {
        id: m.id,
        tournamentId: m.tournamentId,
        tournamentName: t.name,
        category: t.category,
        genderCategory: t.genderCategory,
        sport: t.sport,
        stage: m.stage,
        round: m.round,
        status: m.status,
        courtId: m.courtId,
        courtName: m.courtId ? (courtNameById.get(m.courtId) ?? null) : null,
        scheduledAt: m.scheduledAt,
        durationMinutes: matchFormatDurationMinutes(format),
        effectiveFormat: format,
        player1Id: m.player1Id,
        player2Id: m.player2Id,
        player1: m.player1,
        player2: m.player2,
        player1PartnerName: m.player1Id ? (partnerNameByPlayerId.get(m.player1Id) ?? null) : null,
        player2PartnerName: m.player2Id ? (partnerNameByPlayerId.get(m.player2Id) ?? null) : null,
        score: m.score,
        winnerId: m.winnerId,
      }
    })

    return res.json({ success: true, data })
  } catch (err) {
    return next(err)
  }
})

// ─── POST /api/tournament-events/:id/schedule — agenda TODOS los torneos ─────
// del evento coordinando las mismas pistas compartidas, evitando el choque que
// produciría llamar POST /api/tournaments/:tid/schedule por separado en cada uno
// (ese endpoint solo mira su propio torneo — ver tournaments.routes.ts).
//
// Estrategia (idéntica en espíritu al scheduler por-torneo, extendida a N torneos):
//  - Partidos "conocidos" (ambos jugadores ya definidos, típicamente toda la
//    primera ronda del cuadro): se agendan todos juntos, ordenados por ronda,
//    en la pista libre más temprana — así R16 de los 6 torneos se entrelazan
//    de forma natural aprovechando las pistas compartidas. Se respeta además el
//    cupo diario/media-jornada de partidos y sets por pareja, CRUZADO entre los
//    torneos del evento (ver docs/scheduling-workload-limits.md) — si el horario
//    más temprano ya agota el cupo de alguna pareja (incluso por un partido suyo
//    en OTRO torneo del mismo evento), se salta al siguiente bloque disponible.
//  - Partidos "desconocidos" (rondas futuras del cuadro, sin jugador aún): se
//    agrupan por torneo+ronda en "olas". Cada torneo avanza de ola en ola de
//    forma independiente (su propio "piso" de tiempo), pero todas comparten el
//    mismo mapa de pistas — así el torneo A puede tener su QF corriendo en
//    paralelo con el R16 del torneo B si hay pista libre, sin pisarse nunca. El
//    cupo por pareja no se puede validar aquí (los jugadores aún no están
//    definidos) — se valida cuando esos partidos se re-agenden ya con jugadores.
router.post(
  '/:id/schedule',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { startAt, courtIds, sport, breakMinutes = 10 } = req.body

      const event = await prisma.tournamentEvent.findUnique({
        where: { id: req.params.id },
        include: { tournaments: true, club: { select: { timezone: true } } },
      })
      if (!event) throw new AppError('Evento no encontrado', 404)
      if (event.organizerId !== req.userId)
        throw new AppError('Solo el organizador puede agendar este evento', 403)
      if (event.tournaments.length === 0)
        throw new AppError('El evento no tiene torneos asociados', 400)

      const sports = new Set(event.tournaments.map((t) => t.sport))
      const resolvedSport = sport || (sports.size === 1 ? [...sports][0] : null)
      if (!resolvedSport) {
        throw new AppError(
          'El evento mezcla deportes distintos — pasa "sport" explícito para elegir qué pistas usar',
          400
        )
      }

      let courts: { id: string }[]
      if (Array.isArray(courtIds) && courtIds.length > 0) {
        courts = courtIds.map((id: string) => ({ id }))
      } else {
        courts = await prisma.court.findMany({
          where: { clubId: event.clubId, sport: resolvedSport, isActive: true },
          select: { id: true },
        })
      }
      if (courts.length === 0) throw new AppError('No hay pistas disponibles para asignar', 400)

      const breakMs = Number(breakMinutes) * 60000
      const windows = event.schedulingWindows
        ? windowsToMs(sanitizeSchedulingWindows(event.schedulingWindows) ?? [], event.club.timezone)
        : null
      const rawStart = new Date(startAt ?? event.startDate).getTime()
      const startCursor = windows ? nextPlayable(rawStart, windows) : rawStart
      if (windows && startCursor === Infinity) {
        throw new AppError('startAt cae después de todas las franjas horarias del evento', 400)
      }

      // Contexto de formato/duración por torneo (cada torneo puede tener su propia
      // modalidad general + overrides por ronda + descanso mínimo entre partidos).
      const tournamentCtx = new Map<
        string,
        {
          baseFormat: string
          overrides: MatchFormatOverrides | null
          restMs: number
          maxKnockoutRound: number
        }
      >()
      for (const t of event.tournaments) {
        const maxRoundAgg = await prisma.match.aggregate({
          where: { tournamentId: t.id, stage: 'knockout' },
          _max: { round: true },
        })
        tournamentCtx.set(t.id, {
          baseFormat: t.matchFormat,
          overrides: (t.matchFormatOverrides as MatchFormatOverrides | null) ?? null,
          restMs: t.minRestMinutes * 60000,
          maxKnockoutRound: maxRoundAgg._max.round ?? 0,
        })
      }

      function formatForMatch(
        tournamentId: string,
        m: { stage: string; round: number | null }
      ): string {
        const ctx = tournamentCtx.get(tournamentId)!
        const stageKey =
          m.stage === 'knockout' && m.round !== null
            ? knockoutStageKeyForRound(m.round, ctx.maxKnockoutRound)
            : null
        return resolveMatchFormat(
          { matchFormat: ctx.baseFormat as never, matchFormatOverrides: ctx.overrides },
          stageKey
        )
      }
      function durationMsForMatch(
        tournamentId: string,
        m: { stage: string; round: number | null }
      ): number {
        return matchFormatDurationMinutes(formatForMatch(tournamentId, m)) * 60000
      }

      const pending = await prisma.match.findMany({
        where: {
          tournamentId: { in: event.tournaments.map((t) => t.id) },
          scheduledAt: null,
          status: 'scheduled',
          round: { not: null },
        },
        orderBy: [{ round: 'asc' }, { tournamentId: 'asc' }, { id: 'asc' }],
      })
      if (pending.length === 0)
        throw new AppError(
          'No hay partidos pendientes de horario en los torneos de este evento',
          400
        )

      const courtFreeAt = new Map<string, number>(courts.map((c) => [c.id, startCursor]))
      const playerFreeAt = new Map<string, number>()
      const updates: { id: string; scheduledAt: Date; courtId: string }[] = []

      // Cupo de partidos/sets por pareja y por jornada — cruzado entre TODOS los
      // torneos del evento (una pareja puede jugar categorías distintas el mismo
      // fin de semana, y el límite es por pareja, no por torneo). Pre-sembrado con
      // los partidos que ya tenían horario antes de esta corrida. Ver
      // docs/scheduling-workload-limits.md.
      const tracker = new PairWorkloadTracker()
      const eventTournamentIds = event.tournaments.map((t) => t.id)
      const alreadyScheduled = await prisma.match.findMany({
        where: {
          tournamentId: { in: eventTournamentIds },
          scheduledAt: { not: null },
          player1Id: { not: null },
          player2Id: { not: null },
        },
        select: {
          tournamentId: true,
          player1Id: true,
          player1PartnerId: true,
          player2Id: true,
          player2PartnerId: true,
          scheduledAt: true,
          stage: true,
          round: true,
        },
      })
      for (const m of alreadyScheduled) {
        const sets = matchFormatMaxSets(formatForMatch(m.tournamentId!, m))
        tracker.register(pairKey(m.player1Id!, m.player1PartnerId), m.scheduledAt!.getTime(), sets)
        tracker.register(pairKey(m.player2Id!, m.player2PartnerId), m.scheduledAt!.getTime(), sets)
      }

      // Encuentra la pista libre más pronto en o después de `notBefore`, ajustado a la
      // franja horaria vigente si el evento las tiene — SIN reservar la pista (peek puro,
      // se puede llamar varias veces mientras se busca un horario que respete el cupo).
      function peekEarliestCourt(
        notBefore: number,
        durationMs: number
      ): { courtId: string; start: number } {
        let bestCourt = courts[0].id
        let bestFreeAt = Infinity
        for (const [courtId, freeAt] of courtFreeAt) {
          if (freeAt < bestFreeAt) {
            bestFreeAt = freeAt
            bestCourt = courtId
          }
        }
        let start = Math.max(notBefore, bestFreeAt)
        if (windows) {
          start = nextPlayable(start, windows)
          if (start === Infinity)
            throw new AppError(
              'No hay franjas horarias suficientes en el evento para agendar todos los partidos pendientes',
              400
            )
          const win = windows.find((w) => start >= w.start && start < w.end)!
          if (start + durationMs > win.end) {
            const idx = windows.findIndex((w) => w.start > start)
            if (idx === -1)
              throw new AppError(
                'No hay franjas horarias suficientes en el evento para agendar todos los partidos pendientes',
                400
              )
            start = windows[idx].start
          }
        }
        return { courtId: bestCourt, start }
      }
      function commitCourt(courtId: string, start: number, durationMs: number) {
        courtFreeAt.set(courtId, start + durationMs + breakMs)
      }

      // 1) Partidos con ambos jugadores conocidos — se entrelazan libremente entre torneos.
      const known = pending.filter((m) => m.player1Id && m.player2Id)
      const tournamentFloor = new Map<string, number>() // hasta cuándo está "ocupado" el bracket de cada torneo
      for (const m of known) {
        const ctx = tournamentCtx.get(m.tournamentId!)!
        const durationMs = durationMsForMatch(m.tournamentId!, m)
        const sets = matchFormatMaxSets(formatForMatch(m.tournamentId!, m))
        const pairA = pairKey(m.player1Id!, m.player1PartnerId)
        const pairB = pairKey(m.player2Id!, m.player2PartnerId)
        const earliestForPlayers = Math.max(
          playerFreeAt.get(m.player1Id!) ?? startCursor,
          playerFreeAt.get(m.player2Id!) ?? startCursor
        )
        const start = findWorkloadEligibleStart({
          lowerBound: earliestForPlayers,
          sets,
          pairKeys: [pairA, pairB],
          tracker,
          earliestCourtAtOrAfter: (notBefore) => peekEarliestCourt(notBefore, durationMs).start,
        })
        const { courtId } = peekEarliestCourt(start, durationMs)
        commitCourt(courtId, start, durationMs)
        updates.push({ id: m.id, scheduledAt: new Date(start), courtId })
        playerFreeAt.set(m.player1Id!, start + durationMs + ctx.restMs)
        playerFreeAt.set(m.player2Id!, start + durationMs + ctx.restMs)
        tracker.register(pairA, start, sets)
        tracker.register(pairB, start, sets)
        tournamentFloor.set(
          m.tournamentId!,
          Math.max(tournamentFloor.get(m.tournamentId!) ?? 0, start + durationMs + ctx.restMs)
        )
      }

      // 2) Partidos aún sin jugador definido (rondas futuras del cuadro) — en olas
      //    por torneo+ronda, ordenadas globalmente por número de ronda para que
      //    ninguna ronda tardía de un torneo se agende antes que una temprana de otro.
      const unknown = pending.filter((m) => !(m.player1Id && m.player2Id))
      const waveGroups = new Map<string, typeof unknown>()
      for (const m of unknown) {
        const key = `${m.tournamentId}:${m.stage}:${m.round}`
        if (!waveGroups.has(key)) waveGroups.set(key, [])
        waveGroups.get(key)!.push(m)
      }
      const orderedWaves = [...waveGroups.values()].sort(
        (a, b) => (a[0].round ?? 0) - (b[0].round ?? 0)
      )

      for (const matches of orderedWaves) {
        const tournamentId = matches[0].tournamentId!
        const ctx = tournamentCtx.get(tournamentId)!
        const durationMs = durationMsForMatch(tournamentId, matches[0])
        const floor = Math.max(startCursor, tournamentFloor.get(tournamentId) ?? 0)
        let waveEnd = floor
        for (const m of matches) {
          const { courtId, start } = peekEarliestCourt(floor, durationMs)
          commitCourt(courtId, start, durationMs)
          updates.push({ id: m.id, scheduledAt: new Date(start), courtId })
          waveEnd = Math.max(waveEnd, start + durationMs)
        }
        tournamentFloor.set(tournamentId, waveEnd + ctx.restMs)
      }

      await prisma.$transaction(
        updates.map((u) =>
          prisma.match.update({
            where: { id: u.id },
            data: { scheduledAt: u.scheduledAt, courtId: u.courtId },
          })
        )
      )

      const byTournament = event.tournaments.map((t) => {
        const tMatches = updates.filter(
          (u) => pending.find((p) => p.id === u.id)?.tournamentId === t.id
        )
        const lastEnd = tMatches.length
          ? Math.max(
              ...tMatches.map(
                (u) =>
                  u.scheduledAt.getTime() +
                  durationMsForMatch(
                    t.id,
                    pending.find((p) => p.id === u.id)!
                  )
              )
            )
          : null
        return {
          tournamentId: t.id,
          name: t.name,
          scheduledMatches: tMatches.length,
          estimatedEndAt: lastEnd ? new Date(lastEnd) : null,
        }
      })

      const estimatedEndAt = new Date(
        Math.max(
          ...byTournament.filter((b) => b.estimatedEndAt).map((b) => b.estimatedEndAt!.getTime())
        )
      )

      return res.json({
        success: true,
        data: {
          scheduledMatches: updates.length,
          courtsUsed: courts.length,
          estimatedEndAt,
          byTournament,
        },
      })
    } catch (err) {
      return next(err)
    }
  }
)

export { router as tournamentEventsRouter }
