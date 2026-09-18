import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import app from '../index'

const prisma = new PrismaClient({ adapter: createPgAdapter() })

describe('/api/bookings', () => {
  let ownerId: string
  let otherId: string
  let clubId: string
  let courtId: string
  let slotId: string
  let bookingId: string

  beforeAll(async () => {
    const [owner, other] = await Promise.all([
      prisma.user.create({ data: { email: `booking-owner-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `booking-other-${Date.now()}@racketly.test` } }),
    ])
    ownerId = owner.id
    otherId = other.id

    const club = await prisma.club.create({
      data: {
        ownerId,
        name: 'Club Bookings Test',
        country: 'DO',
        city: 'Santo Domingo',
        address: 'Calle Falsa 123',
        latitude: 18.48,
        longitude: -69.93,
      },
    })
    clubId = club.id

    const court = await prisma.court.create({
      data: {
        clubId,
        name: 'Cancha 1',
        sport: 'padel',
        surface: 'cristal',
        basePrice: 40,
        peakPrice: 40,
      },
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
    if (bookingId) await prisma.booking.deleteMany({ where: { id: bookingId } })
    await prisma.timeSlot.deleteMany({ where: { courtId } })
    await prisma.court.delete({ where: { id: courtId } })
    await prisma.club.delete({ where: { id: clubId } })
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } })
    await prisma.$disconnect()
  })

  it('POST / a nombre de otro usuario (x-user-id no coincide con userId del body) responde 403', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('x-user-id', otherId)
      .send({ slotId, userId: ownerId })
    expect(res.status).toBe(403)
  })

  it('POST / crea la reserva (club → court → slot → booking, row filtrada por club vía courtId)', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('x-user-id', ownerId)
      .send({ slotId, userId: ownerId })
    expect(res.status).toBe(201)
    expect(res.body.data.booking.userId).toBe(ownerId)
    expect(res.body.data.booking.slotId).toBe(slotId)
    bookingId = res.body.data.booking.id
  })

  it('DELETE /:id con alguien que no es el dueño de la reserva responde 403', async () => {
    const res = await request(app).delete(`/api/bookings/${bookingId}`).set('x-user-id', otherId)
    expect(res.status).toBe(403)
  })

  it('DELETE /:id con el dueño de la reserva la cancela', async () => {
    const res = await request(app).delete(`/api/bookings/${bookingId}`).set('x-user-id', ownerId)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('cancelled')
  })
})

describe('/api/bookings/:id/players/:playerId pago', () => {
  let ownerId: string
  let otherId: string
  let strangerId: string
  let clubId: string
  let courtId: string
  let slotId: string
  let bookingId: string

  beforeAll(async () => {
    const [owner, other, stranger] = await Promise.all([
      prisma.user.create({ data: { email: `pay-owner-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `pay-other-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `pay-stranger-${Date.now()}@racketly.test` } }),
    ])
    ownerId = owner.id
    otherId = other.id
    strangerId = stranger.id

    const club = await prisma.club.create({
      data: {
        ownerId,
        name: 'Club Pay Test',
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
      data: {
        clubId,
        name: 'Cancha Pago',
        sport: 'padel',
        surface: 'cristal',
        basePrice: 40,
        peakPrice: 40,
      },
    })
    courtId = court.id

    const slot = await prisma.timeSlot.create({
      data: {
        courtId,
        date: '2099-01-02',
        startTime: '10:00',
        endTime: '11:00',
        basePrice: 40,
        peakPrice: 40,
      },
    })
    slotId = slot.id

    const booking = await prisma.booking.create({
      data: {
        id: uuidv4(),
        slotId,
        userId: ownerId,
        status: 'confirmed',
        currency: 'DOP',
        amountPaid: 0,
        players: [
          { userId: ownerId, name: 'Owner', isOwner: true, amountOwed: 40, paymentStatus: 'pending' },
          { userId: otherId, name: 'Other', isOwner: false, amountOwed: 40, paymentStatus: 'pending' },
        ],
      },
    })
    bookingId = booking.id
  })

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { clubId } })
    await prisma.booking.deleteMany({ where: { id: bookingId } })
    await prisma.timeSlot.deleteMany({ where: { courtId } })
    await prisma.court.delete({ where: { id: courtId } })
    await prisma.clubAdmin.deleteMany({ where: { clubId } })
    await prisma.club.delete({ where: { id: clubId } })
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId, strangerId] } } })
    await prisma.$disconnect()
  })

  it('PATCH /players/:playerId/pay (cobro admin) sin ser admin del club responde 403', async () => {
    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/players/${ownerId}/pay`)
      .set('x-user-id', otherId)
      .send({})
    expect(res.status).toBe(403)
  })

  it('PATCH /players/:playerId/pay con admin del club marca pagado', async () => {
    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/players/${ownerId}/pay`)
      .set('x-user-id', ownerId)
      .send({ paymentMethod: 'cash' })
    expect(res.status).toBe(200)
    const player = res.body.data.players.find((p: any) => p.userId === ownerId)
    expect(player.paymentStatus).toBe('paid')
  })

  it('POST /players/:playerId/intent sin ser participante de la reserva responde 403', async () => {
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/players/${otherId}/intent`)
      .set('x-user-id', strangerId)
    expect(res.status).toBe(403)
  })

  it('POST /players/:playerId/intent con quien creó la reserva pagando por otro jugador devuelve un PaymentIntent en DEV mode', async () => {
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/players/${otherId}/intent`)
      .set('x-user-id', ownerId)
    expect(res.status).toBe(200)
    expect(res.body.data.paymentIntentId).toBeTruthy()
    expect(res.body.data.devMode).toBe(true)
  })

  it('POST /players/:playerId/intent con un jugador que no creó la reserva pagando por otro jugador responde 403', async () => {
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/players/${ownerId}/intent`)
      .set('x-user-id', otherId)
    expect(res.status).toBe(403)
  })

  it('POST /players/:playerId/confirm-payment sin paymentIntentId responde 400', async () => {
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/players/${otherId}/confirm-payment`)
      .set('x-user-id', ownerId)
      .send({})
    expect(res.status).toBe(400)
  })

  it('POST /players/:playerId/confirm-payment con un intent válido marca al jugador pagado', async () => {
    const intentRes = await request(app)
      .post(`/api/bookings/${bookingId}/players/${otherId}/intent`)
      .set('x-user-id', ownerId)
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/players/${otherId}/confirm-payment`)
      .set('x-user-id', ownerId)
      .send({ paymentIntentId: intentRes.body.data.paymentIntentId })
    expect(res.status).toBe(200)
    const player = res.body.data.players.find((p: any) => p.userId === otherId)
    expect(player.paymentStatus).toBe('paid')
    expect(player.paymentMethod).toBe('card')
  })
})
