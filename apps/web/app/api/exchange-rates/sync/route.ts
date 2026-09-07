import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({}))
    const res = await gatewayFetch('/api/exchange-rates/sync', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Servicio no disponible' }, { status: 502 })
  }
}
