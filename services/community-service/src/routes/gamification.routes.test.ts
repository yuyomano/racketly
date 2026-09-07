import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { app } from '../index'

const prisma = new PrismaClient()

describe('POST /api/gamification/:userId/award-xp', () => {
  let userId: string
  let otherUserId: string
  let missionId: string
  let missionWithBadgeId: string
  let badgeId: string

  beforeAll(async () => {
    const suffix = Date.now()
    const user = await prisma.user.create({ data: { email: `gami-${suffix}@racketly.test` } })
    userId = user.id
    await prisma.playerProfile.create({
      data: { userId, displayName: 'Gami Test', country: 'DO', city: 'Santo Domingo' },
    })

    const other = await prisma.user.create({
      data: { email: `gami-other-${suffix}@racketly.test` },
    })
    otherUserId = other.id

    const mission = await prisma.mission.create({
      data: { title: 'Misión de prueba', description: 'test', xpReward: 50 },
    })
    missionId = mission.id

    const badge = await prisma.badge.create({
      data: {
        code: `test-badge-${suffix}`,
        name: 'Badge de prueba',
        description: 'test',
        iconUrl: 'https://example.com/icon.png',
        conditionType: 'mission',
        conditionValue: 1,
      },
    })
    badgeId = badge.id
    const missionWithBadge = await prisma.mission.create({
      data: { title: 'Misión con badge', description: 'test', xpReward: 30, badgeId },
    })
    missionWithBadgeId = missionWithBadge.id
  })

  afterAll(async () => {
    await prisma.userMission.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
    await prisma.userBadge.deleteMany({ where: { userId } })
    await prisma.mission.deleteMany({ where: { id: { in: [missionId, missionWithBadgeId] } } })
    await prisma.badge.delete({ where: { id: badgeId } })
    await prisma.playerProfile.delete({ where: { userId } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
    await prisma.$disconnect()
  })

  it('sin x-user-id responde 401', async () => {
    const res = await request(app).post(`/api/gamification/${userId}/award-xp`).send({ missionId })
    expect(res.status).toBe(401)
  })

  it('intentar otorgarse XP a otro usuario responde 403', async () => {
    const res = await request(app)
      .post(`/api/gamification/${otherUserId}/award-xp`)
      .set('x-user-id', userId)
      .send({ missionId })
    expect(res.status).toBe(403)
  })

  it('misión inexistente responde 404', async () => {
    const res = await request(app)
      .post(`/api/gamification/${userId}/award-xp`)
      .set('x-user-id', userId)
      .send({ missionId: 'clxxxxxxxxxxxxxxxxxxxxxxxx' })
    expect(res.status).toBe(404)
  })

  it('completa la misión: otorga xpReward real, no un monto libre', async () => {
    const res = await request(app)
      .post(`/api/gamification/${userId}/award-xp`)
      .set('x-user-id', userId)
      .send({ missionId, amount: 5000 }) // amount ya no existe en el schema — se ignora
    expect(res.status).toBe(200)
    expect(res.body.data.newXp).toBe(50)

    const um = await prisma.userMission.findUnique({
      where: { userId_missionId: { userId, missionId } },
    })
    expect(um?.completedAt).not.toBeNull()
  })

  it('completar la misma misión otra vez responde 409, no vuelve a sumar XP', async () => {
    const res = await request(app)
      .post(`/api/gamification/${userId}/award-xp`)
      .set('x-user-id', userId)
      .send({ missionId })
    expect(res.status).toBe(409)

    const profile = await prisma.playerProfile.findUnique({ where: { userId } })
    expect(profile?.xpPoints).toBe(50)
  })

  it('misión con badge asociado también otorga el badge', async () => {
    const res = await request(app)
      .post(`/api/gamification/${userId}/award-xp`)
      .set('x-user-id', userId)
      .send({ missionId: missionWithBadgeId })
    expect(res.status).toBe(200)
    expect(res.body.data.newXp).toBe(80)

    const userBadge = await prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId } },
    })
    expect(userBadge).not.toBeNull()
  })
})
