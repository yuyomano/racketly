import { NextRequest, NextResponse } from 'next/server'

const GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3000'

// POST /api/auth/forgot-password
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const res = await fetch(`${GATEWAY}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'No se pudo procesar la solicitud' }, { status: res.status })
    }

    return NextResponse.json({ success: true, message: data.message })
  } catch {
    return NextResponse.json({ error: 'Error de conexión con el servidor' }, { status: 502 })
  }
}
