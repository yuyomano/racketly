import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookies } from '@/lib/auth-web'

const GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3000'

// POST /api/auth/register — alta de jugador nuevo
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const res = await fetch(`${GATEWAY}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || 'No se pudo crear la cuenta' },
        { status: res.status }
      )
    }

    const response = NextResponse.json({ success: true, user: data.data?.user })
    setSessionCookies(response, data.data)

    return response
  } catch {
    return NextResponse.json({ error: 'Error de conexión con el servidor' }, { status: 502 })
  }
}
