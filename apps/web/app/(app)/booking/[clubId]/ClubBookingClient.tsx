'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MapPin, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Court = { id: string; name: string; sport: string; capacity: number }
type Club = { id: string; name: string; city: string; country: string; currency: string; courts: Court[] }
type Slot = {
  id: string; courtId: string; date: string; startTime: string; endTime: string
  basePrice: number; peakPrice: number; isPeak: boolean; isAvailable: boolean
}

function nextDays(n: number, locale: string): { date: string; label: string; dayNum: string }[] {
  const out = []
  for (let i = 0; i < n; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    out.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(locale, { weekday: 'short' }),
      dayNum: d.toLocaleDateString(locale, { day: 'numeric' }),
    })
  }
  return out
}

async function fetchAvailability(clubId: string, date: string, fetchErrorMessage: string): Promise<Slot[]> {
  const res = await fetch(`/api/clubs/${clubId}/availability?date=${date}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? fetchErrorMessage)
  return data.data ?? []
}

export function ClubBookingClient({ club, userId, displayName }: { club: Club; userId: string; displayName: string }) {
  const t = useTranslations('Booking.clubDetail')
  const locale = useLocale()
  const queryClient = useQueryClient()
  const toast = useToast()
  const days = useMemo(() => nextDays(7, locale), [locale])
  const [selectedDate, setSelectedDate] = useState(days[0].date)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const { data: slots, isLoading } = useQuery({
    queryKey: ['availability', club.id, selectedDate],
    queryFn: () => fetchAvailability(club.id, selectedDate, t('fetchAvailabilityError')),
  })

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSlot) return
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          userId,
          clubId: club.id,
          ownerName: displayName,
          ownerPay: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('bookError'))
      return data.data
    },
    onSuccess: () => {
      setConfirmed(true)
      toast.success(t('bookingConfirmedToast'))
      queryClient.invalidateQueries({ queryKey: ['availability', club.id, selectedDate] })
      queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] })
    },
  })

  const courts = club.courts ?? []
  const slotsByCourtId = new Map<string, Slot[]>()
  for (const s of slots ?? []) {
    if (!slotsByCourtId.has(s.courtId)) slotsByCourtId.set(s.courtId, [])
    slotsByCourtId.get(s.courtId)!.push(s)
  }

  if (confirmed) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">{t('confirmedTitle')}</h1>
        <p className="text-sm text-gray-400 mt-1.5">
          {club.name} · {selectedSlot?.date} · {selectedSlot?.startTime.slice(0, 5)}
        </p>
        <div className="flex gap-3 mt-6 justify-center">
          <Link href="/booking/mine" className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl px-5 py-2.5 transition-colors">
            {t('viewMyBookings')}
          </Link>
          <Link href="/booking" className="text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl px-5 py-2.5 transition-colors">
            {t('bookAnother')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24">
      <Link href="/booking" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
        <ArrowLeft className="w-4 h-4" /> {t('backToClubs')}
      </Link>

      <div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight">{club.name}</h1>
        <p className="flex items-center gap-1 text-sm text-gray-400 mt-0.5">
          <MapPin className="w-3.5 h-3.5" /> {club.city}, {club.country}
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <button
            key={d.date}
            onClick={() => { setSelectedDate(d.date); setSelectedSlot(null) }}
            className={cn(
              'flex flex-col items-center shrink-0 w-16 py-2.5 rounded-xl border text-sm font-semibold transition-colors',
              selectedDate === d.date ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            )}
          >
            <span className="text-[11px] font-medium capitalize opacity-80">{d.label}</span>
            <span className="text-base">{d.dayNum}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : courts.length === 0 ? (
        <EmptyState icon={MapPin} title={t('noActiveCourts')} />
      ) : (
        <div className="space-y-5">
          {courts.map((court) => {
            const courtSlots = (slotsByCourtId.get(court.id) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime))
            return (
              <Card key={court.id} className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  {court.sport === 'padel' ? <PadelIcon size={16} className="text-gray-400" /> : <PickleballIcon size={16} className="text-gray-400" />}
                  <h3 className="font-bold text-gray-800 text-sm">{court.name}</h3>
                </div>
                {courtSlots.length === 0 ? (
                  <p className="text-xs text-gray-400">{t('noSlots')}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {courtSlots.map((slot) => {
                      const price = slot.isPeak ? slot.peakPrice : slot.basePrice
                      const isSelected = selectedSlot?.id === slot.id
                      return (
                        <button
                          key={slot.id}
                          disabled={!slot.isAvailable}
                          onClick={() => setSelectedSlot(slot)}
                          className={cn(
                            'flex flex-col items-center px-3 py-2 rounded-xl border text-xs font-semibold min-w-[64px] transition-colors',
                            !slot.isAvailable
                              ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                              : isSelected
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-300'
                          )}
                        >
                          <span>{slot.startTime.slice(0, 5)}</span>
                          <span className={cn('text-[10px] font-normal mt-0.5', isSelected ? 'text-emerald-50' : 'text-gray-400')}>
                            {club.currency} {price.toFixed(0)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {selectedSlot && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-4 py-4 z-30">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-gray-900">
                {courts.find((c) => c.id === selectedSlot.courtId)?.name} · {selectedSlot.startTime.slice(0, 5)}
              </p>
              <p className="text-xs text-gray-400">
                {selectedDate} · {club.currency} {(selectedSlot.isPeak ? selectedSlot.peakPrice : selectedSlot.basePrice).toFixed(0)}
              </p>
              {bookMutation.isError && (
                <p className="flex items-center gap-1 text-xs text-red-600 mt-1"><AlertCircle className="w-3.5 h-3.5" /> {(bookMutation.error as Error).message}</p>
              )}
            </div>
            <button
              onClick={() => bookMutation.mutate()}
              disabled={bookMutation.isPending}
              className="shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2"
            >
              {bookMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('confirmBooking')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
