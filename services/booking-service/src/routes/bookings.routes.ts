import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import QRCode from 'qrcode'
import { v4 as uuidv4 } from 'uuid'
import { randomUUID } from 'crypto'
import { AppError } from '../middleware/error.middleware'
import { isSlotAvailable } from '../services/slot.service'
import {
  createStripePaymentIntent,
  retrieveStripePaymentIntent,
  refundStripePayment,
  isStripeConfigured,
} from '../services/payment.service'

const WEB_URL = process.env.WEB_URL || 'http://localhost:3010'
const GUEST_PAYMENT_LINK_TTL_HOURS = 48
import { countMembershipSessionsForDate } from '../services/membership-sessions.service'
import { applyMatchElo } from '../services/match-elo.service'
import {
  restoreCoveredCredits,
  cancelBookingAndIssueCredit,
} from '../services/cancellation.service'
import {
  toMinutes,
  hasConflictingClass,
  hasConflictingMaintenance,
} from '../services/schedule-conflict.service'
import { determineWinner } from '@racketly/utils'
import type { SetScore } from '@racketly/shared-types'

const router = Router()
const prisma = new PrismaClient()

// Registra un cobro real en el libro de caja (Payment), separado del bookkeeping de
// amountPaid/paymentStatus en Booking. `paidAt` es SIEMPRE el momento del cobro — no la
// fecha de la reserva que cubre — porque es lo que importa para el cuadre de caja diario.
export async function recordPayment(opts: {
  clubId: string
  bookingId?: string
  playerUserId?: string | null
  playerName?: string
  amount: number
  currency: string
  method: 'cash' | 'card'
}) {
  if (opts.amount <= 0) return
  await prisma.payment.create({
    data: {
      clubId: opts.clubId,
      bookingId: opts.bookingId,
      playerUserId: opts.playerUserId ?? undefined,
      playerName: opts.playerName,
      amount: opts.amount,
      currency: opts.currency,
      method: opts.method,
    },
  })
}

function resolvePaymentMethod(input: unknown): 'cash' | 'card' {
  return input === 'cash' ? 'cash' : 'card'
}
// Para "Marcar pagado" manual desde el dashboard, sin método explícito se asume efectivo
// (es el caso típico: cobro presencial no capturado por Stripe) — a diferencia de las
// reservas nuevas, donde el default es 'card' porque cubre el flujo de la app.
function resolvePaymentMethodDefaultCash(input: unknown): 'cash' | 'card' {
  return input === 'card' ? 'card' : 'cash'
}

// Resuelve si un jugador (compañero o dueño) no necesita pagar su parte porque:
//  1) tiene membresía activa en el club con sesión disponible ese día — el día que se
//     JUEGA (slotDate), no el día en que se hace la reserva — (como dueño o como
//     compañero en otra reserva — se cuenta igual), o
//  2) tiene crédito disponible en el club que alcanza para cubrir su parte (se consume automáticamente,
//     guardando qué créditos se usaron para poder restaurarlos si la reserva se cancela).
// Si tiene membresía pero ya agotó sus sesiones del día, el precio a cobrar (por Stripe o
// crédito) es el `priceExtraSession` del plan si el club definió uno — no el precio completo
// de la pista — igual que ya calculaba GET /pricing (antes esta función lo ignoraba y siempre
// cobraba el precio completo, dejando la tarifa de socio sin aplicar en la reserva real).
// Si ninguna aplica, cae al flag `pay` que decidió quien reserva.
async function resolvePlayerCoverage(
  playerUserId: string,
  clubId: string,
  pricePerPlayer: number,
  wantsToPayNow: boolean,
  slotDate: string
) {
  const membership = await prisma.userClubMembership.findFirst({
    where: { userId: playerUserId, clubId, status: 'active' },
    include: { plan: true },
  })

  let effectivePrice = pricePerPlayer
  if (membership) {
    const sessionsOnDate = await countMembershipSessionsForDate(
      prisma,
      playerUserId,
      clubId,
      slotDate
    )
    if (sessionsOnDate < membership.plan.sessionsPerDay) {
      return {
        amountOwed: 0,
        amountPaid: 0,
        paymentStatus: 'paid' as const,
        coveredBy: 'membership' as const,
        creditIdsUsed: undefined as string[] | undefined,
      }
    }
    if (membership.plan.priceExtraSession > 0) {
      effectivePrice = membership.plan.priceExtraSession
    }
  }

  const availableCredits = await prisma.userCredit.findMany({
    where: { userId: playerUserId, clubId, status: 'available' },
    orderBy: { createdAt: 'asc' },
  })
  const totalCredit = availableCredits.reduce((sum, c) => sum + c.amount, 0)
  if (totalCredit >= effectivePrice) {
    let remaining = effectivePrice
    const idsToUse: string[] = []
    for (const c of availableCredits) {
      if (remaining <= 0) break
      idsToUse.push(c.id)
      remaining -= c.amount
    }
    await prisma.userCredit.updateMany({
      where: { id: { in: idsToUse } },
      data: { status: 'used', usedAt: new Date() },
    })
    return {
      amountOwed: effectivePrice,
      amountPaid: effectivePrice,
      paymentStatus: 'paid' as const,
      coveredBy: 'credit' as const,
      creditIdsUsed: idsToUse,
    }
  }

  return {
    amountOwed: effectivePrice,
    amountPaid: wantsToPayNow ? effectivePrice : 0,
    paymentStatus: wantsToPayNow ? ('paid' as const) : ('pending' as const),
    coveredBy: null,
    creditIdsUsed: undefined as string[] | undefined,
  }
}

// POST /api/bookings — Crear reserva
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const {
    slotId,
    userId,
    players,
    paymentProvider,
    pricingType,
    membershipId,
    ownerName,
    ownerPay,
  } = req.body
  // Método de cobro para lo que se paga AHORA en esta reserva (dueño y/o compañeros con pay:true).
  // La app del jugador nunca manda este campo → cae a 'card' (todo pago por app es tarjeta).
  // Solo el dashboard admin, al cobrar en persona, manda explícitamente 'cash'.
  const paymentMethod = resolvePaymentMethod(req.body.paymentMethod)

  try {
    // Mismo patrón que el resto de este archivo (DELETE /:id, etc.): si el gateway mandó
    // x-user-id, debe coincidir con el `userId` de la reserva — si no, cualquiera podía crear
    // reservas (con cobros asociados) a nombre de otra persona con solo mandar su id en el body.
    const requestingUserId = req.headers['x-user-id'] as string | undefined
    if (requestingUserId && userId !== requestingUserId) {
      throw new AppError('No puedes crear una reserva a nombre de otro usuario', 403)
    }

    // Verificar disponibilidad
    const available = await isSlotAvailable(slotId)
    if (!available) throw new AppError('Esta cancha ya no está disponible', 409)

    const slot = await prisma.timeSlot.findUnique({
      where: { id: slotId },
      include: { court: true },
    })
    if (!slot) throw new AppError('Slot no encontrado', 404)

    const blockExpired = slot.blockedExpiresAt && new Date() > slot.blockedExpiresAt
    if (slot.isBlocked && !blockExpired) {
      const allowedUser = slot.blockedForUserId
      if (!allowedUser || allowedUser !== userId) {
        throw new AppError('Este horario está bloqueado por el club', 409)
      }
    }

    if (
      await hasConflictingClass(
        slot.courtId,
        slot.date,
        toMinutes(slot.startTime),
        toMinutes(slot.endTime)
      )
    ) {
      throw new AppError('Esta pista tiene una clase programada a esa hora', 409)
    }

    if (
      await hasConflictingMaintenance(
        slot.courtId,
        slot.date,
        toMinutes(slot.startTime),
        toMinutes(slot.endTime)
      )
    ) {
      throw new AppError('Esta pista está en mantenimiento en ese horario', 409)
    }

    const courtPrice = slot.isPeak ? slot.peakPrice : slot.basePrice
    const capacity = slot.court.capacity || 4
    const pricePerPlayer = slot.pricePerPlayer ?? courtPrice / capacity

    const resolvedPricingType = pricingType || 'pay_per_use'
    const extraPlayers = (players as any[] | undefined) ?? []

    if (1 + extraPlayers.length > capacity) {
      throw new AppError(`Esta cancha admite máximo ${capacity} jugadores`, 400)
    }

    // Validar que ningún jugador ya tenga reserva activa en el mismo horario
    const sameTimeSlots = await prisma.timeSlot.findMany({
      where: { date: slot.date, startTime: slot.startTime, endTime: slot.endTime },
      select: { id: true },
    })
    if (sameTimeSlots.length > 0) {
      const conflictBookings = await prisma.booking.findMany({
        where: {
          slotId: { in: sameTimeSlots.map((s) => s.id) },
          status: { in: ['pending', 'confirmed'] },
        },
        select: { userId: true, players: true },
      })
      const bookedIds = new Set<string>()
      for (const b of conflictBookings) {
        bookedIds.add(b.userId)
        for (const p of (b.players as any[]) || []) {
          if (p.userId) bookedIds.add(p.userId)
        }
      }
      const allRequestedIds = [userId, ...extraPlayers.map((p: any) => p.userId).filter(Boolean)]
      const conflicts = allRequestedIds.filter((id) => bookedIds.has(id))
      if (conflicts.length > 0) {
        throw new AppError('Uno o más jugadores ya tienen una reserva activa en este horario', 409)
      }
    }

    const ownerCourtesy = req.body.ownerCourtesy === true
    const courtesyReason = (req.body.courtesyReason as string | undefined)?.trim()
    const anyCourtesy = ownerCourtesy || extraPlayers.some((p: any) => p.courtesy === true)
    if (anyCourtesy && !courtesyReason) {
      throw new AppError('Se requiere una razón para la cortesía', 400)
    }

    // Resolver cobertura de cada jugador extra: cortesía explícita > membresía propia > crédito propio > lo que decida quien reserva
    const extraPlayersData = await Promise.all(
      extraPlayers.map(async (p: any) => {
        const coverage = p.courtesy
          ? {
              amountOwed: pricePerPlayer,
              amountPaid: 0,
              paymentStatus: 'courtesy' as const,
              coveredBy: null,
              creditIdsUsed: undefined as string[] | undefined,
            }
          : p.userId
            ? await resolvePlayerCoverage(
                p.userId,
                req.body.clubId,
                pricePerPlayer,
                !!p.pay,
                slot.date
              )
            : {
                amountOwed: pricePerPlayer,
                amountPaid: p.pay ? pricePerPlayer : 0,
                paymentStatus: p.pay ? ('paid' as const) : ('pending' as const),
                coveredBy: null,
                creditIdsUsed: undefined as string[] | undefined,
              }
        return {
          userId: p.userId ?? null,
          name: p.name,
          avatarUrl: p.avatarUrl ?? null,
          ...(!p.userId && { guestId: randomUUID() }),
          amountOwed: coverage.amountOwed,
          amountPaid: coverage.amountPaid,
          paymentStatus: coverage.paymentStatus,
          ...(coverage.coveredBy && { coveredBy: coverage.coveredBy }),
          ...(coverage.creditIdsUsed && { creditIdsUsed: coverage.creditIdsUsed }),
          ...(p.courtesy && { courtesyReason }),
          ...(coverage.paymentStatus === 'paid' &&
            !coverage.coveredBy && { paymentMethod, paidAt: new Date().toISOString() }),
        }
      })
    )

    // Cobertura del dueño: cortesía explícita > cobertura resuelta en servidor.
    // `resolvedPricingType` es solo lo que el cliente pidió (venía del preview de GET /pricing);
    // se re-verifica siempre server-side vía resolvePlayerCoverage — igual que para los
    // compañeros — para que aplique el precio real (gratis, priceExtraSession, o completo)
    // y no se pueda forzar una reserva gratis enviando pricingType=membership_included sin
    // tener membresía.
    const ownerWantsToPayNow =
      ownerPay === true ||
      resolvedPricingType === 'membership_included' ||
      resolvedPricingType === 'membership_extra'
    const ownerCoverage = ownerCourtesy
      ? {
          amountOwed: pricePerPlayer,
          amountPaid: 0,
          paymentStatus: 'courtesy' as const,
          coveredBy: null,
          creditIdsUsed: undefined as string[] | undefined,
        }
      : await resolvePlayerCoverage(
          userId,
          req.body.clubId,
          pricePerPlayer,
          ownerWantsToPayNow,
          slot.date
        )

    const playersData = [
      {
        userId,
        name: ownerName ?? userId,
        isOwner: true,
        amountOwed: ownerCoverage.amountOwed,
        amountPaid: ownerCoverage.amountPaid,
        paymentStatus: ownerCoverage.paymentStatus,
        ...(ownerCoverage.coveredBy && { coveredBy: ownerCoverage.coveredBy }),
        ...(ownerCoverage.creditIdsUsed && { creditIdsUsed: ownerCoverage.creditIdsUsed }),
        ...(ownerCourtesy && { courtesyReason }),
        ...(ownerCoverage.paymentStatus === 'paid' &&
          !ownerCoverage.coveredBy && { paymentMethod, paidAt: new Date().toISOString() }),
      },
      ...extraPlayersData,
    ]
    // Excluye jugadores cubiertos por su propia membresía/crédito: no se cobran ahora en el método de pago de quien reserva.
    const amount = playersData
      .filter((p) => p.paymentStatus === 'paid' && !p.coveredBy)
      .reduce((sum, p) => sum + p.amountOwed, 0)

    // `pricingType` del booking refleja lo que realmente se resolvió para el dueño (server-side),
    // no lo que pidió el cliente — evita guardar una etiqueta falsa si el cliente mandó
    // pricingType=membership_included sin tener membresía real.
    const actualPricingType =
      ownerCoverage.coveredBy === 'membership'
        ? 'membership_included'
        : !ownerCourtesy &&
            ownerCoverage.amountOwed > 0 &&
            ownerCoverage.amountOwed < pricePerPlayer
          ? 'membership_extra'
          : 'pay_per_use'

    // El estado agregado de pago de la reserva refleja si TODOS los jugadores están
    // resueltos (pagado/cortesía/cubierto), no solo si hay algo que cobrar ahora mismo
    // (un jugador puede elegir "pagar por app" más tarde y `amount` seguir siendo 0).
    const allSettled = playersData.every(
      (p) => p.paymentStatus === 'paid' || p.paymentStatus === 'courtesy'
    )

    // Crear reserva en estado PENDING. El chequeo `isSlotAvailable` de arriba (línea 118) es solo
    // un check-then-act sin lock — útil para fallar rápido antes de calcular precios/cobertura,
    // pero NO es autoritativo: dos requests concurrentes para el mismo slotId podrían pasarlo
    // ambas. Por eso la creación real va dentro de una transacción que toma un lock de fila sobre
    // el TimeSlot (SELECT ... FOR UPDATE) y re-verifica disponibilidad ya serializada — la segunda
    // solicitud espera a que la primera libere el lock (tras su commit) y entonces ve el booking
    // recién creado y falla con 409, en vez de crear una reserva duplicada para la misma pista/hora.
    const booking = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM time_slots WHERE id = ${slotId} FOR UPDATE`
      const stillAvailable = await tx.booking.findFirst({
        where: { slotId, status: { in: ['pending', 'confirmed'] } },
      })
      if (stillAvailable) throw new AppError('Esta cancha ya no está disponible', 409)

      return tx.booking.create({
        data: {
          id: uuidv4(),
          slotId,
          userId,
          status: 'pending',
          players: playersData,
          amountPaid: amount,
          currency: slot.currency,
          paymentProvider:
            (paymentProvider === 'membership' ? 'stripe' : paymentProvider) || 'stripe',
          paymentStatus: allSettled ? 'paid' : 'pending',
          pricingType: actualPricingType as any,
          membershipId: membershipId || null,
        },
      })
    })

    // Nada que cobrar ahora mismo (por membresía, crédito, o porque nadie eligió pagar ya) → confirmar directo
    if (amount === 0) {
      const qrPayload = JSON.stringify({
        bookingId: booking.id,
        exp: Date.now() + 48 * 60 * 60 * 1000,
      })
      const QRCode = await import('qrcode')
      const qrCode = await QRCode.toDataURL(qrPayload)
      const confirmed = await prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'confirmed', qrCode },
      })
      // Describe honestamente por qué no se cobró nada: cobertura real (membresía/crédito) vs.
      // simplemente que nadie eligió pagar ahora (pagan después por la app).
      const coverageTypes = [...new Set(playersData.map((p) => p.coveredBy).filter(Boolean))]
      const provider = coverageTypes.length > 0 ? coverageTypes.join('+') : 'none'
      return res
        .status(201)
        .json({ success: true, data: { booking: confirmed, payment: { provider, charged: 0 } } })
    }

    // Crear PaymentIntent con Stripe (o auto-confirmar en DEV sin Stripe)
    if (paymentProvider === 'stripe' || !paymentProvider) {
      const paymentData = await createStripePaymentIntent({
        amount: Math.round(amount * 100),
        currency: slot.currency,
        bookingId: booking.id,
        userId,
        description: `Reserva ${slot.court.name} - ${slot.date} ${slot.startTime}`,
      })

      // ── DEV MODE: Stripe no configurado → auto-confirmar sin cobro real ──
      if (paymentData.devMode || !isStripeConfigured) {
        const qrPayload = JSON.stringify({
          bookingId: booking.id,
          exp: Date.now() + 48 * 60 * 60 * 1000,
        })
        const QRCodeLib = await import('qrcode')
        const qrCode = await QRCodeLib.toDataURL(qrPayload)
        const confirmed = await prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: 'confirmed',
            paymentStatus: allSettled ? 'paid' : 'pending',
            paymentId: paymentData.paymentIntentId,
            qrCode,
          },
        })

        // Registra en el libro de caja cada cobro real que ocurrió ahora mismo (dueño y/o
        // compañeros con pay:true resuelto a 'paid' sin cobertura por membresía/crédito).
        if (req.body.clubId) {
          await Promise.all(
            playersData
              .filter((p) => p.paymentStatus === 'paid' && !p.coveredBy && p.amountOwed > 0)
              .map((p) =>
                recordPayment({
                  clubId: req.body.clubId,
                  bookingId: booking.id,
                  playerUserId: p.userId,
                  playerName: p.name,
                  amount: p.amountOwed,
                  currency: slot.currency,
                  method: paymentMethod,
                })
              )
          )
        }

        return res.status(201).json({
          success: true,
          data: {
            booking: confirmed,
            payment: { provider: 'dev_mode', devMode: true },
          },
        })
      }

      return res.status(201).json({
        success: true,
        data: {
          booking,
          payment: { clientSecret: paymentData.clientSecret, provider: 'stripe' },
        },
      })
    }

    return res.status(201).json({ success: true, data: { booking } })
  } catch (err) {
    return next(err)
  }
})

// POST /api/bookings/:id/confirm — Confirmar pago y generar QR
router.post('/:id/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
    if (!booking) throw new AppError('Reserva no encontrada', 404)
    if (booking.status !== 'pending') throw new AppError('Reserva no está pendiente', 400)

    // Nunca confiar en que el cliente diga "ya pagué" — verificar server-side el estado
    // real del PaymentIntent con Stripe antes de marcar la reserva como pagada (mismo
    // patrón que guest-payments.routes.ts). Sin esto, cualquiera podía mandar un
    // paymentIntentId inventado y confirmar una reserva sin haber pagado.
    const { paymentIntentId } = req.body
    if (!paymentIntentId) throw new AppError('paymentIntentId requerido', 400)
    const intent = await retrieveStripePaymentIntent(paymentIntentId)
    if (intent.status !== 'succeeded') throw new AppError('El pago aún no se completó', 400)

    // Generar QR (expira 30min después del horario del partido)
    const slot = await prisma.timeSlot.findUnique({ where: { id: booking.slotId } })
    const qrPayload = JSON.stringify({ bookingId: booking.id, exp: Date.now() + 30 * 60 * 1000 })
    const qrCode = await QRCode.toDataURL(qrPayload)

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentId: paymentIntentId,
        qrCode,
        qrExpiresAt: slot ? new Date(`${slot.date}T${slot.endTime}:00`).toISOString() : undefined,
      },
    })

    return res.json({ success: true, data: updated })
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/bookings/:id — Cancelar reserva
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
    if (!booking) throw new AppError('Reserva no encontrada', 404)
    if (booking.status === 'cancelled') throw new AppError('Ya está cancelada', 400)
    if (booking.status === 'completed')
      throw new AppError('No se puede cancelar una reserva completada', 400)

    // Verificar que quien cancela es el dueño (el gateway inyecta x-user-id desde el JWT)
    const requestingUserId = req.headers['x-user-id'] as string | undefined
    if (requestingUserId && booking.userId !== requestingUserId) {
      throw new AppError('No autorizado para cancelar esta reserva', 403)
    }

    // Aplicar política de cancelación según el club
    const slot = await prisma.timeSlot.findUnique({
      where: { id: booking.slotId },
      include: { court: { include: { club: true } } },
    })

    const slotDateTime = new Date(`${slot?.date}T${slot?.startTime}:00`)
    const hoursUntil = (slotDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
    const policy = slot?.court.club.cancellationPolicy || 'flexible'

    let refundAmount = 0
    if (policy === 'flexible' && hoursUntil >= 24) refundAmount = booking.amountPaid
    else if (policy === 'moderate' && hoursUntil >= 48) refundAmount = booking.amountPaid
    // strict: sin reembolso

    if (refundAmount > 0 && booking.paymentId) {
      await refundStripePayment(booking.paymentId, Math.round(refundAmount * 100))
    }

    const cancelled = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        refundAmount,
        paymentStatus: refundAmount > 0 ? 'refunded' : booking.paymentStatus,
      },
    })

    await restoreCoveredCredits(booking.players)

    return res.json({ success: true, data: cancelled })
  } catch (err) {
    return next(err)
  }
})

// GET /api/bookings/user/:userId — Todas las reservas del usuario (activas e historial), ya sea
// que las haya creado o que lo hayan agregado como jugador. Así puede ver cuándo debe jugar y
// acceder al QR sin importar quién reservó. Cada item trae `isOwnerBooking` para que el cliente
// sepa si puede gestionar jugadores/cancelar (dueño) o solo pagar/salir (invitado).
router.get('/user/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params

    const owned = await prisma.booking.findMany({
      where: { userId },
      include: { slot: { include: { court: { include: { club: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const others = await prisma.booking.findMany({
      where: { userId: { not: userId } },
      include: { slot: { include: { court: { include: { club: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    const asPlayer = others.filter((b) => {
      const players = b.players
      return Array.isArray(players) && players.some((p: any) => p?.userId === userId)
    })

    const merged = [...owned, ...asPlayer]
      .map((b) => ({ ...b, isOwnerBooking: b.userId === userId }))
      .sort((a, b) =>
        `${b.slot.date}T${b.slot.startTime}`.localeCompare(`${a.slot.date}T${a.slot.startTime}`)
      )

    return res.json({ success: true, data: merged })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/bookings/:id/players — Actualizar compañeros de juego
router.patch('/:id/players', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { players } = req.body
    if (!Array.isArray(players)) throw new AppError('players debe ser un array', 400)

    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
    if (!booking) throw new AppError('Reserva no encontrada', 404)
    if (booking.status === 'cancelled')
      throw new AppError('No se puede modificar una reserva cancelada', 400)

    // Verificar autorización: dueño de la reserva O admin del club (por role o ClubAdmin en DB)
    const requestingUserId = req.headers['x-user-id'] as string | undefined
    const requestingRole = req.headers['x-user-role'] as string | undefined
    const isOwner = !requestingUserId || booking.userId === requestingUserId
    const isRoleAdmin = requestingRole === 'club_admin' || requestingRole === 'super_admin'

    if (!isOwner && !isRoleAdmin) {
      // Último recurso: verificar ClubAdmin en DB (cubre tokens sin campo role)
      let isClubAdmin = false
      const slot = await prisma.timeSlot.findUnique({
        where: { id: booking.slotId },
        select: { court: { select: { clubId: true } } },
      })
      if (slot?.court?.clubId) {
        const ca = await prisma.clubAdmin.findFirst({
          where: { userId: requestingUserId, clubId: slot.court.clubId },
        })
        isClubAdmin = !!ca
      }
      if (!isClubAdmin) throw new AppError('No autorizado', 403)
    }

    const slotWithCourt = await prisma.timeSlot.findUnique({
      where: { id: booking.slotId },
      include: { court: true },
    })
    if (!slotWithCourt) throw new AppError('Slot no encontrado', 404)

    const capacity = slotWithCourt.court.capacity || 4
    const existingPlayers = (booking.players as any[]) || []
    // Solo bloquea si se está aumentando el número de jugadores más allá del cupo;
    // guardar sin cambios una reserva legada que ya excedía el cupo debe seguir funcionando.
    if (players.length > capacity && players.length > existingPlayers.length) {
      throw new AppError(`Esta cancha admite máximo ${capacity} jugadores`, 400)
    }

    const courtPrice = slotWithCourt.isPeak ? slotWithCourt.peakPrice : slotWithCourt.basePrice
    const pricePerPlayer = slotWithCourt.pricePerPlayer ?? courtPrice / capacity

    // Merge: preserve payment data for existing players; para jugadores nuevos, resolver
    // cobertura por membresía/crédito igual que en la creación de la reserva.
    const mergedPlayers = await Promise.all(
      players.map(async (p: any) => {
        const existing = p.userId
          ? existingPlayers.find((e: any) => e.userId && e.userId === p.userId)
          : p.guestId
            ? existingPlayers.find((e: any) => e.guestId && e.guestId === p.guestId)
            : undefined
        if (existing) return { ...existing, name: p.name, userId: p.userId ?? null }

        if (!p.userId) {
          return {
            userId: null,
            guestId: randomUUID(),
            name: p.name,
            amountOwed: pricePerPlayer,
            amountPaid: 0,
            paymentStatus: 'pending',
          }
        }
        const coverage = await resolvePlayerCoverage(
          p.userId,
          slotWithCourt.court.clubId,
          pricePerPlayer,
          false,
          slotWithCourt.date
        )
        return {
          userId: p.userId,
          name: p.name,
          amountOwed: coverage.amountOwed,
          amountPaid: coverage.amountPaid,
          paymentStatus: coverage.paymentStatus,
          ...(coverage.coveredBy && { coveredBy: coverage.coveredBy }),
          ...(coverage.creditIdsUsed && { creditIdsUsed: coverage.creditIdsUsed }),
        }
      })
    )

    const newAmountPaid = mergedPlayers.reduce(
      (sum: number, p: any) => sum + (p.amountPaid ?? 0),
      0
    )
    const allSettled = mergedPlayers.every(
      (p: any) => p.paymentStatus === 'paid' || p.paymentStatus === 'courtesy'
    )

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        players: mergedPlayers,
        amountPaid: newAmountPaid,
        paymentStatus: allSettled ? 'paid' : 'pending',
      },
      include: { slot: { include: { court: { include: { club: true } } } } },
    })
    return res.json({ success: true, data: updated })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/bookings/:id/cancel — Cancelar reserva (admin, sin verificar dueño)
// Body opcional: { issueCredit: boolean } — si true, emite crédito a cada jugador que
// pagó en efectivo/tarjeta (no cubierto por membresía/crédito, que ya se restaura aparte).
router.patch('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { issueCredit, creditReason } = req.body ?? {}
    const { booking: cancelled, credits } = await cancelBookingAndIssueCredit(req.params.id, {
      issueCredit,
      creditReason,
    })
    return res.json({ success: true, data: cancelled, credits })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/bookings/:id/players/:playerId/pay — Admin marca pago de un jugador (cobro
// presencial desde el dashboard). :playerId matchea userId (jugador con cuenta) o guestId
// (invitado sin cuenta). Body opcional: { paymentMethod: 'cash' | 'card' }.
router.patch(
  '/:id/players/:playerId/pay',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: req.params.id },
        include: { slot: { include: { court: true } } },
      })
      if (!booking) throw new AppError('Reserva no encontrada', 404)

      const players = (booking.players as any[]) || []
      const idx = players.findIndex(
        (p: any) => p.userId === req.params.playerId || p.guestId === req.params.playerId
      )
      if (idx === -1) throw new AppError('Jugador no encontrado en esta reserva', 404)

      const method = resolvePaymentMethodDefaultCash(req.body?.paymentMethod)
      const amountToCollect = players[idx].amountOwed ?? booking.amountPaid
      const paidAt = new Date().toISOString()

      players[idx] = {
        ...players[idx],
        amountPaid: amountToCollect,
        paymentStatus: 'paid',
        paymentMethod: method,
        paidAt,
      }

      const newAmountPaid = players.reduce((sum: number, p: any) => sum + (p.amountPaid ?? 0), 0)

      const updated = await prisma.booking.update({
        where: { id: req.params.id },
        data: { players, amountPaid: newAmountPaid },
        include: { slot: { include: { court: { include: { club: true } } } } },
      })

      await recordPayment({
        clubId: booking.slot.court.clubId,
        bookingId: booking.id,
        playerUserId: players[idx].userId,
        playerName: players[idx].name,
        amount: amountToCollect,
        currency: booking.currency,
        method,
      })

      return res.json({ success: true, data: updated })
    } catch (err) {
      return next(err)
    }
  }
)

// PATCH /api/bookings/:id/players/:playerId/courtesy — Admin marca pago de cortesía (sin cobrar)
router.patch(
  '/:id/players/:playerId/courtesy',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body
      if (!reason?.trim()) throw new AppError('Se requiere una razón para la cortesía', 400)

      const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
      if (!booking) throw new AppError('Reserva no encontrada', 404)

      const players = (booking.players as any[]) || []
      const idx = players.findIndex(
        (p: any) => p.userId === req.params.playerId || p.guestId === req.params.playerId
      )
      if (idx === -1) throw new AppError('Jugador no encontrado en esta reserva', 404)

      players[idx] = {
        ...players[idx],
        amountPaid: 0,
        paymentStatus: 'courtesy',
        courtesyReason: reason.trim(),
      }

      const newAmountPaid = players.reduce((sum: number, p: any) => sum + (p.amountPaid ?? 0), 0)

      const updated = await prisma.booking.update({
        where: { id: req.params.id },
        data: { players, amountPaid: newAmountPaid },
        include: { slot: { include: { court: { include: { club: true } } } } },
      })
      return res.json({ success: true, data: updated })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/bookings/:id/players/:playerId/guest-link — Genera (o reutiliza uno vigente)
// un link de pago para que el invitado pague su parte con tarjeta desde una página pública,
// sin necesitar cuenta. Solo aplica a jugadores sin userId (invitados).
router.post(
  '/:id/players/:playerId/guest-link',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
      if (!booking) throw new AppError('Reserva no encontrada', 404)

      const players = (booking.players as any[]) || []
      const player = players.find((p: any) => p.guestId === req.params.playerId)
      if (!player) throw new AppError('Este jugador no es un invitado sin cuenta', 404)
      if (player.paymentStatus === 'paid' || player.paymentStatus === 'courtesy') {
        throw new AppError('Este jugador ya está resuelto (pagado o cortesía)', 400)
      }

      // Reutilizar un link vigente y sin pagar si ya existe, en vez de generar uno nuevo cada vez.
      const existing = await prisma.guestPaymentLink.findFirst({
        where: {
          bookingId: booking.id,
          playerGuestId: player.guestId,
          status: 'pending',
          expiresAt: { gt: new Date() },
        },
      })
      const link =
        existing ??
        (await prisma.guestPaymentLink.create({
          data: {
            bookingId: booking.id,
            playerGuestId: player.guestId,
            playerName: player.name,
            amount: player.amountOwed ?? 0,
            currency: booking.currency,
            expiresAt: new Date(Date.now() + GUEST_PAYMENT_LINK_TTL_HOURS * 60 * 60 * 1000),
          },
        }))

      return res.status(existing ? 200 : 201).json({
        success: true,
        data: { link, url: `${WEB_URL}/pay/${link.token}` },
      })
    } catch (err) {
      return next(err)
    }
  }
)

// PATCH /api/bookings/:id/players/:guestId/link-user — Vincula un invitado sin cuenta (guestId)
// a un User real (recién creado o existente), preservando su historial de pago (paymentStatus,
// amountPaid, coveredBy, etc.) — a diferencia de PATCH /players, que trataría un userId nuevo
// como un jugador distinto y perdería ese estado.
router.patch(
  '/:id/players/:guestId/link-user',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.body
      if (!userId) throw new AppError('userId es requerido', 400)

      const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
      if (!booking) throw new AppError('Reserva no encontrada', 404)

      const players = (booking.players as any[]) || []
      const idx = players.findIndex((p: any) => p.guestId === req.params.guestId)
      if (idx === -1) throw new AppError('Invitado no encontrado en esta reserva', 404)

      const { guestId, ...rest } = players[idx]
      players[idx] = { ...rest, userId }

      const updated = await prisma.booking.update({
        where: { id: req.params.id },
        data: { players },
        include: { slot: { include: { court: { include: { club: true } } } } },
      })
      return res.json({ success: true, data: updated })
    } catch (err) {
      return next(err)
    }
  }
)

// DELETE /api/bookings/:id/players/:playerId — Quitar jugador. Si ya pagó, opcionalmente emite crédito.
// :playerId matchea userId (jugador con cuenta) o guestId (invitado sin cuenta).
router.delete('/:id/players/:playerId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { issueCredit, creditReason } = req.body

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { slot: { include: { court: true } } },
    })
    if (!booking) throw new AppError('Reserva no encontrada', 404)
    if (booking.status === 'cancelled') throw new AppError('Ya está cancelada', 400)
    if (booking.status === 'completed')
      throw new AppError('No se puede modificar una reserva completada', 400)

    // Puede quitar a un jugador: el propio jugador (self-leave) o un admin del club de la reserva
    // (el gateway inyecta x-user-id desde el JWT; si no hay header, se asume una llamada interna/confiable).
    // Un invitado (sin cuenta) nunca tiene x-user-id propio, así que solo un admin puede quitarlo.
    const requestingUserId = req.headers['x-user-id'] as string | undefined
    if (requestingUserId && requestingUserId !== req.params.playerId) {
      const ca = await prisma.clubAdmin.findFirst({
        where: { userId: requestingUserId, clubId: booking.slot.court.clubId },
      })
      if (!ca) throw new AppError('No autorizado para quitar a este jugador', 403)
    }

    const players = (booking.players as any[]) || []
    const idx = players.findIndex(
      (p: any) => p.userId === req.params.playerId || p.guestId === req.params.playerId
    )
    if (idx === -1) throw new AppError('Jugador no encontrado en esta reserva', 404)

    const removedPlayer = players[idx]
    if (removedPlayer.isOwner) {
      throw new AppError('Quien reservó no puede salir — debe cancelar la reserva completa', 400)
    }
    const remainingPlayers = players.filter((_: any, i: number) => i !== idx)

    // Restaura cualquier crédito que este jugador haya usado para cubrir su parte —
    // si no, quedaría marcado 'used' para siempre aunque ya no participe en la reserva.
    await restoreCoveredCredits([removedPlayer])

    let credit = null
    const paidOutOfPocket =
      removedPlayer.userId && !removedPlayer.coveredBy && (removedPlayer.amountPaid ?? 0) > 0
    if (issueCredit && paidOutOfPocket) {
      credit = await prisma.userCredit.create({
        data: {
          userId: removedPlayer.userId,
          clubId: booking.slot.court.clubId,
          amount: removedPlayer.amountPaid,
          currency: booking.currency,
          reason: creditReason?.trim() || 'Cambio/cancelación de jugador en reserva',
          bookingId: booking.id,
          status: 'available',
        },
      })
    }

    const newAmountPaid = remainingPlayers.reduce(
      (sum: number, p: any) => sum + (p.amountPaid ?? 0),
      0
    )

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: { players: remainingPlayers, amountPaid: newAmountPaid },
      include: { slot: { include: { court: { include: { club: true } } } } },
    })

    return res.json({ success: true, data: updated, credit })
  } catch (err) {
    return next(err)
  }
})

// GET /api/bookings/:id — Detalle de una reserva (con QR)
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { slot: { include: { court: { include: { club: true } } } } },
    })
    if (!booking) throw new AppError('Reserva no encontrada', 404)
    return res.json({ success: true, data: booking })
  } catch (err) {
    return next(err)
  }
})

const MATCH_AUTO_CONFIRM_HOURS = 24

// Determina si `userId` está en el equipo 1, equipo 2, o ninguno de un Match.
function teamOf(
  match: {
    player1Id: string | null
    player1PartnerId: string | null
    player2Id: string | null
    player2PartnerId: string | null
  },
  userId: string
): 1 | 2 | null {
  if (match.player1Id === userId || match.player1PartnerId === userId) return 1
  if (match.player2Id === userId || match.player2PartnerId === userId) return 2
  return null
}

// POST /api/bookings/:id/match — registrar cómo jugaron las parejas y el marcador.
// Body: { team1: string[1-2], team2: string[1-2], sets: SetScore[] }
// Estilo Playtomic: el resultado queda pendiente de confirmación del rival — el ELO
// NO se aplica aquí. Se aplica al confirmar (POST /match/confirm) o, si nadie objeta,
// automáticamente pasadas 24h (cron `autoConfirmPendingMatches`).
router.post('/:id/match', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { team1, team2, sets } = req.body as {
      team1: string[]
      team2: string[]
      sets: SetScore[]
    }
    if (
      !Array.isArray(team1) ||
      !Array.isArray(team2) ||
      team1.length === 0 ||
      team2.length === 0
    ) {
      throw new AppError('team1 y team2 son requeridos (1 o 2 jugadores cada uno)', 400)
    }
    if (team1.length > 2 || team2.length > 2)
      throw new AppError('Cada equipo admite máximo 2 jugadores', 400)
    if (!Array.isArray(sets) || sets.length === 0)
      throw new AppError('El marcador (sets) es requerido', 400)

    const reportedById = (req.headers['x-user-id'] as string | undefined) || req.body.reportedById
    if (!reportedById) throw new AppError('No se pudo identificar quién reporta el resultado', 400)
    if (![...team1, ...team2].includes(reportedById)) {
      throw new AppError(
        'Quien reporta el resultado debe ser uno de los jugadores del partido',
        400
      )
    }

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { slot: { include: { court: true } } },
    })
    if (!booking) throw new AppError('Reserva no encontrada', 404)
    if (booking.status !== 'completed') {
      throw new AppError('Solo se puede registrar el resultado de una reserva ya completada', 400)
    }

    const bookingPlayerIds = new Set<string>([
      booking.userId,
      ...((booking.players as any[]) || []).map((p) => p.userId).filter(Boolean),
    ])
    const unknown = [...team1, ...team2].filter((id) => !bookingPlayerIds.has(id))
    if (unknown.length > 0)
      throw new AppError('Todos los jugadores del resultado deben ser parte de la reserva', 400)

    const winnerPos = determineWinner(sets)
    if (!winnerPos) throw new AppError('El marcador no define un ganador claro', 400)

    const existing = await prisma.match.findFirst({ where: { bookingId: booking.id } })
    if (existing?.scoreConfirmed) {
      throw new AppError(
        'Este resultado ya fue confirmado por ambos equipos y no se puede editar aquí',
        409
      )
    }

    const matchData = {
      bookingId: booking.id,
      sport: booking.slot.court.sport,
      courtId: booking.slot.courtId,
      player1Id: team1[0],
      player1PartnerId: team1[1] ?? null,
      player2Id: team2[0],
      player2PartnerId: team2[1] ?? null,
      score: sets as object[],
      winnerId: winnerPos === 1 ? team1[0] : team2[0],
      winningSide: winnerPos,
      status: 'completed',
      finishedAt: new Date(),
      reportedById,
      scoreConfirmed: false,
      scoreConfirmedAt: null,
      autoConfirmAt: new Date(Date.now() + MATCH_AUTO_CONFIRM_HOURS * 60 * 60 * 1000),
    }

    const match = existing
      ? await prisma.match.update({ where: { id: existing.id }, data: matchData as any })
      : await prisma.match.create({ data: matchData as any })

    const opposingTeam = teamOf(match, reportedById) === 1 ? team2 : team1
    return res.status(existing ? 200 : 201).json({
      success: true,
      data: match,
      pendingConfirmationFrom: opposingTeam,
    })
  } catch (err) {
    return next(err)
  }
})

// POST /api/bookings/:id/match/confirm — el rival confirma el resultado reportado → aplica el ELO
router.post('/:id/match/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const confirmerId = (req.headers['x-user-id'] as string | undefined) || req.body.userId
    if (!confirmerId) throw new AppError('No se pudo identificar quién confirma', 400)

    const match = await prisma.match.findFirst({ where: { bookingId: req.params.id } })
    if (!match) throw new AppError('Esta reserva no tiene un resultado reportado', 404)
    if (match.scoreConfirmed) throw new AppError('Este resultado ya estaba confirmado', 400)
    if (confirmerId === match.reportedById) {
      throw new AppError(
        'Quien reportó el resultado no puede confirmarlo — debe hacerlo el rival',
        403
      )
    }
    const reporterTeam = match.reportedById ? teamOf(match, match.reportedById) : null
    const confirmerTeam = teamOf(match, confirmerId)
    if (!confirmerTeam || confirmerTeam === reporterTeam) {
      throw new AppError('Solo un jugador del equipo rival puede confirmar el resultado', 403)
    }

    const eloChanges = await applyMatchElo(match.id)
    const updated = await prisma.match.update({
      where: { id: match.id },
      data: { scoreConfirmed: true, scoreConfirmedAt: new Date() },
    })

    return res.json({ success: true, data: updated, eloChanges })
  } catch (err) {
    return next(err)
  }
})

// POST /api/bookings/:id/match/dispute — el rival objeta el resultado → se descarta para reportarlo de nuevo
router.post('/:id/match/dispute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputerId = (req.headers['x-user-id'] as string | undefined) || req.body.userId
    if (!disputerId) throw new AppError('No se pudo identificar quién objeta', 400)

    const match = await prisma.match.findFirst({ where: { bookingId: req.params.id } })
    if (!match) throw new AppError('Esta reserva no tiene un resultado reportado', 404)
    if (match.scoreConfirmed)
      throw new AppError('Este resultado ya fue confirmado, no se puede objetar', 400)
    const reporterTeam = match.reportedById ? teamOf(match, match.reportedById) : null
    const disputerTeam = teamOf(match, disputerId)
    if (!disputerTeam || disputerTeam === reporterTeam) {
      throw new AppError('Solo un jugador del equipo rival puede objetar el resultado', 403)
    }

    await prisma.match.delete({ where: { id: match.id } })
    return res.json({
      success: true,
      data: null,
      message: 'Resultado descartado — cualquiera de los dos equipos puede reportarlo de nuevo',
    })
  } catch (err) {
    return next(err)
  }
})

// GET /api/bookings/:id/match — resultado del partido de una reserva (si existe)
router.get('/:id/match', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const match = await prisma.match.findFirst({ where: { bookingId: req.params.id } })
    return res.json({ success: true, data: match })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/bookings/:id/complete — marcar manualmente como completada (override admin,
// p. ej. corregir un caso antes de que corra el cron)
router.patch('/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
    if (!booking) throw new AppError('Reserva no encontrada', 404)
    if (booking.status !== 'confirmed') {
      throw new AppError('Solo una reserva confirmada puede marcarse como completada', 400)
    }

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: { status: 'completed' },
    })
    return res.json({ success: true, data: updated })
  } catch (err) {
    return next(err)
  }
})

export { router as bookingsRouter }
