import { NextResponse } from 'next/server'
import { getSessionRefreshToken, setSessionCookies, clearSessionCookies } from '@/lib/auth-web'

const GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3000'

// POST /api/auth/refresh — usa el refresh token httpOnly para renovar la sesión sin
// pedirle credenciales al usuario. Llamado por middleware.ts antes de que el access
// token expire (silent refresh), o por el cliente si recibe un 401.
export async function POST() {
  try {
    const refreshToken = await getSessionRefreshToken()
    if (!refreshToken) {
      return NextResponse.json({ error: 'No hay sesión activa' }, { status: 401 })
    }

    const res = await fetch(`${GATEWAY}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    const data = await res.json()

    if (!res.ok) {
      const response = NextResponse.json({ error: data.error || 'Sesión expirada' }, { status: res.status })
      clearSessionCookies(response)
      return response
    }

    const response = NextResponse.json({ success: true })
    setSessionCookies(response, data.data)
    return response
  } catch {
    return NextResponse.json({ error: 'Error de conexión con el servidor' }, { status: 502 })
  }
}
