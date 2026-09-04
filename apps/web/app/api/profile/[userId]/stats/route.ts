import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// GET /api/profile/:userId/stats — perfil + categoría + estadísticas de partidos
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const res = await gatewayFetch(`/api/profile/${userId}/stats`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudieron cargar las estadísticas' },
      { status: 502 }
    )
  }
}
