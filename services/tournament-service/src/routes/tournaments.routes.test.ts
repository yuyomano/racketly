import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import app from '../index'

const prisma = new PrismaClient({ adapter: createPgAdapter() })

describe('/api/tournaments', () => {
  let organizerId: string
  let otherId: string
  let tournamentId: string

  beforeAll(async () => {
    const [organizer, other] = await Promise.all([
      prisma.user.create({ data: { email: `tourn-org-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `tourn-other-${Date.now()}@racketly.test` } }),
    ])
    organizerId = organizer.id
    otherId = other.id
    // TournamentParticipant.player apunta a PlayerProfile.userId, no a User.id directamente.
    await prisma.playerProfile.create({
      data: { userId: otherId, displayName: 'Otro Jugador', country: 'DO', city: 'Santo Domingo' },
    })
  })

  afterAll(async () => {
    if (tournamentId) {
      await prisma.tournamentParticipant.deleteMany({ where: { tournamentId } })
      await prisma.tournament.delete({ where: { id: tournamentId } })
    }
    await prisma.playerProfile.delete({ where: { userId: otherId } })
    await prisma.user.deleteMany({ where: { id: { in: [organizerId, otherId] } } })
    await prisma.$disconnect()
  })

  it('POST / sin x-user-id responde 401', async () => {
    const res = await request(app).post('/api/tournaments').send({ name: 'Copa Test' })
    expect(res.status).toBe(401)
  })

  it('POST / crea el torneo con organizerId del header, no del body', async () => {
    const res = await request(app)
      .post('/api/tournaments')
      .set('x-user-id', organizerId)
      .send({
        organizerId: otherId, // debe ser ignorado
        name: 'Copa Test',
        sport: 'padel',
        category: 'B2',
        location: 'Club Test',
        registrationStart: new Date().toISOString(),
        registrationEnd: new Date(Date.now() + 86400000).toISOString(),
        startDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      })
    expect(res.status).toBe(201)
    expect(res.body.data.organizerId).toBe(organizerId)
    tournamentId = res.body.data.id
  })

  it('PATCH /:id con un usuario que no es el organizador responde 403', async () => {
    const res = await request(app)
      .patch(`/api/tournaments/${tournamentId}`)
      .set('x-user-id', otherId)
      .send({ name: 'Hackeado' })
    expect(res.status).toBe(403)
  })

  it('PATCH /:id con el organizador edita el torneo', async () => {
    const res = await request(app)
      .patch(`/api/tournaments/${tournamentId}`)
      .set('x-user-id', organizerId)
      .send({ name: 'Copa Test Renombrada' })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Copa Test Renombrada')
  })

  it('PATCH /:id/status con un usuario que no es el organizador responde 403', async () => {
    const res = await request(app)
      .patch(`/api/tournaments/${tournamentId}/status`)
      .set('x-user-id', otherId)
      .send({ status: 'open' })
    expect(res.status).toBe(403)
  })

  it('PATCH /:id/status con el organizador abre el torneo', async () => {
    const res = await request(app)
      .patch(`/api/tournaments/${tournamentId}/status`)
      .set('x-user-id', organizerId)
      .send({ status: 'open' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('open')
  })

  it('POST /:id/register sin ser el propio jugador ni el organizador responde 403', async () => {
    const res = await request(app)
      .post(`/api/tournaments/${tournamentId}/register`)
      .set('x-user-id', otherId)
      .send({ playerId: organizerId })
    expect(res.status).toBe(403)
  })

  it('POST /:id/register permite que el propio jugador se inscriba', async () => {
    const res = await request(app)
      .post(`/api/tournaments/${tournamentId}/register`)
      .set('x-user-id', otherId)
      .send({ playerId: otherId })
    expect(res.status).toBe(201)
    expect(res.body.data.playerId).toBe(otherId)
  })
})
