import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { v4 as uuidv4 } from 'uuid'
import app from '../index'

const prisma = new PrismaClient({ adapter: createPgAdapter() })

describe('/api/professors — assertClubAdmin al dar de alta / editar', () => {
  let ownerId: string
  let otherId: string
  let clubId: string
  let professorId: string

  beforeAll(async () => {
    const [owner, other] = await Promise.all([
      prisma.user.create({ data: { email: `prof-owner-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `prof-other-${Date.now()}@racketly.test` } }),
    ])
    ownerId = owner.id
    otherId = other.id

    const club = await prisma.club.create({
      data: {
        ownerId,
        name: 'Club Professors Test',
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
    await prisma.clubProfessor.deleteMany({ where: { clubId } })
    await prisma.clubAdmin.deleteMany({ where: { clubId } })
    await prisma.club.delete({ where: { id: clubId } })
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } })
    await prisma.$disconnect()
  })

  it('POST / sin x-user-id responde 401', async () => {
    const res = await request(app)
      .post('/api/professors')
      .send({ clubId, name: 'Prof Externo', isExternal: true, hourlyRate: 20 })
    expect(res.status).toBe(401)
  })

  it('POST / con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .post('/api/professors')
      .set('x-user-id', otherId)
      .send({ clubId, name: 'Prof Externo', isExternal: true, hourlyRate: 20 })
    expect(res.status).toBe(403)
  })

  it('POST / con el owner del club da de alta al profesor', async () => {
    const res = await request(app)
      .post('/api/professors')
      .set('x-user-id', ownerId)
      .send({ clubId, name: 'Prof Externo', isExternal: true, hourlyRate: 20 })
    expect(res.status).toBe(201)
    professorId = res.body.data.id
  })

  it('PATCH /:id con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .patch(`/api/professors/${professorId}`)
      .set('x-user-id', otherId)
      .send({ isActive: false })
    expect(res.status).toBe(403)
  })

  it('PATCH /:id con el owner del club lo edita', async () => {
    const res = await request(app)
      .patch(`/api/professors/${professorId}`)
      .set('x-user-id', ownerId)
      .send({ isActive: false })
    expect(res.status).toBe(200)
    expect(res.body.data.isActive).toBe(false)
  })
})
