import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// PATCH /api/bookings/:bookingId — cancel (admin)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params
    const body = await req.json().catch(() => ({}))
    const res = await gatewayFetch(`/api/bookings/${bookingId}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo cancelar la reserva' }, { status: 502 })
  }
}
