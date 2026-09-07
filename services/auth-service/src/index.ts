import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { initSentry } from '@racketly/utils/observability'

import { authRouter } from './routes/auth.routes'
import { profileRouter } from './routes/profile.routes'
import { usersRouter } from './routes/users.routes'
import { errorHandler } from './middleware/error.middleware'

initSentry({ serviceName: 'auth-service' })

const app = express()
const PORT = process.env.PORT || 3001

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet())
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  })
)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,
    message: { success: false, error: 'Demasiadas solicitudes. Intenta más tarde.' },
  })
)

// ─── Parsers ──────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'auth-service', status: 'ok', ts: new Date().toISOString() })
})

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter)
app.use('/api/profile', profileRouter)
app.use('/api/users', usersRouter)

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler)

app.listen(PORT, () => {
  console.info(`🔐 Auth Service running on port ${PORT}`)
})

export default app
