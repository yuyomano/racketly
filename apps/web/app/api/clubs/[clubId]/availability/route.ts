import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

export async function GET(req: Request, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]
    const res = await gatewayFetch(`/api/clubs/${clubId}/availability?date=${date}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, data: [] }, { status: 502 })
  }
}
