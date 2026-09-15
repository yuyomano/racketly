import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// GET /api/users/search?q=&excludeId=
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') ?? ''
    const excludeId = searchParams.get('excludeId')
    const res = await gatewayFetch(
      `/api/users/search?q=${encodeURIComponent(q)}&limit=8${excludeId ? `&excludeId=${encodeURIComponent(excludeId)}` : ''}`
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, data: [] }, { status: 502 })
  }
}
