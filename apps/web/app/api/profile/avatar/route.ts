import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, getSessionToken } from '@/lib/auth-web'

const GW = process.env.API_GATEWAY_URL || 'http://localhost:3000'

// POST /api/profile/avatar — sube foto de perfil (multipart, no puede usar gatewayFetch
// porque ese helper fuerza Content-Type: application/json)
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  try {
    const formData = await req.formData()
    const token = await getSessionToken()
    const res = await fetch(`${GW}/api/profile/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo subir la imagen' }, { status: 502 })
  }
}
