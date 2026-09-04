import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const clubs = await prisma.club.findMany({
    select: { id: true, name: true, country: true, currency: true },
  })

  const COUNTRY_CURRENCY: Record<string, string> = {
    CO: 'COP',
    MX: 'MXN',
    AR: 'ARS',
    BR: 'BRL',
    CL: 'CLP',
    PE: 'PEN',
    US: 'USD',
    ES: 'EUR',
    GB: 'GBP',
  }

  for (const club of clubs) {
    const expected = COUNTRY_CURRENCY[club.country ?? ''] ?? 'USD'
    if (club.currency !== expected) {
      await prisma.club.update({ where: { id: club.id }, data: { currency: expected } })
      console.log(`✓ ${club.name}: ${club.currency} → ${expected}`)
    } else {
      console.log(`  ${club.name}: ${club.currency} ✓`)
    }
  }
  console.log('Done.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
