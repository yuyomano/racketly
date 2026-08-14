import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cron from 'node-cron'

import { clubsRouter } from './routes/clubs.routes'
import { courtsRouter } from './routes/courts.routes'
import { bookingsRouter } from './routes/bookings.routes'
import { slotsRouter } from './routes/slots.routes'
import { membershipsRouter } from './routes/memberships.routes'
import { creditsRouter } from './routes/credits.routes'
import { professorsRouter } from './routes/professors.routes'
import { classesRouter } from './routes/classes.routes'
import { guestPaymentsRouter } from './routes/guest-payments.routes'
import { webhooksRouter } from './routes/webhooks.routes'
import exchangeRatesRouter from './routes/exchange-rates.routes'
import { errorHandler } from './middleware/error.middleware'
import { releaseExpiredSlots, runScheduledSlotGeneration } from './services/slot.service'
import { completeExpiredBookings } from './services/booking-completion.service'
import { autoConfirmPendingMatches } from './services/match-elo.service'
import { cancelIncompleteRosterBookings } from './services/roster-completion.service'
import { expireCancelledMemberships } from './services/membership-lifecycle.service'
import { warnPendingPaymentBookings, warnIncompleteRosterBookings } from './services/pre-cancellation-warning.service'

const app = express()
const PORT = process.env.PORT || 3002

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(','), credentials: true }))

// El webhook de Stripe necesita el body SIN parsear para verificar la firma HMAC —
// tiene que montarse ANTES de express.json() global, que ya habría consumido/reescrito
// el stream y roto la verificación.
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhooksRouter)

app.use(express.json({ limit: '10kb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'booking-service', status: 'ok' })
})

app.use('/api/clubs', clubsRouter)
app.use('/api/courts', courtsRouter)
app.use('/api/slots', slotsRouter)
app.use('/api/bookings', bookingsRouter)
app.use('/api/memberships', membershipsRouter)
app.use('/api/credits', creditsRouter)
app.use('/api/professors', professorsRouter)
app.use('/api/classes', classesRouter)
app.use('/api/guest-payments', guestPaymentsRouter)
// memberships también expone rutas bajo /api/clubs/:id/membership-plans
app.use('/api/clubs', membershipsRouter)
app.use('/api/exchange-rates', exchangeRatesRouter)
app.use(errorHandler)

// Cron: liberar slots con pago pendiente cada 5 min
cron.schedule('*/5 * * * *', async () => {
  await releaseExpiredSlots()
})

// Cron: avisar a jugadores con pago pendiente antes de que se libere el slot, cada 5 min
cron.schedule('*/5 * * * *', async () => {
  await warnPendingPaymentBookings()
})

// Cron: cada hora en punto, revisa qué clubs tienen esa hora configurada como su
// `slotGenerationHour` (default 6am, editable por club) y genera los slots que
// falten dentro de su horizonte de reservas.
cron.schedule('0 * * * *', async () => {
  await runScheduledSlotGeneration()
})

// Cron: completar reservas confirmadas cuyo horario ya pasó, cada 15 min
cron.schedule('*/15 * * * *', async () => {
  await completeExpiredBookings()
})

// Cron: aceptar tácitamente (y aplicar ELO a) resultados de partido que nadie objetó, cada 30 min
cron.schedule('*/30 * * * *', async () => {
  await autoConfirmPendingMatches()
})

// Cron: cancelar reservas confirmadas que sigan con cupo incompleto a 24h del partido,
// devolviendo crédito a quien ya pagó. Cada 30 min.
cron.schedule('*/30 * * * *', async () => {
  await cancelIncompleteRosterBookings()
})

// Cron: avisar a jugadores con roster incompleto antes de la cancelación automática, cada 30 min
cron.schedule('*/30 * * * *', async () => {
  await warnIncompleteRosterBookings()
})

// Cron: pasar a 'cancelled' las membresías cuyo período ya pagado terminó (el socio
// pidió cancelar pero mantuvo el beneficio hasta nextBillingDate). Cada hora.
cron.schedule('0 * * * *', async () => {
  await expireCancelledMemberships()
})

app.listen(PORT, () => {
  console.info(`📅 Booking Service running on port ${PORT}`)
})

export default app
