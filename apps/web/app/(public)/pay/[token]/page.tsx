'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle, XCircle, Clock, Loader2, CreditCard } from 'lucide-react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/lib/utils'

const GW = '' // relative — next.config reescribe /api/guest-payments al gateway (ruta pública, sin auth)

type LinkDetail = {
  status: 'pending' | 'paid' | 'expired' | 'cancelled'
  playerName: string
  amount: number
  currency: string
  club: string
  court: string
  date: string
  startTime: string
  endTime: string
  stripeConfigured: boolean
}

// Publishable key opcional — si no está configurada (o Stripe no está configurado en el
// backend), la página cae a un botón de "modo prueba" que confirma el pago sin tarjeta real,
// igual que el resto de la app se auto-confirma en DEV_MODE cuando no hay STRIPE_SECRET_KEY.
const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

export default function GuestPaymentPage() {
  const params = useParams()
  const token = (params?.token as string) ?? ''

  const [detail, setDetail] = useState<LinkDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const [paid, setPaid] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${GW}/api/guest-payments/${token}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'No se pudo cargar el link de pago'); return }
      setDetail(json.data)
      if (json.data.status === 'paid') setPaid(true)
    } catch {
      setError('Error de conexión con el servidor')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { if (token) load() }, [token, load])

  // Modo prueba (sin Stripe real configurado): crea el intent y lo confirma de inmediato.
  async function payDevMode() {
    setPaying(true); setError('')
    try {
      const intentRes = await fetch(`${GW}/api/guest-payments/${token}/intent`, { method: 'POST' })
      const intentJson = await intentRes.json()
      if (!intentRes.ok) throw new Error(intentJson.error)

      const confirmRes = await fetch(`${GW}/api/guest-payments/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: intentJson.data.paymentIntentId }),
      })
      const confirmJson = await confirmRes.json()
      if (!confirmJson.success) throw new Error(confirmJson.error)
      setPaid(true)
    } catch (e: any) {
      setError(e.message || 'No se pudo completar el pago')
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-sky-500 mx-auto animate-spin" />
          <p className="text-gray-500 text-sm">Cargando link de pago…</p>
        </div>
      </Shell>
    )
  }

  if (error && !detail) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <XCircle className="w-14 h-14 text-red-400 mx-auto" />
          <h2 className="text-xl font-bold text-gray-800">No se pudo cargar el link</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </Shell>
    )
  }

  if (!detail) return null

  if (paid || detail.status === 'paid') {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto" />
          <h2 className="text-xl font-bold text-gray-800">¡Pago recibido!</h2>
          <p className="text-gray-500 text-sm">
            Gracias, {detail.playerName}. Tu parte de {formatCurrency(detail.amount, detail.currency)} quedó registrada.
          </p>
        </div>
      </Shell>
    )
  }

  if (detail.status === 'expired') {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <Clock className="w-14 h-14 text-amber-400 mx-auto" />
          <h2 className="text-xl font-bold text-gray-800">Este link expiró</h2>
          <p className="text-gray-500 text-sm">Pide al club que te genere uno nuevo.</p>
        </div>
      </Shell>
    )
  }

  if (detail.status === 'cancelled') {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <XCircle className="w-14 h-14 text-gray-400 mx-auto" />
          <h2 className="text-xl font-bold text-gray-800">Este link ya no está vigente</h2>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="space-y-5">
        <div className="text-center">
          <h2 className="text-lg font-bold text-gray-800">¡Hola, {detail.playerName}!</h2>
          <p className="text-sm text-gray-500 mt-1">Completa tu pago para la reserva:</p>
        </div>

        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-sm">
          <p className="font-semibold text-sky-900">{detail.club}</p>
          <p className="text-sky-700">{detail.court} · {formatDate(detail.date)} · {detail.startTime.slice(0, 5)}–{detail.endTime.slice(0, 5)}</p>
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total a pagar</p>
          <p className="text-3xl font-black text-gray-900">{formatCurrency(detail.amount, detail.currency)}</p>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">{error}</p>}

        {detail.stripeConfigured && STRIPE_PUBLISHABLE_KEY ? (
          <StripeCardForm token={token} onSuccess={() => setPaid(true)} onError={setError} />
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">
              Modo de prueba — el club aún no configuró un método de cobro real. Este botón simula el pago.
            </p>
            <Button onClick={payDevMode} disabled={paying} className="w-full">
              {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CreditCard className="w-4 h-4" /> Pagar {formatCurrency(detail.amount, detail.currency)}</>}
            </Button>
          </div>
        )}
      </div>
    </Shell>
  )
}

let stripePromise: Promise<Stripe | null> | null = null
function getStripePromise() {
  if (!stripePromise) stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY!)
  return stripePromise
}

// Formulario real con Stripe Elements — solo se monta cuando hay publishable key y el backend
// confirma que Stripe está configurado.
function StripeCardForm({ token, onSuccess, onError }: { token: string; onSuccess: () => void; onError: (msg: string) => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${GW}/api/guest-payments/${token}/intent`, { method: 'POST' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (!json.success) { onError(json.error || 'No se pudo iniciar el pago'); return }
        setClientSecret(json.data.clientSecret)
        setPaymentIntentId(json.data.paymentIntentId)
      })
      .catch(() => { if (!cancelled) onError('No se pudo iniciar el pago') })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (!clientSecret) {
    return <div className="text-center py-6"><Loader2 className="w-6 h-6 text-sky-500 mx-auto animate-spin" /></div>
  }

  return (
    <Elements stripe={getStripePromise()} options={{ clientSecret }}>
      <PaymentElementForm token={token} fallbackPaymentIntentId={paymentIntentId!} onSuccess={onSuccess} onError={onError} />
    </Elements>
  )
}

function PaymentElementForm({ token, fallbackPaymentIntentId, onSuccess, onError }: {
  token: string; fallbackPaymentIntentId: string; onSuccess: () => void; onError: (msg: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)

  async function handlePay() {
    if (!stripe || !elements) return
    setSubmitting(true)
    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required' })
      if (stripeError) { onError(stripeError.message || 'El pago no pudo procesarse'); return }
      const confirmRes = await fetch(`${GW}/api/guest-payments/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: paymentIntent?.id ?? fallbackPaymentIntentId }),
      })
      const confirmJson = await confirmRes.json()
      if (!confirmJson.success) { onError(confirmJson.error || 'No se pudo confirmar el pago'); return }
      onSuccess()
    } catch (e: any) {
      onError(e.message || 'No se pudo completar el pago')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      <Button onClick={handlePay} disabled={submitting || !stripe} className="w-full">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Pagar ahora'}
      </Button>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-900 via-sky-800 to-sky-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center text-lg">🎾</div>
          <div>
            <p className="font-black text-sky-900 text-lg leading-none">Racketly</p>
            <p className="text-sky-600 text-xs">Pago de invitado</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  )
}
