import { NextRequest, NextResponse } from 'next/server'

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
  try {
    const body = await req.json()
    const res = await fetch(`${BOOKING}/api/exchange-rates`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 502 })
  }
}
