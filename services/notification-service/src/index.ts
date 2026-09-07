import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { Queue, Worker } from 'bullmq'
import sgMail from '@sendgrid/mail'
import { PrismaClient } from '@prisma/client'
import { distanceKm } from '@racketly/utils'
import { initSentry, Sentry } from '@racketly/utils/observability'
import { errorHandler } from './middleware/error.middleware'

const prisma = new PrismaClient()

initSentry({ serviceName: 'notification-service' })

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
export const redisConnection = {
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
).on('failed', (job, err) => {
  console.error(`[Push] Job ${job?.id} failed:`, err)
  Sentry.captureException(err, { tags: { queue: 'push-notifications' } })
})

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
).on('failed', (job, err) => {
  console.error(`[Email] Job ${job?.id} failed:`, err)
  Sentry.captureException(err, { tags: { queue: 'email-notifications' } })
})

// ponytail: umbrales fijos y globales (15km, ±150 ELO), no personalizables por usuario
// todavía — subir a preferencia de usuario si hace falta afinarlos por densidad de mercado.
const NEARBY_COURT_RADIUS_KM = 15
const RIVAL_ELO_RANGE = 150

// Nada en el repo llama todavía a POST /api/notifications/smart-alert (el "detectar cancha
// libre" / "encontrar rival" / "torneo en tu categoría" vive en booking/tournament-service y
// no dispara esto aún) — esta lógica es la del worker: dado un job ya encolado, decide si la
// alerta sigue siendo relevante para el usuario antes de gastar un push, en vez de reenviar
// ciegamente lo que mandó el caller.
new Worker(
  'smart-alerts',
  async (job) => {
    const { type, userId, payload } = job.data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { playerProfile: true },
    })
    if (!user?.playerProfile) {
      console.info(`[SmartAlert] SKIP (sin perfil de jugador): ${type} para ${userId}`)
      return
    }
    const profile = user.playerProfile

    let title: string
    let body: string
    switch (type) {
      case 'nearby_court': {
        const { courtLat, courtLon, clubName } = payload
        if (profile.latitude == null || profile.longitude == null) {
          console.info(`[SmartAlert] SKIP (sin ubicación): nearby_court para ${userId}`)
          return
        }
        const km = distanceKm(profile.latitude, profile.longitude, courtLat, courtLon)
        if (km > NEARBY_COURT_RADIUS_KM) {
          console.info(
            `[SmartAlert] SKIP (${km}km, fuera de ${NEARBY_COURT_RADIUS_KM}km): nearby_court para ${userId}`
          )
          return
        }
        title = 'Cancha libre cerca de ti'
        body = `Hay disponibilidad en ${clubName}, a ${km}km`
        break
      }
      case 'rival_available': {
        const { rivalElo, sport } = payload
        const myElo = sport === 'pickleball' ? profile.eloPickleball : profile.eloPadel
        if (Math.abs(myElo - rivalElo) > RIVAL_ELO_RANGE) {
          console.info(`[SmartAlert] SKIP (elo fuera de rango): rival_available para ${userId}`)
          return
        }
        title = 'Rival disponible'
        body = 'Encontramos un rival de tu nivel para jugar'
        break
      }
      case 'tournament_category': {
        const { category, tournamentName } = payload
        if (category !== profile.category) {
          console.info(
            `[SmartAlert] SKIP (categoría ${profile.category} != ${category}): tournament_category para ${userId}`
          )
          return
        }
        title = 'Torneo en tu categoría'
        body = `${tournamentName} está abierto para tu categoría`
        break
      }
      default:
        console.info(`[SmartAlert] SKIP (tipo desconocido): ${type}`)
        return
    }

    await prisma.notification.create({ data: { userId, type, title, body, data: payload } })
    if (user.pushToken) {
      await pushQueue.add('smart-alert-push', { token: user.pushToken, title, body, data: payload })
    }
    console.info(`[SmartAlert] Sent: ${type} para ${userId}`)
  },
  { connection: redisConnection }
).on('failed', (job, err) => {
  console.error(`[SmartAlert] Job ${job?.id} failed:`, err)
  Sentry.captureException(err, { tags: { queue: 'smart-alerts' } })
})

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
app.post('/api/notifications/send', async (req, res, next) => {
  try {
    const { userId, token, type, title, body, data } = req.body
    await pushQueue.add(type, { userId, token, title, body, data })
    return res.json({ success: true, message: 'Notification queued' })
  } catch (err) {
    return next(err)
  }
})

// POST /api/notifications/email
app.post('/api/notifications/email', async (req, res, next) => {
  try {
    const { to, subject, html } = req.body
    await emailQueue.add('email', { to, subject, html })
    return res.json({ success: true, message: 'Email queued' })
  } catch (err) {
    return next(err)
  }
})

// POST /api/notifications/smart-alert
app.post('/api/notifications/smart-alert', async (req, res, next) => {
  try {
    const { type, userId, payload } = req.body
    await smartAlertQueue.add(type, { type, userId, payload })
    return res.json({ success: true, message: 'Smart alert queued' })
  } catch (err) {
    return next(err)
  }
})

app.use(errorHandler)

export { app }

// Guard: al importar `app` desde un test (supertest) no queremos bindear el puerto real.
if (require.main === module) {
  app.listen(PORT, () => {
    console.info(`🔔 Notification Service running on port ${PORT}`)
  })
}
