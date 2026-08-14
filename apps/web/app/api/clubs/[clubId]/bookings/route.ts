import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params
    const res = await gatewayFetch(`/api/clubs/${clubId}/bookings?limit=100`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Servicio de reservas no disponible' },
      { status: 502 }
    )
  }
}
