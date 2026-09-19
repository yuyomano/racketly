import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// GET /api/bookings/:bookingId/match — resultado del partido (si existe)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params
    const res = await gatewayFetch(`/api/bookings/${bookingId}/match`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo cargar el resultado' }, { status: 502 })
  }
}

// POST /api/bookings/:bookingId/match — registrar el marcador del partido
export async function POST(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  try {
    const { bookingId } = await params
    const body = await req.json()
    const res = await gatewayFetch(`/api/bookings/${bookingId}/match`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo registrar el resultado' }, { status: 502 })
  }
}
