import { NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

// DELETE /api/memberships/:id/cancel
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  try {
    const { id } = await params
    const res = await gatewayFetch(`/api/memberships/${id}/cancel`, { method: 'DELETE' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudo cancelar la membresía' },
      { status: 502 }
    )
  }
}
