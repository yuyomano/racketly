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
  Zap,
  CreditCard,
  Clock,
  Wallet,
  MessageCircle,
  Mail,
} from 'lucide-react'
import { buildGoogleCalendarUrl } from '@racketly/utils'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Court = { id: string; name: string; sport: string; capacity: number; surface?: string }
type Club = {
  id: string
  name: string
  city: string
  country: string
  currency: string
  courts: Court[]
  bookingHorizonDays?: number
  cancellationPolicy?: 'flexible' | 'moderate' | 'strict'
}
type Slot = {
  id: string
  courtId: string
  court: { id: string; name: string; sport: string; capacity: number; surface?: string }
  date: string
  startTime: string
  endTime: string
  basePrice: number
  peakPrice: number
  isPeak: boolean
  isAvailable: boolean
}
type Pricing = {
  pricingType: 'pay_per_use' | 'membership_included' | 'membership_extra'
  price: number
  pricePerPlayer?: number
}
type PlayerItem = { id: string; name: string; email?: string; avatarUrl?: string; city?: string }
type RosterPlayer = PlayerItem & { pay: boolean; isGuest?: boolean }
type PlayerFilter = 'club' | 'withMe' | 'city' | 'all'
type MembershipPlan = {
  id: string
  name: string
  price: number
  currency: string
  sessionsPerDay: number
}
type Membership = { clubId: string; status: string; plan?: MembershipPlan }

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

async function fetchPricing(
  userId: string,
  clubId: string,
  slotId: string
): Promise<Pricing | null> {
  const res = await fetch(
    `/api/memberships/pricing?userId=${userId}&clubId=${clubId}&slotId=${slotId}`
  )
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

async function fetchMembershipPlans(clubId: string): Promise<MembershipPlan[]> {
  const res = await fetch(`/api/clubs/${clubId}/membership-plans`)
  if (!res.ok) return []
  const data = await res.json()
  return data.data ?? []
}

async function fetchMyMemberships(userId: string): Promise<Membership[]> {
  const res = await fetch(`/api/memberships/user/${userId}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.data ?? []
}

async function subscribeMembership(planId: string) {
  const res = await fetch('/api/memberships/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error)
  return data.data
}

async function searchPlayers(
  query: string,
  excludeId: string,
  clubId: string,
  filter: PlayerFilter
): Promise<PlayerItem[]> {
  const params = new URLSearchParams({ q: query, excludeId, clubId, filter })
  const res = await fetch(`/api/users/search?${params.toString()}`)
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
  const days = useMemo(
    () => nextDays(club.bookingHorizonDays ?? 7, locale),
    [locale, club.bookingHorizonDays]
  )
  const [selectedDate, setSelectedDate] = useState(days[0].date)
  const [selectedSport, setSelectedSport] = useState<string | null>(null)
  const [selectedSurface, setSelectedSurface] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const initialPlayers = useMemo<RosterPlayer[]>(
    () =>
      partnerUserId && partnerName ? [{ id: partnerUserId, name: partnerName, pay: false }] : [],
    [partnerUserId, partnerName]
  )
  const [players, setPlayers] = useState<RosterPlayer[]>(initialPlayers)
  const [ownerPay, setOwnerPay] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'mercadopago'>('card')
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>('club')
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerQuery, setPlayerQuery] = useState('')
  const [guestName, setGuestName] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setPlayerQuery(playerSearch), 400)
    return () => clearTimeout(timer)
  }, [playerSearch])

  const { data: playerResults, isFetching: searchingPlayers } = useQuery({
    queryKey: ['user-search', playerQuery, playerFilter, club.id],
    queryFn: () => searchPlayers(playerQuery, userId, club.id, playerFilter),
    enabled: playerFilter !== 'all' || playerQuery.trim().length >= 2,
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

  const { data: membershipPlans } = useQuery({
    queryKey: ['membership-plans', club.id],
    queryFn: () => fetchMembershipPlans(club.id),
  })

  const { data: myMemberships } = useQuery({
    queryKey: ['my-memberships', userId],
    queryFn: () => fetchMyMemberships(userId),
  })
  const activeMembership = myMemberships?.find((m) => m.clubId === club.id && m.status === 'active')

  const subscribeMutation = useMutation({
    mutationFn: subscribeMembership,
    onSuccess: () => {
      toast.success(t('membershipSubscribedToast'))
      queryClient.invalidateQueries({ queryKey: ['my-memberships', userId] })
    },
    onError: (e: Error) => toast.error(e.message || t('membershipSubscribeError')),
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
          ownerPay,
          paymentMethod,
          pricingType: pricing?.pricingType,
          players: players.map((p) => ({
            ...(p.isGuest ? {} : { userId: p.id }),
            name: p.name,
            pay: p.pay,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('bookError'))
      return data.data
    },
    onSuccess: (result) => {
      setQrCode(result?.booking?.qrCode ?? null)
      setBookingId(result?.booking?.id ?? null)
      setConfirmed(true)
      toast.success(t('bookingConfirmedToast'))
      queryClient.invalidateQueries({ queryKey: ['availability', club.id, selectedDate] })
      queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] })
    },
  })

  const courts = club.courts ?? []
  // Filtros rápidos de deporte/superficie — solo se muestran si el club tiene pistas mixtas.
  const sports = useMemo(() => [...new Set((slots ?? []).map((s) => s.court.sport))], [slots])
  const surfaces = useMemo(
    () => [...new Set((slots ?? []).map((s) => s.court.surface).filter((s): s is string => !!s))],
    [slots]
  )
  const availableSlots = (slots ?? []).filter(
    (s) =>
      s.isAvailable &&
      (selectedSport === null || s.court.sport === selectedSport) &&
      (selectedSurface === null || s.court.surface === selectedSurface)
  )
  // Grid pistas × horas — mismo criterio visual que BookingPickerOptimized (mobile) y
  // CourtScheduleGrid (dashboard): filas = horas, columnas = pistas, celda = pista+hora.
  const gridCourts = useMemo(() => {
    const map = new Map<string, Slot['court']>()
    availableSlots.forEach((s) => map.set(s.court.id, s.court))
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [availableSlots])
  const gridTimes = useMemo(
    () => [...new Set(availableSlots.map((s) => s.startTime))].sort(),
    [availableSlots]
  )
  function slotAt(courtId: string, time: string) {
    return availableSlots.find((s) => s.court.id === courtId && s.startTime === time) ?? null
  }

  const capacity = selectedSlot?.court.capacity || 4
  const missingPlayers = Math.max(0, capacity - (players.length + 1))
  const rosterComplete = missingPlayers === 0

  function addPlayer(p: PlayerItem) {
    if (players.find((x) => x.id === p.id)) return
    if (players.length + 1 >= capacity) return
    setPlayers((prev) => [...prev, { ...p, pay: false }])
    setPlayerSearch('')
    setPlayerQuery('')
  }
  function addGuest(name: string) {
    if (!name.trim() || players.length + 1 >= capacity) return
    setPlayers((prev) => [
      ...prev,
      {
        id: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        pay: false,
        isGuest: true,
      },
    ])
    setGuestName('')
  }
  function removePlayer(id: string) {
    setPlayers((prev) => prev.filter((p) => p.id !== id))
  }
  function togglePlayerPay(id: string) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, pay: !p.pay } : p)))
  }

  const rawSlotPrice = selectedSlot
    ? selectedSlot.isPeak
      ? selectedSlot.peakPrice
      : selectedSlot.basePrice
    : 0
  const isMembershipIncluded = pricing?.pricingType === 'membership_included'
  const perPlayerPrice = isMembershipIncluded
    ? 0
    : (pricing?.pricePerPlayer ?? rawSlotPrice / capacity)
  const ownerCoveredByCredit = !isMembershipIncluded && (creditTotal ?? 0) >= perPlayerPrice
  const payingExtras = players.filter((p) => p.pay).length
  const payingCount = (ownerPay && !ownerCoveredByCredit ? 1 : 0) + payingExtras
  const finalPrice = isMembershipIncluded ? 0 : perPlayerPrice * payingCount
  const priceNote =
    finalPrice === 0
      ? isMembershipIncluded
        ? t('priceCoveredMembership')
        : ownerCoveredByCredit
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
          <p className="text-xs text-ink-400 mt-1">
            {t('bookingWithPartner', { name: partnerName })}
          </p>
        )}
        {qrCode && (
          <div className="mt-6 inline-flex flex-col items-center gap-2 bg-white border border-ink-100 rounded-2xl p-5">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, no next/image optimization to be done */}
            <img src={qrCode} alt={t('qrHint')} className="w-40 h-40" />
            <p className="text-xs text-ink-400 max-w-[200px]">{t('qrHint')}</p>
          </div>
        )}
        {selectedSlot && (
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            <a
              href={buildGoogleCalendarUrl({
                title: `${club.name} · ${selectedSlot.court.name}`,
                location: club.name,
                description: 'Reserva hecha en Racketly',
                date: selectedSlot.date,
                startTime: selectedSlot.startTime,
                endTime: selectedSlot.endTime,
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-court-700 bg-court-50 hover:bg-court-100 rounded-xl px-4 py-2 transition-colors"
            >
              <CalendarPlus className="w-4 h-4" /> {t('addToCalendar')}
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                t('shareMessage', {
                  club: club.name,
                  court: selectedSlot.court.name,
                  date: selectedSlot.date,
                  time: selectedSlot.startTime.slice(0, 5),
                  link: bookingId ? `${window.location.origin}/booking/mine?b=${bookingId}` : '',
                })
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl px-4 py-2 transition-colors"
            >
              <MessageCircle className="w-4 h-4" /> {t('shareWhatsApp')}
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(t('shareEmailSubject', { club: club.name }))}&body=${encodeURIComponent(
                t('shareMessage', {
                  club: club.name,
                  court: selectedSlot.court.name,
                  date: selectedSlot.date,
                  time: selectedSlot.startTime.slice(0, 5),
                  link: bookingId ? `${window.location.origin}/booking/mine?b=${bookingId}` : '',
                })
              )}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 bg-ink-100 hover:bg-ink-200 rounded-xl px-4 py-2 transition-colors"
            >
              <Mail className="w-4 h-4" /> {t('shareEmail')}
            </a>
          </div>
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

      {(membershipPlans?.length ?? 0) > 0 &&
        (activeMembership ? (
          <div className="flex items-center justify-between gap-3 bg-court-900 text-white rounded-2xl px-4 py-3.5">
            <div>
              <p className="text-sm font-extrabold">{t('membershipActiveTitle')}</p>
              <p className="text-xs text-court-300 mt-0.5">
                {t('membershipActiveSub', {
                  sessions: activeMembership.plan?.sessionsPerDay ?? 1,
                  currency: activeMembership.plan?.currency ?? club.currency,
                  price: Number(activeMembership.plan?.price ?? 0).toLocaleString(),
                })}
              </p>
            </div>
            <Link
              href="/memberships/mine"
              className="shrink-0 text-xs font-bold bg-white/15 hover:bg-white/25 rounded-lg px-3 py-2 transition-colors"
            >
              {t('membershipManage')}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            {membershipPlans!.map((plan) => (
              <Card
                key={plan.id}
                className="p-4 flex-1 flex items-center justify-between gap-3 border-2 border-court-100"
              >
                <div>
                  <p className="text-sm font-extrabold text-court-900">{plan.name}</p>
                  <p className="text-xs text-ink-500 mt-1">
                    {t('membershipFeatureIncluded', { sessions: plan.sessionsPerDay })}
                  </p>
                  <p className="text-xs text-ink-400">{t('membershipFeatureExtra')}</p>
                  <p className="text-xs text-ink-400">{t('membershipFeatureCancel')}</p>
                </div>
                <div className="shrink-0 text-center">
                  <p className="text-sm font-black text-court-600">
                    {plan.currency} {Number(plan.price).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-ink-400 mb-2">{t('membershipPricePerMonth')}</p>
                  <button
                    onClick={() => subscribeMutation.mutate(plan.id)}
                    disabled={subscribeMutation.isPending}
                    className="text-xs font-bold text-white bg-court-600 hover:bg-court-700 disabled:opacity-60 rounded-lg px-3 py-2 transition-colors"
                  >
                    {subscribeMutation.isPending
                      ? t('membershipSubscribing')
                      : t('membershipSubscribe')}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        ))}

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

      {(sports.length > 1 || surfaces.length > 1) && (
        <div className="flex flex-wrap gap-2">
          {sports.length > 1 && (
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  setSelectedSport(null)
                  setSelectedSlot(null)
                }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
                  selectedSport === null
                    ? 'bg-court-600 text-white'
                    : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                )}
              >
                {t('filterAllSports')}
              </button>
              {sports.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSelectedSport(s)
                    setSelectedSlot(null)
                  }}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
                    selectedSport === s
                      ? 'bg-court-600 text-white'
                      : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                  )}
                >
                  {s === 'padel' ? <PadelIcon size={12} /> : <PickleballIcon size={12} />}
                  {s === 'padel' ? t('sportPadel') : t('sportPickleball')}
                </button>
              ))}
            </div>
          )}
          {surfaces.length > 1 && (
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  setSelectedSurface(null)
                  setSelectedSlot(null)
                }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                  selectedSurface === null
                    ? 'bg-court-600 border-court-600 text-white'
                    : 'bg-white border-ink-200 text-ink-500 hover:border-ink-300'
                )}
              >
                {t('filterAllSurfaces')}
              </button>
              {surfaces.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSelectedSurface(s)
                    setSelectedSlot(null)
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                    selectedSurface === s
                      ? 'bg-court-600 border-court-600 text-white'
                      : 'bg-white border-ink-200 text-ink-500 hover:border-ink-300'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : courts.length === 0 ? (
        <EmptyState icon={MapPin} title={t('noActiveCourts')} />
      ) : gridTimes.length === 0 || gridCourts.length === 0 ? (
        <EmptyState icon={MapPin} title={t('noSlots')} />
      ) : (
        <Card className="p-4 overflow-x-auto">
          <table className="border-separate border-spacing-1.5 w-full">
            <thead>
              <tr>
                <th className="w-14" />
                {gridCourts.map((court) => (
                  <th key={court.id} className="text-center px-1 pb-2 min-w-[92px]">
                    <span className="flex items-center justify-center gap-1 text-xs font-bold text-ink-900">
                      {court.sport === 'padel' ? (
                        <PadelIcon size={13} />
                      ) : (
                        <PickleballIcon size={13} />
                      )}
                      {court.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gridTimes.map((time) => (
                <tr key={time}>
                  <td className="text-xs font-bold text-ink-500 text-right pr-2">
                    {time.slice(0, 5)}
                  </td>
                  {gridCourts.map((court) => {
                    const slot = slotAt(court.id, time)
                    if (!slot) {
                      return (
                        <td key={court.id}>
                          <div className="flex items-center justify-center min-h-[44px] rounded-xl bg-ink-50 border border-ink-100 text-ink-300 text-sm">
                            —
                          </div>
                        </td>
                      )
                    }
                    const price = slot.isPeak ? slot.peakPrice : slot.basePrice
                    const isSelected = selectedSlot?.id === slot.id
                    return (
                      <td key={court.id}>
                        <button
                          onClick={() => {
                            setSelectedSlot(slot)
                            setPlayers(initialPlayers)
                          }}
                          className={cn(
                            'flex flex-col items-center justify-center w-full min-h-[44px] px-2 py-1.5 rounded-xl border text-xs font-semibold transition-colors',
                            isSelected
                              ? 'bg-court-600 border-court-600 text-white'
                              : slot.isPeak
                                ? 'bg-trophy-50 border-trophy-400 text-ink-700 hover:border-trophy-500'
                                : 'bg-court-50 border-court-200 text-ink-700 hover:border-court-400'
                          )}
                        >
                          <span>
                            {club.currency} {price.toFixed(0)}
                          </span>
                          {slot.isPeak && (
                            <span
                              className={cn(
                                'flex items-center gap-0.5 text-[9px] font-bold mt-0.5 px-1 py-0.5 rounded',
                                isSelected
                                  ? 'bg-white/20 text-white'
                                  : 'bg-trophy-100 text-trophy-700'
                              )}
                            >
                              <Zap className="w-2.5 h-2.5" /> {t('peakBadge')}
                            </span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
            {isMembershipIncluded ? (
              <span className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-court-100 text-court-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t('coveredByMembership')}
              </span>
            ) : ownerCoveredByCredit ? (
              <span className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-court-100 text-court-700">
                <Wallet className="w-3.5 h-3.5" /> {t('coveredByCreditTag')}
              </span>
            ) : (
              <button
                onClick={() => setOwnerPay((v) => !v)}
                className={cn(
                  'shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors',
                  ownerPay
                    ? 'bg-court-100 text-court-700'
                    : 'bg-white text-ink-500 border border-ink-200'
                )}
              >
                {ownerPay ? (
                  <CreditCard className="w-3.5 h-3.5" />
                ) : (
                  <Clock className="w-3.5 h-3.5" />
                )}
                {ownerPay ? t('payNow') : t('payLater')}
              </button>
            )}
          </div>

          {players.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 bg-ink-50 rounded-xl px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900 truncate">
                  {p.name}{' '}
                  {p.isGuest && <span className="text-ink-400 font-normal">· {t('guestTag')}</span>}
                </p>
                {p.city && <p className="text-xs text-ink-400">{p.city}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => togglePlayerPay(p.id)}
                  className={cn(
                    'flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors',
                    p.pay
                      ? 'bg-court-100 text-court-700'
                      : 'bg-white text-ink-500 border border-ink-200'
                  )}
                >
                  {p.pay ? (
                    <CreditCard className="w-3.5 h-3.5" />
                  ) : (
                    <Clock className="w-3.5 h-3.5" />
                  )}
                  {p.pay ? t('payNow') : t('payLater')}
                </button>
                <button
                  onClick={() => removePlayer(p.id)}
                  aria-label={t('removePlayerLabel')}
                  className="text-ink-300 hover:text-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
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
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(
              [
                ['club', t('filterClub')],
                ['withMe', t('filterWithMe')],
                ['city', t('filterCity')],
                ['all', t('filterAllPlayers')],
              ] as [PlayerFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setPlayerFilter(value)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
                  playerFilter === value
                    ? 'bg-court-600 text-white'
                    : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                )}
              >
                {label}
              </button>
            ))}
          </div>

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

          <div className="space-y-1 h-72 overflow-y-auto">
            {playerFilter === 'all' && playerQuery.trim().length < 2 ? (
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

          <div className="border-t border-ink-100 pt-3 flex items-center gap-2">
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addGuest(guestName)}
              placeholder={t('guestNamePlaceholder')}
              className="flex-1 text-sm outline-none border border-ink-200 rounded-xl px-3 py-2"
            />
            <button
              onClick={() => addGuest(guestName)}
              disabled={!guestName.trim()}
              className="shrink-0 text-xs font-bold text-white bg-court-600 hover:bg-court-700 disabled:opacity-50 rounded-xl px-3.5 py-2 transition-colors"
            >
              {t('addGuestButton')}
            </button>
          </div>
        </div>
      </Modal>

      {selectedSlot && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-ink-100 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-4 py-4 z-30">
          <div className="max-w-5xl mx-auto space-y-3">
            {finalPrice > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => setPaymentMethod('card')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors',
                    paymentMethod === 'card'
                      ? 'bg-court-50 border-court-500 text-court-700'
                      : 'bg-white border-ink-200 text-ink-500'
                  )}
                >
                  <CreditCard className="w-3.5 h-3.5" /> {t('paymentCard')}
                </button>
                <button
                  disabled
                  title={t('paymentComingSoon')}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-ink-100 text-ink-300 bg-ink-50 cursor-not-allowed"
                >
                  {t('paymentMercadoPago')}
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-ink-900">
                  {selectedSlot.court.name} · {selectedSlot.startTime.slice(0, 5)}
                </p>
                <p className="text-xs text-ink-400">
                  {selectedDate} ·{' '}
                  {finalPrice === 0 ? (
                    <span className="font-semibold text-court-600">
                      {priceNote ?? t('priceFree')}
                    </span>
                  ) : (
                    <>
                      {club.currency} {finalPrice.toFixed(0)} ·{' '}
                      {t('payingCountLabel', { count: payingCount })}
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
        </div>
      )}
    </div>
  )
}
