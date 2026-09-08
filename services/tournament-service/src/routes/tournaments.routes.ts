import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import { PrismaClient, Prisma } from '@prisma/client'
import { AppError } from '../middleware/error.middleware'
import { requireAuth } from '../middleware/auth.middleware'
import {
  distanceKm,
  matchFormatDurationMinutes,
  resolveMatchFormat,
  knockoutStageKeyForRound,
  KNOCKOUT_STAGE_KEYS,
  MATCH_FORMAT_LABELS,
  type MatchFormatOverrides,
  matchFormatMaxSets,
  pairKey,
  PairWorkloadTracker,
  findWorkloadEligibleStart,
} from '@racketly/utils'
import { computeGroupStandings, type GroupStanding } from '../lib/group-standings'
import {
  createStripePaymentIntent,
  retrieveStripePaymentIntent,
  isStripeConfigured,
  recordPayment,
} from '../services/payment.service'

// Filtra matchFormatOverrides a solo claves/valores válidos (octavos/cuartos/semifinal/final
// con una modalidad de juego reconocida); ignora silenciosamente el resto.
function sanitizeMatchFormatOverrides(input: unknown): MatchFormatOverrides | null {
  if (!input || typeof input !== 'object') return null
  const validFormats = new Set(Object.keys(MATCH_FORMAT_LABELS))
  const result: MatchFormatOverrides = {}
  for (const key of KNOCKOUT_STAGE_KEYS) {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value === 'string' && validFormats.has(value)) {
      result[key] = value as MatchFormatOverrides[typeof key]
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

const router = Router()
const prisma = new PrismaClient()

// Verifica que req.userId sea el organizador del torneo — usado en todas las acciones de
// gestión (editar, cambiar estado, agendar, cobros manuales, resultado de partidos, etc).
async function assertOrganizer(tournamentId: string, userId: string | undefined) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } })
  if (!tournament) throw new AppError('Torneo no encontrado', 404)
  if (tournament.organizerId !== userId)
    throw new AppError('Solo el organizador puede hacer esto', 403)
  return tournament
}

// GET /api/tournaments
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      clubId,
      sport,
      city,
      country,
      status,
      category,
      page = '1',
      limit = '20',
      lat,
      lng,
      radius = '30',
      userId,
    } = req.query
    const where: Record<string, unknown> = {}
    if (clubId) where.clubId = clubId
    if (sport) where.sport = sport
    if (status) where.status = status
    if (category) where.category = category
    if (city || country)
      where.location = { contains: (city || country) as string, mode: 'insensitive' }

    // Modo "descubrimiento" (app móvil, sin clubId explícito): mostrar solo torneos de clubes
    // cercanos y/o donde el usuario jugó (reservó) en los últimos 3 meses — mismo criterio que
    // usa /api/clubs para "clubs cerca de mí / donde jugué recientemente".
    if (!clubId && ((lat && lng) || userId)) {
      const allowedClubIds = new Set<string>()

      if (lat && lng) {
        const userLat = parseFloat(lat as string)
        const userLng = parseFloat(lng as string)
        const maxRadius = parseFloat(radius as string)
        const clubs = await prisma.club.findMany({
          where: { isActive: true },
          select: { id: true, latitude: true, longitude: true },
        })
        for (const c of clubs) {
          if (distanceKm(userLat, userLng, c.latitude, c.longitude) <= maxRadius)
            allowedClubIds.add(c.id)
        }
      }

      if (userId) {
        const threeMonthsAgo = new Date()
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
        const recentBookings = await prisma.booking.findMany({
          where: { userId: userId as string, createdAt: { gte: threeMonthsAgo } },
          select: { slot: { select: { court: { select: { clubId: true } } } } },
        })
        for (const b of recentBookings) allowedClubIds.add(b.slot.court.clubId)
      }

      where.clubId = { in: [...allowedClubIds] }
    }

    const [tournaments, total] = await Promise.all([
      prisma.tournament.findMany({
        where,
        orderBy: { startDate: 'asc' },
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
        include: { _count: { select: { participants: true } }, club: { select: { name: true } } },
      }),
      prisma.tournament.count({ where }),
    ])

    return res.json({
      success: true,
      data: tournaments,
      pagination: { page: Number(page), pageSize: Number(limit), total },
    })
  } catch (err) {
    return next(err)
  }
})

// GET /api/tournaments/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        participants: {
          include: { player: { select: { displayName: true, avatarUrl: true, category: true } } },
        },
        matches: { orderBy: [{ round: 'asc' }, { id: 'asc' }] },
        _count: { select: { participants: true } },
        club: { select: { name: true, address: true, city: true } },
      },
    })
    if (!tournament) throw new AppError('Torneo no encontrado', 404)

    const requiresPair = tournament.type === 'pairs'
    const playerIdSet = new Set(tournament.participants.map((p) => p.playerId))
    const participantsWithStatus = tournament.participants.map((p) => ({
      ...p,
      confirmed: !requiresPair || (!!p.partnerId && playerIdSet.has(p.partnerId)),
    }))

    return res.json({
      success: true,
      data: { ...tournament, participants: participantsWithStatus },
    })
  } catch (err) {
    return next(err)
  }
})

// GET /api/tournaments/participants/user/:userId — historial y torneos activos de un jugador, con su pareja
router.get(
  '/participants/user/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params

      const participations = await prisma.tournamentParticipant.findMany({
        where: { playerId: userId },
        include: { tournament: { include: { club: { select: { name: true } } } } },
        orderBy: { registeredAt: 'desc' },
      })

      const partnerIds = [
        ...new Set(participations.map((p) => p.partnerId).filter((id): id is string => !!id)),
      ]
      const partnerProfiles = partnerIds.length
        ? await prisma.playerProfile.findMany({
            where: { userId: { in: partnerIds } },
            select: { userId: true, displayName: true },
          })
        : []
      const partnerNameById = new Map(partnerProfiles.map((p) => [p.userId, p.displayName]))

      const data = participations.map((p) => ({
        id: p.id,
        tournamentId: p.tournamentId,
        tournamentName: p.tournament.name,
        sport: p.tournament.sport,
        status: p.tournament.status,
        clubName: p.tournament.club?.name ?? null,
        location: p.tournament.location,
        category: p.tournament.category,
        startDate: p.tournament.startDate,
        endDate: p.tournament.endDate,
        partnerId: p.partnerId,
        partnerName: p.partnerId ? (partnerNameById.get(p.partnerId) ?? null) : null,
        paymentStatus: p.paymentStatus,
        isActive: p.tournament.status === 'open' || p.tournament.status === 'in_progress',
      }))

      return res.json({ success: true, data })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/tournaments — crear torneo
// ponytail: no valida que req.userId administre `clubId` (requeriría cruzar con ClubAdmin
// de booking-service) — cualquier usuario autenticado puede crear un torneo bajo cualquier
// club. Upgrade: validar ClubAdmin si esto se vuelve un vector de abuso real.
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      clubId,
      eventId,
      name,
      description,
      sport,
      format,
      matchFormat,
      matchFormatOverrides,
      minRestMinutes,
      type,
      genderCategory,
      category,
      maxParticipants,
      entryFee,
      currency,
      prizePool,
      prizeInfo,
      rules,
      location,
      registrationStart,
      registrationEnd,
      startDate,
      endDate,
      sponsorId,
      sponsorLogoUrl,
    } = req.body

    // prizePool (legacy field from frontend) → prizeInfo string
    const resolvedPrizeInfo =
      prizeInfo ?? (prizePool ? `${currency ?? 'USD'} ${Number(prizePool).toLocaleString()}` : null)

    if (eventId) {
      const event = await prisma.tournamentEvent.findUnique({
        where: { id: eventId },
        select: { clubId: true },
      })
      if (!event) throw new AppError('Evento no encontrado', 404)
      if (clubId && event.clubId !== clubId)
        throw new AppError('El torneo debe pertenecer al mismo club que el evento', 400)
    }

    const tournament = await prisma.tournament.create({
      data: {
        ...(clubId && { clubId }),
        ...(eventId && { eventId }),
        organizerId: req.userId!,
        name,
        ...(description && { description }),
        sport,
        format: format ?? 'round_robin',
        matchFormat: matchFormat ?? 'best_of_3_full',
        matchFormatOverrides: sanitizeMatchFormatOverrides(matchFormatOverrides) ?? undefined,
        minRestMinutes: Number(minRestMinutes ?? 30),
        ...(type && { type }),
        genderCategory: genderCategory ?? 'mixto',
        category,
        maxParticipants: Number(maxParticipants ?? 16),
        entryFee: Number(entryFee ?? 0),
        currency: currency ?? 'USD',
        ...(resolvedPrizeInfo && { prizeInfo: resolvedPrizeInfo }),
        ...(rules && { rules }),
        location,
        registrationStart: new Date(registrationStart),
        registrationEnd: new Date(registrationEnd),
        startDate: new Date(startDate),
        endDate: new Date(endDate ?? startDate),
        ...(sponsorId && { sponsorId }),
        ...(sponsorLogoUrl && { sponsorLogoUrl }),
        status: 'draft',
      },
    })
    return res.status(201).json({ success: true, data: tournament })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/tournaments/:id — editar torneo
router.patch('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertOrganizer(req.params.id, req.userId)

    const {
      name,
      description,
      sport,
      format,
      matchFormat,
      matchFormatOverrides,
      minRestMinutes,
      type,
      genderCategory,
      category,
      maxParticipants,
      entryFee,
      currency,
      prizePool,
      prizeInfo,
      rules,
      location,
      registrationStart,
      registrationEnd,
      startDate,
      endDate,
      eventId,
    } = req.body

    const resolvedPrizeInfo =
      prizeInfo !== undefined
        ? prizeInfo
        : prizePool !== undefined
          ? `${currency ?? 'USD'} ${Number(prizePool).toLocaleString()}`
          : undefined

    if (eventId !== undefined && eventId !== null) {
      const [tournament, event] = await Promise.all([
        prisma.tournament.findUnique({ where: { id: req.params.id }, select: { clubId: true } }),
        prisma.tournamentEvent.findUnique({ where: { id: eventId }, select: { clubId: true } }),
      ])
      if (!event) throw new AppError('Evento no encontrado', 404)
      if (tournament?.clubId && tournament.clubId !== event.clubId)
        throw new AppError('El torneo debe pertenecer al mismo club que el evento', 400)
    }

    const data: Record<string, unknown> = {}
    if (eventId !== undefined) data.eventId = eventId
    if (name !== undefined) data.name = name
    if (description !== undefined) data.description = description || null
    if (sport !== undefined) data.sport = sport
    if (format !== undefined) data.format = format
    if (matchFormat !== undefined) data.matchFormat = matchFormat
    if (matchFormatOverrides !== undefined)
      data.matchFormatOverrides = sanitizeMatchFormatOverrides(matchFormatOverrides)
    if (minRestMinutes !== undefined) data.minRestMinutes = Number(minRestMinutes)
    if (type !== undefined) data.type = type
    if (genderCategory !== undefined) data.genderCategory = genderCategory
    if (category !== undefined) data.category = category
    if (maxParticipants !== undefined) data.maxParticipants = Number(maxParticipants)
    if (entryFee !== undefined) data.entryFee = Number(entryFee)
    if (currency !== undefined) data.currency = currency
    if (resolvedPrizeInfo !== undefined) data.prizeInfo = resolvedPrizeInfo || null
    if (rules !== undefined) data.rules = rules || null
    if (location !== undefined) data.location = location
    if (registrationStart !== undefined) data.registrationStart = new Date(registrationStart)
    if (registrationEnd !== undefined) data.registrationEnd = new Date(registrationEnd)
    if (startDate !== undefined) data.startDate = new Date(startDate)
    if (endDate !== undefined) data.endDate = new Date(endDate)

    if (data.maxParticipants !== undefined) {
      const current = await prisma.tournament.findUnique({
        where: { id: req.params.id },
        select: { currentParticipants: true },
      })
      if (current && (data.maxParticipants as number) < current.currentParticipants) {
        throw new AppError(
          `No puedes reducir el cupo por debajo de los ${current.currentParticipants} jugadores ya inscritos`,
          400
        )
      }
    }

    const tournament = await prisma.tournament.update({
      where: { id: req.params.id },
      data,
      include: { club: { select: { name: true } } },
    })
    return res.json({ success: true, data: tournament })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/tournaments/:id/reserved-slots — reservar/liberar cupos de parejas (no disponibles para inscripción pública)
router.patch(
  '/:id/reserved-slots',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reservedPairs } = req.body
      const n = Number(reservedPairs)
      if (!Number.isInteger(n) || n < 0)
        throw new AppError('Número de parejas reservadas inválido', 400)

      const tournament = await assertOrganizer(req.params.id, req.userId)

      const reservedSlots = n * 2
      if (reservedSlots + tournament.currentParticipants > tournament.maxParticipants) {
        throw new AppError(
          'No hay suficiente cupo disponible para reservar esa cantidad de parejas',
          400
        )
      }

      const updated = await prisma.tournament.update({
        where: { id: req.params.id },
        data: { reservedSlots },
      })
      return res.json({ success: true, data: updated })
    } catch (err) {
      return next(err)
    }
  }
)

// ─── Generación de partidos ───────────────────────────────────────────────────

function nextPow2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function generateEliminationMatches(tournamentId: string, playerIds: string[]) {
  await generateKnockoutMatches(tournamentId, shuffle(playerIds))
}

// Genera el cuadro de eliminación a partir de una lista YA sembrada (sin shuffle):
// seeded[0] vs seeded[1], seeded[2] vs seeded[3], etc. `null` en cualquier posición
// significa bye. Se usa tanto para elimination directa (orden aleatorio) como para
// el knockout post-grupos (seeding real, con posibles byes intercalados).
async function generateKnockoutMatches(tournamentId: string, seeded: (string | null)[]) {
  const size = nextPow2(seeded.length)
  const padded = [...seeded, ...Array(size - seeded.length).fill(null)] // null = bye
  const rounds = Math.log2(size)
  const creates: Prisma.MatchCreateManyInput[] = []

  // Round 1 — real matchups; byes get walkover with the real player advancing
  for (let i = 0; i < size; i += 2) {
    const p1 = padded[i]
    const p2 = padded[i + 1]
    const isBye = !p1 || !p2
    creates.push({
      tournamentId,
      round: 1,
      stage: 'knockout',
      player1Id: p1 ?? null,
      player2Id: p2 ?? null,
      status: isBye ? 'walkover' : 'scheduled',
      winnerId: isBye ? (p1 ?? p2) : null,
    })
  }

  // Rounds 2..final — empty placeholder slots
  for (let r = 2; r <= rounds; r++) {
    const count = size / Math.pow(2, r)
    for (let i = 0; i < count; i++) {
      creates.push({ tournamentId, round: r, stage: 'knockout', status: 'scheduled' })
    }
  }

  await prisma.match.createMany({ data: creates })

  // Los byes ya quedan con winnerId al crearse, pero el placeholder de la ronda
  // siguiente sigue vacío — propagarlos igual que un resultado normal.
  const byeMatches = await prisma.match.findMany({
    where: { tournamentId, stage: 'knockout', round: 1, status: 'walkover' },
  })
  for (const m of byeMatches) await propagateKnockoutWinner(tournamentId, m.id)
}

// Reparte entrantes en grupos balanceados (objetivo: 4 por grupo) y genera un
// round-robin de partidos dentro de cada grupo, marcados con stage='group'.
async function generateGroupStageMatches(tournamentId: string, playerIds: string[]) {
  const shuffled = shuffle(playerIds)
  const numGroups = Math.max(1, Math.round(shuffled.length / 4))
  const groups: string[][] = Array.from({ length: numGroups }, () => [])
  shuffled.forEach((id, i) => groups[i % numGroups].push(id))

  // Persistir el grupo asignado en TournamentParticipant (ambos registros de la pareja)
  const groupByPlayerId = new Map<string, number>()
  groups.forEach((g, idx) => g.forEach((playerId) => groupByPlayerId.set(playerId, idx + 1)))

  const participants = await prisma.tournamentParticipant.findMany({
    where: { tournamentId },
    select: { id: true, playerId: true, partnerId: true },
  })
  const updates = participants
    .map((p) => {
      const gn =
        groupByPlayerId.get(p.playerId) ??
        (p.partnerId ? groupByPlayerId.get(p.partnerId) : undefined)
      return gn
        ? prisma.tournamentParticipant.update({ where: { id: p.id }, data: { groupNumber: gn } })
        : null
    })
    .filter((u): u is NonNullable<typeof u> => !!u)
  if (updates.length) await prisma.$transaction(updates)

  const creates: Prisma.MatchCreateManyInput[] = []
  groups.forEach((groupPlayers, idx) => {
    const groupNumber = idx + 1
    const gp = [...groupPlayers]
    if (gp.length % 2 !== 0) gp.push('BYE')
    const n = gp.length
    const rounds = n - 1
    for (let round = 0; round < rounds; round++) {
      for (let i = 0; i < n / 2; i++) {
        const p1 = gp[i]
        const p2 = gp[n - 1 - i]
        if (p1 !== 'BYE' && p2 !== 'BYE') {
          creates.push({
            tournamentId,
            round: round + 1,
            stage: 'group',
            groupNumber,
            player1Id: p1,
            player2Id: p2,
            status: 'scheduled',
          })
        }
      }
      const last = gp.pop()!
      gp.splice(1, 0, last)
    }
  })

  if (creates.length) await prisma.match.createMany({ data: creates })
}

async function generateRoundRobinMatches(tournamentId: string, playerIds: string[]) {
  const players = shuffle(playerIds)
  if (players.length % 2 !== 0) players.push('BYE')
  const n = players.length
  const rounds = n - 1
  const creates: Prisma.MatchCreateManyInput[] = []

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < n / 2; i++) {
      const p1 = players[i]
      const p2 = players[n - 1 - i]
      if (p1 !== 'BYE' && p2 !== 'BYE') {
        creates.push({
          tournamentId,
          round: round + 1,
          player1Id: p1,
          player2Id: p2,
          status: 'scheduled',
        })
      }
    }
    // Rotate: keep players[0] fixed, rotate the rest clockwise
    const last = players.pop()!
    players.splice(1, 0, last)
  }

  await prisma.match.createMany({ data: creates })
}

async function generateMatchesForTournament(tournamentId: string, format: string, type: string) {
  await prisma.match.deleteMany({ where: { tournamentId } })

  const participants = await prisma.tournamentParticipant.findMany({
    where: { tournamentId },
    select: { playerId: true, partnerId: true },
    orderBy: { registeredAt: 'asc' },
  })

  let playerIds: string[]
  if (type === 'pairs') {
    // Solo parejas confirmadas (ambos jugadores inscritos) entran al cuadro.
    // Un solo entrante por pareja para evitar que ambos compañeros aparezcan por separado.
    const playerIdSet = new Set(participants.map((p) => p.playerId))
    const seen = new Set<string>()
    playerIds = []
    for (const p of participants) {
      const confirmed = !!p.partnerId && playerIdSet.has(p.partnerId)
      if (!confirmed) continue
      if (seen.has(p.playerId) || seen.has(p.partnerId!)) continue
      seen.add(p.playerId)
      seen.add(p.partnerId!)
      playerIds.push(p.playerId)
    }
  } else {
    playerIds = participants.map((p) => p.playerId)
  }

  if (playerIds.length < 2) return

  if (format === 'round_robin' || format === 'swiss') {
    await generateRoundRobinMatches(tournamentId, playerIds)
  } else if (format === 'groups_bracket') {
    await generateGroupStageMatches(tournamentId, playerIds)
  } else {
    // elimination
    await generateEliminationMatches(tournamentId, playerIds)
  }
}

// ─────────────────────────────────────────────────────────────────────────────

// PATCH /api/tournaments/:id/status — cambiar estado
router.patch(
  '/:id/status',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body
      const valid = ['draft', 'open', 'in_progress', 'completed', 'cancelled']
      if (!valid.includes(status)) throw new AppError('Estado inválido', 400)

      await assertOrganizer(req.params.id, req.userId)

      const tournament = await prisma.tournament.update({
        where: { id: req.params.id },
        data: { status },
        include: { club: { select: { name: true } } },
      })

      // Generar partidos al iniciar el torneo
      if (status === 'in_progress') {
        await generateMatchesForTournament(req.params.id, tournament.format, tournament.type)
      }

      return res.json({ success: true, data: tournament })
    } catch (err) {
      return next(err)
    }
  }
)

// Resuelve method con default 'cash' — igual criterio que booking-service: los cobros hechos
// a mano desde el dashboard (inscripción admin, "Marcar pagado") por defecto son efectivo si
// no se especifica; el pago online del jugador (Stripe) siempre manda 'card' explícito.
function resolvePaymentMethodDefaultCash(input: unknown): 'cash' | 'card' {
  return input === 'card' ? 'card' : 'cash'
}

// Cobertura de un participante al inscribirse: cortesía > lo que decidió quien inscribe.
// A diferencia de bookings, hoy no hay descuento de membresía en torneos — el entryFee del
// torneo es el mismo para todos; socio/no socio es solo informativo en Caja.
function resolveParticipantCharge(entryFee: number, status: string, paymentMethod: unknown) {
  if (status === 'courtesy')
    return { amountOwed: entryFee, amountPaid: 0, paymentMethod: null as 'cash' | 'card' | null }
  if (status === 'paid')
    return {
      amountOwed: entryFee,
      amountPaid: entryFee,
      paymentMethod: resolvePaymentMethodDefaultCash(paymentMethod),
    }
  return { amountOwed: entryFee, amountPaid: 0, paymentMethod: null as 'cash' | 'card' | null }
}

// POST /api/tournaments/:id/register — inscribirse (individual, o en pareja si el torneo lo requiere).
// El propio jugador se inscribe a sí mismo (playerId === req.userId), o el organizador
// inscribe manualmente a otra persona (ej. cortesía, pago en efectivo en la sede).
router.post(
  '/:id/register',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId, partnerId, teamName, paymentStatus, courtesyReason, paymentMethod } =
        req.body

      const status = paymentStatus ?? 'pending'
      if (!['pending', 'paid', 'courtesy'].includes(status))
        throw new AppError('Estado de pago inválido', 400)
      if (status === 'courtesy' && !courtesyReason?.trim())
        throw new AppError('La cortesía requiere una razón', 400)

      // Todo el chequeo de cupo + creación va dentro de una transacción que toma un lock de fila
      // sobre el Tournament (SELECT ... FOR UPDATE) antes de leer currentParticipants. Sin esto, dos
      // inscripciones concurrentes podrían leer currentParticipants=15/16 al mismo tiempo, ambas
      // pasar el chequeo de cupo, y terminar con 17 inscritos en un torneo de 16 — el `{ increment: 1 }`
      // de más abajo es atómico para el UPDATE en sí, pero no evita que dos requests decidan "hay
      // cupo" antes de que ninguna haya escrito. El lock serializa: la segunda solicitud espera a que
      // la primera confirme (o falle) antes de leer currentParticipants, y ya lo ve actualizado.
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM tournaments WHERE id = ${req.params.id} FOR UPDATE`

        const tournament = await tx.tournament.findUnique({ where: { id: req.params.id } })
        if (!tournament) throw new AppError('Torneo no encontrado', 404)
        if (tournament.status !== 'open') throw new AppError('El torneo no está abierto', 400)
        if (playerId !== req.userId && tournament.organizerId !== req.userId)
          throw new AppError('Solo puedes inscribirte a ti mismo, o ser el organizador', 403)

        const existing = await tx.tournamentParticipant.findFirst({
          where: { tournamentId: req.params.id, playerId },
        })
        if (existing) throw new AppError('Ya estás inscrito en este torneo', 409)

        const requiresPair = tournament.type === 'pairs'
        const availableCapacity = tournament.maxParticipants - tournament.reservedSlots
        const charge = resolveParticipantCharge(tournament.entryFee, status, paymentMethod)

        // Sin pareja: inscripción individual (queda pendiente de completar si el torneo requiere pareja)
        if (!partnerId) {
          if (tournament.currentParticipants >= availableCapacity)
            throw new AppError('Torneo lleno', 400)
          const participant = await tx.tournamentParticipant.create({
            data: {
              tournamentId: req.params.id,
              playerId,
              teamName,
              paymentStatus: status,
              courtesyReason: status === 'courtesy' ? courtesyReason.trim() : null,
              amountOwed: charge.amountOwed,
              amountPaid: charge.amountPaid,
              paymentMethod: charge.paymentMethod,
              paidAt: charge.amountPaid > 0 ? new Date() : null,
            },
          })
          await tx.tournament.update({
            where: { id: req.params.id },
            data: { currentParticipants: { increment: 1 } },
          })
          return { participant, confirmed: !requiresPair, tournament, charge }
        }

        // Con pareja: ¿ya existe una inscripción a nombre del compañero?
        const partnerExisting = await tx.tournamentParticipant.findFirst({
          where: { tournamentId: req.params.id, playerId: partnerId },
        })
        if (partnerExisting?.partnerId) throw new AppError('Esa pareja ya está completa', 409)

        if (partnerExisting) {
          // Completar la pareja incompleta del compañero
          if (tournament.currentParticipants >= availableCapacity)
            throw new AppError('Torneo lleno', 400)
          await tx.tournamentParticipant.update({
            where: { id: partnerExisting.id },
            data: { partnerId: playerId },
          })
          const participant = await tx.tournamentParticipant.create({
            data: {
              tournamentId: req.params.id,
              playerId,
              partnerId,
              teamName,
              paymentStatus: status,
              courtesyReason: status === 'courtesy' ? courtesyReason.trim() : null,
              amountOwed: charge.amountOwed,
              amountPaid: charge.amountPaid,
              paymentMethod: charge.paymentMethod,
              paidAt: charge.amountPaid > 0 ? new Date() : null,
            },
          })
          await tx.tournament.update({
            where: { id: req.params.id },
            data: { currentParticipants: { increment: 1 } },
          })
          return { participant, confirmed: true, tournament, charge }
        }

        // Pareja nueva: crear ambos registros de una vez (el compañero queda con su propio cobro pendiente)
        if (tournament.currentParticipants + 2 > availableCapacity)
          throw new AppError('Torneo lleno', 400)
        const participant = await tx.tournamentParticipant.create({
          data: {
            tournamentId: req.params.id,
            playerId,
            partnerId,
            teamName,
            paymentStatus: status,
            courtesyReason: status === 'courtesy' ? courtesyReason.trim() : null,
            amountOwed: charge.amountOwed,
            amountPaid: charge.amountPaid,
            paymentMethod: charge.paymentMethod,
            paidAt: charge.amountPaid > 0 ? new Date() : null,
          },
        })
        await tx.tournamentParticipant.create({
          data: {
            tournamentId: req.params.id,
            playerId: partnerId,
            partnerId: playerId,
            teamName,
            paymentStatus: 'pending',
            amountOwed: tournament.entryFee,
          },
        })
        await tx.tournament.update({
          where: { id: req.params.id },
          data: { currentParticipants: { increment: 2 } },
        })
        return { participant, confirmed: true, tournament, charge }
      })

      // El registro del cobro en Caja no forma parte de la carrera por el cupo — se hace después
      // del commit, sin mantener el lock del torneo abierto más tiempo del necesario.
      if (result.charge.amountPaid > 0 && result.tournament.clubId) {
        const profile = await prisma.playerProfile.findUnique({ where: { userId: playerId } })
        await recordPayment({
          clubId: result.tournament.clubId,
          tournamentParticipantId: result.participant.id,
          playerUserId: playerId,
          playerName: profile?.displayName,
          amount: result.charge.amountPaid,
          currency: result.tournament.currency,
          method: result.charge.paymentMethod || 'cash',
        })
      }

      return res
        .status(201)
        .json({ success: true, data: { ...result.participant, confirmed: result.confirmed } })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/tournaments/:id/participants/:participantId/pay-intent — el propio jugador paga su
// inscripción con tarjeta (Stripe). Crea el PaymentIntent por el monto pendiente.
router.post(
  '/:id/participants/:participantId/pay-intent',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const participant = await prisma.tournamentParticipant.findUnique({
        where: { id: req.params.participantId },
      })
      if (!participant || participant.tournamentId !== req.params.id)
        throw new AppError('Participante no encontrado', 404)
      if (participant.playerId !== req.userId)
        throw new AppError('Solo el propio jugador puede pagar su inscripción', 403)
      if (participant.paymentStatus !== 'pending')
        throw new AppError('Esta inscripción ya está resuelta', 400)

      const owed = participant.amountOwed - participant.amountPaid
      if (owed <= 0) throw new AppError('No hay nada pendiente por pagar', 400)

      const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } })
      if (!tournament) throw new AppError('Torneo no encontrado', 404)

      const paymentData = await createStripePaymentIntent({
        amount: Math.round(owed * 100),
        currency: tournament.currency,
        participantId: participant.id,
        userId: participant.playerId,
        description: `Inscripción torneo ${tournament.name}`,
      })

      return res.json({
        success: true,
        data: {
          clientSecret: paymentData.clientSecret,
          paymentIntentId: paymentData.paymentIntentId,
          devMode: !!paymentData.devMode,
          stripeConfigured: isStripeConfigured,
        },
      })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/tournaments/:id/participants/:participantId/confirm — verifica el PaymentIntent con
// Stripe server-side y marca pagada la inscripción (nunca confiamos en que el cliente diga "ya pagué").
router.post(
  '/:id/participants/:participantId/confirm',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { paymentIntentId } = req.body
      if (!paymentIntentId) throw new AppError('Falta paymentIntentId', 400)

      const participant = await prisma.tournamentParticipant.findUnique({
        where: { id: req.params.participantId },
      })
      if (!participant || participant.tournamentId !== req.params.id)
        throw new AppError('Participante no encontrado', 404)
      if (participant.playerId !== req.userId)
        throw new AppError('Solo el propio jugador puede confirmar su inscripción', 403)
      if (participant.paymentStatus === 'paid')
        return res.json({ success: true, data: { alreadyPaid: true } })
      if (participant.paymentStatus !== 'pending')
        throw new AppError('Esta inscripción ya está resuelta', 400)

      const intent = await retrieveStripePaymentIntent(paymentIntentId)
      if (intent.status !== 'succeeded') throw new AppError('El pago aún no se completó', 400)

      const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } })
      if (!tournament) throw new AppError('Torneo no encontrado', 404)

      const owed = participant.amountOwed - participant.amountPaid
      const updated = await prisma.tournamentParticipant.update({
        where: { id: participant.id },
        data: {
          paymentStatus: 'paid',
          amountPaid: participant.amountOwed,
          paymentMethod: 'card',
          paidAt: new Date(),
        },
      })

      if (owed > 0 && tournament.clubId) {
        const profile = await prisma.playerProfile.findUnique({
          where: { userId: participant.playerId },
        })
        await recordPayment({
          clubId: tournament.clubId,
          tournamentParticipantId: participant.id,
          playerUserId: participant.playerId,
          playerName: profile?.displayName,
          amount: owed,
          currency: tournament.currency,
          method: 'card',
        })
      }

      return res.json({ success: true, data: updated })
    } catch (err) {
      return next(err)
    }
  }
)

// PATCH /api/tournaments/:id/participants/:participantId/payment — pago individual o cortesía
// (admin, desde el dashboard). Body opcional: { paymentMethod: 'cash' | 'card' } al marcar 'paid'.
router.patch(
  '/:id/participants/:participantId/payment',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { paymentStatus, courtesyReason, paymentMethod } = req.body
      if (!['pending', 'paid', 'courtesy'].includes(paymentStatus))
        throw new AppError('Estado de pago inválido', 400)
      if (paymentStatus === 'courtesy' && !courtesyReason?.trim())
        throw new AppError('La cortesía requiere una razón', 400)

      await assertOrganizer(req.params.id, req.userId)

      const existing = await prisma.tournamentParticipant.findUnique({
        where: { id: req.params.participantId },
      })
      if (!existing || existing.tournamentId !== req.params.id)
        throw new AppError('Participante no encontrado', 404)

      const owed = existing.amountOwed - existing.amountPaid
      const method = resolvePaymentMethodDefaultCash(paymentMethod)

      const participant = await prisma.tournamentParticipant.update({
        where: { id: req.params.participantId },
        data: {
          paymentStatus,
          courtesyReason: paymentStatus === 'courtesy' ? courtesyReason.trim() : null,
          ...(paymentStatus === 'paid' && {
            amountPaid: existing.amountOwed,
            paymentMethod: method,
            paidAt: new Date(),
          }),
        },
      })

      if (paymentStatus === 'paid' && owed > 0) {
        const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } })
        if (tournament?.clubId) {
          const profile = await prisma.playerProfile.findUnique({
            where: { userId: existing.playerId },
          })
          await recordPayment({
            clubId: tournament.clubId,
            tournamentParticipantId: participant.id,
            playerUserId: existing.playerId,
            playerName: profile?.displayName,
            amount: owed,
            currency: tournament.currency,
            method,
          })
        }
      }

      return res.json({ success: true, data: participant })
    } catch (err) {
      return next(err)
    }
  }
)

// Coloca al ganador de un partido de eliminación en el slot correspondiente del
// partido de la ronda siguiente. Sin esto, el cuadro nunca avanza más allá de la
// primera ronda: las rondas 2+ se crean como placeholders vacíos.
export async function propagateKnockoutWinner(tournamentId: string, matchId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match || match.stage !== 'knockout' || !match.winnerId || match.round == null) return

  const roundMatches = await prisma.match.findMany({
    where: { tournamentId, stage: 'knockout', round: match.round },
    orderBy: { id: 'asc' },
  })
  const idx = roundMatches.findIndex((m) => m.id === matchId)
  if (idx === -1) return

  const nextRoundMatches = await prisma.match.findMany({
    where: { tournamentId, stage: 'knockout', round: match.round + 1 },
    orderBy: { id: 'asc' },
  })
  const nextMatch = nextRoundMatches[Math.floor(idx / 2)]
  if (!nextMatch) return // era la final, no hay ronda siguiente

  const slot = idx % 2 === 0 ? 'player1Id' : 'player2Id'
  await prisma.match.update({ where: { id: nextMatch.id }, data: { [slot]: match.winnerId } })
}

// PATCH /api/tournaments/:id/matches/:matchId — resultado de un partido (organizador/dashboard)
router.patch(
  '/:id/matches/:matchId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await assertOrganizer(req.params.id, req.userId)

      const { score, winnerId, status, scheduledAt, courtId } = req.body
      const data: Record<string, unknown> = {}
      if (score !== undefined) data.score = score
      if (winnerId !== undefined) data.winnerId = winnerId ?? null
      if (status !== undefined) data.status = status
      if (scheduledAt !== undefined) data.scheduledAt = scheduledAt ? new Date(scheduledAt) : null
      if (courtId !== undefined) data.courtId = courtId ?? null

      const match = await prisma.match.update({
        where: { id: req.params.matchId },
        data,
        include: {
          player1: { select: { displayName: true, avatarUrl: true } },
          player2: { select: { displayName: true, avatarUrl: true } },
        },
      })

      if (match.winnerId && (match.status === 'completed' || match.status === 'walkover')) {
        await propagateKnockoutWinner(req.params.id, match.id)
      }

      return res.json({ success: true, data: match })
    } catch (err) {
      return next(err)
    }
  }
)

// Adjunta el nombre de la pista (courtName) a partidos que solo tienen courtId — Match
// no tiene relación Prisma declarada hacia Court (dominios distintos), así que se resuelve
// con una consulta aparte en vez de un include.
async function attachCourtNames<T extends { courtId: string | null }>(
  matches: T[]
): Promise<(T & { courtName: string | null })[]> {
  const courtIds = [...new Set(matches.map((m) => m.courtId).filter((x): x is string => !!x))]
  const courts = courtIds.length
    ? await prisma.court.findMany({
        where: { id: { in: courtIds } },
        select: { id: true, name: true },
      })
    : []
  const nameById = new Map(courts.map((c) => [c.id, c.name]))
  return matches.map((m) => ({
    ...m,
    courtName: m.courtId ? (nameById.get(m.courtId) ?? null) : null,
  }))
}

// GET /api/tournaments/:id/groups — grupos, standings y partidos de la fase de grupos
router.get('/:id/groups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      select: { type: true, format: true },
    })
    if (!tournament) throw new AppError('Torneo no encontrado', 404)
    if (tournament.format !== 'groups_bracket')
      throw new AppError('Este torneo no usa formato de grupos', 400)

    const [participants, matches] = await Promise.all([
      prisma.tournamentParticipant.findMany({
        where: { tournamentId: req.params.id, groupNumber: { not: null } },
        include: { player: { select: { displayName: true, avatarUrl: true } } },
      }),
      prisma.match.findMany({
        where: { tournamentId: req.params.id, stage: 'group' },
        orderBy: [{ groupNumber: 'asc' }, { round: 'asc' }, { id: 'asc' }],
        include: {
          player1: { select: { displayName: true, avatarUrl: true } },
          player2: { select: { displayName: true, avatarUrl: true } },
        },
      }),
    ])

    const matchesWithCourt = await attachCourtNames(matches)

    const nameByPlayerId = new Map(participants.map((p) => [p.playerId, p.player?.displayName]))
    const numGroups = Math.max(0, ...participants.map((p) => p.groupNumber ?? 0))

    const groups = Array.from({ length: numGroups }, (_, i) => {
      const groupNumber = i + 1
      const entrants = participants.filter(
        (p) =>
          p.groupNumber === groupNumber &&
          p.partnerId &&
          nameByPlayerId.has(p.partnerId) &&
          p.playerId < p.partnerId!
      )
      // playerId < partnerId evita listar la pareja dos veces (una fila por cada miembro)
      const groupMatches = matchesWithCourt.filter((m) => m.groupNumber === groupNumber)
      const groupPlayerIds = [
        ...new Set(
          groupMatches.flatMap((m) => [m.player1Id, m.player2Id]).filter((x): x is string => !!x)
        ),
      ]
      const standings = computeGroupStandings(groupMatches, groupPlayerIds, groupNumber).map(
        (s) => ({
          ...s,
          displayName: nameByPlayerId.get(s.playerId) ?? 'Desconocido',
          partnerName: (() => {
            const p = participants.find((pp) => pp.playerId === s.playerId)
            return p?.partnerId ? (nameByPlayerId.get(p.partnerId) ?? null) : null
          })(),
        })
      )

      return {
        groupNumber,
        entrants: entrants.map((p) => ({
          playerId: p.playerId,
          partnerId: p.partnerId,
          displayName: p.player?.displayName,
          partnerName: nameByPlayerId.get(p.partnerId!) ?? null,
        })),
        matches: groupMatches,
        standings,
        isComplete:
          groupMatches.length > 0 &&
          groupMatches.every((m) => m.status === 'completed' || m.status === 'walkover'),
      }
    })

    return res.json({ success: true, data: groups })
  } catch (err) {
    return next(err)
  }
})

// Reparte cuántos clasificados directos salen de cada grupo y a qué tamaño de cuadro
// (8 = cuartos, 16 = octavos) apunta el torneo, según el número de grupos:
//   - más de 8 grupos  → cuadro de octavos (16); solo pasa el 1ro de cada grupo + mejores segundos
//   - 5 a 8 grupos     → cuadro de cuartos (8);  solo pasa el 1ro de cada grupo + mejores segundos
//   - 4 grupos         → cuadro de cuartos (8);  pasan los 2 mejores de cada grupo (encaja exacto)
//   - menos de 4 grupos→ cuadro de cuartos (8);  pasan los 2 mejores de cada grupo + mejores terceros
function knockoutPlan(numGroups: number): { targetSize: number; directPerGroup: number } {
  const targetSize = numGroups > 8 ? 16 : 8
  const directPerGroup = numGroups < 4 ? 2 : 1
  return { targetSize, directPerGroup }
}

function standingStrengthCompare(a: GroupStanding, b: GroupStanding): number {
  return (
    b.points - a.points ||
    b.setsWon - b.setsLost - (a.setsWon - a.setsLost) ||
    b.gamesWon - b.gamesLost - (a.gamesWon - a.gamesLost)
  )
}

// Devuelve los clasificados ordenados de más fuerte a más débil (para sembrar el
// cuadro): primero todos los directos (1ros, o 1ros+2dos si hay <4 grupos), y luego
// se completa con los mejores "siguientes puestos" de todos los grupos hasta llenar
// el tamaño de cuadro objetivo (mejores segundos, o mejores terceros si ya se tomaron
// 2 directos por grupo).
function rankKnockoutQualifiers(
  standingsByGroup: GroupStanding[][]
): { playerId: string; groupNumber: number }[] {
  const { targetSize, directPerGroup } = knockoutPlan(standingsByGroup.length)

  const direct = standingsByGroup.flatMap((standings) => standings.slice(0, directPerGroup))
  direct.sort(standingStrengthCompare)

  const qualifiers = [...direct]
  let nextRank = directPerGroup
  while (qualifiers.length < targetSize) {
    const pool = standingsByGroup.map((s) => s[nextRank]).filter((s): s is GroupStanding => !!s)
    if (pool.length === 0) break // no quedan más candidatos en ningún grupo
    pool.sort(standingStrengthCompare)
    qualifiers.push(...pool.slice(0, targetSize - qualifiers.length))
    nextRank++
  }

  return qualifiers.map((s) => ({ playerId: s.playerId, groupNumber: s.groupNumber }))
}

// Orden clásico de sembrado de un cuadro de eliminación (1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6
// para un cuadro de 8; se generaliza igual para 16, 32, etc). Devuelve, para cada
// posición del cuadro (en orden de partido), qué número de seed (1 = más fuerte) va ahí.
function standardBracketSeedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const n = order.length * 2
    const next: number[] = []
    for (const s of order) next.push(s, n + 1 - s)
    order = next
  }
  return order
}

// El sembrado clásico (1v8, 4v5, 2v7, 3v6...) ya tiende a cruzar directos (seeds fuertes)
// contra comodines (seeds débiles) en primera ronda, porque los directos ocupan los
// números de seed más bajos. Pero no sabe nada de grupos: si el comodín que le toca a un
// seed fuerte resulta ser justo el 2do/3er lugar de SU MISMO grupo, quedarían enfrentados
// en la primera ronda — exactamente lo que no queremos (ya se enfrentaron en grupos, y no
// debe depender del azar volver a cruzarse antes de que el favorito del grupo lo "gane" en
// la tabla). Este paso recorre los partidos de ronda 1 y, ante un cruce del mismo grupo,
// intercambia con el próximo jugador del cuadro que no genere otro conflicto (ni con su
// rival actual ni con el nuevo rival que le tocaría a quien se desplaza).
function resolveGroupConflicts(
  seeded: (string | null)[],
  groupByPlayer: Map<string, number>
): (string | null)[] {
  const result = [...seeded]
  for (let i = 0; i < result.length; i += 2) {
    const a = result[i]
    const b = result[i + 1]
    if (!a || !b) continue
    const groupA = groupByPlayer.get(a)
    const groupB = groupByPlayer.get(b)
    if (groupA == null || groupB == null || groupA !== groupB) continue // sin conflicto

    for (let j = 0; j < result.length; j++) {
      if (j === i || j === i + 1) continue
      const candidate = result[j]
      if (!candidate) continue
      const groupCandidate = groupByPlayer.get(candidate)
      if (groupCandidate === groupA) continue // el candidato también es del grupo en conflicto

      const partnerIdx = j % 2 === 0 ? j + 1 : j - 1
      const partner = result[partnerIdx]
      const groupPartner = partner ? groupByPlayer.get(partner) : null
      if (groupPartner != null && groupPartner === groupB) continue // b chocaría con el compañero del candidato

      result[i + 1] = candidate
      result[j] = b
      break
    }
    // Si no se encontró candidato (muy pocos grupos alimentando el cuadro), se deja el cruce —
    // matemáticamente inevitable en ese caso.
  }
  return result
}

// POST /api/tournaments/:id/advance-to-knockout — cierra la fase de grupos y genera el
// bracket de eliminación (cuartos u octavos según el número de grupos), sembrado por
// fuerza (1ros de grupo primero, luego mejores comodines) con el sembrado clásico de
// torneos para que los favoritos no se crucen antes de semis/final.
router.post(
  '/:id/advance-to-knockout',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournament = await assertOrganizer(req.params.id, req.userId)
      if (tournament.format !== 'groups_bracket')
        throw new AppError('Este torneo no usa formato de grupos', 400)

      const existingKnockout = await prisma.match.count({
        where: { tournamentId: req.params.id, stage: 'knockout' },
      })
      if (existingKnockout > 0) throw new AppError('El bracket de eliminación ya fue generado', 409)

      const [participants, groupMatches] = await Promise.all([
        prisma.tournamentParticipant.findMany({
          where: { tournamentId: req.params.id, groupNumber: { not: null } },
        }),
        prisma.match.findMany({ where: { tournamentId: req.params.id, stage: 'group' } }),
      ])
      if (groupMatches.length === 0)
        throw new AppError('La fase de grupos no ha sido generada', 400)

      const pending = groupMatches.filter(
        (m) => m.status !== 'completed' && m.status !== 'walkover'
      )
      if (pending.length > 0)
        throw new AppError(`Faltan ${pending.length} partido(s) de grupos por completar`, 400)

      const numGroups = Math.max(0, ...participants.map((p) => p.groupNumber ?? 0))
      const standingsByGroup: GroupStanding[][] = []
      for (let g = 1; g <= numGroups; g++) {
        const groupMatchesG = groupMatches.filter((m) => m.groupNumber === g)
        const groupPlayerIds = [
          ...new Set(
            groupMatchesG.flatMap((m) => [m.player1Id, m.player2Id]).filter((x): x is string => !!x)
          ),
        ]
        standingsByGroup.push(computeGroupStandings(groupMatchesG, groupPlayerIds, g))
      }

      const qualifiersByStrength = rankKnockoutQualifiers(standingsByGroup)
      const groupByPlayer = new Map(qualifiersByStrength.map((q) => [q.playerId, q.groupNumber]))
      const bracketSize = nextPow2(qualifiersByStrength.length)
      const seedOrder = standardBracketSeedOrder(bracketSize)
      const naiveSeeded: (string | null)[] = seedOrder.map(
        (seedNum) => qualifiersByStrength[seedNum - 1]?.playerId ?? null
      )
      const seeded = resolveGroupConflicts(naiveSeeded, groupByPlayer)

      await generateKnockoutMatches(req.params.id, seeded)

      const knockoutMatches = await prisma.match.findMany({
        where: { tournamentId: req.params.id, stage: 'knockout' },
        orderBy: [{ round: 'asc' }, { id: 'asc' }],
        include: {
          player1: { select: { displayName: true, avatarUrl: true } },
          player2: { select: { displayName: true, avatarUrl: true } },
        },
      })

      return res.json({ success: true, data: knockoutMatches })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/tournaments/:id/schedule — asigna pista y horario a todos los partidos
// pendientes (sin scheduledAt) del torneo, según la modalidad de juego (duración
// estimada por partido), las pistas del club disponibles para el deporte del torneo,
// y el descanso mínimo entre partidos de una misma pareja (`minRestMinutes` del
// torneo, o `restMinutes` en el body para esta corrida puntual).
//
// Dos modos, según si ya se conocen los dos jugadores del partido:
//  - Conocidos (fase de grupos, y ronda 1 del knockout ya sembrada): se agenda
//    partido por partido con un greedy que respeta a la vez la pista más pronto
//    disponible, el descanso mínimo de cada pareja desde su último partido, Y el
//    cupo diario/media-jornada de partidos y sets por pareja (ver
//    docs/scheduling-workload-limits.md) — si el horario más temprano ya agota el
//    cupo de alguna de las dos parejas, se salta al siguiente bloque disponible.
//  - Desconocidos (rondas de knockout futuras, aún sin definir por resultados
//    pendientes): no hay forma de rastrear el descanso NI el cupo por pareja todavía
//    (los jugadores aún no están definidos), así que se agendan por "oleada" (una
//    ronda entera), sin arrancar antes de que CUALQUIER posible clasificado de la
//    ronda anterior haya descansado lo mínimo. El cupo diario de esas rondas se
//    valida recién cuando se re-agenden partidos ya con jugadores conocidos.
router.post(
  '/:id/schedule',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { startAt, courtIds, breakMinutes = 10, restMinutes: restOverride } = req.body
      const tournament = await assertOrganizer(req.params.id, req.userId)

      // La modalidad (y por tanto la duración) puede variar por ronda eliminatoria —
      // grupos usan siempre la modalidad general; octavos/cuartos/semifinal/final caen
      // a su override si el organizador definió uno, o a la general si no.
      const maxKnockoutRoundAgg = await prisma.match.aggregate({
        where: { tournamentId: req.params.id, stage: 'knockout' },
        _max: { round: true },
      })
      const maxKnockoutRound = maxKnockoutRoundAgg._max.round ?? 0
      const baseMatchFormat = tournament.matchFormat
      const overrides = (tournament.matchFormatOverrides as MatchFormatOverrides | null) ?? null

      function formatForMatch(m: { stage: string; round: number | null }): string {
        const stageKey =
          m.stage === 'knockout' && m.round !== null
            ? knockoutStageKeyForRound(m.round, maxKnockoutRound)
            : null
        return resolveMatchFormat(
          { matchFormat: baseMatchFormat, matchFormatOverrides: overrides },
          stageKey
        )
      }
      function durationMsForMatch(m: { stage: string; round: number | null }): number {
        return matchFormatDurationMinutes(formatForMatch(m)) * 60000
      }

      const restMinutes = Number(restOverride ?? tournament.minRestMinutes)
      const breakMs = Number(breakMinutes) * 60000
      const restMs = restMinutes * 60000
      // Duración "base" (modalidad general) usada solo para separar del último partido
      // ya agendado y como referencia en la respuesta — cada partido usa su propia duración.
      const baseDurationMs = matchFormatDurationMinutes(tournament.matchFormat) * 60000

      let courts: { id: string }[]
      if (Array.isArray(courtIds) && courtIds.length > 0) {
        courts = courtIds.map((id: string) => ({ id }))
      } else if (tournament.clubId) {
        courts = await prisma.court.findMany({
          where: { clubId: tournament.clubId, sport: tournament.sport, isActive: true },
          select: { id: true },
        })
      } else {
        courts = []
      }
      if (courts.length === 0)
        throw new AppError(
          'No hay pistas disponibles para asignar (el club no tiene pistas de este deporte, o pasa courtIds explícitos)',
          400
        )

      const pending = await prisma.match.findMany({
        where: {
          tournamentId: req.params.id,
          scheduledAt: null,
          status: 'scheduled',
          round: { not: null },
        },
        orderBy: [{ stage: 'asc' }, { round: 'asc' }, { id: 'asc' }], // 'group' < 'knockout' alfabéticamente: grupos primero
      })
      if (pending.length === 0) throw new AppError('No hay partidos pendientes de horario', 400)

      // Punto de partida: si ya hay partidos con horario asignado, continuar después del
      // más tardío dejando el mayor de (colchón de pista, descanso mínimo); si no, usar
      // startAt (body) o la fecha de inicio del torneo.
      const latestScheduled = await prisma.match.findFirst({
        where: { tournamentId: req.params.id, scheduledAt: { not: null } },
        orderBy: { scheduledAt: 'desc' },
      })
      const startCursor = latestScheduled?.scheduledAt
        ? new Date(
            latestScheduled.scheduledAt.getTime() +
              durationMsForMatch(latestScheduled) +
              Math.max(breakMs, restMs)
          )
        : new Date(startAt ?? tournament.startDate)

      const courtFreeAt = new Map<string, number>(courts.map((c) => [c.id, startCursor.getTime()]))
      const playerFreeAt = new Map<string, number>()
      const updates: { id: string; scheduledAt: Date; courtId: string; durationMs: number }[] = []

      // Cupo de partidos/sets por pareja y por jornada — pre-sembrado con los partidos
      // de este torneo que YA tenían horario antes de esta corrida, para que agendar
      // por partes (sin tocar lo ya fijado) siga respetando el límite diario acumulado.
      const tracker = new PairWorkloadTracker()
      const alreadyScheduled = await prisma.match.findMany({
        where: {
          tournamentId: req.params.id,
          scheduledAt: { not: null },
          player1Id: { not: null },
          player2Id: { not: null },
        },
        select: {
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
        const sets = matchFormatMaxSets(formatForMatch(m))
        tracker.register(pairKey(m.player1Id!, m.player1PartnerId), m.scheduledAt!.getTime(), sets)
        tracker.register(pairKey(m.player2Id!, m.player2PartnerId), m.scheduledAt!.getTime(), sets)
      }

      function earliestCourtTimeAtOrAfter(notBefore: number): number {
        let best = Infinity
        for (const freeAt of courtFreeAt.values())
          best = Math.min(best, Math.max(freeAt, notBefore))
        return best
      }
      function pickCourtAtTime(t: number): string {
        let bestCourt = courts[0].id
        let bestFreeAt = Infinity
        for (const [courtId, freeAt] of courtFreeAt) {
          if (freeAt <= t && freeAt < bestFreeAt) {
            bestFreeAt = freeAt
            bestCourt = courtId
          }
        }
        return bestCourt
      }

      const known = pending.filter((m) => m.player1Id && m.player2Id)
      for (const m of known) {
        const durationMs = durationMsForMatch(m)
        const sets = matchFormatMaxSets(formatForMatch(m))
        const pairA = pairKey(m.player1Id!, m.player1PartnerId)
        const pairB = pairKey(m.player2Id!, m.player2PartnerId)
        const earliestForPlayers = Math.max(
          playerFreeAt.get(m.player1Id!) ?? startCursor.getTime(),
          playerFreeAt.get(m.player2Id!) ?? startCursor.getTime()
        )
        const start = findWorkloadEligibleStart({
          lowerBound: earliestForPlayers,
          sets,
          pairKeys: [pairA, pairB],
          tracker,
          earliestCourtAtOrAfter: earliestCourtTimeAtOrAfter,
        })
        const bestCourt = pickCourtAtTime(start)
        updates.push({ id: m.id, scheduledAt: new Date(start), courtId: bestCourt, durationMs })
        courtFreeAt.set(bestCourt, start + durationMs + breakMs)
        playerFreeAt.set(m.player1Id!, start + durationMs + restMs)
        playerFreeAt.set(m.player2Id!, start + durationMs + restMs)
        tracker.register(pairA, start, sets)
        tracker.register(pairB, start, sets)
      }

      const unknown = pending.filter((m) => !(m.player1Id && m.player2Id))
      const waves = new Map<string, typeof unknown>()
      for (const m of unknown) {
        const key = `${m.stage}:${m.round}`
        if (!waves.has(key)) waves.set(key, [])
        waves.get(key)!.push(m)
      }

      let waveFloor = Math.max(
        startCursor.getTime(),
        ...(playerFreeAt.size ? [...playerFreeAt.values()] : []),
        ...(courtFreeAt.size ? [...courtFreeAt.values()] : [])
      )
      const courtIdsList = courts.map((c) => c.id)
      for (const matches of waves.values()) {
        const durationMs = durationMsForMatch(matches[0]) // toda la ola comparte stage:round → misma modalidad
        const heats = Math.ceil(matches.length / courtIdsList.length)
        matches.forEach((m, i) => {
          const heatIndex = Math.floor(i / courtIdsList.length)
          const courtId = courtIdsList[i % courtIdsList.length]
          const start = waveFloor + heatIndex * (durationMs + breakMs)
          updates.push({ id: m.id, scheduledAt: new Date(start), courtId, durationMs })
        })
        const waveEnd = waveFloor + (heats - 1) * (durationMs + breakMs) + durationMs
        waveFloor = waveEnd + Math.max(breakMs, restMs)
      }

      await prisma.$transaction(
        updates.map((u) =>
          prisma.match.update({
            where: { id: u.id },
            data: { scheduledAt: u.scheduledAt, courtId: u.courtId },
          })
        )
      )

      const estimatedEndAt = new Date(
        Math.max(...updates.map((u) => u.scheduledAt.getTime() + u.durationMs))
      )

      return res.json({
        success: true,
        data: {
          scheduledMatches: updates.length,
          courtsUsed: courts.length,
          matchDurationMinutes: baseDurationMs / 60000,
          minRestMinutes: restMinutes,
          estimatedEndAt,
        },
      })
    } catch (err) {
      return next(err)
    }
  }
)

// Duración de un partido según la modalidad de SU torneo (con cache por torneo,
// para no repetir la consulta de Tournament + agregado de ronda máxima por cada
// candidato al comprobar solapamientos).
type DurationCtx = {
  baseFormat: string
  overrides: MatchFormatOverrides | null
  maxKnockoutRound: number
}
async function matchDurationMs(
  m: { tournamentId: string | null; stage: string; round: number | null },
  cache: Map<string, DurationCtx>
): Promise<number> {
  if (!m.tournamentId) return matchFormatDurationMinutes('best_of_3_full') * 60000
  let ctx = cache.get(m.tournamentId)
  if (!ctx) {
    const t = await prisma.tournament.findUnique({
      where: { id: m.tournamentId },
      select: { matchFormat: true, matchFormatOverrides: true },
    })
    const maxRoundAgg = await prisma.match.aggregate({
      where: { tournamentId: m.tournamentId, stage: 'knockout' },
      _max: { round: true },
    })
    ctx = {
      baseFormat: t?.matchFormat ?? 'best_of_3_full',
      overrides: (t?.matchFormatOverrides as MatchFormatOverrides | null) ?? null,
      maxKnockoutRound: maxRoundAgg._max.round ?? 0,
    }
    cache.set(m.tournamentId, ctx)
  }
  const stageKey =
    m.stage === 'knockout' && m.round !== null
      ? knockoutStageKeyForRound(m.round, ctx.maxKnockoutRound)
      : null
  const format = resolveMatchFormat(
    { matchFormat: ctx.baseFormat as never, matchFormatOverrides: ctx.overrides },
    stageKey
  )
  return matchFormatDurationMinutes(format) * 60000
}

// ─── PATCH /api/tournaments/:id/matches/:matchId/reschedule — mover un partido ──
// a otra pista/horario a mano (ajuste manual después del agendado automático).
// El conflicto se evalúa contra CUALQUIER partido de esa pista (de cualquier
// torneo — las pistas se comparten entre torneos de un mismo evento), no solo
// los de este torneo. Si hay choque:
//   - sin resolveConflict=true: rechaza con 409 y el detalle del partido en conflicto.
//   - con resolveConflict=true: mueve también al partido en conflicto — busca el
//     próximo hueco libre en esa misma pista después del horario que se está
//     asignando, y lo reubica ahí (nunca lo deja fuera de la pista/torneo).
router.patch(
  '/:id/matches/:matchId/reschedule',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await assertOrganizer(req.params.id, req.userId)

      const { courtId, scheduledAt, resolveConflict } = req.body
      if (!courtId) throw new AppError('courtId es requerido', 400)
      if (!scheduledAt) throw new AppError('scheduledAt es requerido', 400)

      const match = await prisma.match.findUnique({ where: { id: req.params.matchId } })
      if (!match) throw new AppError('Partido no encontrado', 404)
      if (match.tournamentId !== req.params.id)
        throw new AppError('El partido no pertenece a este torneo', 400)

      const durationCache = new Map<string, DurationCtx>()
      const newStart = new Date(scheduledAt).getTime()
      if (Number.isNaN(newStart)) throw new AppError('scheduledAt inválido', 400)
      const durationMs = await matchDurationMs(match, durationCache)
      const newEnd = newStart + durationMs

      const sameCourtMatches = await prisma.match.findMany({
        where: {
          courtId,
          scheduledAt: { not: null },
          status: { notIn: ['cancelled'] },
          id: { not: match.id },
        },
        include: {
          player1: { select: { displayName: true } },
          player2: { select: { displayName: true } },
        },
      })

      // OJO: puede haber MÁS de un partido ya solapado en esa pista/hora (datos
      // heredados de agendados automáticos independientes que no se coordinaron
      // entre sí) — hay que resolverlos todos, no solo el primero que se encuentre,
      // o el partido movido terminaría compartiendo el slot con el que quedó fuera.
      const conflicts: { match: (typeof sameCourtMatches)[number]; durationMs: number }[] = []
      for (const c of sameCourtMatches) {
        const cStart = c.scheduledAt!.getTime()
        const cDur = await matchDurationMs(c, durationCache)
        if (newStart < cStart + cDur && cStart < newEnd)
          conflicts.push({ match: c, durationMs: cDur })
      }

      if (conflicts.length > 0 && !resolveConflict) {
        const first = conflicts[0].match
        const conflictTournament = first.tournamentId
          ? await prisma.tournament.findUnique({
              where: { id: first.tournamentId },
              select: { name: true },
            })
          : null
        const label =
          first.player1?.displayName || first.player2?.displayName
            ? `${first.player1?.displayName ?? '?'} vs ${first.player2?.displayName ?? '?'}`
            : 'un partido por definir'
        const extra = conflicts.length > 1 ? ` (y ${conflicts.length - 1} más)` : ''
        throw new AppError(
          `Esa pista ya tiene ${label} agendado a esa hora (${conflictTournament?.name ?? 'otro torneo'})${extra}. Repite el cambio con resolveConflict:true para moverlos automáticamente.`,
          409
        )
      }

      const updates: { id: string; courtId: string | null; scheduledAt: Date | null }[] = [
        { id: match.id, courtId, scheduledAt: new Date(scheduledAt) },
      ]

      if (conflicts.length > 0) {
        const conflictIds = new Set(conflicts.map((c) => c.match.id))
        // Huecos ya ocupados en esa pista, sin contar a los que se van a mover —
        // se va actualizando según se les va asignando nuevo horario a cada uno,
        // para que dos partidos desplazados nunca terminen chocando entre sí.
        const occupiedWithDur: { start: number; end: number }[] = [{ start: newStart, end: newEnd }]
        for (const c of sameCourtMatches) {
          if (conflictIds.has(c.id)) continue
          const cStart = c.scheduledAt!.getTime()
          const cDur = await matchDurationMs(c, durationCache)
          occupiedWithDur.push({ start: cStart, end: cStart + cDur })
        }

        // Se reubican en orden de hora original, cada uno buscando el próximo
        // hueco libre después de newEnd considerando lo ya ocupado (incluyendo a
        // los conflictos ya reubicados en esta misma pasada).
        const orderedConflicts = [...conflicts].sort(
          (a, b) => a.match.scheduledAt!.getTime() - b.match.scheduledAt!.getTime()
        )
        for (const { match: c, durationMs: cDur } of orderedConflicts) {
          let candidateStart = newEnd
          for (let i = 0; i < 100; i++) {
            const candidateEnd = candidateStart + cDur
            const overlapping = occupiedWithDur.find(
              (o) => candidateStart < o.end && o.start < candidateEnd
            )
            if (!overlapping) break
            candidateStart = overlapping.end
          }
          occupiedWithDur.push({ start: candidateStart, end: candidateStart + cDur })
          updates.push({ id: c.id, courtId, scheduledAt: new Date(candidateStart) })
        }
      }

      await prisma.$transaction(
        updates.map((u) =>
          prisma.match.update({
            where: { id: u.id },
            data: { courtId: u.courtId, scheduledAt: u.scheduledAt },
          })
        )
      )

      return res.json({
        success: true,
        data: {
          movedMatchId: match.id,
          swappedMatchIds: conflicts.map((c) => c.match.id),
          updates,
        },
      })
    } catch (err) {
      return next(err)
    }
  }
)

// DELETE /api/tournaments/:id/participants/:participantId — retirar inscripción
// El propio jugador se retira a sí mismo, o el organizador lo retira por él.
router.delete(
  '/:id/participants/:participantId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [existing, tournament] = await Promise.all([
        prisma.tournamentParticipant.findUnique({ where: { id: req.params.participantId } }),
        prisma.tournament.findUnique({
          where: { id: req.params.id },
          select: { organizerId: true },
        }),
      ])
      if (!existing || existing.tournamentId !== req.params.id || !tournament) {
        throw new AppError('Participante no encontrado', 404)
      }
      if (existing.playerId !== req.userId && tournament.organizerId !== req.userId) {
        throw new AppError('No puedes retirar la inscripción de otra persona', 403)
      }

      await prisma.$transaction([
        prisma.tournamentParticipant.delete({ where: { id: req.params.participantId } }),
        prisma.tournament.update({
          where: { id: req.params.id },
          data: { currentParticipants: { decrement: 1 } },
        }),
      ])

      return res.json({ success: true })
    } catch (err) {
      return next(err)
    }
  }
)

// GET /api/tournaments/:id/bracket — cuadro del torneo
router.get('/:id/bracket', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      select: { type: true },
    })

    const [matches, participants] = await Promise.all([
      prisma.match.findMany({
        where: { tournamentId: req.params.id, stage: 'knockout' },
        orderBy: [{ round: 'asc' }, { id: 'asc' }],
        include: {
          player1: { select: { displayName: true, avatarUrl: true } },
          player2: { select: { displayName: true, avatarUrl: true } },
        },
      }),
      tournament?.type === 'pairs'
        ? prisma.tournamentParticipant.findMany({
            where: { tournamentId: req.params.id },
            select: { playerId: true, partnerId: true, player: { select: { displayName: true } } },
          })
        : Promise.resolve([]),
    ])

    // Mapear playerId → nombre de su pareja (solo torneos de tipo "pairs")
    const partnerNameByPlayerId = new Map<string, string>()
    if (tournament?.type === 'pairs') {
      const nameByPlayerId = new Map(participants.map((p) => [p.playerId, p.player?.displayName]))
      for (const p of participants) {
        if (p.partnerId && nameByPlayerId.has(p.partnerId)) {
          partnerNameByPlayerId.set(p.playerId, nameByPlayerId.get(p.partnerId)!)
        }
      }
    }

    const matchesWithCourt = await attachCourtNames(matches)
    const matchesWithPartners = matchesWithCourt.map((m) => ({
      ...m,
      player1PartnerName: m.player1Id ? (partnerNameByPlayerId.get(m.player1Id) ?? null) : null,
      player2PartnerName: m.player2Id ? (partnerNameByPlayerId.get(m.player2Id) ?? null) : null,
    }))

    // Agrupar por ronda
    const bracket = matchesWithPartners.reduce(
      (acc: Record<number, typeof matchesWithPartners>, match) => {
        const round = match.round ?? 0
        if (!acc[round]) acc[round] = []
        acc[round].push(match)
        return acc
      },
      {}
    )

    return res.json({ success: true, data: bracket })
  } catch (err) {
    return next(err)
  }
})

// GET /api/tournaments/:id/matches — agenda plana (todas las fases) con pista, hora
// y duración resueltas — usada por la grilla horas×pistas del dashboard.
router.get('/:id/matches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } })
    if (!tournament) throw new AppError('Torneo no encontrado', 404)

    const maxRoundAgg = await prisma.match.aggregate({
      where: { tournamentId: tournament.id, stage: 'knockout' },
      _max: { round: true },
    })
    const maxKnockoutRound = maxRoundAgg._max.round ?? 0
    const overrides = (tournament.matchFormatOverrides as MatchFormatOverrides | null) ?? null

    const [matches, participants] = await Promise.all([
      prisma.match.findMany({
        where: { tournamentId: tournament.id },
        orderBy: [{ scheduledAt: 'asc' }],
        include: {
          player1: { select: { displayName: true } },
          player2: { select: { displayName: true } },
        },
      }),
      tournament.type === 'pairs'
        ? prisma.tournamentParticipant.findMany({
            where: { tournamentId: tournament.id },
            select: { playerId: true, partnerId: true, player: { select: { displayName: true } } },
          })
        : Promise.resolve([]),
    ])

    const nameByPlayerId = new Map(participants.map((p) => [p.playerId, p.player?.displayName]))
    const partnerNameByPlayerId = new Map<string, string>()
    for (const p of participants) {
      if (p.partnerId && nameByPlayerId.has(p.partnerId)) {
        partnerNameByPlayerId.set(p.playerId, nameByPlayerId.get(p.partnerId)!)
      }
    }

    const matchesWithCourt = await attachCourtNames(matches)

    const data = matchesWithCourt.map((m) => {
      const stageKey =
        m.stage === 'knockout' && m.round !== null
          ? knockoutStageKeyForRound(m.round, maxKnockoutRound)
          : null
      const format = resolveMatchFormat(
        { matchFormat: tournament.matchFormat, matchFormatOverrides: overrides },
        stageKey
      )
      return {
        id: m.id,
        tournamentId: m.tournamentId,
        tournamentName: tournament.name,
        category: tournament.category,
        genderCategory: tournament.genderCategory,
        stage: m.stage,
        round: m.round,
        status: m.status,
        courtId: m.courtId,
        courtName: m.courtName,
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

export { router as tournamentsRouter }
