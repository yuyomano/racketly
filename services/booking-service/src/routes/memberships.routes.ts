import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { AppError } from '../middleware/error.middleware'
import { requireClubAccess, assertClubAdmin } from '../middleware/club-auth.middleware'
import { countMembershipSessionsForDate } from '../services/membership-sessions.service'
import { recordPayment, resolvePaymentMethod } from '../services/payment-ledger.service'
import { decryptPII } from '@racketly/utils/pii-crypto'

const router = Router()
const prisma = new PrismaClient({ adapter: createPgAdapter() })

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addMonths(date: Date, n: number) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

// ─── GET /api/clubs/:clubId/membership-plans ─────────────────────────────────
// Planes de membresía que ofrece un club
// Note: router is mounted at both /api/clubs and /api/memberships
// When mounted at /api/clubs, Express strips the prefix → path is /:clubId/membership-plans
router.get('/:clubId/membership-plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeInactive = req.query.all === '1'
    const plans = await prisma.clubMembershipPlan.findMany({
      where: { clubId: req.params.clubId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { price: 'asc' },
      include: { _count: { select: { subscribers: { where: { status: 'active' } } } } },
    })
    return res.json({ success: true, data: plans })
  } catch (err) {
    return next(err)
  }
})

// ─── POST /api/clubs/:clubId/membership-plans ────────────────────────────────
// Crear un plan de membresía para el club (uso admin)
router.post(
  '/:clubId/membership-plans',
  requireClubAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, price, currency, sessionsPerDay, priceExtraSession } = req.body
      if (!name?.trim()) throw new AppError('El nombre del plan es requerido', 400)
      if (price === undefined || Number(price) < 0)
        throw new AppError('El precio es requerido', 400)
      if (!sessionsPerDay || Number(sessionsPerDay) < 1)
        throw new AppError('sessionsPerDay debe ser al menos 1', 400)

      const club = await prisma.club.findUnique({
        where: { id: req.params.clubId },
        select: { currency: true },
      })

      const plan = await prisma.clubMembershipPlan.create({
        data: {
          clubId: req.params.clubId,
          name: name.trim(),
          description: description?.trim() || null,
          price: Number(price),
          currency: currency?.trim() || club?.currency || 'USD',
          sessionsPerDay: Number(sessionsPerDay),
          priceExtraSession: Number(priceExtraSession ?? 0),
        },
      })
      return res.status(201).json({ success: true, data: plan })
    } catch (err) {
      return next(err)
    }
  }
)

// ─── PATCH /api/clubs/:clubId/membership-plans/:planId ───────────────────────
// Editar o activar/desactivar un plan
router.patch(
  '/:clubId/membership-plans/:planId',
  requireClubAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.clubMembershipPlan.findUnique({
        where: { id: req.params.planId },
      })
      if (!existing || existing.clubId !== req.params.clubId)
        throw new AppError('Plan no encontrado', 404)

      const { name, description, price, currency, sessionsPerDay, priceExtraSession, isActive } =
        req.body
      const data: Record<string, unknown> = {}
      if (name !== undefined) data.name = String(name).trim()
      if (description !== undefined) data.description = description?.trim() || null
      if (price !== undefined) data.price = Number(price)
      if (currency !== undefined) data.currency = String(currency).trim()
      if (sessionsPerDay !== undefined) data.sessionsPerDay = Number(sessionsPerDay)
      if (priceExtraSession !== undefined) data.priceExtraSession = Number(priceExtraSession)
      if (isActive !== undefined) data.isActive = !!isActive

      const plan = await prisma.clubMembershipPlan.update({
        where: { id: req.params.planId },
        data,
      })
      return res.json({ success: true, data: plan })
    } catch (err) {
      return next(err)
    }
  }
)

// ─── GET /api/clubs/:clubId/memberships ───────────────────────────────────────
// Suscriptores del club (uso admin) — todas las membresías, con plan y usuario
router.get('/:clubId/memberships', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const memberships = await prisma.userClubMembership.findMany({
      where: { clubId: req.params.clubId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    })
    const userIds = [...new Set(memberships.map((m) => m.userId))]
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : []
    const userById = new Map(users.map((u) => [u.id, u]))

    const data = memberships.map((m) => {
      const u = userById.get(m.userId)
      const fullName =
        u && (u.firstName || u.lastName) ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : null
      return {
        ...m,
        userName: fullName || u?.email?.split('@')[0] || 'Desconocido',
        userEmail: u?.email ?? null,
      }
    })

    return res.json({ success: true, data })
  } catch (err) {
    return next(err)
  }
})

// ─── POST /api/clubs/:clubId/memberships ─────────────────────────────────────
// Alta manual de socio desde el dashboard (admin): suscribe a un jugador ya
// registrado a un plan del club, con cobro opcional en efectivo/tarjeta. Si se
// omite paymentMethod y el plan tiene precio, queda como cortesía/sin cobro —
// igual que las reservas, requiere un motivo (ej. "Profesora del club").
router.post(
  '/:clubId/memberships',
  requireClubAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clubId } = req.params
      const { userId, planId, paymentMethod, courtesyReason } = req.body
      if (!userId || !planId) throw new AppError('userId y planId requeridos', 400)

      const plan = await prisma.clubMembershipPlan.findUnique({ where: { id: planId } })
      if (!plan || plan.clubId !== clubId || !plan.isActive)
        throw new AppError('Plan no disponible', 404)

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
      if (!user) throw new AppError('Jugador no encontrado', 404)

      const existing = await prisma.userClubMembership.findFirst({
        where: { userId, clubId, status: 'active' },
      })
      if (existing) throw new AppError('Este jugador ya tiene una membresía activa en el club', 409)

      const isCourtesy = !paymentMethod && plan.price > 0
      if (isCourtesy && !courtesyReason?.trim()) {
        throw new AppError('Se requiere un motivo para la membresía de cortesía', 400)
      }

      const now = new Date()
      const membership = await prisma.userClubMembership.create({
        data: {
          userId,
          planId,
          clubId,
          status: 'active',
          startDate: now,
          nextBillingDate: addMonths(now, 1),
          isCourtesy,
          courtesyReason: isCourtesy ? courtesyReason.trim() : null,
        },
        include: { plan: true },
      })

      let paid = false
      if (paymentMethod) {
        const fullName =
          user.firstName || user.lastName
            ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
            : undefined
        await recordPayment({
          clubId,
          membershipId: membership.id,
          playerUserId: userId,
          playerName: fullName || user.email?.split('@')[0],
          amount: plan.price,
          currency: plan.currency,
          method: resolvePaymentMethod(paymentMethod),
        })
        paid = plan.price > 0
      }

      return res.status(201).json({ success: true, data: { ...membership, paid } })
    } catch (err) {
      return next(err)
    }
  }
)

// ─── GET /api/clubs/:clubId/players ──────────────────────────────────────────
// Directorio de jugadores del club: cruza reservas, membresías, créditos y torneos.
// Solo incluye jugadores con userId (cuenta registrada) — no invitados sueltos.
// También devuelve el resto de usuarios registrados (sin movimiento en este club)
// con hasActivityInClub=false, para poder filtrarlos por separado en el frontend.
router.get('/:clubId/players', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clubId } = req.params

    const [club, bookings, memberships, creditSums, tournamentParticipants, professors] =
      await Promise.all([
        prisma.club.findUnique({ where: { id: clubId }, select: { name: true, currency: true } }),
        prisma.booking.findMany({
          where: { slot: { court: { clubId } }, status: { not: 'cancelled' } },
          select: { players: true, slot: { select: { date: true } } },
        }),
        prisma.userClubMembership.findMany({
          where: { clubId },
          include: { plan: { select: { name: true } }, club: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.userCredit.groupBy({
          by: ['userId'],
          where: { clubId, status: 'available' },
          _sum: { amount: true },
        }),
        prisma.tournamentParticipant.findMany({
          where: { tournament: { clubId } },
          select: { playerId: true, registeredAt: true },
        }),
        // Profesores "del club" atados a un jugador registrado — cuentan como
        // jugadores activos del club aunque no tengan reservas/membresía propias.
        prisma.clubProfessor.findMany({
          where: { clubId, userId: { not: null } },
          select: { userId: true },
        }),
      ])

    type Row = {
      userId: string
      name: string | null
      bookingsCount: number
      lastBookingDate: string | null
      totalPaid: number
    }
    const byUser = new Map<string, Row>()

    for (const b of bookings) {
      const players = (b.players as any[]) || []
      for (const p of players) {
        if (!p.userId) continue
        const row = byUser.get(p.userId) ?? {
          userId: p.userId,
          name: null,
          bookingsCount: 0,
          lastBookingDate: null,
          totalPaid: 0,
        }
        row.bookingsCount++
        row.totalPaid += p.amountPaid ?? 0
        if (p.name) row.name = p.name
        const d = b.slot?.date ?? null
        if (d && (!row.lastBookingDate || d > row.lastBookingDate)) row.lastBookingDate = d
        byUser.set(p.userId, row)
      }
    }

    // Membresía más reciente por usuario (ya vienen ordenadas desc por createdAt)
    const membershipByUser = new Map<string, (typeof memberships)[number]>()
    for (const m of memberships) {
      if (!membershipByUser.has(m.userId)) membershipByUser.set(m.userId, m)
    }

    const creditByUser = new Map(creditSums.map((c) => [c.userId, c._sum.amount ?? 0]))

    const tournamentCountByUser = new Map<string, number>()
    for (const tp of tournamentParticipants) {
      tournamentCountByUser.set(tp.playerId, (tournamentCountByUser.get(tp.playerId) ?? 0) + 1)
    }

    const professorUserIds = new Set(professors.map((p) => p.userId as string))

    const activeUserIds = new Set<string>([
      ...byUser.keys(),
      ...membershipByUser.keys(),
      ...creditByUser.keys(),
      ...tournamentCountByUser.keys(),
      ...professorUserIds,
    ])

    const [activeUsers, otherUsers] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: [...activeUserIds] } },
        select: { id: true, email: true, phone: true, firstName: true, lastName: true },
      }),
      prisma.user.findMany({
        where: { id: { notIn: [...activeUserIds] } },
        select: { id: true, email: true, phone: true, firstName: true, lastName: true },
      }),
    ])
    const userById = new Map([...activeUsers, ...otherUsers].map((u) => [u.id, u]))

    const activeRows = [...activeUserIds].map((userId) => {
      const u = userById.get(userId)
      const row = byUser.get(userId)
      const membership = membershipByUser.get(userId)
      const availableCredit = creditByUser.get(userId) ?? 0
      const tournamentsCount = tournamentCountByUser.get(userId) ?? 0

      const fullName =
        u && (u.firstName || u.lastName) ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : null
      const name = row?.name || fullName || u?.email?.split('@')[0] || 'Desconocido'

      return {
        userId,
        name,
        email: u?.email ?? null,
        phone: decryptPII(u?.phone),
        bookingsCount: row?.bookingsCount ?? 0,
        lastBookingDate: row?.lastBookingDate ?? null,
        totalPaid: row?.totalPaid ?? 0,
        membershipStatus: membership?.status ?? 'none', // active | cancelled | none
        membershipPlan: membership?.plan?.name ?? null,
        membershipClubName: membership?.club?.name ?? null,
        hasActiveMembership: membership?.status === 'active',
        hadMembershipEver: !!membership,
        availableCredit,
        creditClubName: availableCredit > 0 ? (club?.name ?? null) : null,
        tournamentsCount,
        hasActivityInClub: true,
        isProfessor: professorUserIds.has(userId),
      }
    })

    const otherRows = otherUsers.map((u) => {
      const fullName =
        u.firstName || u.lastName ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : null
      return {
        userId: u.id,
        name: fullName || u.email?.split('@')[0] || 'Desconocido',
        email: u.email ?? null,
        phone: decryptPII(u.phone),
        bookingsCount: 0,
        lastBookingDate: null,
        totalPaid: 0,
        membershipStatus: 'none' as const,
        membershipPlan: null,
        membershipClubName: null,
        hasActiveMembership: false,
        hadMembershipEver: false,
        availableCredit: 0,
        creditClubName: null,
        tournamentsCount: 0,
        hasActivityInClub: false,
        isProfessor: false,
      }
    })

    const data = [...activeRows, ...otherRows]
    data.sort((a, b) => (b.lastBookingDate ?? '').localeCompare(a.lastBookingDate ?? ''))

    return res.json({ success: true, data, currency: club?.currency ?? 'USD' })
  } catch (err) {
    return next(err)
  }
})

// ─── GET /api/clubs/:clubId/players/:userId/bookings ─────────────────────────
// Historial y reservas activas de un jugador puntual en el club
router.get(
  '/:clubId/players/:userId/bookings',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clubId, userId } = req.params

      const [club, bookings] = await Promise.all([
        prisma.club.findUnique({ where: { id: clubId }, select: { name: true } }),
        prisma.booking.findMany({
          where: { slot: { court: { clubId } } },
          include: { slot: { include: { court: { select: { name: true, sport: true } } } } },
          orderBy: { createdAt: 'desc' },
        }),
      ])

      const today = new Date().toISOString().slice(0, 10)

      const rows = bookings
        .map((b) => {
          const players = (b.players as any[]) || []
          const me = players.find((p) => p.userId === userId)
          if (!me) return null
          return {
            id: b.id,
            date: b.slot.date,
            startTime: b.slot.startTime,
            endTime: b.slot.endTime,
            courtName: b.slot.court.name,
            sport: b.slot.court.sport,
            clubName: club?.name ?? null,
            status: b.status,
            amountPaid: me.amountPaid ?? 0,
            currency: b.currency,
            paymentStatus: me.paymentStatus ?? null,
            isUpcoming: b.slot.date >= today && b.status !== 'cancelled',
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      rows.sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))

      return res.json({ success: true, data: rows })
    } catch (err) {
      return next(err)
    }
  }
)

// ─── GET /api/clubs/:clubId/membership-analytics ─────────────────────────────
// Rentabilidad de cada membresía activa este mes: cuántas sesiones cubrió la
// membresía y cuánto habrían costado a precio normal (pay-per-use), comparado
// contra lo que paga el socio por el plan. Sirve para detectar planes demasiado
// baratos (el club "regala" más valor en pistas del que cobra por la suscripción).
router.get(
  '/:clubId/membership-analytics',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clubId = req.params.clubId
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const monthEnd = nextMonth.toISOString().slice(0, 10) // límite exclusivo YYYY-MM-DD

      const memberships = await prisma.userClubMembership.findMany({
        where: { clubId, status: 'active' },
        include: { plan: true },
      })

      if (memberships.length === 0) {
        return res.json({
          success: true,
          data: { periodStart: monthStart, members: [], byPlan: [] },
        })
      }

      const userIds = [...new Set(memberships.map((m) => m.userId))]

      const [bookings, users] = await Promise.all([
        prisma.booking.findMany({
          where: {
            status: { not: 'cancelled' },
            slot: { court: { clubId }, date: { gte: monthStart, lt: monthEnd } },
          },
          include: { slot: { include: { court: true } } },
        }),
        prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        }),
      ])
      const userById = new Map(users.map((u) => [u.id, u]))

      const members = memberships.map((m) => {
        let sessionsThisMonth = 0
        let valueProvided = 0
        for (const b of bookings) {
          const players = (b.players as any[]) || []
          const mine = players.find((p) => p.userId === m.userId && p.coveredBy === 'membership')
          if (!mine) continue
          sessionsThisMonth++
          const courtPrice = b.slot.isPeak ? b.slot.peakPrice : b.slot.basePrice
          const pricePerPlayer = b.slot.pricePerPlayer ?? courtPrice / (b.slot.court.capacity || 4)
          valueProvided += pricePerPlayer
        }
        const ratio = m.plan.price > 0 ? valueProvided / m.plan.price : null
        const u = userById.get(m.userId)
        const fullName =
          u && (u.firstName || u.lastName)
            ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
            : null

        return {
          membershipId: m.id,
          userId: m.userId,
          userName: fullName || u?.email?.split('@')[0] || 'Desconocido',
          planId: m.planId,
          planName: m.plan.name,
          planPrice: m.plan.price,
          currency: m.plan.currency,
          sessionsPerDayAllowed: m.plan.sessionsPerDay,
          sessionsThisMonth,
          valueProvided: Math.round(valueProvided * 100) / 100,
          ratio,
        }
      })

      const byPlanMap = new Map<
        string,
        {
          planId: string
          planName: string
          planPrice: number
          currency: string
          subscribers: number
          totalSessions: number
          totalValueProvided: number
        }
      >()
      for (const mem of members) {
        const agg = byPlanMap.get(mem.planId) ?? {
          planId: mem.planId,
          planName: mem.planName,
          planPrice: mem.planPrice,
          currency: mem.currency,
          subscribers: 0,
          totalSessions: 0,
          totalValueProvided: 0,
        }
        agg.subscribers += 1
        agg.totalSessions += mem.sessionsThisMonth
        agg.totalValueProvided += mem.valueProvided
        byPlanMap.set(mem.planId, agg)
      }

      const byPlan = [...byPlanMap.values()].map((agg) => {
        const avgSessionsPerMonth = agg.subscribers ? agg.totalSessions / agg.subscribers : 0
        const avgValueProvided = agg.subscribers ? agg.totalValueProvided / agg.subscribers : 0
        const totalRevenue = agg.subscribers * agg.planPrice
        return {
          ...agg,
          avgSessionsPerMonth: Math.round(avgSessionsPerMonth * 10) / 10,
          avgValueProvided: Math.round(avgValueProvided * 100) / 100,
          totalRevenue,
          netForClub: Math.round((totalRevenue - agg.totalValueProvided) * 100) / 100,
          avgRatio: agg.planPrice > 0 ? avgValueProvided / agg.planPrice : null,
        }
      })

      return res.json({ success: true, data: { periodStart: monthStart, members, byPlan } })
    } catch (err) {
      return next(err)
    }
  }
)

// ─── GET /api/clubs/:clubId/membership-payment-issues ────────────────────────
// Reservas de socios (membresía activa en el club) cuya parte quedó sin resolver:
// paymentStatus 'pending' (nunca se cobró — el jugador eligió pagar después y no
// volvió, o el cobro automático falló) o 'failed' (Stripe rechazó el cargo).
// Permite al admin ver el problema y resolverlo a mano desde el tab de Membresías
// (marcar como pagado) sin tener que ir a buscarlo en Reservas.
router.get(
  '/:clubId/membership-payment-issues',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clubId = req.params.clubId

      const memberships = await prisma.userClubMembership.findMany({
        where: { clubId, status: 'active' },
        select: { userId: true },
      })
      const memberIds = new Set(memberships.map((m) => m.userId))
      if (memberIds.size === 0) return res.json({ success: true, data: [] })

      const bookings = await prisma.booking.findMany({
        where: { status: { not: 'cancelled' }, slot: { court: { clubId } } },
        select: {
          id: true,
          currency: true,
          createdAt: true,
          players: true,
          slot: { select: { date: true, startTime: true, court: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      })

      const users = await prisma.user.findMany({
        where: { id: { in: [...memberIds] } },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
      const userById = new Map(users.map((u) => [u.id, u]))

      const issues: any[] = []
      for (const b of bookings) {
        const players = (b.players as any[]) || []
        for (const p of players) {
          if (!p.userId || !memberIds.has(p.userId)) continue
          if (p.paymentStatus !== 'pending' && p.paymentStatus !== 'failed') continue
          const u = userById.get(p.userId)
          const fullName =
            u && (u.firstName || u.lastName)
              ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
              : null
          issues.push({
            bookingId: b.id,
            playerUserId: p.userId,
            playerName: fullName || u?.email?.split('@')[0] || p.name || 'Desconocido',
            amountOwed: p.amountOwed ?? 0,
            paymentStatus: p.paymentStatus,
            currency: b.currency,
            date: b.slot?.date ?? null,
            startTime: b.slot?.startTime ?? null,
            courtName: b.slot?.court?.name ?? null,
          })
        }
      }

      return res.json({ success: true, data: issues })
    } catch (err) {
      return next(err)
    }
  }
)

// ─── GET /api/memberships/pricing ────────────────────────────────────────────
// Calcula el precio real de una reserva según la membresía del usuario
// Query: userId, slotId, clubId
router.get('/pricing', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, slotId, clubId } = req.query as Record<string, string>
    if (!userId || !slotId || !clubId) throw new AppError('userId, slotId y clubId requeridos', 400)

    const slot = await prisma.timeSlot.findUnique({
      where: { id: slotId },
      include: { court: true },
    })
    if (!slot) throw new AppError('Slot no encontrado', 404)

    const fullPrice = slot.isPeak ? slot.peakPrice : slot.basePrice
    const pricePerPlayer = slot.pricePerPlayer ?? fullPrice / (slot.court.capacity || 4)

    // ¿Tiene membresía activa en este club?
    const membership = await prisma.userClubMembership.findFirst({
      where: { userId, clubId, status: 'active' },
      include: { plan: true },
    })

    if (!membership) {
      // Sin membresía → paga precio completo de la pista (pay-per-use)
      return res.json({
        success: true,
        data: {
          pricingType: 'pay_per_use',
          price: fullPrice,
          pricePerPlayer,
          originalPrice: fullPrice,
          membershipPlan: null,
          sessionsUsedToday: 0,
          sessionsAllowedPerDay: 0,
          currency: slot.currency,
          savings: 0,
        },
      })
    }

    // Contar cuántas sesiones usó en la fecha del slot (día que se juega, no día que reserva) en este club
    const sessionsToday = await countMembershipSessionsForDate(prisma, userId, clubId, slot.date)

    const allowed = membership.plan.sessionsPerDay
    const hasSessionLeft = sessionsToday < allowed

    if (hasSessionLeft) {
      // Sesión cubierta por membresía → gratis
      return res.json({
        success: true,
        data: {
          pricingType: 'membership_included',
          price: 0,
          pricePerPlayer: 0,
          originalPrice: fullPrice,
          membershipPlan: membership.plan.name,
          membershipId: membership.id,
          sessionsUsedToday: sessionsToday,
          sessionsAllowedPerDay: allowed,
          currency: slot.currency,
          savings: fullPrice,
        },
      })
    }

    // Superó sesiones/día → cobra por jugador (precio extra de membresía o pricePerPlayer)
    const extraPrice =
      membership.plan.priceExtraSession > 0 ? membership.plan.priceExtraSession : pricePerPlayer

    return res.json({
      success: true,
      data: {
        pricingType: 'membership_extra',
        price: extraPrice,
        pricePerPlayer: extraPrice,
        originalPrice: fullPrice,
        membershipPlan: membership.plan.name,
        membershipId: membership.id,
        sessionsUsedToday: sessionsToday,
        sessionsAllowedPerDay: allowed,
        currency: slot.currency,
        savings: fullPrice - extraPrice,
      },
    })
  } catch (err) {
    return next(err)
  }
})

// ─── GET /api/memberships/user/:userId ──────────────────────────────────────
// Membresías activas del usuario
router.get('/user/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const memberships = await prisma.userClubMembership.findMany({
      where: { userId: req.params.userId },
      include: {
        plan: true,
        club: { select: { id: true, name: true, city: true, photos: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return res.json({ success: true, data: memberships })
  } catch (err) {
    return next(err)
  }
})

// ─── POST /api/memberships/subscribe ────────────────────────────────────────
// Suscribir usuario a un plan de membresía
router.post('/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { planId } = req.body
    const userId = req.headers['x-user-id'] as string | undefined
    if (!userId) throw new AppError('Autenticación requerida', 401)
    if (!planId) throw new AppError('planId requerido', 400)

    const plan = await prisma.clubMembershipPlan.findUnique({
      where: { id: planId },
      include: { club: true },
    })
    if (!plan || !plan.isActive) throw new AppError('Plan no disponible', 404)

    // Verificar que no tenga membresía activa en este club
    const existing = await prisma.userClubMembership.findFirst({
      where: { userId, clubId: plan.clubId, status: 'active' },
    })
    if (existing) throw new AppError('Ya tienes una membresía activa en este club', 409)

    const now = new Date()
    const membership = await prisma.userClubMembership.create({
      data: {
        userId,
        planId,
        clubId: plan.clubId,
        status: 'active',
        startDate: now,
        nextBillingDate: addMonths(now, 1),
        // stripeSubscriptionId: se añadirá cuando Stripe esté configurado
      },
      include: { plan: true, club: { select: { id: true, name: true, city: true } } },
    })

    return res.status(201).json({
      success: true,
      data: membership,
      message: `¡Bienvenido! Membresía en ${plan.club.name} activada.`,
    })
  } catch (err) {
    return next(err)
  }
})

// ─── DELETE /api/memberships/:id/cancel ─────────────────────────────────────
// Cancelar membresía — usado tanto desde la app (el socio) como desde el dashboard
// (el admin, tab Membresías). No corta el beneficio ya pagado: se queda en
// status='active' con cancelAtPeriodEnd=true hasta nextBillingDate, momento en el
// que el cron `expireCancelledMemberships` la pasa a 'cancelled'. Así no se pierde
// el resto del mes ya cobrado ni se le sigue cobrando el siguiente período.
router.delete('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const membership = await prisma.userClubMembership.findUnique({
      where: { id: req.params.id },
      include: { plan: true, club: { select: { name: true } } },
    })
    if (!membership) throw new AppError('Membresía no encontrada', 404)

    const requestingUserId = req.headers['x-user-id'] as string | undefined
    if (requestingUserId !== membership.userId) {
      await assertClubAdmin(requestingUserId, membership.clubId)
    }

    if (membership.status !== 'active') throw new AppError('La membresía no está activa', 400)
    if (membership.cancelAtPeriodEnd)
      throw new AppError('Esta membresía ya está en proceso de cancelación', 400)

    const updated = await prisma.userClubMembership.update({
      where: { id: membership.id },
      data: {
        cancelAtPeriodEnd: true,
        cancelledAt: new Date(),
      },
    })

    return res.json({
      success: true,
      data: updated,
      message: `Membresía en ${membership.club.name} cancelada. Sigue activa hasta ${membership.nextBillingDate.toLocaleDateString('es')}, sin cobrar el siguiente período.`,
    })
  } catch (err) {
    return next(err)
  }
})

export { router as membershipsRouter }
