import { NextRequest, NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

export async function GET(req: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params
    const period = req.nextUrl.searchParams.get('period') ?? '7'
    const res = await gatewayFetch(`/api/clubs/${clubId}/stats?period=${period}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Servicio de estadísticas no disponible' },
      { status: 502 }
    )
  }
}
