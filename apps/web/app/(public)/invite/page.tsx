'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const GW = '' // relative — middleware inyecta auth, next.config reescribe al gateway

function AcceptInviteContent() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [clubName, setClubName] = useState('')

  // Si hay token, aceptar automáticamente al cargar
  useEffect(() => {
    if (!token) return
    handleAccept()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleAccept() {
    if (!token) {
      setStatus('error')
      setMessage('Token de invitación no encontrado')
      return
    }
    setStatus('loading')
    try {
      const res = await fetch(`${GW}/api/clubs/invitations/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'No se pudo aceptar la invitación')
        return
      }
      setStatus('success')
      setClubName(data.data?.clubId ?? '')
    } catch {
      setStatus('error')
      setMessage('Error de conexión con el servidor')
    }
  }

  if (!token) {
    return (
      <div className="text-center space-y-3">
        <XCircle className="w-14 h-14 text-red-400 mx-auto" />
        <h2 className="text-xl font-bold text-gray-800">Enlace inválido</h2>
        <p className="text-gray-500 text-sm">No se encontró un token de invitación en el enlace.</p>
        <Button onClick={() => router.push('/login')}>Ir al inicio</Button>
      </div>
    )
  }

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 text-emerald-500 mx-auto animate-spin" />
        <p className="text-gray-500 text-sm">Procesando invitación...</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="text-center space-y-3">
        <XCircle className="w-14 h-14 text-red-400 mx-auto" />
        <h2 className="text-xl font-bold text-gray-800">No se pudo aceptar</h2>
        <p className="text-gray-500 text-sm">{message}</p>
        <div className="flex gap-3 justify-center mt-4">
          <Button onClick={() => router.push('/login')} variant="ghost">
            Ir al login
          </Button>
          <Button onClick={() => router.push('/dashboard')}>Dashboard</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="text-center space-y-3">
      <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto" />
      <h2 className="text-xl font-bold text-gray-800">¡Invitación aceptada!</h2>
      <p className="text-gray-500 text-sm">
        Ya tienes acceso como administrador{clubName ? ` del club ${clubName}` : ''}.
      </p>
      <Button onClick={() => router.push('/dashboard')} className="mt-4">
        Ir al dashboard
      </Button>
    </div>
  )
}

export default function InvitePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-lg">
            🎾
          </div>
          <div>
            <p className="font-black text-emerald-900 text-lg leading-none">Racketly</p>
            <p className="text-emerald-600 text-xs">Invitación de administrador</p>
          </div>
          <ShieldCheck className="w-5 h-5 text-emerald-500 ml-auto" />
        </div>
        <Suspense fallback={<div className="text-center text-gray-400 text-sm">Cargando...</div>}>
          <AcceptInviteContent />
        </Suspense>
      </div>
    </main>
  )
}
