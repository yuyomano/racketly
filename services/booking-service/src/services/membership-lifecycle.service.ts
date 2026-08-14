import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Las membresías canceladas por el socio se quedan en status='active' (con todos sus
// beneficios) mientras cancelAtPeriodEnd=true, hasta que se cumple nextBillingDate — el
// fin del período que ya pagó. Este cron las mueve a 'cancelled' cuando ese momento llega.
export async function expireCancelledMemberships() {
  await prisma.userClubMembership.updateMany({
    where: { status: 'active', cancelAtPeriodEnd: true, nextBillingDate: { lte: new Date() } },
    data: { status: 'cancelled' },
  })
}
