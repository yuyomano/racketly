'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, MapPin, Loader2, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Booking = {
  id: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  isOwnerBooking: boolean
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

export function MyBookingsClient() {
  const t = useTranslations('Booking.mine')
  const queryClient = useQueryClient()
  const toast = useToast()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

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
            const st = STATUS_LABEL[b.status]
            return (
              <Card key={b.id} className="p-4 flex items-center justify-between gap-4">
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
                </div>
                {canCancel && (
                  <button
                    onClick={() => cancelMutation.mutate(b.id)}
                    disabled={cancelMutation.isPending}
                    className="shrink-0 flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> {t('cancelButton')}
                  </button>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
