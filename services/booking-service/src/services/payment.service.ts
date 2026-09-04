import Stripe from 'stripe'

// ─── Lazy Stripe instance ────────────────────────────────────────────────────
// Stripe se inicializa solo si la key está configurada.
// En modo DEV sin key, los pagos se auto-confirman (útil para pruebas locales).

const DEV_MODE = !process.env.STRIPE_SECRET_KEY

let _stripe: Stripe | null = null

function getStripe(): Stripe {
  if (DEV_MODE) throw new Error('STRIPE_NOT_CONFIGURED')
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
  }
  return _stripe
}

export const isStripeConfigured = !DEV_MODE

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreatePaymentIntentParams {
  amount: number // en centavos
  currency: string
  bookingId: string
  userId: string
  description: string
}

// ─── Payment Intent ──────────────────────────────────────────────────────────

export async function createStripePaymentIntent(params: CreatePaymentIntentParams) {
  // Modo DEV sin Stripe configurado → devuelve un "clientSecret" falso
  // El BookingScreen detectará DEV_MODE y auto-confirmará sin pago real
  if (DEV_MODE) {
    console.log(`[payment] ⚠️  DEV MODE — simulando PaymentIntent para booking ${params.bookingId}`)
    return {
      clientSecret: `dev_secret_${params.bookingId}_${Date.now()}`,
      paymentIntentId: `dev_pi_${params.bookingId}`,
      devMode: true,
    }
  }

  const intent = await getStripe().paymentIntents.create({
    amount: params.amount,
    currency: params.currency.toLowerCase(),
    metadata: {
      bookingId: params.bookingId,
      userId: params.userId,
    },
    description: params.description,
    automatic_payment_methods: { enabled: true },
  })

  return {
    clientSecret: intent.client_secret!,
    paymentIntentId: intent.id,
    devMode: false,
  }
}

// ─── Retrieve (usado para verificar server-side el estado real de un PaymentIntent
// antes de marcar algo como pagado, p.ej. al confirmar el link de pago de un invitado) ──

export async function retrieveStripePaymentIntent(paymentIntentId: string) {
  if (DEV_MODE || paymentIntentId.startsWith('dev_pi_')) {
    return {
      id: paymentIntentId,
      status: 'succeeded' as const,
      amount: undefined as number | undefined,
      currency: undefined as string | undefined,
    }
  }
  return getStripe().paymentIntents.retrieve(paymentIntentId)
}

// ─── Refund ──────────────────────────────────────────────────────────────────

export async function refundStripePayment(paymentIntentId: string, amount?: number) {
  // Modo DEV → sin reembolso real
  if (DEV_MODE || paymentIntentId.startsWith('dev_pi_')) {
    console.log(`[payment] ⚠️  DEV MODE — simulando reembolso de ${paymentIntentId}`)
    return { id: `dev_refund_${Date.now()}`, status: 'succeeded' }
  }

  return getStripe().refunds.create({
    payment_intent: paymentIntentId,
    amount,
  })
}

// ─── Webhook verification ────────────────────────────────────────────────────

export async function constructStripeEvent(payload: Buffer, sig: string) {
  if (DEV_MODE) throw new Error('Stripe no configurado')
  return getStripe().webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET!)
}
