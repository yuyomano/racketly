import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { v4 as uuidv4 } from 'uuid'
import app from '../index'

const prisma = new PrismaClient({ adapter: createPgAdapter() })

describe('/api/credits — assertClubAdmin al emitir/usar créditos', () => {
  let ownerId: string
  let otherId: string
  let playerId: string
  let clubId: string
  let creditId: string

  beforeAll(async () => {
    const [owner, other, player] = await Promise.all([
      prisma.user.create({ data: { email: `credit-owner-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `credit-other-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `credit-player-${Date.now()}@racketly.test` } }),
    ])
    ownerId = owner.id
    otherId = other.id
    playerId = player.id

    const club = await prisma.club.create({
      data: {
        ownerId,
        name: 'Club Credits Test',
        country: 'DO',
        city: 'Santo Domingo',
        address: 'Calle Falsa 123',
        latitude: 18.48,
        longitude: -69.93,
      },
    })
    clubId = club.id
    await prisma.clubAdmin.create({
      data: { id: uuidv4(), userId: ownerId, clubId, role: 'owner' },
    })
  })

  afterAll(async () => {
    await prisma.userCredit.deleteMany({ where: { clubId } })
    await prisma.clubAdmin.deleteMany({ where: { clubId } })
    await prisma.club.delete({ where: { id: clubId } })
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId, playerId] } } })
    await prisma.$disconnect()
  })

  it('POST / sin x-user-id responde 401', async () => {
    const res = await request(app)
      .post('/api/credits')
      .send({ userId: playerId, clubId, amount: 10, reason: 'x' })
    expect(res.status).toBe(401)
  })

  it('POST / con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .post('/api/credits')
      .set('x-user-id', otherId)
      .send({ userId: playerId, clubId, amount: 10, reason: 'x' })
    expect(res.status).toBe(403)
  })

  it('POST / con el owner del club emite el crédito', async () => {
    const res = await request(app)
      .post('/api/credits')
      .set('x-user-id', ownerId)
      .send({ userId: playerId, clubId, amount: 10, reason: 'Cortesía' })
    expect(res.status).toBe(201)
    creditId = res.body.data.id
  })

  it('PATCH /:id/use con alguien sin acceso al club responde 403', async () => {
    const res = await request(app).patch(`/api/credits/${creditId}/use`).set('x-user-id', otherId)
    expect(res.status).toBe(403)
  })

  it('PATCH /:id/use con el owner del club lo marca usado', async () => {
    const res = await request(app).patch(`/api/credits/${creditId}/use`).set('x-user-id', ownerId)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('used')
  })
})
