import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

// POST /api/memberships/subscribe — suscribir al jugador logueado a un plan de membresía
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  try {
    const { planId } = await req.json()
    // El gateway inyecta x-user-id desde el JWT; el servicio usa ese id, no uno del body.
    const res = await gatewayFetch('/api/memberships/subscribe', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 502 })
  }
}
