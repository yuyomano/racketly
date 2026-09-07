import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

const BOOKING = process.env.BOOKING_SERVICE_URL || 'http://localhost:3002'

export async function GET() {
  try {
    const res = await fetch(`${BOOKING}/api/exchange-rates`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 502 })
  }
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  try {
    const body = await req.json()
    // Vía gateway (no directo al servicio) — mismo patrón que /api/clubs. El gateway inyecta
    // x-user-id desde el JWT; booking-service exige eso para tocar exchange-rates.
    const res = await gatewayFetch('/api/exchange-rates', {
      method: 'PUT',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 502 })
  }
}
