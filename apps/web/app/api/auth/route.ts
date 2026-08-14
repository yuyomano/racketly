import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookies, clearSessionCookies, getSessionRefreshToken } from '@/lib/auth-web'

const GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3000'

// POST /api/auth — login
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    const res = await fetch(`${GATEWAY}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || 'Credenciales incorrectas' },
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

// DELETE /api/auth — logout
export async function DELETE() {
  // Revoca el refresh token del lado del servidor — sin esto, "cerrar sesión" solo
  // borraba las cookies del navegador pero el token seguía siendo válido hasta expirar.
  const refreshToken = await getSessionRefreshToken()
  if (refreshToken) {
    try {
      await fetch(`${GATEWAY}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
    } catch { /* best-effort */ }
  }

  const response = NextResponse.json({ success: true })
  clearSessionCookies(response)
  return response
}
