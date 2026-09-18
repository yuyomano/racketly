import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import app from '../index'

const prisma = new PrismaClient({ adapter: createPgAdapter() })

describe('/api/match-requests', () => {
  let requesterId: string
  let applicantId: string
  let requestId: string
  let applicationId: string

  beforeAll(async () => {
    const [requester, applicant] = await Promise.all([
      prisma.user.create({ data: { email: `partner-req-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `partner-app-${Date.now()}@racketly.test` } }),
    ])
    requesterId = requester.id
    applicantId = applicant.id
  })

  afterAll(async () => {
    if (applicationId) await prisma.matchApplication.deleteMany({ where: { requestId } })
    if (requestId) await prisma.matchRequest.delete({ where: { id: requestId } })
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, applicantId] } } })
    await prisma.$disconnect()
  })

  it('POST / sin x-user-id responde 401', async () => {
    const res = await request(app).post('/api/match-requests').send({ sport: 'padel' })
    expect(res.status).toBe(401)
  })

  it('POST / crea la solicitud con requesterId del header, no del body', async () => {
    const res = await request(app).post('/api/match-requests').set('x-user-id', requesterId).send({
      requesterId: applicantId, // debe ser ignorado
      sport: 'padel',
      levelMin: 'B2',
      levelMax: 'B1',
      city: 'Santo Domingo',
    })
    expect(res.status).toBe(201)
    expect(res.body.data.requesterId).toBe(requesterId)
    requestId = res.body.data.id
  })

  it('POST /:id/apply crea la aplicación con applicantId del header', async () => {
    const res = await request(app)
      .post(`/api/match-requests/${requestId}/apply`)
      .set('x-user-id', applicantId)
      .send({ applicantId: requesterId, message: 'Dale' }) // ignorado
    expect(res.status).toBe(201)
    expect(res.body.data.applicantId).toBe(applicantId)
    applicationId = res.body.data.id
  })

  it('PUT /applications/:id/respond con alguien que no publicó la solicitud responde 403', async () => {
    const res = await request(app)
      .put(`/api/match-requests/applications/${applicationId}/respond`)
      .set('x-user-id', applicantId)
      .send({ status: 'accepted' })
    expect(res.status).toBe(403)
  })

  it('PUT /applications/:id/respond con el dueño de la solicitud acepta la aplicación', async () => {
    const res = await request(app)
      .put(`/api/match-requests/applications/${applicationId}/respond`)
      .set('x-user-id', requesterId)
      .send({ status: 'accepted' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('accepted')
  })

  it('PUT /:id ya no permite editar una solicitud emparejada', async () => {
    const res = await request(app)
      .put(`/api/match-requests/${requestId}`)
      .set('x-user-id', requesterId)
      .send({ city: 'Punta Cana' })
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/match-requests/:id (edición)', () => {
  let requesterId: string
  let otherId: string
  let requestId: string

  beforeAll(async () => {
    const [requester, other] = await Promise.all([
      prisma.user.create({ data: { email: `partner-edit-req-${Date.now()}@racketly.test` } }),
      prisma.user.create({ data: { email: `partner-edit-other-${Date.now()}@racketly.test` } }),
    ])
    requesterId = requester.id
    otherId = other.id

    const created = await request(app).post('/api/match-requests').set('x-user-id', requesterId).send({
      sport: 'padel',
      levelMin: 'B2',
      levelMax: 'B1',
      city: 'Santo Domingo',
    })
    requestId = created.body.data.id
  })

  afterAll(async () => {
    await prisma.matchRequest.delete({ where: { id: requestId } })
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, otherId] } } })
    await prisma.$disconnect()
  })

  it('con otra persona responde 403', async () => {
    const res = await request(app)
      .put(`/api/match-requests/${requestId}`)
      .set('x-user-id', otherId)
      .send({ city: 'Punta Cana' })
    expect(res.status).toBe(403)
  })

  it('con el dueño actualiza los campos', async () => {
    const res = await request(app)
      .put(`/api/match-requests/${requestId}`)
      .set('x-user-id', requesterId)
      .send({ city: 'Punta Cana', message: 'Actualizado' })
    expect(res.status).toBe(200)
    expect(res.body.data.city).toBe('Punta Cana')
    expect(res.body.data.message).toBe('Actualizado')
  })

  it('con torneo inexistente responde 404', async () => {
    const res = await request(app)
      .put(`/api/match-requests/${requestId}`)
      .set('x-user-id', requesterId)
      .send({ tournamentId: 'no-existe' })
    expect(res.status).toBe(404)
  })
})
