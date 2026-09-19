import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// POST /api/bookings/:bookingId/match/confirm — el rival confirma el marcador
export async function POST(_req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  try {
    const { bookingId } = await params
    const res = await gatewayFetch(`/api/bookings/${bookingId}/match/confirm`, { method: 'POST' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo confirmar el resultado' }, { status: 502 })
  }
}
