import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const { searchParams } = new URL(req.url)
    const clubId = searchParams.get('clubId')
    const res = await gatewayFetch(`/api/credits/user/${userId}?clubId=${clubId}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo verificar crédito' }, { status: 502 })
  }
}
