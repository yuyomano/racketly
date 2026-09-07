import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import app from '../index'

const prisma = new PrismaClient()

describe('/api/matches', () => {
  let player1Id: string
  let outsiderId: string
  let matchId: string

  beforeAll(async () => {
    const [player1, outsider] = await Promise.all([
      prisma.user.create({ data: { email: `match-p1-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `match-out-${Date.now()}@racketly.test` } }),
    ])
    player1Id = player1.id
    outsiderId = outsider.id
    await prisma.playerProfile.create({
      data: { userId: player1Id, displayName: 'Jugador 1', country: 'DO', city: 'Santo Domingo' },
    })
    // Partido casual (sin torneo) — el otro lado queda por definir.
    const match = await prisma.match.create({ data: { player1Id, status: 'scheduled' } })
    matchId = match.id
  })

  afterAll(async () => {
    if (matchId) await prisma.match.delete({ where: { id: matchId } })
    await prisma.playerProfile.delete({ where: { userId: player1Id } })
    await prisma.user.deleteMany({ where: { id: { in: [player1Id, outsiderId] } } })
    await prisma.$disconnect()
  })

  it('PUT /:id/score sin x-user-id responde 401', async () => {
    const res = await request(app).put(`/api/matches/${matchId}/score`).send({ sets: [] })
    expect(res.status).toBe(401)
  })

  it('PUT /:id/score con alguien ajeno al partido responde 403', async () => {
    const res = await request(app)
      .put(`/api/matches/${matchId}/score`)
      .set('x-user-id', outsiderId)
      .send({ sets: [[6, 4]] })
    expect(res.status).toBe(403)
  })

  it('PUT /:id/score con uno de los jugadores actualiza el marcador', async () => {
    const res = await request(app)
      .put(`/api/matches/${matchId}/score`)
      .set('x-user-id', player1Id)
      .send({ sets: [[6, 4]], isFinished: false })
    expect(res.status).toBe(200)
    expect(res.body.data.score).toEqual([[6, 4]])
  })
})
