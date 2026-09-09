import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'

const prisma = new PrismaClient({ adapter: createPgAdapter() })

// Registra un cobro real en el libro de caja (Payment), separado del bookkeeping propio
// de cada dominio (Booking.amountPaid, ClassBooking.amountPaid, etc). `paidAt` es SIEMPRE
// el momento del cobro — no la fecha de la reserva/clase que cubre — porque es lo que
// importa para el cuadre de caja diario.
export async function recordPayment(opts: {
  clubId: string
  bookingId?: string
  classBookingId?: string
  membershipId?: string
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
      bookingId: opts.bookingId,
      classBookingId: opts.classBookingId,
      membershipId: opts.membershipId,
      playerUserId: opts.playerUserId ?? undefined,
      playerName: opts.playerName,
      amount: opts.amount,
      currency: opts.currency,
      method: opts.method,
    },
  })
}

export function resolvePaymentMethod(input: unknown): 'cash' | 'card' {
  return input === 'cash' ? 'cash' : 'card'
}
// Para "Marcar pagado" manual desde el dashboard, sin método explícito se asume efectivo
// (es el caso típico: cobro presencial no capturado por Stripe).
export function resolvePaymentMethodDefaultCash(input: unknown): 'cash' | 'card' {
  return input === 'card' ? 'card' : 'cash'
}
