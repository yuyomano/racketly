import 'dotenv/config'
import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { Server as SocketServer } from 'socket.io'

import { tournamentsRouter } from './routes/tournaments.routes'
import { tournamentEventsRouter } from './routes/tournament-events.routes'
import { matchesRouter } from './routes/matches.routes'
import { rankingsRouter } from './routes/rankings.routes'
import { partnerRouter } from './routes/partner.routes'
import { errorHandler } from './middleware/error.middleware'
import { setupLiveScoring } from './sockets/liveScoring'

const app = express()
const server = http.createServer(app)
const PORT = process.env.PORT || 3003

// Socket.IO para live scoring
export const io = new SocketServer(server, {
  cors: { origin: process.env.ALLOWED_ORIGINS?.split(','), credentials: true },
})

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(','), credentials: true }))
app.use(express.json({ limit: '10kb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'tournament-service', status: 'ok' })
})

app.use('/api/tournaments', tournamentsRouter)
app.use('/api/tournament-events', tournamentEventsRouter)
app.use('/api/matches', matchesRouter)
app.use('/api/rankings', rankingsRouter)
app.use('/api/match-requests', partnerRouter)
app.use(errorHandler)

// Configurar namespaces de Socket.IO
setupLiveScoring(io)

server.listen(PORT, () => {
  console.info(`🏆 Tournament Service running on port ${PORT} (with WebSocket)`)
})

export default app
