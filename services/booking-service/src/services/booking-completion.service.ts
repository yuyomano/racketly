import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Marca como `completed` toda reserva `confirmed` cuyo horario ya terminó.
 * Estándar de la industria (Playtomic, Playbypoint): la transición es automática
 * por tiempo, sin que el club ni el jugador tengan que hacer nada.
 */
export async function completeExpiredBookings(): Promise<void> {
  const confirmed = await prisma.booking.findMany({
    where: { status: 'confirmed' },
    select: { id: true, slot: { select: { date: true, endTime: true } } },
  })

  const now = new Date()
  const idsToComplete = confirmed
    .filter((b) => new Date(`${b.slot.date}T${b.slot.endTime}:00`) < now)
    .map((b) => b.id)

  if (idsToComplete.length === 0) return

  await prisma.booking.updateMany({
    where: { id: { in: idsToComplete } },
    data: { status: 'completed' },
  })

  console.info(`[booking-completion-cron] Marcadas ${idsToComplete.length} reservas como completadas`)
}
