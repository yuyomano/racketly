import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookies } from '@/lib/auth-web'

const GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3000'

// POST /api/auth/invite/:token/accept — define contraseña, activa la cuenta y crea la sesión
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const { password } = await req.json()

    const res = await fetch(`${GATEWAY}/api/auth/invite/${token}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'No se pudo aceptar la invitación' }, { status: res.status })
    }

    const response = NextResponse.json({ success: true, user: data.data?.user })
    setSessionCookies(response, data.data)

    return response
  } catch {
    return NextResponse.json({ error: 'Error de conexión con el servidor' }, { status: 502 })
  }
}
