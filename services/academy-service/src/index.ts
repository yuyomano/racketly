import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import Mux from '@mux/mux-node'

import { coursesRouter } from './routes/courses.routes'
import { instructorsRouter } from './routes/instructors.routes'

// Mux es opcional en dev — se necesita solo para upload de videos
export const mux =
  process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET
    ? new Mux({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET })
    : null

if (!mux) console.warn('⚠️  MUX_TOKEN_ID no configurado — upload de videos deshabilitado')

const app = express()
const PORT = process.env.PORT || 3005

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(','), credentials: true }))
app.use(express.json({ limit: '10kb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

app.get('/health', (_req, res) =>
  res.json({ success: true, service: 'academy-service', status: 'ok' })
)

app.use('/api/courses', coursesRouter)
app.use('/api/instructors', instructorsRouter)

app.listen(PORT, () => console.info(`🎓 Academy Service running on port ${PORT}`))
