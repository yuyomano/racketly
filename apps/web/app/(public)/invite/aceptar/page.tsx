'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const GW = '' // relative — middleware inyecta auth, next.config reescribe al gateway

function AcceptContent() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''

  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'done'>('loading')
  const [message, setMessage] = useState('')
  const [invite, setInvite] = useState<{ name: string; email: string } | null>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('No se encontró un token de invitación en el enlace.')
      return
    }
    fetch(`${GW}/api/auth/invite/${token}`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) {
          setStatus('error')
          setMessage(data.error || 'Invitación no válida')
          return
        }
        setInvite(data.data)
        setStatus('ready')
      })
      .catch(() => {
        setStatus('error')
        setMessage('Error de conexión con el servidor')
      })
  }, [token])

  async function handleSubmit() {
    if (password.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirm) {
      setFormError('Las contraseñas no coinciden')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      const res = await fetch(`${GW}/api/auth/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'No se pudo activar la cuenta')
        return
      }
      setStatus('done')
    } catch {
      setFormError('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 text-court-500 mx-auto animate-spin" />
        <p className="text-ink-500 text-sm">Cargando invitación...</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="text-center space-y-3">
        <XCircle className="w-14 h-14 text-red-400 mx-auto" />
        <h2 className="text-xl font-bold text-ink-800">No se pudo cargar la invitación</h2>
        <p className="text-ink-500 text-sm">{message}</p>
        <Button onClick={() => router.push('/login')} className="mt-2">
          Ir al login
        </Button>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="text-center space-y-3">
        <CheckCircle className="w-14 h-14 text-court-500 mx-auto" />
        <h2 className="text-xl font-bold text-ink-800">¡Cuenta activada!</h2>
        <p className="text-ink-500 text-sm">
          Ya puedes iniciar sesión con tu email y tu nueva contraseña.
        </p>
        <Button onClick={() => router.push('/login')} className="mt-4">
          Ir al login
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-lg font-bold text-ink-800">¡Hola, {invite!.name}!</h2>
        <p className="text-sm text-ink-500 mt-1">
          Te crearon una cuenta con <span className="font-semibold">{invite!.email}</span>. Define
          tu contraseña para activarla.
        </p>
      </div>

      {formError && (
        <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">{formError}</p>
      )}

      <div>
        <label className="block text-sm font-semibold text-ink-700 mb-1">Contraseña</label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            className="w-full border border-ink-200 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-court-500"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
          >
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-ink-700 mb-1">
          Confirmar contraseña
        </label>
        <input
          type={showPw ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border border-ink-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500"
        />
      </div>

      <Button onClick={handleSubmit} disabled={submitting} className="w-full">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Activar mi cuenta'}
      </Button>
    </div>
  )
}

export default function AcceptPlayerInvitePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-court-900 via-court-800 to-court-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-court-500 flex items-center justify-center text-lg">
            🎾
          </div>
          <div>
            <p className="font-black text-court-900 text-lg leading-none">Racketly</p>
            <p className="text-court-600 text-xs">Completa tu cuenta</p>
          </div>
          <ShieldCheck className="w-5 h-5 text-court-500 ml-auto" />
        </div>
        <Suspense fallback={<div className="text-center text-ink-400 text-sm">Cargando...</div>}>
          <AcceptContent />
        </Suspense>
      </div>
    </main>
  )
}
