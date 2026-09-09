import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { AppError } from '../middleware/error.middleware'
import { notifyPlayer } from './notification.service'

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

  const credits: any[] = []
  if (opts.issueCredit) {
    const players = (booking.players as any[]) || []
    const payersToCredit = players.filter(
      (p) => p.userId && (p.amountPaid ?? 0) > 0 && !p.coveredBy
    )
    for (const p of payersToCredit) {
      const credit = await prisma.userCredit.create({
        data: {
          userId: p.userId,
          clubId: booking.slot.court.clubId,
          amount: p.amountPaid,
          currency: booking.currency,
          reason: opts.creditReason?.trim() || 'Reserva cancelada',
          bookingId: booking.id,
          status: 'available',
        },
      })
      credits.push(credit)
    }
  }

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
