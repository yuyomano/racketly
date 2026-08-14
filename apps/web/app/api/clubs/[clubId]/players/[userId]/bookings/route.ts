import { NextRequest, NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clubId: string; userId: string }> }
) {
  try {
    const { clubId, userId } = await params
    const res = await gatewayFetch(`/api/clubs/${clubId}/players/${userId}/bookings`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Servicio de reservas no disponible' },
      { status: 502 }
    )
  }
}
