import { NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

// GET /api/profile/:userId — perfil público de un jugador
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const res = await gatewayFetch(`/api/profile/${userId}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudo cargar el perfil' },
      { status: 502 }
    )
  }
}
