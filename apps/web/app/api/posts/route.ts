import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// GET /api/posts — feed de la comunidad
export async function GET(req: Request) {
  try {
    const { search } = new URL(req.url)
    const res = await gatewayFetch(`/api/posts${search}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo cargar el feed' }, { status: 502 })
  }
}

// POST /api/posts — crear post
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const res = await gatewayFetch('/api/posts', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo publicar' }, { status: 502 })
  }
}
