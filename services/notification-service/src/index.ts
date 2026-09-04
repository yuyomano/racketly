import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { Queue, Worker } from 'bullmq'
import sgMail from '@sendgrid/mail'

const app = express()
const PORT = process.env.PORT || 3006

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(','), credentials: true }))

// ─── SendGrid Init (opcional en dev) ─────────────────────────────────────────
let sendgridReady = false
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  sendgridReady = true
} else {
  console.warn('⚠️  SENDGRID_API_KEY no configurado — emails deshabilitados')
}

// ─── Redis Connection ─────────────────────────────────────────────────────────
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
}

// ─── Queues ───────────────────────────────────────────────────────────────────
export const pushQueue = new Queue('push-notifications', { connection: redisConnection })
export const emailQueue = new Queue('email-notifications', { connection: redisConnection })
export const smartAlertQueue = new Queue('smart-alerts', { connection: redisConnection })

// ─── Workers ──────────────────────────────────────────────────────────────────
// Push vía Expo Push Service — no requiere credenciales ni build nativo, solo un
// ExponentPushToken válido. A diferencia de FCM/SendGrid no hay "no configurado":
// siempre se intenta, y si el token es inválido/expiró Expo lo reporta en la respuesta.
new Worker(
  'push-notifications',
  async (job) => {
    const { token, title, body, data } = job.data
    if (!token) {
      console.info(`[Push] SKIP (sin token): ${title}`)
      return
    }
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ to: token, title, body, data }]),
    })
    const result = await res.json()
    console.info(`[Push] Sent via Expo: ${title}`, result)
  },
  { connection: redisConnection }
)

new Worker(
  'email-notifications',
  async (job) => {
    const { to, subject, html, text } = job.data
    if (!sendgridReady) {
      console.info(`[Email] SKIP (SendGrid no config): ${subject} → ${to}`)
      return
    }
    await sgMail.send({
      to,
      from: { email: 'noreply@racketly.app', name: 'Racketly' },
      subject,
      html,
      text,
    })
    console.info(`[Email] Sent to ${to}: ${subject}`)
  },
  { connection: redisConnection }
)

new Worker(
  'smart-alerts',
  async (job) => {
    const { type, userId, payload } = job.data
    console.info(`[SmartAlert] Processing ${type} for user ${userId}`, payload)
    // Aquí va la lógica de alertas inteligentes:
    // - Cancha libre cercana
    // - Rival disponible
    // - Torneo en su categoría
  },
  { connection: redisConnection }
)

// ─── Express API ──────────────────────────────────────────────────────────────
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'notification-service',
    status: 'ok',
    capabilities: {
      push: true, // Expo Push Service no requiere config previa
      email: sendgridReady,
      queues: true,
    },
  })
})

// POST /api/notifications/send — enqueue notificación push
app.post('/api/notifications/send', async (req, res) => {
  const { userId, token, type, title, body, data } = req.body
  await pushQueue.add(type, { userId, token, title, body, data })
  return res.json({ success: true, message: 'Notification queued' })
})

// POST /api/notifications/email
app.post('/api/notifications/email', async (req, res) => {
  const { to, subject, html } = req.body
  await emailQueue.add('email', { to, subject, html })
  return res.json({ success: true, message: 'Email queued' })
})

// POST /api/notifications/smart-alert
app.post('/api/notifications/smart-alert', async (req, res) => {
  const { type, userId, payload } = req.body
  await smartAlertQueue.add(type, { type, userId, payload })
  return res.json({ success: true, message: 'Smart alert queued' })
})

app.listen(PORT, () => {
  console.info(`🔔 Notification Service running on port ${PORT}`)
})
