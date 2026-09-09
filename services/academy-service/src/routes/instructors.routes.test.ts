import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { app } from '../index'

// Integración real contra Postgres (mismo criterio que token.service.test.ts en
// auth-service) — el fix acá es justamente la lógica de sobrecupo/doble-reserva
// contra la tabla real, así que mockear Prisma escondería el bug que se corrigió.
const prisma = new PrismaClient({ adapter: createPgAdapter() })

describe('POST /api/instructors/sessions/:id/book', () => {
  let instructorUserId: string
  let studentAId: string
  let studentBId: string
  let sessionId: string // maxStudents = 1, para poder probar "llena" con 2 usuarios

  beforeAll(async () => {
    const suffix = Date.now()
    const instructorUser = await prisma.user.create({
      data: { email: `instructor-${suffix}@racketly.test` },
    })
    instructorUserId = instructorUser.id
    await prisma.instructorProfile.create({
      data: {
        userId: instructorUserId,
        displayName: 'Test Instructor',
        country: 'DO',
        city: 'Santo Domingo',
        hourlyRate: 20,
      },
    })

    const studentA = await prisma.user.create({
      data: { email: `student-a-${suffix}@racketly.test` },
    })
    studentAId = studentA.id
    const studentB = await prisma.user.create({
      data: { email: `student-b-${suffix}@racketly.test` },
    })
    studentBId = studentB.id

    const session = await prisma.instructorSession.create({
      data: {
        instructorId: instructorUserId,
        title: 'Clase de prueba',
        sport: 'padel',
        locationDescription: 'Cancha 1',
        date: '2030-01-01',
        startTime: '10:00',
        maxStudents: 1,
        pricePerPerson: 15,
      },
    })
    sessionId = session.id
  })

  afterAll(async () => {
    await prisma.instructorSessionBooking.deleteMany({ where: { sessionId } })
    await prisma.instructorSession.delete({ where: { id: sessionId } })
    await prisma.instructorProfile.delete({ where: { userId: instructorUserId } })
    await prisma.user.deleteMany({
      where: { id: { in: [instructorUserId, studentAId, studentBId] } },
    })
    await prisma.$disconnect()
  })

  it('sin x-user-id responde 401', async () => {
    const res = await request(app).post(`/api/instructors/sessions/${sessionId}/book`)
    expect(res.status).toBe(401)
  })

  it('sesión inexistente responde 404', async () => {
    const res = await request(app)
      .post('/api/instructors/sessions/no-existe/book')
      .set('x-user-id', studentAId)
    expect(res.status).toBe(404)
  })

  it('primera reserva: 201 y persiste la fila de asistente', async () => {
    const res = await request(app)
      .post(`/api/instructors/sessions/${sessionId}/book`)
      .set('x-user-id', studentAId)
    expect(res.status).toBe(201)

    const booking = await prisma.instructorSessionBooking.findUnique({
      where: { sessionId_userId: { sessionId, userId: studentAId } },
    })
    expect(booking?.status).toBe('active')

    const session = await prisma.instructorSession.findUnique({ where: { id: sessionId } })
    expect(session?.bookedCount).toBe(1)
  })

  it('el mismo usuario reservando otra vez responde 409, no crea una segunda fila', async () => {
    const res = await request(app)
      .post(`/api/instructors/sessions/${sessionId}/book`)
      .set('x-user-id', studentAId)
    expect(res.status).toBe(409)

    const count = await prisma.instructorSessionBooking.count({ where: { sessionId } })
    expect(count).toBe(1)
  })

  it('sesión llena (maxStudents=1, ya ocupado) responde 400 para otro usuario — bug original de sobrecupo', async () => {
    const res = await request(app)
      .post(`/api/instructors/sessions/${sessionId}/book`)
      .set('x-user-id', studentBId)
    expect(res.status).toBe(400)

    const count = await prisma.instructorSessionBooking.count({ where: { sessionId } })
    expect(count).toBe(1) // sigue habiendo un solo asistente real
  })
})
