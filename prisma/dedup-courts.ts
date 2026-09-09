import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
const prisma = new PrismaClient({ adapter: createPgAdapter() })

async function main() {
  const courts = await prisma.court.findMany({ orderBy: { id: 'asc' } })

  // Group by clubId + name
  const seen = new Map<string, string>() // key → first (oldest) courtId to keep
  const toDelete: string[] = []

  for (const c of courts) {
    const key = `${c.clubId}::${c.name}`
    if (seen.has(key)) {
      toDelete.push(c.id)
    } else {
      seen.set(key, c.id)
    }
  }

  if (toDelete.length === 0) {
    console.log('No duplicates found.')
    return
  }

  console.log(`Found ${toDelete.length} duplicate court(s) to remove.`)

  for (const courtId of toDelete) {
    const court = courts.find((c) => c.id === courtId)!
    // Delete bookings whose slot belongs to this court
    const slots = await prisma.timeSlot.findMany({ where: { courtId }, select: { id: true } })
    const slotIds = slots.map((s) => s.id)
    if (slotIds.length > 0) {
      const deletedBookings = await prisma.booking.deleteMany({
        where: { slotId: { in: slotIds } },
      })
      console.log(
        `  Deleted ${deletedBookings.count} booking(s) on duplicate slots of "${court.name}"`
      )
      await prisma.timeSlot.deleteMany({ where: { courtId } })
      console.log(`  Deleted ${slotIds.length} time slot(s)`)
    }
    await prisma.court.delete({ where: { id: courtId } })
    console.log(`  ✓ Deleted duplicate court "${court.name}" (${courtId})`)
  }

  console.log('Done.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
