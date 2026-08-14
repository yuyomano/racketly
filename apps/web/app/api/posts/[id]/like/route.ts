import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// POST /api/posts/:id/like
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const res = await gatewayFetch(`/api/posts/${id}/like`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo procesar el like' }, { status: 502 })
  }
}
