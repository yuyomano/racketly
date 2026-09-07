import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import app from '../index'

const prisma = new PrismaClient()

describe('/api/clubs/:clubId/membership-plans y /api/memberships — requireClubAccess / self-o-admin', () => {
  let ownerId: string
  let otherId: string
  let player1Id: string
  let player2Id: string
  let clubId: string
  let planId: string
  let membershipId: string

  beforeAll(async () => {
    const [owner, other, player1, player2] = await Promise.all([
      prisma.user.create({ data: { email: `memb-owner-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `memb-other-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `memb-player1-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `memb-player2-${Date.now()}@racketly.test` } }),
    ])
    ownerId = owner.id
    otherId = other.id
    player1Id = player1.id
    player2Id = player2.id

    const club = await prisma.club.create({
      data: {
        ownerId,
        name: 'Club Memberships Test',
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
    await prisma.payment.deleteMany({ where: { clubId } })
    await prisma.userClubMembership.deleteMany({ where: { clubId } })
    await prisma.clubMembershipPlan.deleteMany({ where: { clubId } })
    await prisma.clubAdmin.deleteMany({ where: { clubId } })
    await prisma.club.delete({ where: { id: clubId } })
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, otherId, player1Id, player2Id] } },
    })
    await prisma.$disconnect()
  })

  it('POST /:clubId/membership-plans sin x-user-id responde 401', async () => {
    const res = await request(app)
      .post(`/api/clubs/${clubId}/membership-plans`)
      .send({ name: 'Plan Mensual', price: 50, sessionsPerDay: 1 })
    expect(res.status).toBe(401)
  })

  it('POST /:clubId/membership-plans con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .post(`/api/clubs/${clubId}/membership-plans`)
      .set('x-user-id', otherId)
      .send({ name: 'Plan Mensual', price: 50, sessionsPerDay: 1 })
    expect(res.status).toBe(403)
  })

  it('POST /:clubId/membership-plans con el owner del club crea el plan', async () => {
    const res = await request(app)
      .post(`/api/clubs/${clubId}/membership-plans`)
      .set('x-user-id', ownerId)
      .send({ name: 'Plan Mensual', price: 50, sessionsPerDay: 1 })
    expect(res.status).toBe(201)
    planId = res.body.data.id
  })

  it('PATCH /:clubId/membership-plans/:planId con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .patch(`/api/clubs/${clubId}/membership-plans/${planId}`)
      .set('x-user-id', otherId)
      .send({ price: 60 })
    expect(res.status).toBe(403)
  })

  it('POST /:clubId/memberships (alta manual) con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .post(`/api/clubs/${clubId}/memberships`)
      .set('x-user-id', otherId)
      .send({ userId: player1Id, planId, paymentMethod: 'cash' })
    expect(res.status).toBe(403)
  })

  it('POST /:clubId/memberships con el owner del club da de alta al socio', async () => {
    const res = await request(app)
      .post(`/api/clubs/${clubId}/memberships`)
      .set('x-user-id', ownerId)
      .send({ userId: player1Id, planId, paymentMethod: 'cash' })
    expect(res.status).toBe(201)
    membershipId = res.body.data.id
  })

  it('POST /subscribe sin x-user-id responde 401', async () => {
    const res = await request(app).post('/api/memberships/subscribe').send({ planId })
    expect(res.status).toBe(401)
  })

  it('POST /subscribe suscribe al usuario autenticado (nunca a otro id del body)', async () => {
    const res = await request(app)
      .post('/api/memberships/subscribe')
      .set('x-user-id', player2Id)
      .send({ planId })
    expect(res.status).toBe(201)
    expect(res.body.data.userId).toBe(player2Id)
  })

  it('DELETE /:id/cancel con alguien que no es el socio ni admin del club responde 403', async () => {
    const res = await request(app)
      .delete(`/api/memberships/${membershipId}/cancel`)
      .set('x-user-id', otherId)
    expect(res.status).toBe(403)
  })

  it('DELETE /:id/cancel con el propio socio la cancela', async () => {
    const res = await request(app)
      .delete(`/api/memberships/${membershipId}/cancel`)
      .set('x-user-id', player1Id)
    expect(res.status).toBe(200)
    expect(res.body.data.cancelAtPeriodEnd).toBe(true)
  })
})
