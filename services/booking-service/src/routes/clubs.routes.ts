import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { AppError } from '../middleware/error.middleware'
import { requireClubAccess, requireClubOwner } from '../middleware/club-auth.middleware'
import { distanceKm } from '@racketly/utils'
import { decryptPII } from '@racketly/utils/pii-crypto'
import { generateSlotsForClub, resyncFutureSlotsForClub } from '../services/slot.service'
import { ensureCurrencyTracked } from '../services/exchange-rate-sync.service'

const router = Router()
const prisma = new PrismaClient()

// ISO 3166-1 alpha-2 → ISO 4217 currency
const COUNTRY_CURRENCY: Record<string, string> = {
  // América Latina
  CO: 'COP', MX: 'MXN', AR: 'ARS', BR: 'BRL', CL: 'CLP', PE: 'PEN',
  DO: 'DOP', CR: 'CRC', GT: 'GTQ', HN: 'HNL', NI: 'NIO', PA: 'USD',
  UY: 'UYU', PY: 'PYG', BO: 'BOB', EC: 'USD', VE: 'VES', CU: 'CUP',
  SV: 'USD', PR: 'USD', JM: 'JMD', HT: 'HTG', TT: 'TTD', BB: 'BBD',
  // América del Norte
  US: 'USD', CA: 'CAD',
  // Europa — Eurozona
  ES: 'EUR', FR: 'EUR', DE: 'EUR', IT: 'EUR', PT: 'EUR', NL: 'EUR',
  BE: 'EUR', AT: 'EUR', IE: 'EUR', FI: 'EUR', GR: 'EUR', SK: 'EUR',
  SI: 'EUR', LT: 'EUR', LV: 'EUR', EE: 'EUR', CY: 'EUR', MT: 'EUR',
  LU: 'EUR', HR: 'EUR',
  // Europa — otras
  GB: 'GBP', UK: 'GBP', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', RS: 'RSD',
  UA: 'UAH', IS: 'ISK', AL: 'ALL', MK: 'MKD', BA: 'BAM',
  // Asia
  JP: 'JPY', CN: 'CNY', IN: 'INR', KR: 'KRW', TH: 'THB', SG: 'SGD',
  MY: 'MYR', ID: 'IDR', PH: 'PHP', VN: 'VND', TW: 'TWD', HK: 'HKD',
  PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', KZ: 'KZT', UZ: 'UZS',
  // Medio Oriente
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR',
  IL: 'ILS', TR: 'TRY', IR: 'IRR', IQ: 'IQD', JO: 'JOD', LB: 'LBP',
  // África
  ZA: 'ZAR', NG: 'NGN', EG: 'EGP', MA: 'MAD', KE: 'KES', GH: 'GHS',
  TZ: 'TZS', ET: 'ETB', CI: 'XOF', SN: 'XOF', CM: 'XAF',
  // Oceanía
  AU: 'AUD', NZ: 'NZD', FJ: 'FJD', PG: 'PGK',
}

// ─── Rutas públicas (sin auth de club) ─────────────────────────────────────

// POST /api/clubs — crear nuevo club (auto-asigna owner)
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      ownerId, name, description, country, city, address,
      latitude, longitude, photos, sports, amenities,
      contactEmail, phone, website, currency,
      cancellationPolicy, bookingHorizonDays, slotGenerationHour,
    } = req.body

    if (!ownerId || !name || !country || !city || !address) {
      throw new AppError('Faltan campos requeridos: ownerId, name, country, city, address', 400)
    }

    const owner = await prisma.user.findUnique({ where: { id: ownerId } })
    if (!owner) throw new AppError('Usuario no encontrado', 404)

    const genHour = Number(slotGenerationHour ?? 6)
    if (!Number.isInteger(genHour) || genHour < 0 || genHour > 23) {
      throw new AppError('slotGenerationHour debe estar entre 0 y 23', 400)
    }

    const { v4: uuidv4 } = await import('uuid')
    const clubId = uuidv4()

    const [club] = await prisma.$transaction([
      prisma.club.create({
        data: {
          id: clubId,
          ownerId,
          name: name.trim(),
          description: description?.trim() || null,
          country,
          city: city.trim(),
          address: address.trim(),
          latitude:  Number(latitude  ?? 0),
          longitude: Number(longitude ?? 0),
          photos:    Array.isArray(photos)    ? photos.filter(Boolean)    : [],
          sports:    Array.isArray(sports)    ? sports                    : ['padel'],
          amenities: Array.isArray(amenities) ? amenities                 : [],
          contactEmail: contactEmail?.trim() || null,
          phone:        phone?.trim()        || null,
          website:      website?.trim()      || null,
          currency:     currency || COUNTRY_CURRENCY[country as string] || 'USD',
          cancellationPolicy: cancellationPolicy ?? 'flexible',
          bookingHorizonDays: Number(bookingHorizonDays ?? 14),
          slotGenerationHour: genHour,
        },
      }),
      prisma.clubAdmin.create({
        data: { id: uuidv4(), userId: ownerId, clubId, role: 'owner' },
      }),
    ])

    // Best-effort y no bloqueante: si la moneda del club es nueva (nadie la había usado
    // antes), la sincroniza contra Frankfurter para que aparezca en el panel de tasas de
    // cambio sin esperar al próximo "Sync automático" manual.
    void ensureCurrencyTracked(club.currency)

    return res.status(201).json({ success: true, data: { ...club, adminRole: 'owner' } })
  } catch (err) {
    return next(err)
  }
})

// GET /api/clubs — buscar clubes por ciudad/país/geo
const DIACRITICS_REGEX = new RegExp(String.fromCharCode(0x5b) + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + String.fromCharCode(0x5d), 'g')
function normalizeText(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS_REGEX, '').toLowerCase()
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, city, country, sport, lat, lng, radius = '20', page = '1', limit = '20', userId } = req.query

    const where: Record<string, unknown> = { isActive: true }
    const term = (search || city) as string | undefined
    if (country) where.country = country
    if (sport) where.sports = { has: sport }

    let clubs = await prisma.club.findMany({
      where,
      include: { courts: { where: { isActive: true }, select: { id: true, sport: true } } },
      // Con búsqueda por texto se filtra en memoria (insensible a tildes), así que no se pagina en la consulta.
      ...(term ? {} : { take: Number(limit), skip: (Number(page) - 1) * Number(limit) }),
    })

    if (term) {
      const needle = normalizeText(term)
      clubs = clubs.filter((c) => normalizeText(c.name).includes(needle) || normalizeText(c.city).includes(needle))
    }

    let result: any[] = clubs
    if (lat && lng) {
      const userLat = parseFloat(lat as string)
      const userLng = parseFloat(lng as string)
      const maxRadius = parseFloat(radius as string)

      const withDistance = clubs.map((club) => ({
        ...club,
        distanceKm: distanceKm(userLat, userLng, club.latitude, club.longitude),
      }))

      // Con búsqueda explícita (nombre/ciudad) no se descarta por radio, solo se ordena por cercanía.
      // Sin búsqueda (listado por defecto) sí se limita a lo cercano.
      result = term
        ? withDistance.sort((a, b) => a.distanceKm - b.distanceKm)
        : withDistance.filter((c) => c.distanceKm <= maxRadius).sort((a, b) => a.distanceKm - b.distanceKm)
    }

    // Sin búsqueda explícita: sumar clubs donde el usuario reservó en los últimos 3 meses,
    // aunque queden fuera del radio de cercanía.
    if (userId && !term) {
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

      const recentBookings = await prisma.booking.findMany({
        where: { userId: userId as string, createdAt: { gte: threeMonthsAgo } },
        select: { slot: { select: { court: { select: { clubId: true } } } } },
      })
      const recentClubIds = [...new Set(recentBookings.map((b) => b.slot.court.clubId))]
      const missingIds = recentClubIds.filter((id) => !result.some((c) => c.id === id))

      if (missingIds.length > 0) {
        const extraClubs = await prisma.club.findMany({
          where: { id: { in: missingIds }, isActive: true },
          include: { courts: { where: { isActive: true }, select: { id: true, sport: true } } },
        })
        const extraWithDistance = (lat && lng)
          ? extraClubs.map((club) => ({
              ...club,
              distanceKm: distanceKm(parseFloat(lat as string), parseFloat(lng as string), club.latitude, club.longitude),
              recentlyBooked: true,
            }))
          : extraClubs.map((club) => ({ ...club, recentlyBooked: true }))
        result = [...result, ...extraWithDistance]
      }
    }

    return res.json({
      success: true,
      data: result,
      pagination: { page: Number(page), pageSize: Number(limit), total: result.length },
    })
  } catch (err) {
    return next(err)
  }
})

// GET /api/clubs/admin/:userId — clubs donde el usuario es owner o admin
// Debe ir ANTES de /:id para que Express no lo intercepte
router.get('/admin/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params
    const adminEntries = await prisma.clubAdmin.findMany({
      where: { userId },
      include: {
        club: {
          include: { courts: { where: { isActive: true }, select: { id: true, sport: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    const clubs = adminEntries.map((e) => ({ ...e.club, adminRole: e.role }))
    return res.json({ success: true, data: clubs })
  } catch (err) {
    return next(err)
  }
})

// POST /api/clubs/invitations/accept — aceptar invitación con token (público)
router.post('/invitations/accept', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body
    if (!token) throw new AppError('token requerido', 400)

    const userId = req.headers['x-user-id'] as string | undefined
    if (!userId) throw new AppError('Autenticación requerida', 401)

    const inv = await prisma.clubInvitation.findUnique({ where: { token } })
    if (!inv) throw new AppError('Invitación no encontrada o ya usada', 404)
    if (inv.expiresAt < new Date()) throw new AppError('La invitación ha expirado', 410)

    // Verificar que el usuario autenticado sea el destinatario
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError('Usuario no encontrado', 404)
    if (user.email.toLowerCase() !== inv.email.toLowerCase()) {
      throw new AppError('Esta invitación no corresponde a tu cuenta', 403)
    }

    const [ca] = await prisma.$transaction([
      prisma.clubAdmin.upsert({
        where: { userId_clubId: { userId, clubId: inv.clubId } },
        update: { role: inv.role },
        create: { userId, clubId: inv.clubId, role: inv.role },
      }),
      prisma.clubInvitation.delete({ where: { token } }),
    ])

    return res.json({ success: true, data: ca })
  } catch (err) {
    return next(err)
  }
})

// GET /api/clubs/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const club = await prisma.club.findUnique({
      where: { id: req.params.id },
      include: { courts: { where: { isActive: true } } },
    })
    if (!club) throw new AppError('Club no encontrado', 404)
    return res.json({ success: true, data: club })
  } catch (err) {
    return next(err)
  }
})

// ─── Rutas con acceso de club (owner O admin) ────────────────────────────────

// GET /api/clubs/:id/admins
router.get('/:id/admins', requireClubAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admins = await prisma.clubAdmin.findMany({
      where: { clubId: req.params.id },
      include: {
        user: {
          select: {
            id: true, email: true,
            playerProfile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return res.json({ success: true, data: admins })
  } catch (err) {
    return next(err)
  }
})

// GET /api/clubs/:id/bookings
router.get('/:id/bookings', requireClubAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date, status, limit = '50' } = req.query
    const where: Record<string, unknown> = {
      slot: { court: { clubId: req.params.id } },
    }
    if (status) where.status = status
    if (date) where.slot = { ...(where.slot as object), date }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        slot: { include: { court: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    })
    return res.json({ success: true, data: bookings })
  } catch (err) {
    return next(err)
  }
})

// GET /api/clubs/:id/stats
router.get('/:id/stats', requireClubAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clubId = req.params.id
    const days = Math.min(Number(req.query.period) || 7, 90)
    const since = new Date()
    since.setDate(since.getDate() - days)
    // Período anterior equivalente, para comparar tendencia (ej. período de 7 días vs los 7 previos a esos).
    const prevSince = new Date(since)
    prevSince.setDate(prevSince.getDate() - days)
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [allBookings, prevBookings, courts, todayBookings, confirmedBookingsYesterday, todayClassSlots, yesterdayClassSlots, club] = await Promise.all([
      prisma.booking.findMany({
        where: { slot: { court: { clubId } }, createdAt: { gte: since } },
        select: { id: true, status: true, amountPaid: true, createdAt: true },
      }),
      prisma.booking.findMany({
        where: { slot: { court: { clubId } }, createdAt: { gte: prevSince, lt: since } },
        select: { status: true, amountPaid: true },
      }),
      prisma.court.findMany({
        where: { clubId, isActive: true },
        orderBy: { name: 'asc' },
        include: {
          // Trae hoy y ayer juntos para poder comparar ocupación media día a día.
          timeSlots: {
            where: { date: { in: [today, yesterday] } },
            include: { bookings: { where: { status: { in: ['confirmed', 'pending'] } } } },
          },
        },
      }),
      prisma.booking.findMany({
        where: { slot: { court: { clubId }, date: today }, status: { in: ['confirmed', 'pending'] } },
        include: { slot: { include: { court: { select: { name: true, sport: true } } } } },
        orderBy: { slot: { startTime: 'asc' } },
        take: 20,
      }),
      prisma.booking.count({
        where: { slot: { court: { clubId }, date: yesterday }, status: 'confirmed' },
      }),
      // Clases de hoy con cancha asignada — cuentan como pista ocupada aunque no
      // generen una fila de Booking (usan su propio flujo de reserva/pago).
      prisma.classSlot.findMany({
        where: { clubId, date: today, status: 'open', courtId: { not: null } },
        select: { courtId: true, bookings: { where: { status: 'active' }, select: { id: true } } },
      }),
      prisma.classSlot.findMany({
        where: { clubId, date: yesterday, status: 'open', courtId: { not: null } },
        select: { courtId: true, bookings: { where: { status: 'active' }, select: { id: true } } },
      }),
      prisma.club.findUnique({ where: { id: clubId }, select: { country: true, currency: true } }),
    ])

    const classesByCourtToday = new Map<string, number>()
    for (const cs of todayClassSlots) {
      if (!cs.courtId) continue
      classesByCourtToday.set(cs.courtId, (classesByCourtToday.get(cs.courtId) ?? 0) + 1)
    }
    const classesByCourtYesterday = new Map<string, number>()
    for (const cs of yesterdayClassSlots) {
      if (!cs.courtId) continue
      classesByCourtYesterday.set(cs.courtId, (classesByCourtYesterday.get(cs.courtId) ?? 0) + 1)
    }

    const confirmed = allBookings.filter((b) => b.status === 'confirmed' || b.status === 'completed')
    const totalRevenue = confirmed.reduce((s, b) => s + (b.amountPaid ?? 0), 0)

    const prevConfirmed = prevBookings.filter((b) => b.status === 'confirmed' || b.status === 'completed')
    const previousPeriod = {
      totalBookings:     prevBookings.length,
      confirmedBookings: prevConfirmed.length,
      cancelledBookings: prevBookings.filter((b) => b.status === 'cancelled').length,
      pendingBookings:   prevBookings.filter((b) => b.status === 'pending').length,
      totalRevenue:      prevConfirmed.reduce((s, b) => s + (b.amountPaid ?? 0), 0),
    }

    const byDay: Record<string, { bookings: number; revenue: number }> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      byDay[d.toISOString().split('T')[0]] = { bookings: 0, revenue: 0 }
    }
    confirmed.forEach((b) => {
      const day = b.createdAt.toISOString().split('T')[0]
      if (byDay[day]) { byDay[day].bookings++; byDay[day].revenue += b.amountPaid ?? 0 }
    })

    const occupancyFor = (date: string, classesByCourt: Map<string, number>) =>
      courts.map((c) => {
        const slotsThatDay = c.timeSlots.filter((s) => s.date === date)
        const classes = classesByCourt.get(c.id) ?? 0
        const total  = slotsThatDay.length + classes
        const booked = slotsThatDay.filter((s) => s.bookings.length > 0).length + classes
        return {
          id: c.id, name: c.name, sport: c.sport,
          slotsToday: total, bookedToday: booked,
          pct: total > 0 ? Math.round((booked / total) * 100) : 0,
        }
      })

    const courtOccupancy = occupancyFor(today, classesByCourtToday)
    const yesterdayOccupancy = occupancyFor(yesterday, classesByCourtYesterday)
    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0
    const avgOccupancyToday = avg(courtOccupancy.map((c) => c.pct))
    const avgOccupancyYesterday = avg(yesterdayOccupancy.map((c) => c.pct))

    const country = club?.country ?? 'US'
    const currency = club?.currency || COUNTRY_CURRENCY[country] || 'USD'

    // Clases de hoy/ayer con al menos un alumno activo — el equivalente a una "reserva
    // confirmada" para clases, ya que un slot de clase sin alumnos aún no está reservado.
    const confirmedClassesToday = todayClassSlots.filter((cs) => cs.bookings.length > 0).length
    const confirmedClassesYesterday = yesterdayClassSlots.filter((cs) => cs.bookings.length > 0).length
    const confirmedYesterday = confirmedBookingsYesterday + confirmedClassesYesterday

    return res.json({
      success: true,
      data: {
        period: days,
        currency,
        totalBookings:     allBookings.length,
        confirmedBookings: confirmed.length,
        cancelledBookings: allBookings.filter((b) => b.status === 'cancelled').length,
        pendingBookings:   allBookings.filter((b) => b.status === 'pending').length,
        totalRevenue,
        previousPeriod,
        byDay: Object.entries(byDay).map(([date, v]) => ({ date, ...v })),
        courtOccupancy,
        avgOccupancyToday,
        avgOccupancyYesterday,
        todayBookings,
        confirmedClassesToday,
        confirmedClassesYesterday,
        confirmedYesterday,
      },
    })
  } catch (err) {
    return next(err)
  }
})

// GET /api/clubs/:id/cash-report — Cuadre de caja: cobros agrupados por método (cash/card)
// en un rango de fechas. Se filtra por `paidAt` (fecha real del cobro) — NO por la fecha
// de la reserva/membresía que el pago cubre, que puede ser un día completamente distinto
// (ej. un socio paga hoy una reserva para jugar la próxima semana).
// Query: from, to (YYYY-MM-DD, ambos inclusive; default = hoy en ambos).
router.get('/:id/cash-report', requireClubAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clubId = req.params.id
    const today = new Date().toISOString().split('T')[0]
    const from = (req.query.from as string) || today
    const to   = (req.query.to as string) || from

    const fromDate = new Date(`${from}T00:00:00.000Z`)
    const toDate   = new Date(`${to}T23:59:59.999Z`)

    const payments = await prisma.payment.findMany({
      where: { clubId, paidAt: { gte: fromDate, lte: toDate } },
      orderBy: { paidAt: 'desc' },
    })

    const byMethod: Record<'cash' | 'card', { count: number; total: number }> = {
      cash: { count: 0, total: 0 },
      card: { count: 0, total: 0 },
    }
    const byCurrency: Record<string, number> = {}
    for (const p of payments) {
      byMethod[p.method].count += 1
      byMethod[p.method].total += p.amount
      byCurrency[p.currency] = (byCurrency[p.currency] ?? 0) + p.amount
    }

    return res.json({
      success: true,
      data: {
        from, to,
        totalCollected: payments.reduce((s, p) => s + p.amount, 0),
        byMethod,
        byCurrency,
        payments,
      },
    })
  } catch (err) {
    return next(err)
  }
})

// GET /api/clubs/:id/payment-issues — Todos los cobros pendientes/fallidos del club
// (reservas de cancha + clases, sin restringir a socios — a diferencia de
// /api/clubs/:clubId/membership-payment-issues que solo mira socios). Pensado para
// gestionarse desde Caja: junto a cada pendiente se incluye contexto de la reserva/clase
// y el contacto del jugador (teléfono/email) para poder resolverlo o contactarlo.
router.get('/:id/payment-issues', requireClubAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clubId = req.params.id

    const [bookings, classBookings, tournamentParticipants] = await Promise.all([
      prisma.booking.findMany({
        where: { status: { not: 'cancelled' }, slot: { court: { clubId } } },
        select: {
          id: true, currency: true, players: true,
          slot: { select: { date: true, startTime: true, court: { select: { name: true, sport: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
      prisma.classBooking.findMany({
        where: { status: 'active', paymentStatus: { in: ['pending', 'failed'] }, classSlot: { clubId } },
        include: { classSlot: { include: { professor: true, court: true } } },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
      // Inscripciones a torneo con saldo pendiente — mismo Postgres que booking-service
      // (schema compartido con tournament-service), así que se puede consultar directo.
      prisma.tournamentParticipant.findMany({
        where: { paymentStatus: { in: ['pending', 'failed'] }, tournament: { clubId } },
        include: { tournament: { select: { name: true, currency: true, sport: true, startDate: true } }, player: { select: { displayName: true } } },
        orderBy: { registeredAt: 'desc' },
        take: 300,
      }),
    ])

    // `key` agrupa cada pendiente por jugador: userId si tiene cuenta, guestId si es un
    // invitado sin cuenta (no tiene fila en User, así que no se puede agrupar por userId).
    type RawIssue = { key: string; userId: string | null; item: any }
    const raw: RawIssue[] = []

    for (const b of bookings) {
      const players = (b.players as any[]) || []
      for (const p of players) {
        const key = p.userId ?? p.guestId
        if (!key) continue
        if (p.paymentStatus !== 'pending' && p.paymentStatus !== 'failed') continue
        raw.push({
          key,
          userId: p.userId ?? null,
          item: {
            type: 'booking' as const,
            bookingId: b.id,
            playerUserId: p.userId ?? null,
            playerGuestId: p.guestId ?? null,
            playerName: p.name ?? null,
            amountOwed: p.amountOwed ?? 0,
            paymentStatus: p.paymentStatus,
            currency: b.currency,
            date: b.slot?.date ?? null,
            startTime: b.slot?.startTime ?? null,
            courtName: b.slot?.court?.name ?? null,
            sport: b.slot?.court?.sport ?? null,
          },
        })
      }
    }

    for (const cb of classBookings) {
      raw.push({
        key: cb.studentUserId,
        userId: cb.studentUserId,
        item: {
          type: 'class' as const,
          classBookingId: cb.id,
          playerUserId: cb.studentUserId,
          playerName: cb.studentName,
          amountOwed: Math.max(0, cb.amountOwed - cb.amountPaid),
          paymentStatus: cb.paymentStatus,
          currency: cb.classSlot.currency,
          date: cb.classSlot.date,
          startTime: cb.classSlot.startTime,
          courtName: cb.classSlot.court?.name ?? null,
          sport: cb.classSlot.court?.sport ?? null,
          professorName: cb.classSlot.professor.name,
        },
      })
    }

    for (const tp of tournamentParticipants) {
      const owed = Math.max(0, tp.amountOwed - tp.amountPaid)
      if (owed <= 0) continue
      raw.push({
        key: tp.playerId,
        userId: tp.playerId,
        item: {
          type: 'tournament' as const,
          tournamentId: tp.tournamentId,
          tournamentParticipantId: tp.id,
          playerUserId: tp.playerId,
          playerName: tp.player?.displayName ?? null,
          amountOwed: owed,
          paymentStatus: tp.paymentStatus,
          currency: tp.tournament.currency,
          date: tp.tournament.startDate?.toISOString().slice(0, 10) ?? null,
          startTime: null,
          courtName: null,
          sport: tp.tournament.sport,
          tournamentName: tp.tournament.name,
        },
      })
    }

    const userIds = [...new Set(raw.map((r) => r.userId).filter((id): id is string => !!id))]
    const [users, memberships] = await Promise.all([
      userIds.length
        ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, phone: true, firstName: true, lastName: true } })
        : Promise.resolve([]),
      // Socios activos del club — usado solo para el badge informativo "Socio/No socio" en
      // Caja; no cambia el monto a cobrar (no hay descuento de membresía en ningún tipo de pago aquí).
      userIds.length
        ? prisma.userClubMembership.findMany({ where: { clubId, userId: { in: userIds }, status: 'active' }, select: { userId: true } })
        : Promise.resolve([]),
    ])
    const userById = new Map(users.map((u) => [u.id, u]))
    const memberUserIds = new Set(memberships.map((m) => m.userId))

    const issues = raw.map((r) => {
      const u = r.userId ? userById.get(r.userId) : undefined
      const fullName = u && (u.firstName || u.lastName) ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : null
      return {
        ...r.item,
        groupKey: r.key,
        isGuest: !r.userId,
        isMember: r.userId ? memberUserIds.has(r.userId) : false,
        playerName: r.item.playerName || fullName || u?.email?.split('@')[0] || 'Desconocido',
        playerEmail: u?.email ?? null,
        playerPhone: decryptPII(u?.phone),
      }
    })

    issues.sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`))

    return res.json({ success: true, data: issues })
  } catch (err) {
    return next(err)
  }
})

// GET /api/clubs/:id/availability — público para jugadores
router.get('/:id/availability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.query
    if (!date) throw new AppError('Fecha requerida', 400)

    const slots = await prisma.timeSlot.findMany({
      where: {
        court: { clubId: req.params.id, isActive: true },
        date: date as string,
      },
      include: {
        court: true,
        bookings: { where: { status: { in: ['pending', 'confirmed'] } } },
      },
      orderBy: [{ courtId: 'asc' }, { startTime: 'asc' }],
    })

    const now = new Date()
    const result = slots.map((slot) => {
      const blockExpired = slot.blockedExpiresAt && now > slot.blockedExpiresAt
      const isBlocked = slot.isBlocked && !blockExpired
      return {
        ...slot,
        isBlocked,
        isAvailable: slot.bookings.length === 0 && !isBlocked,
        bookings: undefined,
      }
    })

    return res.json({ success: true, data: result })
  } catch (err) {
    return next(err)
  }
})

// PUT /api/clubs/:id — actualizar club
router.put('/:id', requireClubAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name, description, city, address,
      sports, amenities,
      contactEmail, phone, website,
      bookingHorizonDays, slotGenerationHour, currency, cancellationPolicy, timezone,
      paymentWarningMinutesBefore, rosterWarningHoursBefore,
    } = req.body

    const data: Record<string, unknown> = {}

    if (name            !== undefined) data.name            = String(name).trim()
    if (description     !== undefined) data.description     = description ? String(description).trim() : null
    if (city            !== undefined) data.city            = String(city).trim()
    if (address         !== undefined) data.address         = String(address).trim()
    if (Array.isArray(sports))         data.sports          = sports
    if (Array.isArray(amenities))      data.amenities       = amenities
    if (contactEmail    !== undefined) data.contactEmail    = contactEmail ? String(contactEmail).trim() : null
    if (phone           !== undefined) data.phone           = phone ? String(phone).trim() : null
    if (website         !== undefined) data.website         = website ? String(website).trim() : null
    if (currency        !== undefined) data.currency        = currency
    if (cancellationPolicy !== undefined) data.cancellationPolicy = cancellationPolicy
    if (bookingHorizonDays !== undefined) {
      const days = Number(bookingHorizonDays)
      if (!Number.isInteger(days) || days < 1 || days > 90) {
        throw new AppError('bookingHorizonDays debe estar entre 1 y 90', 400)
      }
      data.bookingHorizonDays = days
    }
    if (slotGenerationHour !== undefined) {
      const hour = Number(slotGenerationHour)
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw new AppError('slotGenerationHour debe estar entre 0 y 23', 400)
      }
      data.slotGenerationHour = hour
    }
    if (timezone !== undefined) {
      const tz = String(timezone).trim()
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz })
      } catch {
        throw new AppError('timezone debe ser un identificador IANA válido (ej. "America/Santo_Domingo")', 400)
      }
      data.timezone = tz
    }
    if (paymentWarningMinutesBefore !== undefined) {
      const m = Number(paymentWarningMinutesBefore)
      // Debe preceder al cutoff real de pago (15 min, fijo)
      if (!Number.isInteger(m) || m < 1 || m > 14) {
        throw new AppError('paymentWarningMinutesBefore debe estar entre 1 y 14', 400)
      }
      data.paymentWarningMinutesBefore = m
    }
    if (rosterWarningHoursBefore !== undefined) {
      const h = Number(rosterWarningHoursBefore)
      // Debe preceder al deadline real de roster (24h, fijo)
      if (!Number.isInteger(h) || h < 1 || h > 23) {
        throw new AppError('rosterWarningHoursBefore debe estar entre 1 y 23', 400)
      }
      data.rosterWarningHoursBefore = h
    }

    if (Object.keys(data).length === 0) {
      return res.json({ success: true, message: 'Sin cambios' })
    }

    const club = await prisma.club.update({
      where: { id: req.params.id },
      data,
    })

    return res.json({ success: true, data: club })
  } catch (err) {
    return next(err)
  }
})

// POST /api/clubs/:id/courts — crear cancha
router.post('/:id/courts', requireClubAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name, sport, surface, isIndoor, hasLighting, capacity,
      basePrice, peakPrice, currency,
      openTimeWeekday, closeTimeWeekday,
      openTimeWeekend, closeTimeWeekend,
      slotDuration,
    } = req.body
    if (!name || !sport) throw new AppError('name y sport son requeridos', 400)

    const club = await prisma.club.findUnique({ where: { id: req.params.id } })
    if (!club) throw new AppError('Club no encontrado', 404)

    const { v4: uuidv4 } = await import('uuid')
    const court = await prisma.court.create({
      data: {
        id: uuidv4(),
        clubId: req.params.id,
        name,
        sport,
        surface:          surface         || 'cristal',
        isIndoor:         isIndoor        ?? false,
        hasLighting:      hasLighting     ?? false,
        capacity:         capacity        ?? 4,
        isActive:         true,
        basePrice:        Number(basePrice  ?? 0),
        peakPrice:        Number(peakPrice  ?? 0),
        currency:         currency        || club.currency || 'USD',
        openTimeWeekday:  openTimeWeekday  || '07:00',
        closeTimeWeekday: closeTimeWeekday || '23:00',
        openTimeWeekend:  openTimeWeekend  || '07:00',
        closeTimeWeekend: closeTimeWeekend || '23:00',
        slotDuration:     Number(slotDuration ?? 60),
      },
    })
    return res.status(201).json({ success: true, data: court })
  } catch (err) {
    return next(err)
  }
})

// POST /api/clubs/:id/generate-slots
router.post('/:id/generate-slots', requireClubAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const club = await prisma.club.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!club) throw new AppError('Club no encontrado', 404)

    const result = await generateSlotsForClub(req.params.id)
    return res.json({ success: true, data: result })
  } catch (err) {
    return next(err)
  }
})

// GET /api/clubs/:id/peak-hours — horario pico configurado (por día de la semana)
router.get('/:id/peak-hours', requireClubAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const club = await prisma.club.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!club) throw new AppError('Club no encontrado', 404)

    const rules = await prisma.peakHourRule.findMany({
      where: { clubId: req.params.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
    })
    return res.json({ success: true, data: rules, usingDefault: rules.length === 0 })
  } catch (err) {
    return next(err)
  }
})

// PUT /api/clubs/:id/peak-hours — reemplaza el horario pico completo del club
// body: { rules: { dayOfWeek: 0-6, startTime: 'HH:mm', endTime: 'HH:mm' }[] }
router.put('/:id/peak-hours', requireClubAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const club = await prisma.club.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!club) throw new AppError('Club no encontrado', 404)

    const { rules } = req.body as { rules: { dayOfWeek: number; startTime: string; endTime: string }[] }
    if (!Array.isArray(rules)) throw new AppError('rules (array) requerido', 400)

    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/
    for (const r of rules) {
      if (!Number.isInteger(r.dayOfWeek) || r.dayOfWeek < 0 || r.dayOfWeek > 6) {
        throw new AppError('dayOfWeek debe ser 0-6', 400)
      }
      const validEnd = r.endTime === '24:00' || timeRe.test(r.endTime)
      if (!timeRe.test(r.startTime) || !validEnd) throw new AppError('Horas inválidas (formato HH:mm)', 400)
      if (r.startTime >= r.endTime) throw new AppError('La hora de inicio debe ser menor a la de fin', 400)
    }

    await prisma.$transaction([
      prisma.peakHourRule.deleteMany({ where: { clubId: req.params.id } }),
      ...(rules.length > 0
        ? [prisma.peakHourRule.createMany({
            data: rules.map((r) => ({ clubId: req.params.id, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime })),
          })]
        : []),
    ])

    const slotsUpdated = await resyncFutureSlotsForClub(req.params.id)

    const saved = await prisma.peakHourRule.findMany({
      where: { clubId: req.params.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
    })
    return res.json({ success: true, data: saved, slotsUpdated })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/clubs/:id/active
router.patch('/:id/active', requireClubAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isActive } = req.body
    if (typeof isActive !== 'boolean') throw new AppError('isActive (boolean) requerido', 400)

    const club = await prisma.club.update({
      where: { id: req.params.id },
      data: { isActive },
      select: { id: true, name: true, isActive: true },
    })
    return res.json({ success: true, data: club })
  } catch (err) {
    return next(err)
  }
})

// ─── Rutas exclusivas para owner ─────────────────────────────────────────────

// POST /api/clubs/:id/admins — agregar admin (solo owner)
router.post('/:id/admins', requireClubOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, role = 'admin' } = req.body
    if (!email) throw new AppError('email requerido', 400)

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) throw new AppError('Usuario no encontrado', 404)

    const ca = await prisma.clubAdmin.upsert({
      where: { userId_clubId: { userId: user.id, clubId: req.params.id } },
      update: { role },
      create: { userId: user.id, clubId: req.params.id, role },
      include: { user: { include: { playerProfile: { select: { displayName: true, avatarUrl: true } } } } },
    })
    return res.status(201).json({ success: true, data: ca })
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/clubs/:id/admins/:adminId — remover admin (solo owner)
router.delete('/:id/admins/:adminId', requireClubOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ca = await prisma.clubAdmin.findUnique({ where: { id: req.params.adminId } })
    if (!ca || ca.clubId !== req.params.id) throw new AppError('Admin no encontrado en este club', 404)
    if (ca.role === 'owner') throw new AppError('No se puede remover al owner', 400)

    await prisma.clubAdmin.delete({ where: { id: req.params.adminId } })
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// GET /api/clubs/:id/invitations — listar invitaciones pendientes (solo owner)
router.get('/:id/invitations', requireClubOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invitations = await prisma.clubInvitation.findMany({
      where: { clubId: req.params.id },
      orderBy: { createdAt: 'desc' },
    })
    return res.json({ success: true, data: invitations })
  } catch (err) {
    return next(err)
  }
})

// POST /api/clubs/:id/invitations — crear invitación (solo owner)
router.post('/:id/invitations', requireClubOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, role = 'admin' } = req.body
    if (!email) throw new AppError('email requerido', 400)
    if (!['admin', 'owner'].includes(role)) throw new AppError('role debe ser admin u owner', 400)

    // No invitar a alguien que ya es admin
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      const alreadyAdmin = await prisma.clubAdmin.findFirst({
        where: { userId: existing.id, clubId: req.params.id },
      })
      if (alreadyAdmin) throw new AppError('Este usuario ya es administrador del club', 409)
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 días de vigencia

    const invitation = await prisma.clubInvitation.upsert({
      where: { clubId_email: { clubId: req.params.id, email: email.toLowerCase() } },
      update: { role, expiresAt, invitedBy: req.clubAdmin!.userId },
      create: {
        clubId: req.params.id,
        email: email.toLowerCase(),
        role,
        expiresAt,
        invitedBy: req.clubAdmin!.userId,
      },
    })

    return res.status(201).json({ success: true, data: invitation })
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/clubs/:id/invitations/:invitationId — cancelar invitación (solo owner)
router.delete('/:id/invitations/:invitationId', requireClubOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inv = await prisma.clubInvitation.findUnique({ where: { id: req.params.invitationId } })
    if (!inv || inv.clubId !== req.params.id) throw new AppError('Invitación no encontrada', 404)

    await prisma.clubInvitation.delete({ where: { id: req.params.invitationId } })
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/clubs/:id — solo si no hay reservas históricas (solo owner)
router.delete('/:id', requireClubOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clubId = req.params.id

    const bookingCount = await prisma.booking.count({
      where: { slot: { court: { clubId } } },
    })

    if (bookingCount > 0) {
      throw new AppError(
        `No se puede eliminar: el club tiene ${bookingCount} reserva${bookingCount > 1 ? 's' : ''} registrada${bookingCount > 1 ? 's' : ''}. Desactívalo en su lugar.`,
        409,
      )
    }

    await prisma.club.delete({ where: { id: clubId } })
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export { router as clubsRouter }
