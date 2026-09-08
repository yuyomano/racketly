import Stripe from 'stripe'
import { PrismaClient } from '@prisma/client'

// Copia local del helper de pago de booking-service — cada microservicio tiene su propio
// PrismaClient/proceso, pero ambos apuntan a la misma base de datos (mismo prisma/schema.prisma
// en la raíz del monorepo), así que escribir aquí en Payment/TournamentParticipant es seguro
// y aparece en Caja sin que booking-service tenga que involucrarse.

const DEV_MODE = !process.env.STRIPE_SECRET_KEY
const prisma = new PrismaClient()

let _stripe: Stripe | null = null
function getStripe(): Stripe {
  if (DEV_MODE) throw new Error('STRIPE_NOT_CONFIGURED')
  if (!_stripe)
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-08-26.dahlia' })
  return _stripe
}

export const isStripeConfigured = !DEV_MODE

export interface CreatePaymentIntentParams {
  amount: number // en centavos
  currency: string
  participantId: string
  userId: string
  description: string
}

export async function createStripePaymentIntent(params: CreatePaymentIntentParams) {
  if (DEV_MODE) {
    console.log(
      `[payment] ⚠️  DEV MODE — simulando PaymentIntent para inscripción ${params.participantId}`
    )
    return {
      clientSecret: `dev_secret_${params.participantId}_${Date.now()}`,
      paymentIntentId: `dev_pi_${params.participantId}`,
      devMode: true,
    }
  }

  const intent = await getStripe().paymentIntents.create({
    amount: params.amount,
    currency: params.currency.toLowerCase(),
    metadata: { participantId: params.participantId, userId: params.userId },
    description: params.description,
    automatic_payment_methods: { enabled: true },
  })

  return { clientSecret: intent.client_secret!, paymentIntentId: intent.id, devMode: false }
}

export async function retrieveStripePaymentIntent(paymentIntentId: string) {
  if (DEV_MODE || paymentIntentId.startsWith('dev_pi_')) {
    return { id: paymentIntentId, status: 'succeeded' as const }
  }
  return getStripe().paymentIntents.retrieve(paymentIntentId)
}

// Registra un cobro real en el libro de caja (Payment), igual que booking-service —
// necesario para que la inscripción a torneo pagada aparezca en Caja del dashboard.
export async function recordPayment(opts: {
  clubId: string
  tournamentParticipantId?: string
  playerUserId?: string | null
  playerName?: string
  amount: number
  currency: string
  method: 'cash' | 'card'
}) {
  if (opts.amount <= 0) return
  await prisma.payment.create({
    data: {
      clubId: opts.clubId,
      tournamentParticipantId: opts.tournamentParticipantId,
      playerUserId: opts.playerUserId ?? undefined,
      playerName: opts.playerName,
      amount: opts.amount,
      currency: opts.currency,
      method: opts.method,
    },
  })
}
