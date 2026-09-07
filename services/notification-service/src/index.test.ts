import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import request from 'supertest'
import { app, pushQueue, emailQueue, smartAlertQueue } from './index'

// Contra Redis real (igual que el job "test" de CI, que levanta un Redis dedicado) —
// las colas se crean a nivel de módulo, así que mockear BullMQ sería más frágil que
// verificar que el job realmente llega a la cola. Los payloads usados (sin push token,
// sin SendGrid configurado) caen en la rama SKIP de cada worker, así que no disparan
// llamadas de red reales aunque el worker los procese durante el test.
async function totalJobs(queue: typeof pushQueue) {
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'delayed')
  return Object.values(counts).reduce((a, b) => a + b, 0)
}

afterAll(async () => {
  await pushQueue.close()
  await emailQueue.close()
  await smartAlertQueue.close()
})

describe('POST /api/notifications/send', () => {
  it('encola un push notification', async () => {
    const before = await totalJobs(pushQueue)
    const res = await request(app)
      .post('/api/notifications/send')
      .send({ userId: 'u1', type: 'test', title: 'Hola', body: 'Test' })
    expect(res.status).toBe(200)
    expect(await totalJobs(pushQueue)).toBe(before + 1)
  })
})

describe('POST /api/notifications/email', () => {
  it('encola un email', async () => {
    const before = await totalJobs(emailQueue)
    const res = await request(app)
      .post('/api/notifications/email')
      .send({ to: 'a@a.com', subject: 'Hola', html: '<p>hi</p>' })
    expect(res.status).toBe(200)
    expect(await totalJobs(emailQueue)).toBe(before + 1)
  })
})

describe('POST /api/notifications/smart-alert', () => {
  it('encola una smart alert', async () => {
    const before = await totalJobs(smartAlertQueue)
    const res = await request(app)
      .post('/api/notifications/smart-alert')
      .send({ type: 'nearby_court', userId: 'u1', payload: {} })
    expect(res.status).toBe(200)
    expect(await totalJobs(smartAlertQueue)).toBe(before + 1)
  })
})
