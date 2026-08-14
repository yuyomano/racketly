import { NextRequest, NextResponse } from 'next/server'

const BOOKING = process.env.BOOKING_SERVICE_URL || 'http://localhost:3002'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const res = await fetch(`${BOOKING}/api/exchange-rates/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 502 })
  }
}
