import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const clubId = searchParams.get('clubId')
    const slotId = searchParams.get('slotId')
    const res = await gatewayFetch(`/api/memberships/pricing?userId=${userId}&clubId=${clubId}&slotId=${slotId}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo verificar membresía' }, { status: 502 })
  }
}
