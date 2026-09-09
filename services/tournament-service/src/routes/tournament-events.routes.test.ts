import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import app from '../index'

const prisma = new PrismaClient({ adapter: createPgAdapter() })

describe('/api/tournament-events', () => {
  let organizerId: string
  let otherId: string
  let clubId: string
  let eventId: string

  beforeAll(async () => {
    const [organizer, other] = await Promise.all([
      prisma.user.create({ data: { email: `event-org-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `event-other-${Date.now()}@racketly.test` } }),
    ])
    organizerId = organizer.id
    otherId = other.id
    const club = await prisma.club.create({
      data: {
        ownerId: organizerId,
        name: 'Club Test Events',
        country: 'DO',
        city: 'Santo Domingo',
        address: 'Calle Falsa 123',
        latitude: 18.48,
        longitude: -69.93,
      },
    })
    clubId = club.id
  })

  afterAll(async () => {
    if (eventId) await prisma.tournamentEvent.delete({ where: { id: eventId } })
    await prisma.club.delete({ where: { id: clubId } })
    await prisma.user.deleteMany({ where: { id: { in: [organizerId, otherId] } } })
    await prisma.$disconnect()
  })

  it('POST / sin x-user-id responde 401', async () => {
    const res = await request(app).post('/api/tournament-events').send({ clubId })
    expect(res.status).toBe(401)
  })

  it('POST / crea el evento con organizerId del header', async () => {
    const res = await request(app)
      .post('/api/tournament-events')
      .set('x-user-id', organizerId)
      .send({
        clubId,
        organizerId: otherId, // ignorado
        name: 'Evento Test',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
      })
    expect(res.status).toBe(201)
    expect(res.body.data.organizerId).toBe(organizerId)
    eventId = res.body.data.id
  })

  it('PATCH /:id con un usuario que no es el organizador responde 403', async () => {
    const res = await request(app)
      .patch(`/api/tournament-events/${eventId}`)
      .set('x-user-id', otherId)
      .send({ name: 'Hackeado' })
    expect(res.status).toBe(403)
  })

  it('PATCH /:id con el organizador edita el evento', async () => {
    const res = await request(app)
      .patch(`/api/tournament-events/${eventId}`)
      .set('x-user-id', organizerId)
      .send({ name: 'Evento Renombrado' })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Evento Renombrado')
  })
})
