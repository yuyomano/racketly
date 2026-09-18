import { NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

// POST /api/bookings/:bookingId/players/:playerId/confirm-payment — confirma server-side (vía
// Stripe) que el pago se realizó de verdad antes de marcar al jugador como pagado
export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingId: string; playerId: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  try {
    const { bookingId, playerId } = await params
    const body = await req.json()
    const res = await gatewayFetch(
      `/api/bookings/${bookingId}/players/${playerId}/confirm-payment`,
      { method: 'POST', body: JSON.stringify(body) }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo confirmar el pago' }, { status: 502 })
  }
}
