import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const GW      = process.env.API_GATEWAY_URL      || 'http://localhost:3000'
const BOOKING = process.env.BOOKING_SERVICE_URL  || 'http://localhost:3002'

// Solo Secure en producción — en dev local (http://localhost) una cookie Secure no se
// guardaría en la mayoría de navegadores, rompiendo el login.
const SECURE_COOKIE = process.env.NODE_ENV === 'production'

// Setea las 3 cookies de sesión (access token de vida corta, refresh token httpOnly de
// vida larga, y un espejo no-httpOnly con datos básicos del usuario para el cliente).
// Centralizado acá porque los 4 endpoints que crean sesión (login, register, google,
// invite/accept) necesitan exactamente el mismo set de cookies.
export function setSessionCookies(
  response: NextResponse,
  data: { accessToken?: string; refreshToken?: string; user?: { id?: string; email?: string } }
) {
  if (data.accessToken) {
    response.cookies.set('racketly_token', data.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: SECURE_COOKIE,
      maxAge: 15 * 60, // 15 min — debe coincidir con la vida real del access token
      path: '/',
    })
  }
  if (data.refreshToken) {
    response.cookies.set('racketly_refresh', data.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: SECURE_COOKIE,
      maxAge: 60 * 60 * 24 * 30, // 30 días
      path: '/',
    })
  }
  response.cookies.set('racketly_user', JSON.stringify({
    id: data.user?.id,
    email: data.user?.email,
  }), {
    httpOnly: false,
    sameSite: 'lax',
    secure: SECURE_COOKIE,
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.delete('racketly_token')
  response.cookies.delete('racketly_refresh')
  response.cookies.delete('racketly_user')
}

// Fetch server-side hacia el gateway inyectando el token del usuario autenticado
export async function gatewayFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getSessionToken()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${GW}${path}`, { ...init, headers, cache: 'no-store' })
}

export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get('racketly_user')?.value
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('racketly_token')?.value ?? null
}

export async function getSessionRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('racketly_refresh')?.value ?? null
}

export async function getAdminClubs(userId: string): Promise<any[]> {
  try {
    const res = await gatewayFetch(`/api/clubs/admin/${userId}`)
    if (!res.ok) return []
    const json = await res.json()
    return json.data ?? []
  } catch {
    return []
  }
}

export async function getClubCourts(clubId: string): Promise<any[]> {
  try {
    const res = await fetch(`${BOOKING}/api/clubs/${clubId}`, { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json()
    return json.data?.courts ?? []
  } catch {
    return []
  }
}

export async function getClubBookings(clubId: string): Promise<any[]> {
  try {
    const res = await gatewayFetch(`/api/clubs/${clubId}/bookings?limit=100`)
    if (!res.ok) return []
    const json = await res.json()
    return json.data ?? []
  } catch {
    return []
  }
}
