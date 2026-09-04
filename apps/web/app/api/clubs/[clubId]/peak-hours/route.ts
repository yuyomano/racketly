import { NextRequest, NextResponse } from 'next/server'
import { gatewayFetch } from '@/lib/auth-web'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params
    const res = await gatewayFetch(`/api/clubs/${clubId}/peak-hours`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Servicio de horario pico no disponible' },
      { status: 502 }
    )
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await params
    const body = await req.text()
    const res = await gatewayFetch(`/api/clubs/${clubId}/peak-hours`, {
      method: 'PUT',
      body,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Servicio de horario pico no disponible' },
      { status: 502 }
    )
  }
}
