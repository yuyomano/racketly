'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Loader2,
  X,
  QrCode,
  CreditCard,
  LogOut,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Booking = {
  id: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  isOwnerBooking: boolean
  qrCode?: string | null
  players?: { userId: string; name: string; isOwner: boolean; paymentStatus?: string }[]
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

  const payMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/bookings/${bookingId}/players/${userId}/pay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: 'card' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('payError'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('paidToast'))
      queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

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
            const canPay =
              tab === 'upcoming' &&
              b.status !== 'cancelled' &&
              myPlayer?.paymentStatus === 'pending'
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
                  {canPay && (
                    <button
                      onClick={() => payMutation.mutate(b.id)}
                      disabled={payMutation.isPending}
                      className="flex items-center gap-1 text-xs font-semibold text-court-700 bg-court-50 hover:bg-court-100 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
                    >
                      <CreditCard className="w-3.5 h-3.5" /> {t('payButton')}
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
    </div>
  )
}
