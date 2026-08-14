import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

type Ctx = { params: Promise<{ clubId: string; invitationId: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
  const { clubId, invitationId } = await params
  const res = await gatewayFetch(`/api/clubs/${clubId}/invitations/${invitationId}`, { method: 'DELETE' })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
