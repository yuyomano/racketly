import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const renames: Record<string, string> = {
  'Cancha 1 — Cristal VIP': 'Pista 1 — Cristal VIP',
  'Cancha 2 — Cristal':     'Pista 2 — Cristal',
  'Cancha 3 — Cristal':     'Pista 3 — Cristal',
  'Cancha 4 — Panorámica':  'Pista 4 — Panorámica',
  'Cancha A':               'Pista A',
  'Cancha B':               'Pista B',
  'Cancha Principal':       'Pista Principal',
  'Cancha 2':               'Pista 2',
  'Cancha 3 — Exterior':    'Pista 3 — Exterior',
  'Cancha Sur':             'Pista Sur',
  'Cancha Norte':           'Pista Norte',
}

async function main() {
  for (const [oldName, newName] of Object.entries(renames)) {
    const r = await prisma.court.updateMany({ where: { name: oldName }, data: { name: newName } })
    if (r.count > 0) console.log(`✓ ${oldName} → ${newName}`)
  }
  console.log('Done.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
