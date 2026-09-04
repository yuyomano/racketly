import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// GET /api/posts/:id/comments
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const res = await gatewayFetch(`/api/posts/${id}/comments`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudieron cargar los comentarios' },
      { status: 502 }
    )
  }
}

// POST /api/posts/:id/comments
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const res = await gatewayFetch(`/api/posts/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo comentar' }, { status: 502 })
  }
}
