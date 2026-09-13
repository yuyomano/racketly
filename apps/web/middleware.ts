import { NextRequest, NextResponse } from 'next/server'

const GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3000'
const SECURE_COOKIE = process.env.NODE_ENV === 'production'
const REFRESH_BUFFER_MS = 2 * 60 * 1000 // refresca si al access token le quedan <2 min

// Decodifica (SIN verificar firma) el claim `exp` de un JWT — solo para decidir si
// vale la pena refrescar proactivamente. La verificación criptográfica real la hacen
// los servicios backend en cada request; esto es puramente una optimización de UX.
function decodeExpiryMs(token: string): number | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = JSON.parse(atob(padded))
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

// El refresh token se rota (single-use) en el backend, así que si varios requests en
// paralelo ven el access token por vencer, todos menos el primero fallarían el refresh
// (token ya rotado) y seguirían con el access token viejo/vencido → 401 espurio. Pasa
// también entre requests casi-simultáneos pero no exactamente concurrentes: el segundo
// puede salir del browser con la cookie vieja antes de que el Set-Cookie del primero
// se aplique, y llega al backend cuando el token ya fue rotado por el primero.
// Se deduplica con una cache en memoria del proceso, por userId (no por el valor exacto
// del refreshToken, para cubrir ambos casos): mientras hay un refresh en curso para ese
// usuario, todos comparten la misma promesa; y por un rato corto después de completarse,
// cualquiera que llegue con una cookie vieja recibe el par ya emitido en vez de reintentar
// contra un refresh token que el backend ya marcó como usado.
// ponytail: cache por proceso, no por-cluster — con múltiples réplicas del server el fix
// completo sería este mismo grace period pero compartido (Redis) en vez de en memoria.
const REFRESH_GRACE_MS = 10 * 1000
type RefreshResult = { accessToken: string; refreshToken: string }
const inFlightRefresh = new Map<string, Promise<RefreshResult | null>>()
const recentRefresh = new Map<string, { result: RefreshResult | null; expiresAt: number }>()

// Decodifica (sin verificar firma) el `userId` del refresh token — solo se usa como
// clave de cache; la verificación real ocurre en el backend en cada rotación.
function decodeRefreshUserId(token: string): string | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = JSON.parse(atob(padded))
    return typeof json.userId === 'string' ? json.userId : null
  } catch {
    return null
  }
}

async function tryRefresh(refreshToken: string): Promise<RefreshResult | null> {
  const cacheKey = decodeRefreshUserId(refreshToken) ?? refreshToken

  const recent = recentRefresh.get(cacheKey)
  if (recent && recent.expiresAt > Date.now()) return recent.result

  const cached = inFlightRefresh.get(cacheKey)
  if (cached) return cached

  const promise = (async () => {
    try {
      const res = await fetch(`${GATEWAY}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) return null
      const data = await res.json()
      if (!data?.data?.accessToken || !data?.data?.refreshToken) return null
      return { accessToken: data.data.accessToken, refreshToken: data.data.refreshToken }
    } catch {
      return null
    }
  })()

  inFlightRefresh.set(cacheKey, promise)
  try {
    const result = await promise
    recentRefresh.set(cacheKey, { result, expiresAt: Date.now() + REFRESH_GRACE_MS })
    setTimeout(() => recentRefresh.delete(cacheKey), REFRESH_GRACE_MS)
    return result
  } finally {
    inFlightRefresh.delete(cacheKey)
  }
}

function applySessionCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string }
) {
  response.cookies.set('racketly_token', tokens.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE_COOKIE,
    maxAge: 15 * 60,
    path: '/',
  })
  response.cookies.set('racketly_refresh', tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE_COOKIE,
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
}

export async function middleware(req: NextRequest) {
  let token = req.cookies.get('racketly_token')?.value
  const refreshCookie = req.cookies.get('racketly_refresh')?.value
  const { pathname } = req.nextUrl

  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/community')
  let refreshed: { accessToken: string; refreshToken: string } | null = null

  // Silent refresh: si falta el access token o está por vencer, pero hay refresh
  // token, renovar antes de decidir cualquier cosa (redirect, proxy, etc.) — así el
  // usuario nunca ve un logout solo porque el access token (vida corta, 15 min) venció.
  if (refreshCookie && (isProtected || pathname.startsWith('/api/'))) {
    const exp = token ? decodeExpiryMs(token) : null
    const needsRefresh = !token || (exp !== null && exp - Date.now() < REFRESH_BUFFER_MS)
    if (needsRefresh) {
      const result = await tryRefresh(refreshCookie)
      if (result) {
        token = result.accessToken
        refreshed = result
      }
    }
  }

  // ── Proteger /dashboard y /community — redirigir a /login si no hay sesión ──
  if (isProtected && !token) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    const response = NextResponse.redirect(url)
    // El refresh token que teníamos ya no sirve (si existía y falló arriba) — limpiar
    // para no reintentar el refresh en cada request subsiguiente a /login.
    if (refreshCookie && !refreshed) {
      response.cookies.delete('racketly_token')
      response.cookies.delete('racketly_refresh')
      response.cookies.delete('racketly_user')
    }
    return response
  }

  // ── Redirigir /login → /dashboard si ya hay sesión ────────────────────────
  const userCookie = req.cookies.get('racketly_user')?.value
  if (pathname === '/login' && token && userCookie) {
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    const response = NextResponse.redirect(url)
    if (refreshed) applySessionCookies(response, refreshed)
    return response
  }

  // ── Inyectar Authorization en peticiones API del browser ──────────────────
  // Las páginas del dashboard llaman a /api/* relativo (same-origin).
  // Next.js reescribe a los servicios. Aquí inyectamos el token httpOnly como
  // header para que el gateway pueda identificar al usuario.
  if (pathname.startsWith('/api/') && token) {
    const headers = new Headers(req.headers)
    headers.set('authorization', `Bearer ${token}`)
    const response = NextResponse.next({ request: { headers } })
    if (refreshed) applySessionCookies(response, refreshed)
    return response
  }

  const response = NextResponse.next()
  if (refreshed) applySessionCookies(response, refreshed)
  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/community/:path*', '/login', '/api/:path*'],
}
