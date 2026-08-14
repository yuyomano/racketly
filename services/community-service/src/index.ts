import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import { postsRouter } from './routes/posts.routes'
import { groupsRouter } from './routes/groups.routes'
import { gearRouter } from './routes/gear.routes'
import { gamificationRouter } from './routes/gamification.routes'

const app = express()
const PORT = process.env.PORT || 3004

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(','), credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

app.get('/health', (_req, res) => res.json({ success: true, service: 'community-service', status: 'ok' }))

app.use('/api/posts', postsRouter)
app.use('/api/groups', groupsRouter)
app.use('/api/gear', gearRouter)
app.use('/api/gamification', gamificationRouter)

app.listen(PORT, () => console.info(`👥 Community Service running on port ${PORT}`))
