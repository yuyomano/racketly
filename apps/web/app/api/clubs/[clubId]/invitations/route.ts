import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

type Ctx = { params: Promise<{ clubId: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
  const { clubId } = await params
  const res = await gatewayFetch(`/api/clubs/${clubId}/invitations`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
  const { clubId } = await params
  const body = await req.json()
  const res = await gatewayFetch(`/api/clubs/${clubId}/invitations`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
