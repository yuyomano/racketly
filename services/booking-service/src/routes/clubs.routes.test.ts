import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import app from '../index'

const prisma = new PrismaClient()

describe('/api/clubs', () => {
  let ownerId: string
  let otherId: string
  let clubId: string

  beforeAll(async () => {
    const [owner, other] = await Promise.all([
      prisma.user.create({ data: { email: `club-owner-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `club-other-${Date.now()}@racketly.test` } }),
    ])
    ownerId = owner.id
    otherId = other.id

    const res = await request(app).post('/api/clubs').set('x-user-id', ownerId).send({
      ownerId: otherId, // debe ser ignorado — el owner es quien está autenticado
      name: 'Club Test',
      country: 'DO',
      city: 'Santo Domingo',
      address: 'Calle Falsa 123',
    })
    clubId = res.body.data.id
  })

  afterAll(async () => {
    await prisma.court.deleteMany({ where: { clubId } })
    await prisma.clubAdmin.deleteMany({ where: { clubId } })
    await prisma.club.delete({ where: { id: clubId } })
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } })
    await prisma.$disconnect()
  })

  it('POST / sin x-user-id responde 401', async () => {
    const res = await request(app)
      .post('/api/clubs')
      .send({ ownerId, name: 'Club Sin Auth', country: 'DO', city: 'Santo Domingo', address: 'x' })
    expect(res.status).toBe(401)
  })

  it('POST / crea el club con ownerId del header, no del body', async () => {
    expect(clubId).toBeTruthy()
    const admin = await prisma.clubAdmin.findFirst({ where: { clubId, userId: ownerId } })
    expect(admin?.role).toBe('owner')
    const asOther = await prisma.clubAdmin.findFirst({ where: { clubId, userId: otherId } })
    expect(asOther).toBeNull()
  })

  it('POST /:id/courts sin x-user-id responde 401', async () => {
    const res = await request(app)
      .post(`/api/clubs/${clubId}/courts`)
      .send({ name: 'Cancha 1', sport: 'padel' })
    expect(res.status).toBe(401)
  })

  it('POST /:id/courts con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .post(`/api/clubs/${clubId}/courts`)
      .set('x-user-id', otherId)
      .send({ name: 'Cancha 1', sport: 'padel' })
    expect(res.status).toBe(403)
  })

  it('POST /:id/courts con el owner del club crea la cancha', async () => {
    const res = await request(app)
      .post(`/api/clubs/${clubId}/courts`)
      .set('x-user-id', ownerId)
      .send({ name: 'Cancha 1', sport: 'padel' })
    expect(res.status).toBe(201)
    expect(res.body.data.clubId).toBe(clubId)
  })

  it('DELETE /:id (requireClubOwner) con un admin no-owner responde 403', async () => {
    const { v4: uuidv4 } = await import('uuid')
    await prisma.clubAdmin.create({
      data: { id: uuidv4(), userId: otherId, clubId, role: 'admin' },
    })
    const res = await request(app).delete(`/api/clubs/${clubId}`).set('x-user-id', otherId)
    expect(res.status).toBe(403)
    await prisma.clubAdmin.deleteMany({ where: { userId: otherId, clubId } })
  })
})
