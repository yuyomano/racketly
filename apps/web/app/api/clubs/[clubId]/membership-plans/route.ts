import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// GET /api/clubs/:clubId/membership-plans — planes de membresía activos del club (para que el jugador se suscriba)
export async function GET(_req: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params
    const res = await gatewayFetch(`/api/clubs/${clubId}/membership-plans`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudieron cargar los planes de membresía' },
      { status: 502 }
    )
  }
}
