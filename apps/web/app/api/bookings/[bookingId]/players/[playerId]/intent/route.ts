import { NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

// POST /api/bookings/:bookingId/players/:playerId/intent — crea el PaymentIntent para pagar
// la parte de un jugador (propia u otra) de una reserva de la que el usuario forma parte
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string; playerId: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  try {
    const { bookingId, playerId } = await params
    const res = await gatewayFetch(`/api/bookings/${bookingId}/players/${playerId}/intent`, {
      method: 'POST',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo iniciar el pago' }, { status: 502 })
  }
}
