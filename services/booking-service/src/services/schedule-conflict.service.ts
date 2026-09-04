import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// ¿Hay una clase activa que se solape con [startMin, endMin) en esta pista y fecha?
// `excludeSlotId` se usa al editar una clase para no comparar el slot contra sí mismo.
export async function hasConflictingClass(
  courtId: string,
  date: string,
  startMin: number,
  endMin: number,
  excludeSlotId?: string
): Promise<boolean> {
  const slots = await prisma.classSlot.findMany({
    where: {
      courtId,
      date,
      status: { not: 'cancelled' },
      ...(excludeSlotId ? { id: { not: excludeSlotId } } : {}),
    },
    select: { startTime: true, durationMinutes: true },
  })
  return slots.some((s) => {
    const sStart = toMinutes(s.startTime)
    const sEnd = sStart + s.durationMinutes
    return startMin < sEnd && sStart < endMin
  })
}

// ¿Hay un bloqueo de mantenimiento que se solape con [startMin, endMin) en esta pista y fecha?
export async function hasConflictingMaintenance(
  courtId: string,
  date: string,
  startMin: number,
  endMin: number
): Promise<boolean> {
  const dayStart = new Date(`${date}T00:00:00.000Z`)
  const dayEnd = new Date(`${date}T23:59:59.999Z`)
  const blocks = await prisma.maintenanceBlock.findMany({
    where: { courtId, startAt: { lte: dayEnd }, endAt: { gte: dayStart } },
    select: { startAt: true, endAt: true },
  })
  const rangeStart = new Date(dayStart.getTime() + startMin * 60000)
  const rangeEnd = new Date(dayStart.getTime() + endMin * 60000)
  return blocks.some((b) => rangeStart < b.endAt && b.startAt < rangeEnd)
}

// ¿Hay una reserva normal (pending/confirmed) que se solape con [startMin, endMin) en esta pista y fecha?
export async function hasConflictingBooking(
  courtId: string,
  date: string,
  startMin: number,
  endMin: number
): Promise<boolean> {
  const timeSlots = await prisma.timeSlot.findMany({
    where: { courtId, date },
    select: {
      startTime: true,
      endTime: true,
      bookings: { where: { status: { in: ['pending', 'confirmed'] } }, select: { id: true } },
    },
  })
  return timeSlots.some((ts) => {
    if (ts.bookings.length === 0) return false
    const tsStart = toMinutes(ts.startTime)
    const tsEnd = toMinutes(ts.endTime)
    return startMin < tsEnd && tsStart < endMin
  })
}
