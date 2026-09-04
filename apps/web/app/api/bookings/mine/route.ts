import { NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

// GET /api/bookings/mine — reservas del jugador logueado (propias + donde juega como compañero)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  try {
    const res = await gatewayFetch(`/api/bookings/user/${user.id}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudieron cargar tus reservas' },
      { status: 502 }
    )
  }
}
