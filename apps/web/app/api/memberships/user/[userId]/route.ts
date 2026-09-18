import { NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

// GET /api/memberships/user/:userId — membresías del jugador logueado
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  try {
    const { userId } = await params
    const res = await gatewayFetch(`/api/memberships/user/${userId}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudieron cargar tus membresías' },
      { status: 502 }
    )
  }
}
