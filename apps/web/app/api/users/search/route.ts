import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// GET /api/users/search?q=&excludeId=&clubId=&filter=club|withMe|city|all
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') ?? ''
    const excludeId = searchParams.get('excludeId')
    const clubId = searchParams.get('clubId')
    const filter = searchParams.get('filter')
    const params = new URLSearchParams({ q, limit: '8' })
    if (excludeId) params.set('excludeId', excludeId)
    if (clubId) params.set('clubId', clubId)
    if (filter) params.set('filter', filter)
    const res = await gatewayFetch(`/api/users/search?${params.toString()}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, data: [] }, { status: 502 })
  }
}
