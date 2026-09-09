import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { v4 as uuidv4 } from 'uuid'
import app from '../index'

const prisma = new PrismaClient({ adapter: createPgAdapter() })

describe('/api/courts — assertClubAdmin en canchas y mantenimiento', () => {
  let ownerId: string
  let otherId: string
  let clubId: string
  let courtId: string
  let blockId: string

  beforeAll(async () => {
    const [owner, other] = await Promise.all([
      prisma.user.create({ data: { email: `court-owner-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `court-other-${Date.now()}@racketly.test` } }),
    ])
    ownerId = owner.id
    otherId = other.id

    const club = await prisma.club.create({
      data: {
        ownerId,
        name: 'Club Courts Test',
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
  })

  afterAll(async () => {
    if (blockId) await prisma.maintenanceBlock.deleteMany({ where: { id: blockId } })
    await prisma.court.deleteMany({ where: { clubId } })
    await prisma.clubAdmin.deleteMany({ where: { clubId } })
    await prisma.club.delete({ where: { id: clubId } })
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } })
    await prisma.$disconnect()
  })

  it('PUT /:id sin x-user-id responde 401', async () => {
    const res = await request(app).put(`/api/courts/${courtId}`).send({ name: 'x' })
    expect(res.status).toBe(401)
  })

  it('PUT /:id con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .put(`/api/courts/${courtId}`)
      .set('x-user-id', otherId)
      .send({ name: 'Cancha renombrada' })
    expect(res.status).toBe(403)
  })

  it('PUT /:id con el owner del club actualiza la cancha', async () => {
    const res = await request(app)
      .put(`/api/courts/${courtId}`)
      .set('x-user-id', ownerId)
      .send({ name: 'Cancha renombrada' })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Cancha renombrada')
  })

  it('POST /:id/generate-slots con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .post(`/api/courts/${courtId}/generate-slots`)
      .set('x-user-id', otherId)
    expect(res.status).toBe(403)
  })

  it('POST /:id/maintenance con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .post(`/api/courts/${courtId}/maintenance`)
      .set('x-user-id', otherId)
      .send({ startAt: '2099-01-01T10:00:00Z', endAt: '2099-01-01T11:00:00Z', description: 'x' })
    expect(res.status).toBe(403)
  })

  it('POST /:id/maintenance con el owner del club crea el bloqueo', async () => {
    const res = await request(app)
      .post(`/api/courts/${courtId}/maintenance`)
      .set('x-user-id', ownerId)
      .send({ startAt: '2099-01-01T10:00:00Z', endAt: '2099-01-01T11:00:00Z', description: 'x' })
    expect(res.status).toBe(201)
    blockId = res.body.data.id
  })

  it('DELETE /:id/maintenance/:blockId con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .delete(`/api/courts/${courtId}/maintenance/${blockId}`)
      .set('x-user-id', otherId)
    expect(res.status).toBe(403)
  })

  it('DELETE /:id/maintenance/:blockId con el owner del club lo elimina', async () => {
    const res = await request(app)
      .delete(`/api/courts/${courtId}/maintenance/${blockId}`)
      .set('x-user-id', ownerId)
    expect(res.status).toBe(200)
    blockId = ''
  })
})
