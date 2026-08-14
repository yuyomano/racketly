import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const plan = await prisma.clubMembershipPlan.upsert({
    where: { id: 'plan-bogota-ilimitado' },
    update: {},
    create: {
      id: 'plan-bogota-ilimitado',
      clubId: 'club-bogota-1',
      name: 'Socio Ilimitado',
      description: '1 sesion diaria incluida, sesiones extra a precio especial.',
      price: 350000,
      currency: 'COP',
      sessionsPerDay: 1,
      priceExtraSession: 15000,
      isActive: true,
    },
  })
  console.log(`Plan creado: ${plan.name}`)

  const marco = await prisma.user.findFirst({ where: { email: { contains: 'marco' } } })
  const natalia = await prisma.user.findFirst({ where: { email: { contains: 'natalia' } } })

  if (!marco || !natalia) {
    console.log('No se encontraron usuarios marco/natalia')
    return
  }

  const now = new Date()
  const nextMonth = new Date(now)
  nextMonth.setMonth(nextMonth.getMonth() + 1)

  for (const user of [marco, natalia]) {
    try {
      const sub = await prisma.userClubMembership.upsert({
        where: { id: `sub-${user.id}-bogota` },
        update: { status: 'active' },
        create: {
          id: `sub-${user.id}-bogota`,
          userId: user.id,
          clubId: 'club-bogota-1',
          planId: plan.id,
          status: 'active',
          startDate: now,
          nextBillingDate: nextMonth,
        },
      })
      console.log(`Subscripcion activa: ${user.name} -> ${plan.name}`)
    } catch (e: any) {
      console.log(`Error para ${user.name}: ${e.message}`)
    }
  }

  console.log('Done. Marco Rios y Natalia Reyes tienen membresia en Bogota Padel Club.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
