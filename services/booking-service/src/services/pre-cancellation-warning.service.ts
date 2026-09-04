import { PrismaClient } from '@prisma/client'
import { notifyPlayer } from './notification.service'

const prisma = new PrismaClient()

// Mismo cutoff real que releaseExpiredSlots (slot.service.ts) — no se toca, solo se usa
// para calcular la ventana de aviso previo, configurable por club.
const PAYMENT_CUTOFF_MINUTES = 15
const ROSTER_DEADLINE_HOURS = 24 // mismo valor que roster-completion.service.ts

/**
 * Avisa a los jugadores con pago pendiente de una reserva que está por expirar (antes de
 * que `releaseExpiredSlots` la cancele a los 15 min). La ventana de aviso es configurable
 * por club (`Club.paymentWarningMinutesBefore`, default 5 min antes del cutoff real).
 * Idempotente vía `Booking.paymentWarningNotifiedAt`.
 */
export async function warnPendingPaymentBookings(): Promise<void> {
  const now = new Date()

  const pending = await prisma.booking.findMany({
    where: { status: 'pending', paymentWarningNotifiedAt: null },
    include: { slot: { include: { court: { include: { club: true } } } } },
  })

  let notifiedCount = 0

  for (const b of pending) {
    const club = b.slot.court.club
    const cutoff = new Date(b.createdAt.getTime() + PAYMENT_CUTOFF_MINUTES * 60 * 1000)
    const warnAt = new Date(cutoff.getTime() - club.paymentWarningMinutesBefore * 60 * 1000)
    if (now < warnAt || now >= cutoff) continue // aún no entra en la ventana de aviso, o ya venció

    const players = ((b.players as any[]) || []).filter(
      (p) => p.userId && p.paymentStatus === 'pending'
    )
    const minutesLeft = Math.max(1, Math.round((cutoff.getTime() - now.getTime()) / 60000))

    try {
      for (const p of players) {
        await notifyPlayer(
          p.userId,
          'Tu reserva está por vencer',
          `Te quedan ${minutesLeft} minuto(s) para completar el pago de tu reserva en ${club.name} o se cancelará automáticamente.`,
          { bookingId: b.id, type: 'payment_warning' }
        )
      }
      await prisma.booking.update({ where: { id: b.id }, data: { paymentWarningNotifiedAt: now } })
      notifiedCount++
    } catch (err) {
      console.error(
        `[pre-cancellation-warning] Error avisando pago pendiente de reserva ${b.id}:`,
        err
      )
    }
  }

  if (notifiedCount > 0) {
    console.info(`[pre-cancellation-warning] Avisadas ${notifiedCount} reservas con pago pendiente`)
  }
}

/**
 * Avisa a los jugadores ya confirmados de una reserva cuyo cupo sigue incompleto, antes
 * de que `cancelIncompleteRosterBookings` la cancele a las 24h del partido. La ventana de
 * aviso es configurable por club (`Club.rosterWarningHoursBefore`, default 6h antes del
 * deadline real de 24h). Idempotente vía `Booking.rosterWarningNotifiedAt`.
 */
export async function warnIncompleteRosterBookings(): Promise<void> {
  const now = new Date()

  const confirmed = await prisma.booking.findMany({
    where: { status: 'confirmed', rosterWarningNotifiedAt: null },
    include: { slot: { include: { court: { include: { club: true } } } } },
  })

  let notifiedCount = 0

  for (const b of confirmed) {
    const capacity = b.slot.court.capacity || 4
    const players = (b.players as any[]) || []
    const rosterCount = players.length
    if (rosterCount >= capacity) continue

    const slotStart = new Date(`${b.slot.date}T${b.slot.startTime}:00`)
    if (slotStart <= now) continue

    const hoursUntilMatch = (slotStart.getTime() - now.getTime()) / (1000 * 60 * 60)
    const club = b.slot.court.club
    // Ventana de aviso: entre el deadline real (24h, ya cancelable, no avisar más) y
    // `rosterWarningHoursBefore` horas antes de ese deadline (ej. default 6h → avisa
    // entre las 24h y las 30h previas al partido).
    if (
      hoursUntilMatch <= ROSTER_DEADLINE_HOURS ||
      hoursUntilMatch > ROSTER_DEADLINE_HOURS + club.rosterWarningHoursBefore
    )
      continue

    const hoursLeadTime = (slotStart.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60)
    if (hoursLeadTime < ROSTER_DEADLINE_HOURS) continue // misma excepción que la cancelación real

    try {
      for (const p of players.filter((p) => p.userId)) {
        await notifyPlayer(
          p.userId,
          'A tu reserva le falta gente',
          `Tu reserva en ${club.name} tiene ${rosterCount}/${capacity} jugadores. Complétala antes de las 24h previas al partido o se cancelará automáticamente.`,
          { bookingId: b.id, type: 'roster_warning' }
        )
      }
      await prisma.booking.update({ where: { id: b.id }, data: { rosterWarningNotifiedAt: now } })
      notifiedCount++
    } catch (err) {
      console.error(
        `[pre-cancellation-warning] Error avisando roster incompleto de reserva ${b.id}:`,
        err
      )
    }
  }

  if (notifiedCount > 0) {
    console.info(
      `[pre-cancellation-warning] Avisadas ${notifiedCount} reservas con roster incompleto`
    )
  }
}
