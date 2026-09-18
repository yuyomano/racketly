import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// PATCH /api/bookings/:bookingId/players/:playerId/pay — marca la parte del jugador como pagada
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bookingId: string; playerId: string }> }
) {
  try {
    const { bookingId, playerId } = await params
    const body = await req.json().catch(() => ({}))
    const res = await gatewayFetch(`/api/bookings/${bookingId}/players/${playerId}/pay`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudo registrar el pago' },
      { status: 502 }
    )
  }
}
