import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

type Ctx = { params: Promise<{ clubId: string; adminId: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
  const { clubId, adminId } = await params
  const res = await gatewayFetch(`/api/clubs/${clubId}/admins/${adminId}`, { method: 'DELETE' })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
