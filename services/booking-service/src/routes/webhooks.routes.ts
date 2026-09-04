import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import QRCode from 'qrcode'
import { constructStripeEvent } from '../services/payment.service'

const router = Router()
const prisma = new PrismaClient()

// POST /api/webhooks/stripe — red de seguridad de integridad de pagos: confirma la
// reserva aunque el cliente nunca haya llamado a /bookings/:id/confirm (app cerrada,
// error de red a mitad de pago, cliente malicioso que nunca confirma) y deja registro
// de pagos fallidos. Requiere el body SIN parsear para verificar la firma — se monta
// con express.raw() antes del express.json() global (ver index.ts).
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string | undefined
  if (!sig) return res.status(400).json({ success: false, error: 'Falta stripe-signature' })

  let event: Awaited<ReturnType<typeof constructStripeEvent>>
  try {
    event = await constructStripeEvent(req.body as Buffer, sig)
  } catch (err) {
    console.error('[stripe-webhook] Firma inválida:', err)
    return res.status(400).json({ success: false, error: 'Firma de webhook inválida' })
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as { id: string; metadata?: Record<string, string> }
      const bookingId = intent.metadata?.bookingId
      if (bookingId) {
        const booking = await prisma.booking.findUnique({
          where: { id: bookingId },
          include: { slot: true },
        })
        // Idempotente: si /confirm ya la marcó (el camino normal), no hay nada que hacer.
        if (booking && booking.status === 'pending') {
          const qrPayload = JSON.stringify({
            bookingId: booking.id,
            exp: Date.now() + 30 * 60 * 1000,
          })
          const qrCode = await QRCode.toDataURL(qrPayload)
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              status: 'confirmed',
              paymentStatus: 'paid',
              paymentId: intent.id,
              qrCode,
              qrExpiresAt: booking.slot
                ? new Date(`${booking.slot.date}T${booking.slot.endTime}:00`).toISOString()
                : undefined,
            },
          })
          console.info(
            `[stripe-webhook] Booking ${booking.id} confirmado vía webhook (el cliente nunca llamó a /confirm)`
          )
        }
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as { id: string; metadata?: Record<string, string> }
      console.warn(
        `[stripe-webhook] Pago fallido: PaymentIntent ${intent.id} (bookingId: ${intent.metadata?.bookingId ?? 'desconocido'})`
      )
    }

    return res.json({ received: true })
  } catch (err) {
    console.error('[stripe-webhook] Error procesando evento:', err)
    return res.status(500).json({ success: false, error: 'Error procesando el webhook' })
  }
})

export { router as webhooksRouter }
