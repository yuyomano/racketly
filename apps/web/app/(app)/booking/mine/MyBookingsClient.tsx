'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Loader2,
  X,
  QrCode,
  CreditCard,
  LogOut,
  Pencil,
  UserPlus,
  Award,
  Wallet,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { cn, formatCurrency } from '@/lib/utils'

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
let stripePromise: Promise<Stripe | null> | null = null
function getStripePromise() {
  if (!stripePromise) stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY!)
  return stripePromise
}

type Player = {
  userId: string
  name: string
  isOwner: boolean
  paymentStatus?: string
  amountOwed?: number
  coveredBy?: 'membership' | 'credit' | null
}

type Booking = {
  id: string
  currency: string
  isOwnerBooking: boolean
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  qrCode?: string | null
  players?: Player[]
  slot: {
    date: string
    startTime: string
    endTime: string
    court: { name: string; club: { id: string; name: string; city: string } }
  }
}

async function fetchMyBookings(fetchErrorMessage: string): Promise<Booking[]> {
  const res = await fetch('/api/bookings/mine')
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? fetchErrorMessage)
  return data.data ?? []
}

export function MyBookingsClient({ userId }: { userId: string }) {
  const t = useTranslations('Booking.mine')
  const queryClient = useQueryClient()
  const toast = useToast()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [qrModalBooking, setQrModalBooking] = useState<Booking | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  useEffect(() => {
    const b = new URLSearchParams(window.location.search).get('b')
    if (b) setHighlightId(b)
  }, [])

  const STATUS_LABEL: Record<Booking['status'], { label: string; tone: BadgeTone }> = {
    pending: { label: t('statusPending'), tone: 'amber' },
    confirmed: { label: t('statusConfirmed'), tone: 'emerald' },
    cancelled: { label: t('statusCancelled'), tone: 'red' },
    completed: { label: t('statusCompleted'), tone: 'gray' },
  }

  const { data: bookings, isLoading } = useQuery({
    queryKey: ['bookings', 'mine'],
    queryFn: () => fetchMyBookings(t('fetchError')),
  })

  useEffect(() => {
    if (!highlightId || !bookings) return
    const b = bookings.find((x) => x.id === highlightId)
    if (!b) return
    const isPast = new Date(`${b.slot.date}T${b.slot.endTime}`).getTime() < Date.now()
    setTab(isPast || b.status === 'cancelled' ? 'past' : 'upcoming')
    setTimeout(
      () => document.getElementById(`booking-${highlightId}`)?.scrollIntoView({ block: 'center' }),
      50
    )
  }, [highlightId, bookings])

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('cancelError'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('cancelledToast'))
      queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const [payTarget, setPayTarget] = useState<{ booking: Booking; player: Player } | null>(null)
  const [editBooking, setEditBooking] = useState<Booking | null>(null)

  const leaveMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/bookings/${bookingId}/players/${userId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('leaveError'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('leftToast'))
      queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const now = Date.now()
  const isPast = (b: Booking) => new Date(`${b.slot.date}T${b.slot.endTime}`).getTime() < now
  const filtered = (bookings ?? []).filter((b) =>
    tab === 'upcoming'
      ? !isPast(b) && b.status !== 'cancelled'
      : isPast(b) || b.status === 'cancelled'
  )

  return (
    <div className="space-y-6">
      <Link
        href="/booking"
        className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('backToClubs')}
      </Link>

      <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>

      <div className="flex border border-ink-200 rounded-xl overflow-hidden w-fit">
        {(
          [
            ['upcoming', t('tabUpcoming')],
            ['past', t('tabPast')],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={cn(
              'px-4 py-2 text-sm font-semibold transition-colors',
              tab === v ? 'bg-court-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={tab === 'upcoming' ? t('emptyUpcomingTitle') : t('emptyPastTitle')}
          description={tab === 'upcoming' ? t('emptyUpcomingDescription') : undefined}
          action={
            tab === 'upcoming' ? (
              <Link
                href="/booking"
                className="text-sm font-semibold text-white bg-court-600 hover:bg-court-700 rounded-xl px-5 py-2.5 transition-colors"
              >
                {t('searchClubs')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const canCancel = tab === 'upcoming' && b.isOwnerBooking && b.status !== 'cancelled'
            const myPlayer = b.players?.find((p) => p.userId === userId)
            const isActive = tab === 'upcoming' && b.status !== 'cancelled'
            const canPay = isActive && myPlayer?.paymentStatus === 'pending'
            const othersToPay =
              isActive && b.isOwnerBooking
                ? (b.players ?? []).filter(
                    (p) => p.userId !== userId && p.paymentStatus === 'pending'
                  )
                : []
            const canEdit = isActive && b.isOwnerBooking
            const canLeave = tab === 'upcoming' && !b.isOwnerBooking && b.status !== 'cancelled'
            const st = STATUS_LABEL[b.status]
            return (
              <Card
                key={b.id}
                id={`booking-${b.id}`}
                className={cn(
                  'p-4 flex items-center justify-between gap-4',
                  highlightId === b.id && 'ring-2 ring-court-500'
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-ink-900 truncate">{b.slot.court.club.name}</p>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {!b.isOwnerBooking && <Badge tone="blue">{t('guestBadge')}</Badge>}
                  </div>
                  <p className="flex items-center gap-1 text-xs text-ink-400 mt-1">
                    <MapPin className="w-3 h-3" /> {b.slot.court.name} · {b.slot.court.club.city}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {b.slot.date} · {b.slot.startTime.slice(0, 5)}–{b.slot.endTime.slice(0, 5)}
                  </p>
                  {b.players && b.players.length > 1 && (
                    <p className="text-xs text-ink-400 mt-0.5 truncate">
                      {t('withPlayers', { names: b.players.map((p) => p.name).join(', ') })}
                    </p>
                  )}
                  {myPlayer?.coveredBy && (
                    <p className="flex items-center gap-1 text-xs text-court-700 mt-1 font-semibold">
                      {myPlayer.coveredBy === 'membership' ? (
                        <Award className="w-3 h-3" />
                      ) : (
                        <Wallet className="w-3 h-3" />
                      )}
                      {myPlayer.coveredBy === 'membership'
                        ? t('coveredByMembership')
                        : t('coveredByCredit')}
                    </p>
                  )}
                  {othersToPay.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {othersToPay.map((p) => (
                        <button
                          key={p.userId}
                          onClick={() => setPayTarget({ booking: b, player: p })}
                          className="flex items-center gap-1 text-xs font-semibold text-court-700 bg-court-50 hover:bg-court-100 rounded-lg px-2.5 py-1.5 transition-colors"
                        >
                          <CreditCard className="w-3 h-3" />
                          {t('payForButton', { name: p.name })}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {b.qrCode && (
                    <button
                      onClick={() => setQrModalBooking(b)}
                      className="flex items-center gap-1 text-xs font-semibold text-court-700 bg-court-50 hover:bg-court-100 rounded-lg px-3 py-2 transition-colors"
                    >
                      <QrCode className="w-3.5 h-3.5" /> {t('qrButton')}
                    </button>
                  )}
                  {canPay && myPlayer && (
                    <button
                      onClick={() => setPayTarget({ booking: b, player: myPlayer })}
                      className="flex items-center gap-1 text-xs font-semibold text-court-700 bg-court-50 hover:bg-court-100 rounded-lg px-3 py-2 transition-colors"
                    >
                      <CreditCard className="w-3.5 h-3.5" /> {t('payButton')}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => setEditBooking(b)}
                      className="flex items-center gap-1 text-xs font-semibold text-ink-600 bg-ink-50 hover:bg-ink-100 rounded-lg px-3 py-2 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> {t('editButton')}
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={() => cancelMutation.mutate(b.id)}
                      disabled={cancelMutation.isPending}
                      className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> {t('cancelButton')}
                    </button>
                  )}
                  {canLeave && (
                    <button
                      onClick={() => leaveMutation.mutate(b.id)}
                      disabled={leaveMutation.isPending}
                      className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" /> {t('leaveButton')}
                    </button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={!!qrModalBooking}
        onClose={() => setQrModalBooking(null)}
        title={t('qrModalTitle')}
      >
        {qrModalBooking?.qrCode && (
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, no next/image optimization to be done */}
            <img src={qrModalBooking.qrCode} alt={t('qrModalTitle')} className="w-48 h-48" />
            <p className="text-xs text-ink-400 max-w-[220px] text-center">{t('qrModalHint')}</p>
          </div>
        )}
      </Modal>

      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title={t('payModalTitle')}>
        {payTarget && (
          <PayModal
            key={`${payTarget.booking.id}-${payTarget.player.userId}`}
            bookingId={payTarget.booking.id}
            player={payTarget.player}
            currency={payTarget.booking.currency}
            t={t}
            onPaid={() => {
              toast.success(t('paidToast'))
              queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] })
              setPayTarget(null)
            }}
          />
        )}
      </Modal>

      <Modal
        open={!!editBooking}
        onClose={() => setEditBooking(null)}
        title={t('editModalTitle')}
      >
        {editBooking && (
          <EditPlayersModal
            key={editBooking.id}
            booking={editBooking}
            userId={userId}
            t={t}
            onSaved={() => {
              toast.success(t('editSavedToast'))
              queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] })
              setEditBooking(null)
            }}
          />
        )}
      </Modal>
    </div>
  )
}

// Pago real de la parte de un jugador (propia o de otro participante de la reserva) — crea un
// PaymentIntent de Stripe y confirma server-side antes de marcar como pagado, igual que el
// flujo de pago de invitados en /pay/[token].
function PayModal({
  bookingId,
  player,
  currency,
  t,
  onPaid,
}: {
  bookingId: string
  player: Player
  currency: string
  t: (key: string, values?: Record<string, string | number>) => string
  onPaid: () => void
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [devMode, setDevMode] = useState(false)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError('')
    fetch(`/api/bookings/${bookingId}/players/${player.userId}/intent`, { method: 'POST' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (!json.success) {
          setError(json.error || t('payError'))
          return
        }
        setClientSecret(json.data.clientSecret)
        setPaymentIntentId(json.data.paymentIntentId)
        setDevMode(!!json.data.devMode)
      })
      .catch(() => {
        if (!cancelled) setError(t('payError'))
      })
    return () => {
      cancelled = true
    }
  }, [bookingId, player.userId, t])

  async function confirmPaid(intentId: string) {
    setPaying(true)
    setError('')
    try {
      const res = await fetch(
        `/api/bookings/${bookingId}/players/${player.userId}/confirm-payment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: intentId }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('payError'))
      onPaid()
    } catch (e: any) {
      setError(e.message || t('payError'))
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs text-ink-400 uppercase tracking-wide">
          {t('payModalAmountFor', { name: player.name })}
        </p>
        <p className="text-2xl font-black text-ink-900">
          {formatCurrency(player.amountOwed ?? 0, currency)}
        </p>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">{error}</p>}

      {!clientSecret ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 text-court-500 animate-spin" />
        </div>
      ) : devMode || !STRIPE_PUBLISHABLE_KEY ? (
        <div className="space-y-2">
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">
            {t('payModalDevModeHint')}
          </p>
          <Button
            onClick={() => paymentIntentId && confirmPaid(paymentIntentId)}
            disabled={paying}
            className="w-full"
          >
            {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : t('payModalPayButton')}
          </Button>
        </div>
      ) : (
        <Elements stripe={getStripePromise()} options={{ clientSecret }}>
          <StripeCardForm
            fallbackPaymentIntentId={paymentIntentId!}
            paying={paying}
            setPaying={setPaying}
            onError={setError}
            onConfirm={confirmPaid}
            t={t}
          />
        </Elements>
      )}
    </div>
  )
}

function StripeCardForm({
  fallbackPaymentIntentId,
  paying,
  setPaying,
  onError,
  onConfirm,
  t,
}: {
  fallbackPaymentIntentId: string
  paying: boolean
  setPaying: (v: boolean) => void
  onError: (msg: string) => void
  onConfirm: (paymentIntentId: string) => void
  t: (key: string) => string
}) {
  const stripe = useStripe()
  const elements = useElements()

  async function handlePay() {
    if (!stripe || !elements) return
    setPaying(true)
    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      })
      if (stripeError) {
        onError(stripeError.message || t('payError'))
        setPaying(false)
        return
      }
      onConfirm(paymentIntent?.id ?? fallbackPaymentIntentId)
    } catch (e: any) {
      onError(e.message || t('payError'))
      setPaying(false)
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      <Button onClick={handlePay} disabled={paying || !stripe} className="w-full">
        {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : t('payModalPayButton')}
      </Button>
    </div>
  )
}

// Agregar/quitar jugadores de una reserva ya hecha — reusa PATCH /api/bookings/:id/players
// (dueño de la reserva o admin del club), que ya resuelve cobertura por membresía/crédito
// para los jugadores nuevos igual que al crear la reserva.
function EditPlayersModal({
  booking,
  userId,
  t,
  onSaved,
}: {
  booking: Booking
  userId: string
  t: (key: string, values?: Record<string, string | number>) => string
  onSaved: () => void
}) {
  const [players, setPlayers] = useState<{ userId?: string; name: string }[]>(
    (booking.players ?? [])
      .filter((p) => !p.isOwner)
      .map((p) => ({ userId: p.userId, name: p.name }))
  )
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(timer)
  }, [search])

  const { data: results, isFetching } = useQuery({
    queryKey: ['user-search', query, booking.slot.court.club.id, userId],
    queryFn: async () => {
      const params = new URLSearchParams({
        q: query,
        excludeId: userId,
        clubId: booking.slot.court.club.id,
        filter: 'club',
      })
      const res = await fetch(`/api/users/search?${params.toString()}`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data ?? []) as { id: string; name: string }[]
    },
    enabled: query.trim().length >= 2,
  })

  const capacity = 4
  function addPlayer(p: { id: string; name: string }) {
    if (players.some((x) => x.userId === p.id)) return
    if (players.length + 1 >= capacity) return
    setPlayers((prev) => [...prev, { userId: p.id, name: p.name }])
    setSearch('')
    setQuery('')
  }
  function removePlayer(playerId?: string) {
    setPlayers((prev) => prev.filter((p) => p.userId !== playerId))
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/bookings/${booking.id}/players`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('editError'))
      onSaved()
    } catch (e: any) {
      setError(e.message || t('editError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">{error}</p>}

      <div className="space-y-1.5">
        {players.length === 0 && <p className="text-sm text-ink-400">{t('editNoPlayers')}</p>}
        {players.map((p) => (
          <div
            key={p.userId}
            className="flex items-center justify-between bg-ink-50 rounded-lg px-3 py-2"
          >
            <span className="text-sm font-semibold text-ink-800">{p.name}</span>
            <button
              onClick={() => removePlayer(p.userId)}
              className="text-ink-400 hover:text-red-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {players.length + 1 < capacity && (
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('editSearchPlaceholder')}
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-court-500"
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-ink-300" />
          )}
          {!!results?.length && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-ink-200 rounded-lg shadow-lg overflow-hidden">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => addPlayer(r)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-ink-50 flex items-center gap-2"
                >
                  <UserPlus className="w-3.5 h-3.5 text-ink-400" /> {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('editSaveButton')}
      </Button>
    </div>
  )
}
