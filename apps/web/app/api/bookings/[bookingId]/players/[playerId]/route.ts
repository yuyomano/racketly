import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// DELETE /api/bookings/:bookingId/players/:playerId — el jugador sale de la reserva
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string; playerId: string }> }
) {
  try {
    const { bookingId, playerId } = await params
    const res = await gatewayFetch(`/api/bookings/${bookingId}/players/${playerId}`, {
      method: 'DELETE',
      body: JSON.stringify({ issueCredit: true }),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudo salir de la reserva' },
      { status: 502 }
    )
  }
}
