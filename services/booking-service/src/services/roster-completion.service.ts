import { PrismaClient } from '@prisma/client'
import { cancelBookingAndIssueCredit } from './cancellation.service'

const prisma = new PrismaClient()

const ROSTER_DEADLINE_HOURS = 24

/**
 * Política: toda reserva confirmada debe tener el cupo completo (según la capacidad de
 * la cancha) al menos 24h antes del partido — si no, se cancela automáticamente y se
 * devuelve crédito a quien ya pagó. Solo aplica a reservas hechas con ≥24h de anticipación
 * (si alguien reserva a último momento, nunca tuvo esa ventana de 24h para completar el
 * cupo, así que la política no le aplica).
 */
export async function cancelIncompleteRosterBookings(): Promise<void> {
  const now = new Date()
  const confirmed = await prisma.booking.findMany({
    where: { status: 'confirmed' },
    include: { slot: { include: { court: true } } },
  })

  let cancelledCount = 0

  for (const b of confirmed) {
    const capacity = b.slot.court.capacity || 4
    const rosterCount = ((b.players as any[]) || []).length
    if (rosterCount >= capacity) continue

    const slotStart = new Date(`${b.slot.date}T${b.slot.startTime}:00`)
    if (slotStart <= now) continue // ya se jugó (o lo tomará el cron de auto-completado)

    const hoursUntilMatch = (slotStart.getTime() - now.getTime()) / (1000 * 60 * 60)
    if (hoursUntilMatch > ROSTER_DEADLINE_HOURS) continue // aún no entra en la ventana de 24h

    const hoursLeadTime = (slotStart.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60)
    if (hoursLeadTime < ROSTER_DEADLINE_HOURS) continue // se reservó a último momento — no aplica la política

    try {
      await cancelBookingAndIssueCredit(b.id, {
        issueCredit: true,
        creditReason: `Cupo incompleto (${rosterCount}/${capacity}) 24h antes del partido — cancelación automática`,
      })
      cancelledCount++
    } catch (err) {
      console.error(`[roster-completion-cron] Error cancelando reserva ${b.id}:`, err)
    }
  }

  if (cancelledCount > 0) {
    console.info(`[roster-completion-cron] Canceladas ${cancelledCount} reservas por cupo incompleto`)
  }
}
