import { NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

export async function PATCH() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
  try {
    const res = await gatewayFetch('/api/notifications/read-all', { method: 'PATCH' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudieron marcar las notificaciones' },
      { status: 502 }
    )
  }
}
