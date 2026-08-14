import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// POST /api/bookings — admin crea reserva
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const res = await gatewayFetch('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo crear la reserva' }, { status: 502 })
  }
}
