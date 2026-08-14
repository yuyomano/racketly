import { NextRequest, NextResponse } from 'next/server'
import { gatewayFetch, getSessionUser } from '@/lib/auth-web'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const res = await gatewayFetch('/api/auth/me')
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await req.json()
  const res = await gatewayFetch('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
