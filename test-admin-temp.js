const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    const email = 'pablo.instructor@racketly.app'
    const role = 'admin'
    const clubId = 'club-miami-1'

    const user = await prisma.user.findUnique({ where: { email } })
    console.log('user:', user ? `${user.id} (${user.email})` : 'NOT FOUND')
    if (!user) return

    const ca = await prisma.clubAdmin.upsert({
      where: { userId_clubId: { userId: user.id, clubId } },
      update: { role },
      create: { userId: user.id, clubId, role },
      include: { user: { include: { playerProfile: { select: { displayName: true, avatarUrl: true } } } } },
    })
    console.log('SUCCESS:', ca.id, ca.role, ca.user.email)
  } catch(e) {
    console.error('ERROR:', e.message)
    console.error('CODE:', e.code)
    console.error('META:', JSON.stringify(e.meta))
    console.error('STACK:', e.stack?.split('\n').slice(0,5).join('\n'))
  } finally {
    await prisma.$disconnect()
  }
}
main()
