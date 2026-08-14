import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// PATCH /api/bookings/:bookingId/players — update players (admin)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params
    const body = await req.json()
    const res = await gatewayFetch(`/api/bookings/${bookingId}/players`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo actualizar los jugadores' }, { status: 502 })
  }
}
