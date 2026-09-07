import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import app from '../index'

const prisma = new PrismaClient()

describe('/api/slots — assertClubAdmin al bloquear/desbloquear', () => {
  let ownerId: string
  let otherId: string
  let clubId: string
  let courtId: string
  let slotId: string

  beforeAll(async () => {
    const [owner, other] = await Promise.all([
      prisma.user.create({ data: { email: `slot-owner-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `slot-other-${Date.now()}@racketly.test` } }),
    ])
    ownerId = owner.id
    otherId = other.id

    const club = await prisma.club.create({
      data: {
        ownerId,
        name: 'Club Slots Test',
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

    const court = await prisma.court.create({
      data: { clubId, name: 'Cancha 1', sport: 'padel', surface: 'cristal' },
    })
    courtId = court.id

    const slot = await prisma.timeSlot.create({
      data: {
        courtId,
        date: '2099-01-01',
        startTime: '10:00',
        endTime: '11:00',
        basePrice: 40,
        peakPrice: 40,
      },
    })
    slotId = slot.id
  })

  afterAll(async () => {
    await prisma.timeSlot.deleteMany({ where: { courtId } })
    await prisma.court.deleteMany({ where: { clubId } })
    await prisma.clubAdmin.deleteMany({ where: { clubId } })
    await prisma.club.delete({ where: { id: clubId } })
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } })
    await prisma.$disconnect()
  })

  it('PATCH /:id/block sin x-user-id responde 401', async () => {
    const res = await request(app).patch(`/api/slots/${slotId}/block`).send({ reason: 'x' })
    expect(res.status).toBe(401)
  })

  it('PATCH /:id/block con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .patch(`/api/slots/${slotId}/block`)
      .set('x-user-id', otherId)
      .send({ reason: 'x' })
    expect(res.status).toBe(403)
  })

  it('PATCH /:id/block con el owner del club bloquea el slot', async () => {
    const res = await request(app)
      .patch(`/api/slots/${slotId}/block`)
      .set('x-user-id', ownerId)
      .send({ reason: 'x' })
    expect(res.status).toBe(200)
    expect(res.body.data.isBlocked).toBe(true)
  })

  it('DELETE /:id/block con alguien sin acceso al club responde 403', async () => {
    const res = await request(app).delete(`/api/slots/${slotId}/block`).set('x-user-id', otherId)
    expect(res.status).toBe(403)
  })

  it('DELETE /:id/block con el owner del club desbloquea el slot', async () => {
    const res = await request(app).delete(`/api/slots/${slotId}/block`).set('x-user-id', ownerId)
    expect(res.status).toBe(200)
    expect(res.body.data.isBlocked).toBe(false)
  })
})
