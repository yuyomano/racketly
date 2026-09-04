'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  MapPin,
  Users,
  Trophy,
  CalendarDays,
  Loader2,
  AlertCircle,
  CheckCircle2,
  CreditCard,
} from 'lucide-react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { normalizeSetScore } from '@racketly/utils'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { cn, formatCurrency } from '@/lib/utils'

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
let stripePromise: Promise<Stripe | null> | null = null
function getStripePromise() {
  if (!stripePromise) stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY!)
  return stripePromise
}

type Participant = {
  id: string
  playerId: string
  partnerId: string | null
  paymentStatus: string
  confirmed: boolean
  amountOwed?: number
  amountPaid?: number
  player: { displayName: string; category: string }
}
type Tournament = {
  id: string
  name: string
  description: string | null
  sport: string
  category: string
  genderCategory: string
  type: string
  format: string
  status: string
  startDate: string
  endDate: string
  location: string
  entryFee: number
  currency: string
  maxParticipants: number
  currentParticipants: number
  prizeInfo: string | null
  rules: string | null
  club?: { name: string; address: string; city: string } | null
  participants: Participant[]
}
type Match = {
  id: string
  round: number
  status: string
  score: unknown
  winnerId: string | null
  player1Id: string | null
  player2Id: string | null
  player1?: { displayName: string } | null
  player2?: { displayName: string } | null
  player1PartnerName?: string | null
  player2PartnerName?: string | null
}

function formatScore(score: unknown): string {
  if (!Array.isArray(score) || score.length === 0) return ''
  return score
    .map((s) => {
      const n = normalizeSetScore(s)
      return `${n.p1}-${n.p2}`
    })
    .join(' ')
}

async function fetchBracket(id: string, errorMessage: string): Promise<Record<string, Match[]>> {
  const res = await fetch(`/api/tournaments/${id}/bracket`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.data ?? {}
}

export function TournamentDetailClient({
  tournament,
  userId,
}: {
  tournament: Tournament
  userId: string
}) {
  const t = useTranslations('TournamentsApp.detail')
  const locale = useLocale()
  const queryClient = useQueryClient()
  const router = useRouter()
  const toast = useToast()
  const [error, setError] = useState('')

  const STATUS_LABEL: Record<string, string> = {
    draft: t('statusDraft'),
    open: t('statusOpen'),
    in_progress: t('statusInProgress'),
    completed: t('statusCompleted'),
    cancelled: t('statusCancelled'),
  }
  const FORMAT_LABEL: Record<string, string> = {
    round_robin: t('formatRoundRobin'),
    elimination: t('formatElimination'),
    groups_bracket: t('formatGroupsBracket'),
    swiss: t('formatSwiss'),
  }
  const GENDER_LABEL: Record<string, string> = {
    masculino: t('genderMasculino'),
    femenino: t('genderFemenino'),
    mixto: t('genderMixto'),
  }

  const myParticipation = tournament.participants.find((p) => p.playerId === userId)
  const showBracket = tournament.status === 'in_progress' || tournament.status === 'completed'

  const { data: bracket, isLoading: bracketLoading } = useQuery({
    queryKey: ['bracket', tournament.id],
    queryFn: () => fetchBracket(tournament.id, t('bracketLoadError')),
    enabled: showBracket,
  })

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tournaments/${tournament.id}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: userId, paymentStatus: 'pending' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('registerError'))
      return data.data
    },
    onError: (e: Error) => setError(e.message),
    onSuccess: () => {
      setError('')
      toast.success(t('registerSuccess'))
      queryClient.invalidateQueries({ queryKey: ['tournament', tournament.id] })
      router.refresh()
    },
  })

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      if (!myParticipation) return
      const res = await fetch(
        `/api/tournaments/${tournament.id}/participants/${myParticipation.id}`,
        { method: 'DELETE' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? t('withdrawError'))
    },
    onError: (e: Error) => setError(e.message),
    onSuccess: () => {
      setError('')
      toast.success(t('withdrawSuccess'))
      router.refresh()
    },
  })

  const rounds = bracket
    ? Object.keys(bracket)
        .map(Number)
        .sort((a, b) => a - b)
    : []

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Link
        href="/tournaments"
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('backLink')}
      </Link>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">{tournament.name}</h1>
            <p className="flex items-center gap-1 text-sm text-gray-400 mt-1">
              <MapPin className="w-3.5 h-3.5" /> {tournament.club?.name ?? tournament.location}
            </p>
          </div>
          <Badge
            tone={
              tournament.status === 'open'
                ? 'emerald'
                : tournament.status === 'in_progress'
                  ? 'amber'
                  : 'gray'
            }
          >
            {STATUS_LABEL[tournament.status] ?? tournament.status}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-4">
          <Badge tone="violet">{tournament.category}</Badge>
          <Badge tone="blue">
            {GENDER_LABEL[tournament.genderCategory] ?? tournament.genderCategory}
          </Badge>
          <Badge tone="gray">{FORMAT_LABEL[tournament.format] ?? tournament.format}</Badge>
          {tournament.entryFee > 0 && (
            <Badge tone="gray">
              {tournament.currency} {tournament.entryFee.toFixed(0)}
            </Badge>
          )}
        </div>

        {tournament.description && (
          <p className="text-sm text-gray-500 mt-4">{tournament.description}</p>
        )}

        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100">
          <div>
            <p className="flex items-center gap-1 text-xs text-gray-400">
              <CalendarDays className="w-3.5 h-3.5" /> {t('dateLabel')}
            </p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">
              {new Date(tournament.startDate).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'short',
              })}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs text-gray-400">
              <Users className="w-3.5 h-3.5" /> {t('participantsLabel')}
            </p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">
              {tournament.currentParticipants}/{tournament.maxParticipants}
            </p>
          </div>
          {tournament.prizeInfo && (
            <div>
              <p className="flex items-center gap-1 text-xs text-gray-400">
                <Trophy className="w-3.5 h-3.5" /> {t('prizeLabel')}
              </p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">
                {tournament.prizeInfo}
              </p>
            </div>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5 mt-4">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </p>
        )}

        <div className="mt-5">
          {myParticipation ? (
            <div className="flex items-center justify-between gap-3 bg-emerald-50 rounded-xl px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                {myParticipation.confirmed ? t('alreadyRegistered') : t('registeredIncomplete')}
              </p>
              {(tournament.status === 'open' || tournament.status === 'draft') && (
                <button
                  onClick={() => withdrawMutation.mutate()}
                  disabled={withdrawMutation.isPending}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  {withdrawMutation.isPending ? t('withdrawing') : t('withdrawButton')}
                </button>
              )}
            </div>
          ) : tournament.status === 'open' ? (
            <Button
              onClick={() => registerMutation.mutate()}
              disabled={registerMutation.isPending}
              className="w-full"
            >
              {registerMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('registerButton')
              )}
            </Button>
          ) : (
            <p className="text-xs text-gray-400 text-center">{t('registrationsClosed')}</p>
          )}

          {myParticipation &&
            myParticipation.paymentStatus === 'pending' &&
            tournament.entryFee > 0 && (
              <TournamentEntryPayment
                tournamentId={tournament.id}
                participantId={myParticipation.id}
                amountOwed={
                  (myParticipation.amountOwed ?? tournament.entryFee) -
                  (myParticipation.amountPaid ?? 0)
                }
                currency={tournament.currency}
                onPaid={() => {
                  toast.success(t('paymentSuccess'))
                  router.refresh()
                }}
              />
            )}
        </div>
      </Card>

      {showBracket && (
        <Card className="p-6">
          <h2 className="font-bold text-gray-900 mb-4">{t('bracketTitle')}</h2>
          {bracketLoading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : rounds.length === 0 ? (
            <EmptyState icon={Trophy} title={t('bracketEmptyTitle')} />
          ) : (
            <div className="space-y-5">
              {rounds.map((round) => (
                <div key={round}>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                    {t('roundLabel', { round })}
                  </p>
                  <div className="space-y-2">
                    {bracket![round].map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl px-4 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <p
                            className={cn(
                              'truncate',
                              m.winnerId === m.player1Id && 'font-bold text-emerald-700'
                            )}
                          >
                            {m.player1?.displayName ?? t('tbdPlayer')}
                            {m.player1PartnerName ? ` / ${m.player1PartnerName}` : ''}
                          </p>
                          <p
                            className={cn(
                              'truncate',
                              m.winnerId === m.player2Id && 'font-bold text-emerald-700'
                            )}
                          >
                            {m.player2?.displayName ?? t('tbdPlayer')}
                            {m.player2PartnerName ? ` / ${m.player2PartnerName}` : ''}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400 font-mono shrink-0">
                          {formatScore(m.score) || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ─── Pago de inscripción ────────────────────────────────────────────────────
// Se muestra cuando el jugador ya está inscrito pero su pago sigue pendiente. Si el club no
// tiene Stripe configurado (o no hay publishable key en el front), cae a un botón de "modo
// prueba" que confirma el pago sin tarjeta real — igual patrón que el resto de la app en DEV_MODE.
function TournamentEntryPayment({
  tournamentId,
  participantId,
  amountOwed,
  currency,
  onPaid,
}: {
  tournamentId: string
  participantId: string
  amountOwed: number
  currency: string
  onPaid: () => void
}) {
  const t = useTranslations('TournamentsApp.detail')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [stripeConfigured, setStripeConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/tournaments/${tournamentId}/participants/${participantId}/pay-intent`, {
      method: 'POST',
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (!json.success) {
          setError(json.error ?? t('paymentIntentError'))
          return
        }
        setClientSecret(json.data.clientSecret)
        setPaymentIntentId(json.data.paymentIntentId)
        setStripeConfigured(!!json.data.stripeConfigured)
      })
      .catch(() => {
        if (!cancelled) setError(t('paymentIntentError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tournamentId, participantId, t])

  async function confirmDevMode() {
    setPaying(true)
    setError('')
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/participants/${participantId}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId }),
        }
      )
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? t('paymentConfirmError'))
        return
      }
      onPaid()
    } catch {
      setError(t('paymentConfirmError'))
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="border border-sky-200 bg-sky-50/60 rounded-xl p-4 mt-3 space-y-3">
      <p className="text-sm font-semibold text-sky-900">
        {t('paymentPendingTitle', { amount: formatCurrency(amountOwed, currency) })}
      </p>
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 text-sky-500 animate-spin" />
        </div>
      ) : stripeConfigured && STRIPE_PUBLISHABLE_KEY && clientSecret ? (
        <Elements stripe={getStripePromise()} options={{ clientSecret }}>
          <TournamentPaymentForm
            tournamentId={tournamentId}
            participantId={participantId}
            fallbackPaymentIntentId={paymentIntentId!}
            onPaid={onPaid}
            onError={setError}
          />
        </Elements>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {t('devModeNotice')}
          </p>
          <Button onClick={confirmDevMode} disabled={paying || !paymentIntentId} className="w-full">
            {paying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CreditCard className="w-4 h-4" />{' '}
                {t('payButton', { amount: formatCurrency(amountOwed, currency) })}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

function TournamentPaymentForm({
  tournamentId,
  participantId,
  fallbackPaymentIntentId,
  onPaid,
  onError,
}: {
  tournamentId: string
  participantId: string
  fallbackPaymentIntentId: string
  onPaid: () => void
  onError: (msg: string) => void
}) {
  const t = useTranslations('TournamentsApp.detail')
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)

  async function handlePay() {
    if (!stripe || !elements) return
    setSubmitting(true)
    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      })
      if (stripeError) {
        onError(stripeError.message || t('paymentConfirmError'))
        return
      }
      const res = await fetch(
        `/api/tournaments/${tournamentId}/participants/${participantId}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: paymentIntent?.id ?? fallbackPaymentIntentId }),
        }
      )
      const data = await res.json()
      if (!data.success) {
        onError(data.error ?? t('paymentConfirmError'))
        return
      }
      onPaid()
    } catch (e: any) {
      onError(e.message || t('paymentConfirmError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <PaymentElement />
      <Button onClick={handlePay} disabled={submitting || !stripe} className="w-full">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('payNowButton')}
      </Button>
    </div>
  )
}
