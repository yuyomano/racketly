import { NextRequest, NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const res = await gatewayFetch(`/api/tournaments/participants/user/${userId}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Servicio de torneos no disponible' },
      { status: 502 }
    )
  }
}
