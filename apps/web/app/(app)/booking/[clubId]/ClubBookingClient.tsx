'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  MapPin,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Handshake,
  CalendarPlus,
  UserPlus,
  X,
  Search,
} from 'lucide-react'
import { buildGoogleCalendarUrl } from '@racketly/utils'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Court = { id: string; name: string; sport: string; capacity: number }
type Club = {
  id: string
  name: string
  city: string
  country: string
  currency: string
  courts: Court[]
  cancellationPolicy?: 'flexible' | 'moderate' | 'strict'
}
type Slot = {
  id: string
  courtId: string
  date: string
  startTime: string
  endTime: string
  basePrice: number
  peakPrice: number
  isPeak: boolean
  isAvailable: boolean
}
type Pricing = { pricingType: 'pay_per_use' | 'membership_included' | 'membership_extra'; price: number }
type PlayerItem = { id: string; name: string; email?: string; avatarUrl?: string; city?: string }

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

async function fetchAvailability(
  clubId: string,
  date: string,
  fetchErrorMessage: string
): Promise<Slot[]> {
  const res = await fetch(`/api/clubs/${clubId}/availability?date=${date}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? fetchErrorMessage)
  return data.data ?? []
}

async function fetchPricing(userId: string, clubId: string, slotId: string): Promise<Pricing | null> {
  const res = await fetch(`/api/memberships/pricing?userId=${userId}&clubId=${clubId}&slotId=${slotId}`)
  if (!res.ok) return null
  const data = await res.json()
  return data.data ?? null
}

async function fetchCreditTotal(userId: string, clubId: string): Promise<number> {
  const res = await fetch(`/api/credits/user/${userId}?clubId=${clubId}`)
  if (!res.ok) return 0
  const data = await res.json()
  return data.summary?.[clubId]?.total ?? 0
}

async function searchPlayers(query: string, excludeId: string): Promise<PlayerItem[]> {
  const res = await fetch(
    `/api/users/search?q=${encodeURIComponent(query)}&excludeId=${encodeURIComponent(excludeId)}`
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.data ?? []
}

export function ClubBookingClient({
  club,
  userId,
  displayName,
  partnerUserId,
  partnerName,
}: {
  club: Club
  userId: string
  displayName: string
  partnerUserId?: string
  partnerName?: string
}) {
  const t = useTranslations('Booking.clubDetail')
  const locale = useLocale()
  const queryClient = useQueryClient()
  const toast = useToast()
  const days = useMemo(() => nextDays(7, locale), [locale])
  const [selectedDate, setSelectedDate] = useState(days[0].date)
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const initialPlayers = useMemo<PlayerItem[]>(
    () => (partnerUserId && partnerName ? [{ id: partnerUserId, name: partnerName }] : []),
    [partnerUserId, partnerName]
  )
  const [players, setPlayers] = useState<PlayerItem[]>(initialPlayers)
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerQuery, setPlayerQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setPlayerQuery(playerSearch), 400)
    return () => clearTimeout(timer)
  }, [playerSearch])

  const { data: playerResults, isFetching: searchingPlayers } = useQuery({
    queryKey: ['user-search', playerQuery],
    queryFn: () => searchPlayers(playerQuery, userId),
    enabled: playerQuery.trim().length >= 2,
  })

  const { data: slots, isLoading } = useQuery({
    queryKey: ['availability', club.id, selectedDate],
    queryFn: () => fetchAvailability(club.id, selectedDate, t('fetchAvailabilityError')),
  })

  const { data: pricing } = useQuery({
    queryKey: ['booking-pricing', userId, club.id, selectedSlot?.id],
    queryFn: () => fetchPricing(userId, club.id, selectedSlot!.id),
    enabled: !!selectedSlot,
  })

  const { data: creditTotal } = useQuery({
    queryKey: ['user-credit-total', userId, club.id],
    queryFn: () => fetchCreditTotal(userId, club.id),
    enabled: !!selectedSlot,
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
          players: players.map((p) => ({ userId: p.id, name: p.name })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('bookError'))
      return data.data
    },
    onSuccess: (result) => {
      setQrCode(result?.booking?.qrCode ?? null)
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
  const activeCourtId = selectedCourtId ?? courts[0]?.id ?? null
  const activeCourt = courts.find((c) => c.id === activeCourtId) ?? null
  const activeCourtSlots = (slotsByCourtId.get(activeCourtId ?? '') ?? []).sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  )

  const capacity = activeCourt?.capacity || 4
  const missingPlayers = Math.max(0, capacity - (players.length + 1))
  const rosterComplete = missingPlayers === 0

  function addPlayer(p: PlayerItem) {
    if (players.find((x) => x.id === p.id)) return
    if (players.length + 1 >= capacity) return
    setPlayers((prev) => [...prev, p])
    setPlayerSearch('')
    setPlayerQuery('')
  }
  function removePlayer(id: string) {
    setPlayers((prev) => prev.filter((p) => p.id !== id))
  }

  const rawSlotPrice = selectedSlot
    ? selectedSlot.isPeak
      ? selectedSlot.peakPrice
      : selectedSlot.basePrice
    : 0
  const membershipPrice = pricing?.price ?? rawSlotPrice
  const coveredByCredit =
    (pricing?.pricingType ?? 'pay_per_use') === 'pay_per_use' && (creditTotal ?? 0) >= membershipPrice
  const finalPrice = coveredByCredit ? 0 : membershipPrice
  const priceNote =
    finalPrice === 0
      ? pricing?.pricingType === 'membership_included'
        ? t('priceCoveredMembership')
        : coveredByCredit
          ? t('priceCoveredCredit')
          : null
      : null

  const CANCELLATION_LABEL: Record<'flexible' | 'moderate' | 'strict', string> = {
    flexible: t('cancellationFlexible'),
    moderate: t('cancellationModerate'),
    strict: t('cancellationStrict'),
  }

  if (confirmed) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="w-14 h-14 rounded-2xl bg-court-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-court-600" />
        </div>
        <h1 className="text-lg font-bold text-ink-900">{t('confirmedTitle')}</h1>
        <p className="text-sm text-ink-400 mt-1.5">
          {club.name} · {selectedSlot?.date} · {selectedSlot?.startTime.slice(0, 5)}
        </p>
        {partnerName && (
          <p className="text-xs text-ink-400 mt-1">{t('bookingWithPartner', { name: partnerName })}</p>
        )}
        {qrCode && (
          <div className="mt-6 inline-flex flex-col items-center gap-2 bg-white border border-ink-100 rounded-2xl p-5">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, no next/image optimization to be done */}
            <img src={qrCode} alt={t('qrHint')} className="w-40 h-40" />
            <p className="text-xs text-ink-400 max-w-[200px]">{t('qrHint')}</p>
          </div>
        )}
        {selectedSlot && (
          <a
            href={buildGoogleCalendarUrl({
              title: `${club.name} · ${courts.find((c) => c.id === selectedSlot.courtId)?.name ?? ''}`,
              location: club.name,
              description: 'Reserva hecha en Racketly',
              date: selectedSlot.date,
              startTime: selectedSlot.startTime,
              endTime: selectedSlot.endTime,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-court-700 bg-court-50 hover:bg-court-100 rounded-xl px-4 py-2 transition-colors"
          >
            <CalendarPlus className="w-4 h-4" /> {t('addToCalendar')}
          </a>
        )}
        <div className="flex gap-3 mt-6 justify-center">
          <Link
            href="/booking/mine"
            className="text-sm font-semibold text-white bg-court-600 hover:bg-court-700 rounded-xl px-5 py-2.5 transition-colors"
          >
            {t('viewMyBookings')}
          </Link>
          <Link
            href="/booking"
            className="text-sm font-semibold text-ink-600 bg-ink-100 hover:bg-ink-200 rounded-xl px-5 py-2.5 transition-colors"
          >
            {t('bookAnother')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24">
      <Link
        href="/booking"
        className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('backToClubs')}
      </Link>

      <div>
        <h1 className="text-xl font-black text-ink-900 tracking-tight">{club.name}</h1>
        <p className="flex items-center gap-1 text-sm text-ink-400 mt-0.5">
          <MapPin className="w-3.5 h-3.5" /> {club.city}, {club.country}
        </p>
        <p className="text-xs text-ink-400 mt-1">
          {CANCELLATION_LABEL[club.cancellationPolicy ?? 'flexible']}
        </p>
      </div>

      {partnerUserId && partnerName && (
        <div className="flex items-center gap-1.5 text-sm font-semibold text-court-700 bg-court-50 px-3.5 py-2 rounded-xl w-fit">
          <Handshake className="w-4 h-4" /> {t('bookingWithPartner', { name: partnerName })}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <button
            key={d.date}
            onClick={() => {
              setSelectedDate(d.date)
              setSelectedSlot(null)
            }}
            className={cn(
              'flex flex-col items-center shrink-0 w-16 py-2.5 rounded-xl border text-sm font-semibold transition-colors',
              selectedDate === d.date
                ? 'bg-court-600 border-court-600 text-white'
                : 'bg-white border-ink-200 text-ink-500 hover:border-ink-300'
            )}
          >
            <span className="text-[11px] font-medium capitalize opacity-80">{d.label}</span>
            <span className="text-base">{d.dayNum}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : courts.length === 0 ? (
        <EmptyState icon={MapPin} title={t('noActiveCourts')} />
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {courts.map((court) => (
              <button
                key={court.id}
                onClick={() => {
                  setSelectedCourtId(court.id)
                  setSelectedSlot(null)
                  setPlayers(initialPlayers)
                }}
                className={cn(
                  'flex items-center gap-1.5 shrink-0 px-3.5 py-2 rounded-xl border text-sm font-semibold transition-colors',
                  activeCourtId === court.id
                    ? 'bg-court-600 border-court-600 text-white'
                    : 'bg-white border-ink-200 text-ink-500 hover:border-ink-300'
                )}
              >
                {court.sport === 'padel' ? (
                  <PadelIcon size={14} />
                ) : (
                  <PickleballIcon size={14} />
                )}
                {court.name}
              </button>
            ))}
          </div>
          {activeCourt && (
            <Card className="p-5">
              {activeCourtSlots.length === 0 ? (
                <p className="text-xs text-ink-400">{t('noSlots')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {activeCourtSlots.map((slot) => {
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
                            ? 'bg-ink-50 border-ink-100 text-ink-300 cursor-not-allowed'
                            : isSelected
                              ? 'bg-court-600 border-court-600 text-white'
                              : 'bg-white border-ink-200 text-ink-700 hover:border-court-300'
                        )}
                      >
                        <span>{slot.startTime.slice(0, 5)}</span>
                        <span
                          className={cn(
                            'text-[10px] font-normal mt-0.5',
                            isSelected ? 'text-court-50' : 'text-ink-400'
                          )}
                        >
                          {club.currency} {price.toFixed(0)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {selectedSlot && (
        <Card className="p-5 space-y-3">
          <p className="text-sm font-bold text-ink-900">
            {t('rosterTitle', { count: players.length + 1, capacity })}
          </p>

          {missingPlayers > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 text-amber-800 text-xs rounded-xl px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p>{t('rosterMissing', { count: missingPlayers, capacity })}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 bg-ink-50 rounded-xl px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-ink-900">{t('ownerLabel')}</p>
              <p className="text-xs text-ink-400">{displayName}</p>
            </div>
          </div>

          {players.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 bg-ink-50 rounded-xl px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900 truncate">{p.name}</p>
                {p.city && <p className="text-xs text-ink-400">{p.city}</p>}
              </div>
              <button
                onClick={() => removePlayer(p.id)}
                aria-label={t('removePlayerLabel')}
                className="shrink-0 text-ink-300 hover:text-red-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          {players.length + 1 >= capacity ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-court-700 bg-court-50 rounded-xl px-3 py-2.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t('rosterFull', { capacity })}
            </div>
          ) : (
            <button
              onClick={() => setShowAddPlayer(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-court-700 bg-court-50 hover:bg-court-100 rounded-xl px-3.5 py-2.5 transition-colors w-full justify-center"
            >
              <UserPlus className="w-4 h-4" /> {t('addPlayerButton')}
            </button>
          )}
        </Card>
      )}

      <Modal
        open={showAddPlayer}
        onClose={() => setShowAddPlayer(false)}
        title={t('addPlayerModalTitle')}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 border border-ink-200 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-ink-400 shrink-0" />
            <input
              autoFocus
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder={t('playerSearchPlaceholder')}
              className="flex-1 text-sm outline-none"
            />
            {searchingPlayers && <Loader2 className="w-4 h-4 animate-spin text-ink-300" />}
          </div>

          <div className="space-y-1 max-h-72 overflow-y-auto">
            {playerQuery.trim().length < 2 ? (
              <p className="text-xs text-ink-400 text-center py-4">{t('playerSearchHint')}</p>
            ) : (playerResults ?? []).filter((p) => !players.find((x) => x.id === p.id)).length ===
              0 ? (
              <p className="text-xs text-ink-400 text-center py-4">
                {searchingPlayers ? t('playerSearching') : t('playerSearchEmpty')}
              </p>
            ) : (
              (playerResults ?? [])
                .filter((p) => !players.find((x) => x.id === p.id))
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addPlayer(p)}
                    className="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-xl hover:bg-ink-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-court-100 text-court-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900 truncate">{p.name}</p>
                      {p.city && <p className="text-xs text-ink-400 truncate">{p.city}</p>}
                    </div>
                  </button>
                ))
            )}
          </div>
        </div>
      </Modal>

      {selectedSlot && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-ink-100 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-4 py-4 z-30">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-ink-900">
                {courts.find((c) => c.id === selectedSlot.courtId)?.name} ·{' '}
                {selectedSlot.startTime.slice(0, 5)}
              </p>
              <p className="text-xs text-ink-400">
                {selectedDate} ·{' '}
                {finalPrice === 0 ? (
                  <span className="font-semibold text-court-600">{priceNote ?? t('priceFree')}</span>
                ) : (
                  <>
                    {club.currency} {finalPrice.toFixed(0)}
                    {finalPrice < rawSlotPrice && (
                      <span className="line-through text-ink-300 ml-1.5">
                        {club.currency} {rawSlotPrice.toFixed(0)}
                      </span>
                    )}
                  </>
                )}
              </p>
              {bookMutation.isError && (
                <p className="flex items-center gap-1 text-xs text-red-600 mt-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {(bookMutation.error as Error).message}
                </p>
              )}
            </div>
            <button
              onClick={() => bookMutation.mutate()}
              disabled={bookMutation.isPending || !rosterComplete}
              className="shrink-0 bg-court-600 hover:bg-court-700 disabled:opacity-60 text-white font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2"
            >
              {bookMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : !rosterComplete ? (
                t('confirmMissingPlayers', { count: missingPlayers })
              ) : (
                t('confirmBooking')
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
