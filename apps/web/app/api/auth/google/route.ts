import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookies } from '@/lib/auth-web'

const GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3000'

// POST /api/auth/google — recibe el accessToken de Google desde el cliente
export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json()
    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken requerido' }, { status: 400 })
    }

    const res = await fetch(`${GATEWAY}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || 'Error al autenticar con Google' },
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
