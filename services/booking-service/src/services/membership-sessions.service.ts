import { PrismaClient } from '@prisma/client'

// Cuenta las sesiones de membresía usadas por un jugador en un club EN LA FECHA QUE SE
// JUEGA (slot.date) — no en la fecha en que se creó la reserva. Un jugador puede reservar
// varios días futuros en una sola sesión de la app; lo que limita `sessionsPerDay` es
// cuántas veces juega en un mismo día, no cuántas reservas hace hoy.
// Cuenta como sesión de membresía: el dueño de la reserva (pricingType='membership_included')
// o un compañero agregado cuya parte quedó cubierta por su propia membresía (coveredBy='membership').
// Solo cuenta reservas activas (confirmed/pending): al cancelar una reserva, la sesión
// se libera automáticamente en el próximo cálculo, sin necesidad de "restaurar" nada aparte.
export async function countMembershipSessionsForDate(
  prisma: PrismaClient,
  playerUserId: string,
  clubId: string,
  date: string // YYYY-MM-DD — la fecha del slot que se está por reservar/cotizar
): Promise<number> {
  const bookingsOnDate = await prisma.booking.findMany({
    where: {
      status: { in: ['confirmed', 'pending'] },
      slot: { date, court: { clubId } },
    },
    select: { userId: true, pricingType: true, players: true },
  })

  return bookingsOnDate.filter((b) => {
    if (b.userId === playerUserId && b.pricingType === 'membership_included') return true
    const players = (b.players as any[]) || []
    return players.some((p) => p.userId === playerUserId && p.coveredBy === 'membership')
  }).length
}
