import { describe, it, expect, beforeEach, vi } from 'vitest'

// STRIPE_SECRET_KEY no está configurado en el entorno de test → DEV_MODE,
// el mismo camino que corre en local sin credenciales de Stripe reales.
describe('payment.service (DEV_MODE, sin STRIPE_SECRET_KEY)', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.STRIPE_SECRET_KEY
  })

  it(
    'createStripePaymentIntent devuelve un clientSecret simulado sin llamar a Stripe',
    async () => {
      const { createStripePaymentIntent } = await import('./payment.service')
      const result = await createStripePaymentIntent({
        amount: 5000,
        currency: 'DOP',
        bookingId: 'booking-1',
        userId: 'user-1',
        description: 'test',
      })
      expect(result.devMode).toBe(true)
      expect(result.clientSecret).toContain('booking-1')
      expect(result.paymentIntentId).toBe('dev_pi_booking-1')
    },
    // ponytail: el require('stripe') en frío tarda varios segundos con el SDK v22
    // (mucho más grande que v16); vi.resetModules() fuerza recargarlo aquí.
    15000
  )

  it('refundStripePayment simula el reembolso en dev mode', async () => {
    const { refundStripePayment } = await import('./payment.service')
    const result = await refundStripePayment('dev_pi_booking-1')
    expect(result.status).toBe('succeeded')
  })

  it('constructStripeEvent lanza si Stripe no está configurado (no se puede verificar un webhook sin secret real)', async () => {
    const { constructStripeEvent } = await import('./payment.service')
    await expect(constructStripeEvent(Buffer.from('{}'), 'sig')).rejects.toThrow(
      'Stripe no configurado'
    )
  })

  it('isStripeConfigured es false sin STRIPE_SECRET_KEY', async () => {
    const { isStripeConfigured } = await import('./payment.service')
    expect(isStripeConfigured).toBe(false)
  })
})
