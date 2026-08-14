import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

const BOOKING = process.env.BOOKING_SERVICE_URL || 'http://localhost:3002'

// GET /api/clubs — buscar/listar clubes (para que el jugador elija dónde reservar)
export async function GET(req: NextRequest) {
  try {
    const { search } = new URL(req.url)
    const res = await gatewayFetch(`/api/clubs${search}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo cargar la lista de clubes' }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  try {
    const body = await req.json()
    const res = await fetch(`${BOOKING}/api/clubs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, ownerId: user.id }),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 502 })
  }
}
