import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { v4 as uuidv4 } from 'uuid'
import app from '../index'

const prisma = new PrismaClient({ adapter: createPgAdapter() })

describe('/api/classes — assertClubAdmin y self-o-admin en clases', () => {
  let ownerId: string
  let otherId: string
  let studentId: string
  let clubId: string
  let professorId: string
  let slotId: string
  let bookingId: string

  beforeAll(async () => {
    const [owner, other, student] = await Promise.all([
      prisma.user.create({ data: { email: `class-owner-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `class-other-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `class-student-${Date.now()}@racketly.test` } }),
    ])
    ownerId = owner.id
    otherId = other.id
    studentId = student.id

    const club = await prisma.club.create({
      data: {
        ownerId,
        name: 'Club Classes Test',
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

    const professor = await prisma.clubProfessor.create({
      data: { clubId, name: 'Prof Test', isExternal: true, hourlyRate: 20 },
    })
    professorId = professor.id
  })

  afterAll(async () => {
    await prisma.classBooking.deleteMany({ where: { classSlotId: slotId } })
    await prisma.classSlot.deleteMany({ where: { clubId } })
    await prisma.clubProfessor.deleteMany({ where: { clubId } })
    await prisma.clubAdmin.deleteMany({ where: { clubId } })
    await prisma.club.delete({ where: { id: clubId } })
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId, studentId] } } })
    await prisma.$disconnect()
  })

  it('POST / sin x-user-id responde 401', async () => {
    const res = await request(app)
      .post('/api/classes')
      .send({ clubId, professorId, date: '2099-01-01', startTime: '10:00', price: 30 })
    expect(res.status).toBe(401)
  })

  it('POST / con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .post('/api/classes')
      .set('x-user-id', otherId)
      .send({ clubId, professorId, date: '2099-01-01', startTime: '10:00', price: 30 })
    expect(res.status).toBe(403)
  })

  it('POST / con el owner del club crea la clase', async () => {
    const res = await request(app)
      .post('/api/classes')
      .set('x-user-id', ownerId)
      .send({ clubId, professorId, date: '2099-01-01', startTime: '10:00', price: 30 })
    expect(res.status).toBe(201)
    slotId = res.body.data.id
  })

  it('PATCH /:id con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .patch(`/api/classes/${slotId}`)
      .set('x-user-id', otherId)
      .send({ notes: 'x' })
    expect(res.status).toBe(403)
  })

  it('POST /:id/book a nombre de otro alumno (sin ser admin del club) responde 403', async () => {
    const res = await request(app)
      .post(`/api/classes/${slotId}/book`)
      .set('x-user-id', otherId)
      .send({ studentUserId: studentId })
    expect(res.status).toBe(403)
  })

  it('POST /:id/book el propio alumno reserva su cupo', async () => {
    const res = await request(app)
      .post(`/api/classes/${slotId}/book`)
      .set('x-user-id', studentId)
      .send({ studentUserId: studentId })
    expect(res.status).toBe(201)
    bookingId = res.body.data.id
  })

  it('PATCH /bookings/:id/pay con alguien sin acceso al club responde 403', async () => {
    const res = await request(app)
      .patch(`/api/classes/bookings/${bookingId}/pay`)
      .set('x-user-id', otherId)
    expect(res.status).toBe(403)
  })

  it('DELETE /bookings/:id con alguien que no es el alumno ni admin del club responde 403', async () => {
    const res = await request(app)
      .delete(`/api/classes/bookings/${bookingId}`)
      .set('x-user-id', otherId)
    expect(res.status).toBe(403)
  })

  it('DELETE /bookings/:id el propio alumno cancela su cupo', async () => {
    const res = await request(app)
      .delete(`/api/classes/bookings/${bookingId}`)
      .set('x-user-id', studentId)
    expect(res.status).toBe(200)
  })
})
