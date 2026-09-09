import { NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

type Ctx = { params: Promise<{ clubId: string }> }

// POST/DELETE /api/clubs/:clubId/favorite — marcar/quitar un club de favoritos del jugador
// logueado. El gateway inyecta x-user-id desde el JWT (booking-service lo usa como fallback
// si no viene userId en el body), así que no hace falta mandar el id del usuario a mano.

export async function POST(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  const { clubId } = await params
  try {
    const res = await gatewayFetch(`/api/clubs/${clubId}/favorite`, { method: 'POST' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 502 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  const { clubId } = await params
  try {
    const res = await gatewayFetch(`/api/clubs/${clubId}/favorite`, { method: 'DELETE' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 502 })
  }
}
