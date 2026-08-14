import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { AppError } from '../middleware/error.middleware'
import { createStripePaymentIntent, retrieveStripePaymentIntent, isStripeConfigured } from '../services/payment.service'
import { recordPayment } from './bookings.routes'

// Rutas públicas (sin autenticación) para que un jugador invitado pague su parte de una
// reserva desde un link, sin necesitar cuenta. El token del link ES la credencial —
// se valida contra GuestPaymentLink, no contra ningún x-user-id.
const router = Router()
const prisma = new PrismaClient()

async function loadLink(token: string) {
  const link = await prisma.guestPaymentLink.findUnique({
    where: { token },
    include: { booking: { include: { slot: { include: { court: { include: { club: true } } } } } } },
  })
  if (!link) throw new AppError('Link de pago no encontrado', 404)
  return link
}

// GET /api/guest-payments/:token — detalle para renderizar la página pública de pago
router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const link = await loadLink(req.params.token)
    const expired = link.status === 'pending' && link.expiresAt < new Date()

    return res.json({
      success: true,
      data: {
        status: expired ? 'expired' : link.status,
        playerName: link.playerName,
        amount: link.amount,
        currency: link.currency,
        club: link.booking.slot.court.club.name,
        court: link.booking.slot.court.name,
        date: link.booking.slot.date,
        startTime: link.booking.slot.startTime,
        endTime: link.booking.slot.endTime,
        stripeConfigured: isStripeConfigured,
      },
    })
  } catch (err) {
    return next(err)
  }
})

// POST /api/guest-payments/:token/intent — crea (o reutiliza) el PaymentIntent de Stripe
router.post('/:token/intent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const link = await loadLink(req.params.token)
    if (link.status !== 'pending') throw new AppError('Este link ya fue usado o ya no está vigente', 400)
    if (link.expiresAt < new Date()) throw new AppError('Este link de pago expiró', 400)

    const paymentData = await createStripePaymentIntent({
      amount: Math.round(link.amount * 100),
      currency: link.currency,
      bookingId: link.bookingId,
      userId: `guest:${link.playerGuestId}`,
      description: `Reserva ${link.booking.slot.court.name} - ${link.booking.slot.date} ${link.booking.slot.startTime} (invitado: ${link.playerName})`,
    })

    await prisma.guestPaymentLink.update({
      where: { id: link.id },
      data: { paymentIntentId: paymentData.paymentIntentId },
    })

    return res.json({
      success: true,
      data: { clientSecret: paymentData.clientSecret, paymentIntentId: paymentData.paymentIntentId, devMode: !!paymentData.devMode },
    })
  } catch (err) {
    return next(err)
  }
})

// POST /api/guest-payments/:token/confirm — el cliente llama esto tras confirmar el pago con
// Stripe.js. Verificamos server-side el estado real del PaymentIntent antes de dar por pagado
// (nunca confiamos en que el cliente diga "ya pagué").
router.post('/:token/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const link = await loadLink(req.params.token)
    if (link.status === 'paid') {
      return res.json({ success: true, data: { alreadyPaid: true } })
    }
    if (link.status !== 'pending') throw new AppError('Este link ya no está vigente', 400)

    const paymentIntentId = req.body.paymentIntentId || link.paymentIntentId
    if (!paymentIntentId) throw new AppError('No hay un pago iniciado para este link', 400)

    const intent = await retrieveStripePaymentIntent(paymentIntentId)
    if (intent.status !== 'succeeded') {
      throw new AppError('El pago aún no se completó', 400)
    }

    const players = (link.booking.players as any[]) || []
    const idx = players.findIndex((p: any) => p.guestId === link.playerGuestId)
    if (idx === -1) throw new AppError('El jugador ya no está en esta reserva', 404)

    const paidAt = new Date().toISOString()
    players[idx] = { ...players[idx], amountPaid: link.amount, paymentStatus: 'paid', paymentMethod: 'card', paidAt }

    const newAmountPaid = players.reduce((sum: number, p: any) => sum + (p.amountPaid ?? 0), 0)
    const allSettled = players.every((p: any) => p.paymentStatus === 'paid' || p.paymentStatus === 'courtesy')

    await prisma.$transaction([
      prisma.booking.update({
        where: { id: link.bookingId },
        data: { players, amountPaid: newAmountPaid, paymentStatus: allSettled ? 'paid' : link.booking.paymentStatus },
      }),
      prisma.guestPaymentLink.update({
        where: { id: link.id },
        data: { status: 'paid', paidAt: new Date(), paymentIntentId },
      }),
    ])

    await recordPayment({
      clubId: link.booking.slot.court.clubId,
      bookingId: link.bookingId,
      playerUserId: null,
      playerName: link.playerName,
      amount: link.amount,
      currency: link.currency,
      method: 'card',
    })

    return res.json({ success: true, data: { paid: true } })
  } catch (err) {
    return next(err)
  }
})

export { router as guestPaymentsRouter }
