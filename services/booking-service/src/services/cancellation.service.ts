import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { AppError } from '../middleware/error.middleware'
import { notifyPlayer } from './notification.service'
import { refundStripePayment } from './payment.service'
import { reversePayment } from './payment-ledger.service'

const prisma = new PrismaClient({ adapter: createPgAdapter() })

// Al cancelar una reserva, restaura el crédito de cualquier jugador que haya sido cubierto
// automáticamente con crédito (coveredBy: 'credit') — las sesiones de membresía no requieren
// restauración aparte, ya que se cuentan dinámicamente sobre reservas activas (confirmed/pending).
export async function restoreCoveredCredits(players: unknown) {
  const list = (players as any[]) || []
  const creditIds = list.flatMap((p) =>
    p.coveredBy === 'credit' && Array.isArray(p.creditIdsUsed) ? p.creditIdsUsed : []
  )
  if (creditIds.length === 0) return
  await prisma.userCredit.updateMany({
    where: { id: { in: creditIds }, status: 'used' },
    data: { status: 'available', usedAt: null },
  })
}

// Emite un UserCredit a cada jugador (con cuenta) que pagó en efectivo/tarjeta y no estaba
// cubierto por membresía/crédito. Usado tanto al cancelar una reserva completa como al sacar
// a un jugador que ya pagó de una reserva que sigue activa (PATCH /:id/players) — en ambos
// casos el dinero no debe perderse silenciosamente. Los invitados sin cuenta (guestId sin
// userId) no pueden recibir un crédito en el sistema; el club los reembolsa por fuera.
export async function issueCreditForPayers(
  players: unknown,
  info: { clubId: string; currency: string; bookingId: string; reason: string }
) {
  const list = (players as any[]) || []
  const payersToCredit = list.filter((p) => p.userId && (p.amountPaid ?? 0) > 0 && !p.coveredBy)
  const credits: any[] = []
  for (const p of payersToCredit) {
    const credit = await prisma.userCredit.create({
      data: {
        userId: p.userId,
        clubId: info.clubId,
        amount: p.amountPaid,
        currency: info.currency,
        reason: info.reason,
        bookingId: info.bookingId,
        status: 'available',
      },
    })
    credits.push(credit)
  }
  return credits
}

// Reembolsa a cada invitado SIN cuenta que salió de una reserva y ya había pagado — a
// diferencia del crédito a un jugador con cuenta (issueCreditForPayers), esto NUNCA es
// discrecional del club: es plata que salió de la tarjeta del invitado (o que el club ya
// cobró por otro medio), así que se resuelve siempre, sin depender de un flag `issueCredit`.
// - Pagó con su propia tarjeta por guest-link → reembolso real vía Stripe.
// - Cualquier otro cobro ya hecho (efectivo, o tarjeta cobrada por el club fuera de Stripe)
//   → no hay a quién reembolsar por este medio; el club debe devolver el dinero físicamente,
//   así que solo se revierte el ingreso en caja para no contarlo dos veces.
// Se usa tanto al sacar a un invitado de una reserva activa como al cancelarla por completo.
export async function settleRemovedGuests(
  removedPlayers: unknown,
  info: { clubId: string; currency: string; bookingId: string }
) {
  const list = (removedPlayers as any[]) || []
  const guestsToSettle = list.filter((p) => !p.userId && !p.coveredBy && (p.amountPaid ?? 0) > 0)
  for (const guest of guestsToSettle) {
    const link = await prisma.guestPaymentLink.findFirst({
      where: { bookingId: info.bookingId, playerGuestId: guest.guestId, status: 'paid' },
    })
    if (link?.paymentIntentId) {
      try {
        await refundStripePayment(link.paymentIntentId, Math.round(guest.amountPaid * 100))
        await prisma.guestPaymentLink.update({ where: { id: link.id }, data: { status: 'cancelled' } })
      } catch (err) {
        console.error(`[settleRemovedGuests] Reembolso Stripe falló (invitado ${guest.guestId}):`, err)
      }
    }
    // Se revierte el ingreso en caja de todas formas: con reembolso Stripe real o no, ese
    // dinero ya no es del club.
    await reversePayment({
      clubId: info.clubId,
      bookingId: info.bookingId,
      playerUserId: null,
      playerName: guest.name,
      amount: guest.amountPaid,
      currency: info.currency,
      method: guest.paymentMethod === 'card' ? 'card' : 'cash',
    })
  }
}

// Resuelve el dinero de los jugadores que salen de una reserva (swap de invitado/jugador,
// PATCH /:id/players): nadie pierde plata silenciosamente ni el club se queda con un ingreso
// que ya no corresponde.
// - Cubierto por membresía/crédito → se restaura (restoreCoveredCredits), no hay plata de por medio.
// - Jugador con cuenta que pagó → crédito disponible (issueCreditForPayers).
// - Invitado sin cuenta que pagó → settleRemovedGuests (ver arriba).
export async function settleRemovedPlayers(
  removedPlayers: unknown,
  info: { clubId: string; currency: string; bookingId: string; reason: string }
) {
  const list = (removedPlayers as any[]) || []
  if (list.length === 0) return { credits: [] }

  await restoreCoveredCredits(list)
  const credits = await issueCreditForPayers(list, info)
  await settleRemovedGuests(list, info)

  return { credits }
}

// Cancela una reserva, restaura créditos/membresías auto-aplicados y, opcionalmente, emite
// crédito nuevo a cada jugador que pagó en efectivo/tarjeta (no cubierto). Compartido por la
// cancelación manual del club y por cualquier cancelación automática (cron).
export async function cancelBookingAndIssueCredit(
  bookingId: string,
  opts: { issueCredit?: boolean; creditReason?: string } = {}
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { slot: { include: { court: true } } },
  })
  if (!booking) throw new AppError('Reserva no encontrada', 404)
  if (booking.status === 'cancelled') throw new AppError('Ya está cancelada', 400)
  if (booking.status === 'completed')
    throw new AppError('No se puede cancelar una reserva completada', 400)

  const cancelled = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'cancelled', cancelledAt: new Date() },
  })

  await restoreCoveredCredits(booking.players)

  const credits = opts.issueCredit
    ? await issueCreditForPayers(booking.players, {
        clubId: booking.slot.court.clubId,
        currency: booking.currency,
        bookingId: booking.id,
        reason: opts.creditReason?.trim() || 'Reserva cancelada',
      })
    : []
  // A diferencia del crédito de arriba, esto no es opcional: los invitados sin cuenta que
  // pagaron se reembolsan/revierten siempre, cancele o no el club con issueCredit.
  await settleRemovedGuests(booking.players, {
    clubId: booking.slot.court.clubId,
    currency: booking.currency,
    bookingId: booking.id,
  })

  // Aviso posterior (best-effort, no debe bloquear ni fallar la cancelación en sí).
  const players = (booking.players as any[]) || []
  for (const p of players.filter((p) => p.userId)) {
    notifyPlayer(
      p.userId,
      'Tu reserva fue cancelada',
      opts.creditReason?.trim() || 'Tu reserva fue cancelada.',
      { bookingId: booking.id, type: 'booking_cancelled' }
    ).catch(() => {})
  }

  return { booking: cancelled, credits }
}
