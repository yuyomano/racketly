import 'dotenv/config'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { createProxyMiddleware } from 'http-proxy-middleware'
import http from 'http'
import jwt from 'jsonwebtoken'

const app = express()
const PORT = Number(process.env.PORT) || 3000

// Fail-closed: sin JWT_SECRET real, el gateway no debe arrancar — un fallback hardcodeado
// permitiría a cualquiera con acceso al código firmar tokens válidos.
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET no configurado — el gateway no puede arrancar sin un secreto real.')
}
const JWT_SECRET = process.env.JWT_SECRET

// ─── Service URLs ─────────────────────────────────────────────────────────────
const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  booking: process.env.BOOKING_SERVICE_URL || 'http://localhost:3002',
  tournament: process.env.TOURNAMENT_SERVICE_URL || 'http://localhost:3003',
  community: process.env.COMMUNITY_SERVICE_URL || 'http://localhost:3004',
  academy: process.env.ACADEMY_SERVICE_URL || 'http://localhost:3005',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006',
}

// ─── Allowed origins ─────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
  .concat([
    'http://localhost:3000',
    'http://localhost:3010', // Next.js web (dashboard + jugadores) — Next reenvía el
    // header Origin original al hacer proxy vía rewrites,
    // así que el gateway lo ve aunque sea same-origin en el navegador
    'http://localhost:8081', // Expo Metro
    'http://localhost:19006', // Expo web
    'http://10.0.2.2:8081', // Android emulator Metro
  ])

// ─── Core Middleware ─────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }))
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin) return cb(null, true)
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
      // Allow Expo Go origins (exp://)
      if (origin.startsWith('exp://')) return cb(null, true)
      cb(new Error('CORS_NOT_ALLOWED'))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
)
// Sin esto, un origen rechazado por CORS cae al manejador de error default de Express,
// que devuelve una página HTML con el stack trace completo (incluye rutas del filesystem
// del servidor) — una fuga de información innecesaria para un simple 403.
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err.message === 'CORS_NOT_ALLOWED') {
    return res.status(403).json({ success: false, error: 'Origen no permitido' })
  }
  return next(err)
})
app.use(morgan('dev'))
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500, // generous for dev
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas solicitudes. Intenta más tarde.' },
  })
)

// ─── Auth Middleware (optional — enriches request, does NOT block) ────────────
// Verifies the JWT if present (Bearer header or racketly_token cookie) and
// forwards user info as x-user-* headers to downstream services.
function parseCookieHeader(req: Request): Record<string, string> {
  return (req.headers.cookie || '').split(';').reduce<Record<string, string>>((acc, part) => {
    const [k, ...v] = part.trim().split('=')
    if (k) acc[k.trim()] = decodeURIComponent(v.join('='))
    return acc
  }, {})
}

function attachUser(req: Request, _res: Response, next: NextFunction) {
  // Siempre limpiar primero cualquier x-user-* que venga en la petición original —
  // si no, un cliente sin token (o con token inválido) podría mandar estos headers
  // directamente y hacerse pasar por cualquier usuario, ya que los microservicios
  // downstream confían en ellos sin volver a verificar la firma del JWT.
  delete req.headers['x-user-id']
  delete req.headers['x-user-role']
  delete req.headers['x-user-email']

  let token: string | undefined

  const authHeader = req.headers['authorization']
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  } else {
    token = parseCookieHeader(req)['racketly_token']
  }

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any
      req.headers['x-user-id'] = payload.userId || payload.id || ''
      req.headers['x-user-role'] = payload.role || 'player'
      req.headers['x-user-email'] = payload.email || ''
    } catch {
      // token inválido/expirado — los headers ya quedaron limpios arriba
    }
  }
  next()
}

app.use(attachUser)

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const checks = await Promise.allSettled(
    Object.entries(SERVICES).map(async ([name, url]) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2000)
      try {
        const r = await fetch(`${url}/health`, { signal: controller.signal as any })
        return { name, status: r.ok ? 'up' : 'degraded', code: r.status }
      } catch {
        return { name, status: 'down' }
      } finally {
        clearTimeout(timeout)
      }
    })
  )

  const services: Record<string, any> = {}
  checks.forEach((c) => {
    if (c.status === 'fulfilled') services[c.value.name] = c.value
  })

  const allUp = Object.values(services).every((s) => s.status === 'up')
  res.status(allUp ? 200 : 207).json({
    gateway: 'up',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services,
  })
})

// ─── Proxy factory ───────────────────────────────────────────────────────────
// IMPORTANT: mount at root '/' and use pathFilter so the full path is preserved.
// If mounted at '/api/auth', Express strips that prefix before the proxy sees it,
// causing downstream services to receive GET / instead of GET /api/auth/login.
function makeProxy(target: string, pathFilter: string | string[]): any {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter,
    on: {
      error: (err: any, _req: any, res: any) => {
        console.error(`[gateway] proxy error → ${target}: ${err.message}`)
        if (res && typeof res.headersSent !== 'undefined' && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: false,
              error: 'Servicio temporalmente no disponible. Intenta de nuevo.',
              service: target,
            })
          )
        }
      },
    },
  })
}

// ─── Route Table ─────────────────────────────────────────────────────────────
//
//  auth-service      :3001  — auth, users, profiles
//  booking-service   :3002  — clubs, courts, slots, bookings
//  tournament-service:3003  — tournaments, rankings, match-requests, matches
//  community-service :3004  — posts, groups, comments
//  academy-service   :3005  — courses, lessons, instructors
//  notification-svc  :3006  — notifications (internal, mostly event-driven)

app.use(makeProxy(SERVICES.auth, ['/api/auth', '/api/users', '/api/profiles', '/api/profile']))
app.use(
  makeProxy(SERVICES.booking, [
    '/api/clubs',
    '/api/courts',
    '/api/slots',
    '/api/bookings',
    '/api/memberships',
    '/api/credits',
    '/api/exchange-rates',
    '/api/professors',
    '/api/classes',
    '/api/guest-payments',
    '/api/webhooks',
  ])
)
app.use(
  makeProxy(SERVICES.tournament, [
    '/api/tournaments',
    '/api/tournament-events',
    '/api/rankings',
    '/api/matches',
    '/api/match-requests',
  ])
)
app.use(makeProxy(SERVICES.community, ['/api/posts', '/api/groups']))
app.use(makeProxy(SERVICES.academy, ['/api/courses', '/api/instructors', '/api/lessons']))
app.use(makeProxy(SERVICES.notification, ['/api/notifications']))

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Ruta no encontrada en el gateway.' })
})

// ─── Start HTTP server ────────────────────────────────────────────────────────
const server = http.createServer(app)

// ─── WebSocket proxy for Socket.IO (tournament live scoring on :3003) ─────────
// Socket.IO upgrade requests hit /socket.io — forward them to tournament-service
const wsProxy = createProxyMiddleware({
  target: SERVICES.tournament,
  changeOrigin: true,
  ws: true,
  on: {
    error: (err: any) => console.error('[gateway] ws proxy error:', err.message),
  },
})

// Register the WS proxy path on the HTTP server
app.use('/socket.io', wsProxy as any)
server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/socket.io')) {
    ;(wsProxy as any).upgrade(req, socket, head)
  }
})

server.listen(PORT, () => {
  console.log(`\n🚀 API Gateway running on http://localhost:${PORT}`)
  console.log('\n📡 Routing table:')
  console.log(`  /api/auth, /api/users, /api/profiles  →  ${SERVICES.auth}`)
  console.log(`  /api/clubs, /api/courts, /api/slots   →  ${SERVICES.booking}`)
  console.log(`  /api/bookings, /api/memberships        →  ${SERVICES.booking}`)
  console.log(`  /api/professors, /api/classes           →  ${SERVICES.booking}`)
  console.log(`  /api/tournaments, /api/rankings        →  ${SERVICES.tournament}`)
  console.log(`  /api/match-requests, /api/matches      →  ${SERVICES.tournament}`)
  console.log(`  /api/posts, /api/groups                →  ${SERVICES.community}`)
  console.log(`  /api/courses, /api/instructors         →  ${SERVICES.academy}`)
  console.log(`  /api/notifications                     →  ${SERVICES.notification}`)
  console.log(`  /socket.io  (ws)                       →  ${SERVICES.tournament}`)
  console.log('\n✅ Health: http://localhost:3000/health\n')
})

export default app
