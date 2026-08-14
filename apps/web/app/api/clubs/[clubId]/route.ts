import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

type Ctx = { params: Promise<{ clubId: string }> }

// GET /api/clubs/:clubId — detalle público del club (para la página de reserva)
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { clubId } = await params
  try {
    const res = await gatewayFetch(`/api/clubs/${clubId}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 502 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  const { clubId } = await params
  try {
    const body = await req.json()
    const res = await gatewayFetch(`/api/clubs/${clubId}/active`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 502 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  const { clubId } = await params
  try {
    const res = await gatewayFetch(`/api/clubs/${clubId}`, { method: 'DELETE' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 502 })
  }
}
