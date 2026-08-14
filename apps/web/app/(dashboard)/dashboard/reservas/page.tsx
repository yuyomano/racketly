'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, CheckCircle2, Clock, XCircle, Wallet, RefreshCw, Plus, X, UserPlus, List, LayoutGrid } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { Table, TableHead, TableBody, TableRow, Th, Td, TableSpanRow } from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { bookingStatusMeta, bookingStatusLabel } from '@/lib/booking-status'
import { CourtScheduleGrid } from '@/components/dashboard/CourtScheduleGrid'

type PlayerEntry = {
  userId?: string
  guestId?: string
  name: string
  avatarUrl?: string
  amountOwed?: number
  amountPaid?: number
  paymentStatus?: 'paid' | 'pending' | 'courtesy'
  courtesyReason?: string
  coveredBy?: 'membership' | 'credit' | null
  paymentMethod?: 'cash' | 'card'
}

type BookingRow = {
  id: string
  status: string
  amountPaid: number
  currency: string
  players: PlayerEntry[]
  slot: {
    date: string
    startTime: string
    endTime: string
    court: { id: string; name: string; sport: string; capacity: number }
  }
  userId: string
}

type ClassBookingRow = {
  id: string
  studentUserId: string
  studentName: string
  amountOwed: number
  amountPaid: number
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded'
  paymentMethod: 'cash' | 'card' | null
  status: string
}

type ClassSlotRow = {
  id: string
  courtId: string | null
  date: string
  startTime: string
  durationMinutes: number
  maxStudents: number
  price: number
  currency: string
  notes: string | null
  status: string
  professor: { name: string; isExternal: boolean; sport: string }
  court: { id: string; name: string } | null
  bookings: ClassBookingRow[]
}

function bookingHasPendingPayment(b: BookingRow) {
  if (b.players.some((p) => p.paymentStatus === 'pending')) return true
  // Si faltan jugadores para completar la cancha, la reserva tiene pagos pendientes
  const capacity = b.slot?.court?.capacity ?? 4
  return b.players.length < capacity
}

function effectiveAmountPaid(b: BookingRow): number {
  const hasOwed = b.players.some((p) => p.amountOwed != null)
  if (hasOwed) return b.players.reduce((s, p) => s + (p.amountPaid ?? 0), 0)
  return b.amountPaid ?? 0
}

function courtesyCount(bookings: BookingRow[]) {
  return bookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((count, b) => count + b.players.filter((p) => p.paymentStatus === 'courtesy').length, 0)
}

function ingresosByCurrency(bookings: BookingRow[]) {
  const map: Record<string, number> = {}
  bookings
    .filter((b) => b.status !== 'cancelled')
    .forEach((b) => {
      const cur = b.currency || 'COP'
      map[cur] = (map[cur] ?? 0) + effectiveAmountPaid(b)
    })
  return map
}

function formatIngresos(map: Record<string, number>): { primary: string; sub?: string } {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return { primary: formatCurrency(0) }
  const [topCur, topAmt] = entries[0]
  const primary = formatCurrency(topAmt, topCur)
  const sub = entries.length > 1
    ? entries.slice(1).map(([c, a]) => formatCurrency(a, c)).join(' • ')
    : undefined
  return { primary, sub }
}

type CourtRow = {
  id: string; name: string; sport: 'padel' | 'pickleball'
  isActive: boolean
  openTimeWeekday: string; closeTimeWeekday: string
  openTimeWeekend: string; closeTimeWeekend: string
  slotDuration: number
}

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function fmtMin(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
// Hora inicial por defecto de la cuadrícula: una hora antes de la actual (redondeada
// hacia abajo), para que el club vea de una vez lo que está por empezar sin tener que
// desplazarse. Nunca antes de medianoche.
function defaultGridHourFrom() {
  const h = Math.max(0, new Date().getHours() - 1)
  return `${String(h).padStart(2, '0')}:00`
}

type UserResult = { id: string; name: string; email: string; city?: string }
type SlotRow = {
  id: string; startTime: string; endTime: string; isAvailable: boolean; isPeak: boolean
  basePrice: number; peakPrice: number; currency: string; court: { id: string; name: string; sport: string; capacity: number }
  isBlocked?: boolean; blockedReason?: string | null; blockedForUserId?: string | null; blockedExpiresAt?: string | null
}


// ── Botones "Marcar pagado" (efectivo / tarjeta) ────────────────────────────────
// Reemplaza el antiguo botón único "💰 Pagar": para el cuadre de caja el admin tiene
// que decir con qué método cobró en persona, así que son dos botones chicos en vez de uno.
function MarkPaidButtons({ isPending, onMark }: { isPending: boolean; onMark: (method: 'cash' | 'card') => void }) {
  const t = useTranslations('Reservas')
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={() => onMark('cash')}
        disabled={isPending}
        title={t('markPaid.efectivoTitle')}
        className="text-xs font-semibold text-amber-600 hover:text-amber-800 border border-amber-200 hover:border-amber-400 bg-amber-50 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
      >
        {isPending ? '…' : t('markPaid.efectivo')}
      </button>
      <button
        onClick={() => onMark('card')}
        disabled={isPending}
        title={t('markPaid.tarjetaTitle')}
        className="text-xs font-semibold text-sky-600 hover:text-sky-800 border border-sky-200 hover:border-sky-400 bg-sky-50 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
      >
        {isPending ? '…' : t('markPaid.tarjeta')}
      </button>
    </div>
  )
}

// ── User search hook ──────────────────────────────────────────────────────────
function useUserSearch(q: string) {
  const [results, setResults] = useState<UserResult[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
        const json = await res.json()
        setResults(json.data ?? [])
      } finally { setLoading(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [q])
  return { results, loading }
}

export default function ReservasPage() {
  const t = useTranslations('Reservas')
  const [clubId, setClubId] = useState<string | null>(null)
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [courts, setCourts] = useState<CourtRow[]>([])
  const [classSlots, setClassSlots] = useState<ClassSlotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Grilla horaria (pistas × horas) como vista por defecto — es la que responde de
  // un vistazo "¿qué está pasando ahora en el club?"; la tabla plana queda como alternativa.
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid')

  const [statusFilter, setStatusFilter] = useState('confirmed')
  const [sportFilter,  setSportFilter]  = useState('all')
  const [search, setSearch]             = useState('')
  const [dateFilter, setDateFilter]     = useState<'all' | 'today' | 'custom'>('today')
  const [customDate, setCustomDate]     = useState(new Date().toISOString().split('T')[0])
  const [pendingPaymentOnly, setPendingPaymentOnly] = useState(false)

  // ── Vista de cuadrícula (pistas × horas) ────────────────────────────────────
  const [gridDate, setGridDate]         = useState(new Date().toISOString().split('T')[0])
  const [gridHourFrom, setGridHourFrom] = useState(defaultGridHourFrom)
  const [gridHourTo, setGridHourTo]     = useState('23:00')

  // ── Editar reserva ────────────────────────────────────────────────────────
  const [editBooking, setEditBooking] = useState<BookingRow | null>(null)
  const [editPlayers, setEditPlayers] = useState<{ userId: string; guestId?: string; name: string; isOwner?: boolean }[]>([])
  const [editQ, setEditQ] = useState('')
  const [savingPlayers, setSavingPlayers] = useState(false)
  const { results: editResults, loading: editLoading } = useUserSearch(editQ)

  function openEditPlayers(b: BookingRow) {
    setEditPlayers((b.players ?? []).map((p) => ({ userId: p.userId ?? '', guestId: p.guestId, name: p.name, isOwner: (p as any).isOwner })))
    setEditQ('')
    setEditBooking(b)
  }

  // Identificador único de un jugador para armar rutas /players/:playerId — userId si
  // tiene cuenta, guestId si es un invitado sin cuenta.
  function playerRouteId(p: { userId?: string; guestId?: string }): string {
    return p.userId || p.guestId || ''
  }

  // ── Editar clase (desde la cuadrícula de Reservas) ─────────────────────────
  const [editClassSlot, setEditClassSlot] = useState<ClassSlotRow | null>(null)

  // Abrir automáticamente el modal de edición si se llega con ?edit=<bookingId> o
  // ?editClass=<classSlotId> — usado por los links "Editar" de las reservas de hoy
  // en el Overview del dashboard.
  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId && bookings.length > 0) {
      const target = bookings.find((b) => b.id === editId)
      if (target) openEditPlayers(target)
      router.replace('/dashboard/reservas')
    }
    const editClassId = searchParams.get('editClass')
    if (editClassId && classSlots.length > 0) {
      const target = classSlots.find((s) => s.id === editClassId)
      if (target) setEditClassSlot(target)
      router.replace('/dashboard/reservas')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, classSlots, searchParams])

  // Agregar jugador se persiste de inmediato (no espera a "Guardar jugadores"): así el
  // jugador ya existe en la reserva del backend y se le puede marcar el pago sin error.
  async function handleAddPlayer(u: UserResult) {
    if (!editBooking) return
    const nextPlayers = [...editPlayers, { userId: u.id, name: u.name }]
    setSavingPlayers(true)
    try {
      const res = await fetch(`/api/bookings/${editBooking.id}/players`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: nextPlayers.map((p) => ({ userId: p.userId, name: p.name })) }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      const updatedPlayers = (json.data.players ?? []) as PlayerEntry[]
      setEditPlayers(updatedPlayers.map((p) => ({ userId: p.userId ?? '', name: p.name, isOwner: (p as any).isOwner })))
      setBookings((prev) => prev.map((b) =>
        b.id === editBooking.id ? { ...b, players: updatedPlayers, amountPaid: json.data.amountPaid } : b
      ))
      setEditBooking((prev) =>
        prev && prev.id === editBooking.id ? { ...prev, players: updatedPlayers, amountPaid: json.data.amountPaid } : prev
      )
      setEditQ('')
    } catch (e: any) {
      alert(t('alerts.errorPrefix') + e.message)
    } finally {
      setSavingPlayers(false)
    }
  }

  async function handleSavePlayers() {
    if (!editBooking) return
    setSavingPlayers(true)
    try {
      const res = await fetch(`/api/bookings/${editBooking.id}/players`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: editPlayers.map((p) => ({ userId: p.userId, name: p.name })) }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      const updatedPlayers = (json.data.players ?? []) as PlayerEntry[]
      setBookings((prev) => prev.map((b) =>
        b.id === editBooking.id ? { ...b, players: updatedPlayers, amountPaid: json.data.amountPaid } : b
      ))
      setEditBooking(null)
    } catch (e: any) {
      alert(t('alerts.errorPrefix') + e.message)
    } finally {
      setSavingPlayers(false)
    }
  }

  // ── Marcar pago de jugador ─────────────────────────────────────────────
  const [markingPaid, setMarkingPaid] = useState<string | null>(null) // `${bookingId}|${userId}`

  async function handleMarkPlayerPaid(bookingId: string, playerId: string, paymentMethod: 'cash' | 'card') {
    const key = `${bookingId}|${playerId}`
    setMarkingPaid(key)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/players/${playerId}/pay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      const updatePlayers = (players: PlayerEntry[]) =>
        players.map((p) =>
          (p.userId === playerId || p.guestId === playerId)
            ? { ...p, amountPaid: p.amountOwed ?? p.amountPaid ?? 0, paymentStatus: 'paid' as const, paymentMethod }
            : p
        )
      const recalcAmountPaid = (players: PlayerEntry[]) =>
        players.reduce((sum, p) => sum + (p.amountPaid ?? 0), 0)
      setBookings((prev) => prev.map((b) => {
        if (b.id !== bookingId) return b
        const updated = updatePlayers(b.players)
        return { ...b, players: updated, amountPaid: recalcAmountPaid(updated) }
      }))
      setEditBooking((prev) => {
        if (!prev || prev.id !== bookingId) return prev
        const updated = updatePlayers(prev.players)
        return { ...prev, players: updated, amountPaid: recalcAmountPaid(updated) }
      })
    } catch (e: any) {
      alert(t('alerts.errorPrefix') + e.message)
    } finally {
      setMarkingPaid(null)
    }
  }

  // ── Cortesía de pago ──────────────────────────────────────────────────────
  const [courtesyTarget, setCourtesyTarget] = useState<{ bookingId: string; playerId: string; name: string } | null>(null)
  const [courtesyReason, setCourtesyReason] = useState('')
  const [courtesySubmitting, setCourtesySubmitting] = useState(false)

  function closeCourtesyModal() {
    setCourtesyTarget(null); setCourtesyReason('')
  }

  async function submitCourtesy() {
    if (!courtesyTarget || !courtesyReason.trim()) return
    setCourtesySubmitting(true)
    try {
      const res = await fetch(`/api/bookings/${courtesyTarget.bookingId}/players/${courtesyTarget.playerId}/courtesy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: courtesyReason.trim() }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      const updatePlayers = (players: PlayerEntry[]) =>
        players.map((p) =>
          (p.userId === courtesyTarget.playerId || p.guestId === courtesyTarget.playerId)
            ? { ...p, amountPaid: 0, paymentStatus: 'courtesy' as const, courtesyReason: courtesyReason.trim() }
            : p
        )
      const recalcAmountPaid = (players: PlayerEntry[]) =>
        players.reduce((sum, p) => sum + (p.amountPaid ?? 0), 0)
      setBookings((prev) => prev.map((b) => {
        if (b.id !== courtesyTarget.bookingId) return b
        const updated = updatePlayers(b.players)
        return { ...b, players: updated, amountPaid: recalcAmountPaid(updated) }
      }))
      setEditBooking((prev) => {
        if (!prev || prev.id !== courtesyTarget.bookingId) return prev
        const updated = updatePlayers(prev.players)
        return { ...prev, players: updated, amountPaid: recalcAmountPaid(updated) }
      })
      closeCourtesyModal()
    } catch (e: any) {
      alert(t('alerts.errorPrefix') + e.message)
    } finally {
      setCourtesySubmitting(false)
    }
  }

  // ── Link de pago para invitado (desde Editar) ──────────────────────────────
  const [guestLinks, setGuestLinks] = useState<Record<string, string>>({})
  const [generatingLink, setGeneratingLink] = useState<string | null>(null)

  async function generateGuestLink(bookingId: string, guestId: string) {
    setGeneratingLink(guestId)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/players/${guestId}/guest-link`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setGuestLinks((prev) => ({ ...prev, [guestId]: json.data.url }))
    } catch (e: any) {
      alert(t('alerts.errorPrefix') + e.message)
    } finally {
      setGeneratingLink(null)
    }
  }

  // ── Convertir invitado en jugador registrado ────────────────────────────────
  const [makePlayerTarget, setMakePlayerTarget] = useState<{ bookingId: string; guestId: string; name: string } | null>(null)
  const [makePlayerEmail, setMakePlayerEmail] = useState('')
  const [makePlayerSubmitting, setMakePlayerSubmitting] = useState(false)
  const [makePlayerError, setMakePlayerError] = useState('')

  function closeMakePlayerModal() {
    setMakePlayerTarget(null); setMakePlayerEmail(''); setMakePlayerError('')
  }

  async function submitMakePlayer() {
    if (!makePlayerTarget || !makePlayerEmail.trim()) return
    setMakePlayerSubmitting(true)
    setMakePlayerError('')
    try {
      const inviteRes = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: makePlayerTarget.name, email: makePlayerEmail.trim(), invitedBy: 'admin' }),
      })
      const inviteJson = await inviteRes.json()
      if (!inviteRes.ok) throw new Error(inviteJson.error || t('alerts.errorPrefix'))
      const newUserId = inviteJson.data.user.id

      const linkRes = await fetch(`/api/bookings/${makePlayerTarget.bookingId}/players/${makePlayerTarget.guestId}/link-user`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: newUserId }),
      })
      const linkJson = await linkRes.json()
      if (!linkJson.success) throw new Error(linkJson.error)

      const updatedPlayers = (linkJson.data.players ?? []) as PlayerEntry[]
      setEditPlayers(updatedPlayers.map((p) => ({ userId: p.userId ?? '', guestId: p.guestId, name: p.name, isOwner: (p as any).isOwner })))
      setBookings((prev) => prev.map((b) => b.id === makePlayerTarget.bookingId ? { ...b, players: updatedPlayers } : b))
      setEditBooking((prev) => prev && prev.id === makePlayerTarget.bookingId ? { ...prev, players: updatedPlayers } : prev)
      closeMakePlayerModal()
    } catch (e: any) {
      setMakePlayerError(e.message || t('alerts.errorPrefix'))
    } finally {
      setMakePlayerSubmitting(false)
    }
  }

  // ── Quitar jugador (con crédito opcional) ────────────────────────────────
  const [removeConfirm, setRemoveConfirm] = useState<{ playerId: string; name: string; amountPaid: number } | null>(null)
  const [removeSubmitting, setRemoveSubmitting] = useState(false)

  function handleRemovePlayer(index: number) {
    const player = editPlayers[index]
    const playerId = playerRouteId(player)
    const bookingPlayer = (editBooking?.players ?? []).find((bp) => playerRouteId(bp) === playerId)
    const amountPaid = bookingPlayer?.amountPaid ?? 0
    if (!editBooking || !playerId || amountPaid <= 0) {
      setEditPlayers((prev) => prev.filter((_, j) => j !== index))
      return
    }
    setRemoveConfirm({ playerId, name: player.name, amountPaid })
  }

  async function confirmRemovePlayer(issueCredit: boolean) {
    if (!removeConfirm || !editBooking) return
    setRemoveSubmitting(true)
    try {
      const res = await fetch(`/api/bookings/${editBooking.id}/players/${removeConfirm.playerId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueCredit,
          creditReason: issueCredit
            ? `Jugador removido de reserva (${editBooking.slot?.court?.name ?? ''} ${editBooking.slot?.date ?? ''})`
            : undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      const newPlayers = (json.data.players ?? []) as PlayerEntry[]
      setEditPlayers((prev) => prev.filter((p) => playerRouteId(p) !== removeConfirm.playerId))
      setBookings((prev) => prev.map((b) =>
        b.id === editBooking.id ? { ...b, players: newPlayers, amountPaid: json.data.amountPaid } : b
      ))
      setEditBooking((prev) =>
        prev && prev.id === editBooking.id ? { ...prev, players: newPlayers, amountPaid: json.data.amountPaid } : prev
      )
      if (json.credit) {
        alert(t('alerts.creditoEmitido', { currency: json.credit.currency, amount: json.credit.amount.toLocaleString(), name: removeConfirm.name }))
      }
      setRemoveConfirm(null)
    } catch (e: any) {
      alert(t('alerts.errorPrefix') + e.message)
    } finally {
      setRemoveSubmitting(false)
    }
  }

  // ── Cancelar ──────────────────────────────────────────────────────────────
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [confirmCancelBooking, setConfirmCancelBooking] = useState<BookingRow | null>(null)

  async function doCancel(id: string, issueCredit: boolean) {
    setConfirmCancelBooking(null)
    setCancellingId(id)
    try {
      const res = await fetch(`/api/bookings/${id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueCredit,
          creditReason: issueCredit ? 'Reserva cancelada por el club' : undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: 'cancelled' } : b))
      if (json.credits?.length > 0) {
        const total = json.credits.reduce((s: number, c: any) => s + c.amount, 0)
        alert(t('alerts.creditoEmitidoMultiple', { count: json.credits.length, amount: formatCurrency(total, json.credits[0].currency) }))
      }
    } catch (e: any) {
      alert(t('alerts.errorPrefix') + e.message)
    } finally {
      setCancellingId(null)
    }
  }

  // ── Nueva reserva ─────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false)
  const [createDate, setCreateDate] = useState(new Date().toISOString().split('T')[0])
  const [createSport, setCreateSport] = useState<'padel' | 'pickleball'>('padel')
  const [slots, setSlots] = useState<SlotRow[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<SlotRow | null>(null)
  const [playerQ, setPlayerQ] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null)
  const [mainPlayerPay, setMainPlayerPay] = useState(false)
  const [mainPlayerCourtesy, setMainPlayerCourtesy] = useState(false)
  const [createPaymentMethod, setCreatePaymentMethod] = useState<'cash' | 'card'>('cash')
  const [ownerMembership, setOwnerMembership] = useState<{ pricingType: string; membershipPlan: string | null; price: number } | null>(null)
  const [selectedUserCredit, setSelectedUserCredit] = useState<{ total: number; currency: string } | null>(null)
  const [extraPlayers, setExtraPlayers] = useState<UserResult[]>([])
  const [extraPlayersPay, setExtraPlayersPay] = useState<Record<string, boolean>>({})
  const [extraPlayersCourtesy, setExtraPlayersCourtesy] = useState<Record<string, boolean>>({})
  const [extraPlayersCoverage, setExtraPlayersCoverage] = useState<Record<string, { type: 'membership' | 'credit'; label: string } | null>>({})
  const [createCourtesyReason, setCreateCourtesyReason] = useState('')
  const [extraQ, setExtraQ] = useState('')
  const [creating, setCreating] = useState(false)

  // ── Invitados sin cuenta (guests) ───────────────────────────────────────────
  // tempId es solo para identificarlos en el estado local del formulario — el servidor
  // genera su guestId real al crear la reserva.
  type GuestMode = 'pending' | 'owner' | 'link' | 'courtesy'
  const [extraGuests, setExtraGuests] = useState<{ tempId: string; name: string }[]>([])
  const [extraGuestsMode, setExtraGuestsMode] = useState<Record<string, GuestMode>>({})
  const [guestNameInput, setGuestNameInput] = useState('')
  const [createdGuestLinks, setCreatedGuestLinks] = useState<{ name: string; url: string }[] | null>(null)

  function addGuest() {
    const name = guestNameInput.trim()
    if (!name) return
    const tempId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setExtraGuests((prev) => [...prev, { tempId, name }])
    setExtraGuestsMode((prev) => ({ ...prev, [tempId]: 'pending' }))
    setGuestNameInput('')
  }

  const { results: playerResults, loading: playerLoading } = useUserSearch(playerQ)
  const { results: extraResults,  loading: extraLoading }  = useUserSearch(extraQ)

  // ── Bloqueo manual de slot ────────────────────────────────────────────────
  const [blockingSlot, setBlockingSlot] = useState<SlotRow | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [blockForUser, setBlockForUser] = useState<UserResult | null>(null)
  const [blockUserQ, setBlockUserQ] = useState('')
  const [blockSubmitting, setBlockSubmitting] = useState(false)
  const { results: blockUserResults, loading: blockUserLoading } = useUserSearch(blockUserQ)

  function closeBlockModal() {
    setBlockingSlot(null); setBlockReason(''); setBlockForUser(null); setBlockUserQ('')
  }

  async function submitBlockSlot() {
    if (!blockingSlot || !blockReason.trim()) return
    setBlockSubmitting(true)
    try {
      const res = await fetch(`/api/slots/${blockingSlot.id}/block`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: blockReason.trim(), blockedForUserId: blockForUser?.id ?? null }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setSlots((prev) => prev.map((s) =>
        s.id === blockingSlot.id
          ? { ...s, isBlocked: true, blockedReason: blockReason.trim(), blockedForUserId: blockForUser?.id ?? null, isAvailable: false }
          : s
      ))
      closeBlockModal()
    } catch (e: any) {
      alert(t('alerts.errorPrefix') + e.message)
    } finally {
      setBlockSubmitting(false)
    }
  }

  async function handleUnblockSlot(slotId: string) {
    try {
      const res = await fetch(`/api/slots/${slotId}/block`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setSlots((prev) => prev.map((s) =>
        s.id === slotId ? { ...s, isBlocked: false, blockedReason: null, blockedForUserId: null, isAvailable: true } : s
      ))
    } catch (e: any) {
      alert(t('alerts.errorPrefix') + e.message)
    }
  }

  const slotsForSport = slots.filter((s) => s.court.sport === createSport)
  const uniqueTimes = [...new Set(slotsForSport.map((s) => s.startTime))].sort()
  const courtsForTime = selectedTime
    ? slotsForSport
        .filter((s) => s.startTime === selectedTime)
        .filter((s, idx, arr) => arr.findIndex((x) => x.court.name === s.court.name) === idx)
    : []

  async function loadSlots(date: string) {
    if (!clubId) return
    setSlotsLoading(true)
    setSlots([])
    setSelectedSlot(null)
    setSelectedTime(null)
    try {
      const res = await fetch(`/api/clubs/${clubId}/availability?date=${date}`)
      const json = await res.json()
      setSlots((json.data ?? []).filter((s: SlotRow) => s.isAvailable || s.isBlocked))
    } finally { setSlotsLoading(false) }
  }

  useEffect(() => {
    if (showCreate && clubId) loadSlots(createDate)
  }, [showCreate, createDate, clubId])

  // Reset court selection when sport changes
  useEffect(() => {
    setSelectedTime(null)
    setSelectedSlot(null)
  }, [createSport])

  async function handleCreate() {
    if (!selectedSlot || !selectedUser || !clubId) return
    const anyCourtesy = mainPlayerCourtesy
      || extraPlayers.some((p) => extraPlayersCourtesy[p.id])
      || extraGuests.some((g) => extraGuestsMode[g.tempId] === 'courtesy')
    if (anyCourtesy && !createCourtesyReason.trim()) {
      alert(t('alerts.escribeMotivoCortesia'))
      return
    }
    setCreating(true)
    try {
      const isMembershipIncluded = ownerMembership?.pricingType === 'membership_included'
      const players = [
        ...extraPlayers.map((p) => ({
          userId: p.id, name: p.name,
          pay: !!extraPlayersPay[p.id],
          courtesy: !!extraPlayersCourtesy[p.id],
        })),
        ...extraGuests.map((g) => ({
          name: g.name,
          pay: extraGuestsMode[g.tempId] === 'owner',
          courtesy: extraGuestsMode[g.tempId] === 'courtesy',
        })),
      ]
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          userId: selectedUser.id,
          clubId,
          players,
          ownerName: selectedUser.name,
          ownerPay: isMembershipIncluded ? false : mainPlayerPay,
          ownerCourtesy: mainPlayerCourtesy,
          courtesyReason: anyCourtesy ? createCourtesyReason.trim() : undefined,
          paymentProvider: 'stripe',
          pricingType: isMembershipIncluded ? 'membership_included' : 'pay_per_use',
          paymentMethod: createPaymentMethod,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      if (clubId) fetchBookings(clubId)

      // Invitados marcados con "Link de pago": generar su link ahora. El orden de
      // booking.players preserva el orden enviado (jugadores reales primero, invitados
      // después), así que se puede emparejar por posición para conocer el guestId real.
      const linkGuests = extraGuests.filter((g) => extraGuestsMode[g.tempId] === 'link')
      if (linkGuests.length > 0 && json.data?.booking?.id) {
        const bookingId = json.data.booking.id
        const responsePlayers = (json.data.booking.players ?? []) as PlayerEntry[]
        const guestPlayers = responsePlayers.slice(responsePlayers.length - extraGuests.length)
        const links: { name: string; url: string }[] = []
        for (let i = 0; i < linkGuests.length; i++) {
          const g = linkGuests[i]
          const idx = extraGuests.findIndex((x) => x.tempId === g.tempId)
          const guestId = guestPlayers[idx]?.guestId
          if (!guestId) continue
          try {
            const linkRes = await fetch(`/api/bookings/${bookingId}/players/${guestId}/guest-link`, { method: 'POST' })
            const linkJson = await linkRes.json()
            if (linkJson.success) links.push({ name: g.name, url: linkJson.data.url })
          } catch { /* seguir con los demás */ }
        }
        if (links.length > 0) setCreatedGuestLinks(links)
      }

      setShowCreate(false)
      resetCreate()
    } catch (e: any) {
      alert(t('alerts.errorPrefix') + e.message)
    } finally { setCreating(false) }
  }

  function resetCreate() {
    setSelectedSlot(null); setSelectedTime(null); setSelectedUser(null)
    setExtraPlayers([]); setExtraPlayersPay({}); setExtraPlayersCourtesy({}); setExtraPlayersCoverage({}); setPlayerQ(''); setExtraQ('')
    setExtraGuests([]); setExtraGuestsMode({}); setGuestNameInput('')
    setMainPlayerPay(false); setMainPlayerCourtesy(false); setCreateCourtesyReason('')
    setCreateSport('padel'); setOwnerMembership(null); setSelectedUserCredit(null)
    setCreatePaymentMethod('cash')
  }

  async function checkUserCredit(userId: string) {
    if (!clubId) return
    try {
      const res = await fetch(`/api/credits/user/${userId}?clubId=${clubId}`)
      if (!res.ok) { setSelectedUserCredit(null); return }
      const json = await res.json()
      const summary = json.summary?.[clubId]
      setSelectedUserCredit(summary ? { total: summary.total, currency: summary.currency } : null)
    } catch { /* silencioso */ }
  }

  async function checkOwnerMembership(userId: string, slotId: string) {
    if (!clubId) return
    try {
      const res = await fetch(`/api/memberships/pricing?userId=${userId}&clubId=${clubId}&slotId=${slotId}`)
      if (!res.ok) return
      const json = await res.json()
      if (json.data?.pricingType !== 'pay_per_use') {
        setOwnerMembership(json.data)
      } else {
        setOwnerMembership(null)
      }
    } catch { /* silencioso */ }
  }

  // Revisa si un jugador adicional (no el dueño) tiene membresía con sesión disponible o
  // crédito suficiente — si es así, el backend lo cubre automáticamente sin importar el
  // toggle de pago que se elija, así que se lo mostramos al admin ANTES de crear la reserva
  // en vez de que aparezca "pagado" sin explicación después.
  async function checkExtraPlayerCoverage(userId: string, slotId: string) {
    if (!clubId) return
    try {
      const memRes = await fetch(`/api/memberships/pricing?userId=${userId}&clubId=${clubId}&slotId=${slotId}`)
      if (memRes.ok) {
        const memJson = await memRes.json()
        if (memJson.data?.pricingType === 'membership_included') {
          setExtraPlayersCoverage((prev) => ({ ...prev, [userId]: { type: 'membership', label: memJson.data.membershipPlan ?? 'Membresía' } }))
          return
        }
      }
      const credRes = await fetch(`/api/credits/user/${userId}?clubId=${clubId}`)
      if (credRes.ok) {
        const credJson = await credRes.json()
        const summary = credJson.summary?.[clubId]
        const pricePerPlayer = selectedSlot ? (selectedSlot.isPeak ? selectedSlot.peakPrice : selectedSlot.basePrice) / (selectedSlot.court.capacity || 4) : 0
        if (summary && pricePerPlayer > 0 && summary.total >= pricePerPlayer) {
          setExtraPlayersCoverage((prev) => ({ ...prev, [userId]: { type: 'credit', label: formatCurrency(summary.total, summary.currency) } }))
          return
        }
      }
      setExtraPlayersCoverage((prev) => ({ ...prev, [userId]: null }))
    } catch { /* silencioso */ }
  }

  // ── Load bookings ─────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async (cId: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/clubs/${cId}/bookings`)
      if (!res.ok) throw new Error('Error cargando reservas')
      const json = await res.json()
      setBookings(json.data ?? [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Pistas del club — necesarias para la vista de cuadrícula (filas = pistas, incluso
  // las que no tienen reservas ese día).
  const fetchCourts = useCallback(async (cId: string) => {
    try {
      const res = await fetch(`/api/clubs/${cId}`)
      if (!res.ok) return
      const json = await res.json()
      setCourts((json.data?.courts ?? []).filter((c: CourtRow) => c.isActive))
    } catch { /* silencioso */ }
  }, [])

  // Clases del club — para mostrarlas junto a las reservas en la cuadrícula (pistas × horas)
  // y que se note de un vistazo cuándo una pista está ocupada por una clase, no una reserva.
  const fetchClassSlots = useCallback(async (cId: string) => {
    try {
      const res = await fetch(`/api/classes/${cId}`)
      if (!res.ok) return
      const json = await res.json()
      setClassSlots(json.data ?? [])
    } catch { /* silencioso */ }
  }, [])

  const [savingClass, setSavingClass] = useState(false)
  const [classError, setClassError] = useState('')
  const [payingClassBookingId, setPayingClassBookingId] = useState<string | null>(null)
  const [cancellingClassBookingId, setCancellingClassBookingId] = useState<string | null>(null)

  function applyClassSlotUpdate(updated: ClassSlotRow) {
    setClassSlots((prev) => prev.map((s) => s.id === updated.id ? updated : s))
    setEditClassSlot((prev) => prev && prev.id === updated.id ? updated : prev)
  }

  async function saveClassSlot(data: Record<string, unknown>) {
    if (!editClassSlot) return
    setSavingClass(true); setClassError('')
    try {
      const res = await fetch(`/api/classes/${editClassSlot.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      applyClassSlotUpdate(json.data)
    } catch (e: any) {
      setClassError(e.message || t('alerts.noSePudoGuardar'))
    } finally {
      setSavingClass(false)
    }
  }

  async function cancelClassSlot(slot: ClassSlotRow) {
    if (!confirm(t('alerts.confirmCancelarClase'))) return
    setSavingClass(true)
    try {
      const res = await fetch(`/api/classes/${slot.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }),
      })
      const json = await res.json()
      if (json.success) { applyClassSlotUpdate(json.data); setEditClassSlot(null) }
    } finally {
      setSavingClass(false)
    }
  }

  async function markClassBookingPaid(booking: ClassBookingRow, method: 'cash' | 'card') {
    if (!editClassSlot) return
    setPayingClassBookingId(booking.id)
    try {
      const res = await fetch(`/api/classes/bookings/${booking.id}/pay`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentMethod: method }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      applyClassSlotUpdate({ ...editClassSlot, bookings: editClassSlot.bookings.map((b) => b.id === booking.id ? json.data : b) })
    } catch (e: any) {
      alert(t('alerts.errorPrefix') + e.message)
    } finally {
      setPayingClassBookingId(null)
    }
  }

  async function cancelClassBooking(slot: ClassSlotRow, booking: ClassBookingRow) {
    const classStart = new Date(`${slot.date}T${slot.startTime}:00`)
    const hoursUntil = (classStart.getTime() - Date.now()) / (1000 * 60 * 60)
    const msg = hoursUntil >= 24
      ? t('alerts.confirmCancelarCupoMasDe24h', { name: booking.studentName })
      : t('alerts.confirmCancelarCupoMenosDe24h', { name: booking.studentName })
    if (!confirm(msg)) return
    setCancellingClassBookingId(booking.id)
    try {
      const res = await fetch(`/api/classes/bookings/${booking.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      applyClassSlotUpdate({ ...editClassSlot!, bookings: editClassSlot!.bookings.filter((b) => b.id !== booking.id) })
      if (json.refunded) alert(t('alerts.creditoDevuelto', { amount: formatCurrency(booking.amountOwed, slot.currency), name: booking.studentName }))
    } catch (e: any) {
      alert(t('alerts.errorPrefix') + e.message)
    } finally {
      setCancellingClassBookingId(null)
    }
  }

  const [addingClassStudent, setAddingClassStudent] = useState(false)
  const [addClassStudentError, setAddClassStudentError] = useState('')

  async function addClassStudent(slot: ClassSlotRow, student: { id: string; name: string }, pay: 'pending' | 'cash' | 'card') {
    if (!clubId) return
    setAddingClassStudent(true); setAddClassStudentError('')
    try {
      const res = await fetch(`/api/classes/${slot.id}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentUserId: student.id, studentName: student.name, clubId,
          pay: pay !== 'pending', paymentMethod: pay === 'pending' ? undefined : pay,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      applyClassSlotUpdate({ ...slot, bookings: [...slot.bookings, json.data] })
    } catch (e: any) {
      setAddClassStudentError(e.message || t('alerts.noSePudoAgregarAlumno'))
    } finally {
      setAddingClassStudent(false)
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem('racketly_active_club')
    if (stored) {
      try { const p = JSON.parse(stored); if (p?.id) { setClubId(p.id); fetchBookings(p.id); fetchCourts(p.id); fetchClassSlots(p.id) } }
      catch { setLoading(false) }
    } else { setLoading(false) }

    function onClubChanged(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail?.id) { setClubId(detail.id); fetchBookings(detail.id); fetchCourts(detail.id); fetchClassSlots(detail.id) }
    }
    window.addEventListener('club-changed', onClubChanged)
    return () => window.removeEventListener('club-changed', onClubChanged)
  }, [fetchBookings, fetchCourts, fetchClassSlots])

  const todayStr = new Date().toISOString().split('T')[0]

  const filtered = bookings.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    if (sportFilter  !== 'all' && b.slot?.court?.sport !== sportFilter) return false
    if (dateFilter === 'today' && b.slot?.date !== todayStr) return false
    if (dateFilter === 'custom' && customDate && b.slot?.date !== customDate) return false
    if (pendingPaymentOnly && (b.status === 'cancelled' || !b.players.some((p) => p.paymentStatus === 'pending'))) return false
    if (search) {
      const q = search.toLowerCase()
      const matchesCourt = b.slot?.court?.name?.toLowerCase().includes(q)
      const matchesPlayer = (b.players ?? []).some((p) => p.name?.toLowerCase().includes(q))
      if (!matchesCourt && !matchesPlayer) return false
    }
    return true
  }).sort((a, b) => {
    const dateA = `${a.slot?.date ?? ''} ${a.slot?.startTime ?? ''}`
    const dateB = `${b.slot?.date ?? ''} ${b.slot?.startTime ?? ''}`
    if (dateA !== dateB) return dateA.localeCompare(dateB)
    return (a.slot?.court?.name ?? '').localeCompare(b.slot?.court?.name ?? '')
  })

  // Las clases también son "reservas" de una pista y hora — se filtran con los mismos
  // criterios (fecha/estado/deporte/búsqueda) para que aparezcan en la Lista igual que
  // en Overview, no solo en la Cuadrícula.
  const filteredClasses = classSlots.filter((s) => {
    const classStatus = s.status === 'cancelled' ? 'cancelled' : 'confirmed'
    if (statusFilter !== 'all' && statusFilter !== classStatus) return false
    if (sportFilter !== 'all' && s.professor.sport !== sportFilter) return false
    if (dateFilter === 'today' && s.date !== todayStr) return false
    if (dateFilter === 'custom' && customDate && s.date !== customDate) return false
    if (pendingPaymentOnly) return false // las clases se cobran desde su propio modal, no aplican al filtro de pago pendiente de reservas
    if (search) {
      const q = search.toLowerCase()
      const matchesCourt = s.court?.name?.toLowerCase().includes(q)
      const matchesStudent = s.bookings.some((b) => b.status === 'active' && b.studentName?.toLowerCase().includes(q))
      const matchesProf = s.professor.name?.toLowerCase().includes(q)
      if (!matchesCourt && !matchesStudent && !matchesProf) return false
    }
    return true
  })

  // Lista unificada: reservas + clases, ordenadas por fecha/hora/pista.
  type ListItem = { type: 'booking'; data: BookingRow } | { type: 'class'; data: ClassSlotRow }
  const listItems: ListItem[] = [
    ...filtered.map((b): ListItem => ({ type: 'booking', data: b })),
    ...filteredClasses.map((s): ListItem => ({ type: 'class', data: s })),
  ].sort((a, b) => {
    const keyA = a.type === 'booking' ? `${a.data.slot?.date ?? ''} ${a.data.slot?.startTime ?? ''}` : `${a.data.date} ${a.data.startTime}`
    const keyB = b.type === 'booking' ? `${b.data.slot?.date ?? ''} ${b.data.slot?.startTime ?? ''}` : `${b.data.date} ${b.data.startTime}`
    return keyA.localeCompare(keyB)
  })

  // Las clases también son "reservas" de una pista y hora — se suman a los totales
  // igual que a la lista, para que las tarjetas de arriba no las ignoren.
  const activeClassSlots = classSlots.filter((s) => s.status !== 'cancelled')
  const classesTotals = {
    confirmed: activeClassSlots.filter((s) => s.bookings.some((b) => b.status === 'active')).length,
    pending:   activeClassSlots.filter((s) => s.bookings.some((b) => b.status === 'active' && b.paymentStatus === 'pending')).length,
    cancelled: classSlots.filter((s) => s.status === 'cancelled').length,
    income:    activeClassSlots.reduce((sum, s) => sum + s.bookings.filter((b) => b.status === 'active').reduce((sb, b) => sb + b.amountPaid, 0), 0),
  }
  const classesCurrency = activeClassSlots[0]?.currency

  const totals = {
    confirmed: bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed').length + classesTotals.confirmed,
    pending:   bookings.filter((b) => b.status !== 'cancelled' && bookingHasPendingPayment(b)).length + classesTotals.pending,
    cancelled: bookings.filter((b) => b.status === 'cancelled').length + classesTotals.cancelled,
    courtesy:  courtesyCount(bookings),
  }
  const ingresosMap = loading ? {} : ingresosByCurrency(bookings)
  if (classesTotals.income > 0 && classesCurrency) {
    ingresosMap[classesCurrency] = (ingresosMap[classesCurrency] ?? 0) + classesTotals.income
  }
  const ingresosFormatted = formatIngresos(ingresosMap)

  return (
    <div className="space-y-6 max-w-7xl">

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label={t('stats.confirmadas')}  value={loading ? '…' : String(totals.confirmed)} icon={CheckCircle2} tone="emerald" />
        <StatCard label={t('stats.pendientePago')}   value={loading ? '…' : String(totals.pending)}   icon={Clock}        tone="amber"
          onClick={() => setPendingPaymentOnly((v) => !v)} active={pendingPaymentOnly} />
        <StatCard label={t('stats.canceladas')}   value={loading ? '…' : String(totals.cancelled)} icon={XCircle}      tone="gray" />
        <StatCard label={t('stats.cortesias')}    value={loading ? '…' : String(totals.courtesy)}  icon={UserPlus}     tone="violet" />
        <StatCard label={t('stats.ingresos')}     value={loading ? '…' : ingresosFormatted.primary} sub={ingresosFormatted.sub} icon={Wallet} tone="violet" />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl px-5 py-4 flex items-center gap-3">
          <RefreshCw className="w-4 h-4 shrink-0" />
          {error} — {!clubId ? t('error.seleccionaClub') : t('error.verificaServicios')}
        </div>
      )}

      <div className="flex items-center gap-1 bg-gray-100 rounded-2xl p-1 w-fit shadow-inner">
        <button
          onClick={() => setViewMode('list')}
          className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all ${
            viewMode === 'list'
              ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-100'
              : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
          }`}
        >
          <List className="w-4 h-4" />
          {t('viewToggle.lista')}
        </button>
        <button
          onClick={() => setViewMode('grid')}
          className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all ${
            viewMode === 'grid'
              ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-100'
              : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          {t('viewToggle.cuadricula')}
          <span className="hidden sm:inline text-xs font-normal opacity-60">{t('viewToggle.cuadriculaHint')}</span>
        </button>
      </div>

      {viewMode === 'grid' ? (
        <CourtScheduleGrid
          bookings={bookings}
          courts={courts}
          classSlots={classSlots}
          loading={loading}
          gridDate={gridDate} setGridDate={setGridDate}
          hourFrom={gridHourFrom} setHourFrom={setGridHourFrom}
          hourTo={gridHourTo} setHourTo={setGridHourTo}
          onEdit={openEditPlayers}
          onCancel={setConfirmCancelBooking}
          cancellingId={cancellingId}
          onNewBooking={() => { setCreateDate(gridDate); setShowCreate(true); resetCreate() }}
          onEditClass={setEditClassSlot}
        />
      ) : (
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text" placeholder={t('filters.buscarPlaceholder')} value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-64"
            />
          </div>

          <Select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'custom')}
            className="px-4 py-2 w-auto">
            <option value="all">{t('filters.todasFechas')}</option>
            <option value="today">{t('filters.hoy')}</option>
            <option value="custom">{t('filters.fechaEspecifica')}</option>
          </Select>

          {dateFilter === 'custom' && (
            <Input
              type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)}
              className="px-4 py-2 w-auto"
            />
          )}

          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 w-auto">
            <option value="all">{t('filters.todosEstados')}</option>
            <option value="confirmed">{t('filters.confirmadas')}</option>
            <option value="pending">{t('filters.pendientes')}</option>
            <option value="cancelled">{t('filters.canceladas')}</option>
            <option value="completed">{t('filters.completadas')}</option>
          </Select>

          <Select value={sportFilter} onChange={(e) => setSportFilter(e.target.value)}
            className="px-4 py-2 w-auto">
            <option value="all">{t('filters.todosDeportes')}</option>
            <option value="padel">{t('filters.padel')}</option>
            <option value="pickleball">{t('filters.pickleball')}</option>
          </Select>

          {pendingPaymentOnly && (
            <button
              onClick={() => setPendingPaymentOnly(false)}
              className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold rounded-xl px-3 py-2 hover:bg-amber-100 transition-colors"
            >
              {t('filters.soloPagoPendiente')}
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="ml-auto flex items-center gap-3">
            {loading && <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />}
            <span className="text-sm text-gray-400">{t('filters.reservasCount', { count: listItems.length })}</span>
            {clubId && (
              <button
                onClick={() => { setShowCreate(true); resetCreate() }}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('filters.nuevaReserva')}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <tr>
                <Th>{t('table.fechaHora')}</Th>
                <Th>{t('table.pista')}</Th>
                <Th>{t('table.jugadores')}</Th>
                <Th>{t('table.deporte')}</Th>
                <Th>{t('table.precio')}</Th>
                <Th>{t('table.estado')}</Th>
                <Th>{t('table.accion')}</Th>
              </tr>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <Td key={j}>
                        <Skeleton className="h-4" />
                      </Td>
                    ))}
                  </TableRow>
                ))
              ) : listItems.length === 0 ? (
                <TableSpanRow colSpan={7}>
                  <EmptyState
                    icon={Search}
                    title={!clubId ? t('emptyState.seleccionaClubTitle') : t('emptyState.sinReservasTitle')}
                    description={!clubId ? t('emptyState.seleccionaClubDesc') : t('emptyState.sinReservasDesc')}
                  />
                </TableSpanRow>
              ) : listItems.map((item) => {
                if (item.type === 'class') {
                  return <ClassListRow key={`class-${item.data.id}`} slot={item.data} onEdit={setEditClassSlot} onCancel={cancelClassSlot} />
                }
                const b = item.data
                return (
                <TableRow key={b.id}>
                  <Td className="whitespace-nowrap">
                    <p className="text-sm font-bold text-gray-900">{b.slot?.startTime ?? '—'} – {b.slot?.endTime ?? ''}</p>
                    <p className="text-xs text-gray-400">{b.slot?.date ?? ''}</p>
                  </Td>
                  <Td>
                    <p className="text-sm font-medium text-gray-900">{b.slot?.court?.name ?? '—'}</p>
                  </Td>
                  <Td className="max-w-[260px]">
                    {/* Solo lectura: el cobro (efectivo/tarjeta) se hace desde "Editar" — poner los
                        botones aquí también hacía que cada fila ocupara demasiado espacio vertical. */}
                    <div className="flex flex-col gap-1">
                      {Array.isArray(b.players) && b.players.length > 0 ? (
                        b.players.map((p, i) => (
                          <div key={p.userId || i} className="flex items-start gap-1.5">
                            <span className="text-xs text-gray-700 leading-snug break-words flex-1">
                              {p.name}
                              {(p as any).isOwner && <span className="ml-1 text-gray-400">{t('playerRow.reservo')}</span>}
                            </span>
                            {p.paymentStatus === 'paid' ? (
                              <span className="shrink-0 text-xs text-emerald-600 font-semibold" title={t('playerRow.pagado')}>✓</span>
                            ) : p.paymentStatus === 'courtesy' ? (
                              <span className="shrink-0 text-xs text-violet-600 font-semibold" title={p.courtesyReason ?? t('playerRow.cortesia')}>🎁</span>
                            ) : p.paymentStatus === 'pending' && p.userId && b.status !== 'cancelled' ? (
                              <span className="shrink-0 text-xs text-amber-500" title={t('playerRow.pagoPendienteTitle')}>⏳</span>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={b.slot?.court?.sport === 'padel' ? 'emerald' : 'amber'}>
                      <span className="inline-flex items-center gap-1">
                        {b.slot?.court?.sport === 'padel' ? <PadelIcon size={12} /> : <PickleballIcon size={12} />}
                        {b.slot?.court?.sport === 'padel' ? t('filters.padel') : t('filters.pickleball')}
                      </span>
                    </Badge>
                  </Td>
                  <Td>
                    {(() => {
                      const hasOwed = b.players.some((p) => p.amountOwed != null)
                      const totalOwed = hasOwed ? b.players.reduce((s, p) => s + (p.amountOwed ?? 0), 0) : null
                      const totalPaid = b.players.reduce((s, p) => s + (p.amountPaid ?? 0), 0)
                      const display = totalOwed ?? b.amountPaid ?? 0
                      const collected = totalOwed != null ? totalPaid : null
                      return (
                        <div>
                          <span className="text-sm font-bold text-gray-900">{formatCurrency(display, b.currency)}</span>
                          {collected != null && collected < display && (
                            <p className="text-xs text-amber-600 mt-0.5">{t('priceCol.cobrado', { amount: formatCurrency(collected, b.currency) })}</p>
                          )}
                          {collected != null && collected >= display && display > 0 && (
                            <p className="text-xs text-emerald-600 mt-0.5">{t('priceCol.cobradoCheck')}</p>
                          )}
                        </div>
                      )
                    })()}
                  </Td>
                  <Td>
                    <Badge tone={bookingStatusMeta(b.status).tone}>
                      {bookingStatusLabel(t, b.status)}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1.5">
                      {b.status !== 'cancelled' && b.status !== 'completed' && (
                        <button
                          onClick={() => openEditPlayers(b)}
                          className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-400 bg-emerald-50 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          {t('actions.editar')}
                        </button>
                      )}
                      {b.status !== 'cancelled' && b.status !== 'completed' && (
                        <button
                          onClick={() => setConfirmCancelBooking(b)}
                          disabled={cancellingId === b.id}
                          className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                        >
                          {cancellingId === b.id ? '…' : t('actions.cancelar')}
                        </button>
                      )}
                    </div>
                  </Td>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
      )}

      {/* ── Modal: Nueva reserva ────────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); resetCreate() }} title={t('createModal.titulo')} maxWidth="lg">
            <div className="space-y-5">

              {/* Fecha + Deporte */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('createModal.fecha')}</label>
                  <Input
                    type="date"
                    value={createDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setCreateDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('createModal.deporte')}</label>
                  <div className="flex border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setCreateSport('padel')}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors ${createSport === 'padel' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    >
                      <PadelIcon size={14} /> {t('createModal.padel')}
                    </button>
                    <button
                      onClick={() => setCreateSport('pickleball')}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors ${createSport === 'pickleball' ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    >
                      <PickleballIcon size={14} /> {t('createModal.pickleball')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Paso 1: Selección de horario */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('createModal.paso1Horario')}
                  {selectedTime && <span className="ml-2 text-emerald-600 font-normal">✓ {selectedTime.slice(0,5)}</span>}
                </label>
                {slotsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
                    <RefreshCw className="w-4 h-4 animate-spin" /> {t('createModal.cargandoSlots')}
                  </div>
                ) : uniqueTimes.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">
                    {slots.length === 0 ? t('createModal.sinSlotsFecha') : t('createModal.sinSlotsDeporte', { sport: createSport === 'padel' ? t('createModal.padelLower') : t('createModal.pickleballLower') })}
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {uniqueTimes.map((t) => (
                      <button
                        key={t}
                        onClick={() => { setSelectedTime(t); setSelectedSlot(null) }}
                        className={`text-sm font-bold rounded-xl py-2.5 border-2 transition-all ${
                          selectedTime === t
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300'
                        }`}
                      >
                        {t.slice(0, 5)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Paso 2: Selección de cancha (solo visible tras elegir hora) */}
              {selectedTime && courtsForTime.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {t('createModal.paso2Pista')}
                    {selectedSlot && <span className="ml-2 text-emerald-600 font-normal">✓ {selectedSlot.court.name}</span>}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {courtsForTime.map((s) => s.isBlocked ? (
                      <div key={s.id} className="text-left rounded-xl py-3 px-4 border-2 border-gray-200 bg-gray-50">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-gray-500">🔒 {s.court.name}</p>
                          <button
                            onClick={() => handleUnblockSlot(s.id)}
                            className="text-[11px] text-gray-400 hover:text-red-500 underline shrink-0"
                          >
                            {t('createModal.desbloquear')}
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{s.blockedReason}</p>
                      </div>
                    ) : (
                      <div key={s.id} className="relative group">
                        <button
                          onClick={() => { setSelectedSlot(s); if (selectedUser) checkOwnerMembership(selectedUser.id, s.id) }}
                          className={`w-full text-left rounded-xl py-3 px-4 border-2 transition-all ${
                            selectedSlot?.id === s.id
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-gray-200 bg-white hover:border-emerald-300'
                          }`}
                        >
                          <p className={`text-sm font-bold ${selectedSlot?.id === s.id ? 'text-emerald-700' : 'text-gray-800'}`}>{s.court.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {s.currency} {(s.isPeak ? s.peakPrice : s.basePrice).toLocaleString()}
                            {s.isPeak && <span className="ml-1 text-amber-500">⚡ peak</span>}
                          </p>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setBlockingSlot(s) }}
                          title={t('createModal.bloquearHorarioTitle')}
                          className="absolute top-1.5 right-1.5 text-gray-300 hover:text-red-500 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          🔒
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Jugador principal */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('createModal.jugadorPrincipal')}</label>
                {selectedUser ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${ownerMembership ? 'bg-violet-600' : 'bg-emerald-600'}`}>
                      {selectedUser.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{selectedUser.name}</p>
                      <p className="text-xs text-gray-400">{selectedUser.email}</p>
                    </div>
                    {ownerMembership?.pricingType === 'membership_included' ? (
                      <span className="shrink-0 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1">
                        {t('createModal.membresiaGratis', { plan: ownerMembership.membershipPlan ?? t('createModal.membresiaDefault') })}
                      </span>
                    ) : (
                      <div className="flex border border-gray-200 rounded-lg overflow-hidden shrink-0">
                        <button type="button" onClick={() => { setMainPlayerPay(false); setMainPlayerCourtesy(false) }}
                          className={`px-2 py-1 text-xs font-semibold whitespace-nowrap ${!mainPlayerPay && !mainPlayerCourtesy ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                          {t('createModal.app')}
                        </button>
                        <button type="button" onClick={() => { setMainPlayerPay(true); setMainPlayerCourtesy(false) }}
                          className={`px-2 py-1 text-xs font-semibold whitespace-nowrap border-l border-gray-200 ${mainPlayerPay && !mainPlayerCourtesy ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                          {t('createModal.ahora')}
                        </button>
                        <button type="button" onClick={() => { setMainPlayerCourtesy(true); setMainPlayerPay(false) }}
                          className={`px-2 py-1 text-xs font-semibold whitespace-nowrap border-l border-gray-200 ${mainPlayerCourtesy ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                          {t('createModal.cortesia')}
                        </button>
                      </div>
                    )}
                    <button onClick={() => { setSelectedUser(null); setOwnerMembership(null); setSelectedUserCredit(null); setMainPlayerCourtesy(false) }} className="text-gray-400 hover:text-gray-600 shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {selectedUserCredit && selectedUserCredit.total > 0 && (
                    <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 inline-block">
                      {t('createModal.creditoDisponible', { amount: formatCurrency(selectedUserCredit.total, selectedUserCredit.currency) })}
                    </p>
                  )}
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="text" value={playerQ} onChange={(e) => setPlayerQ(e.target.value)}
                      placeholder={t('createModal.buscarJugadorPlaceholder')}
                      className="pl-9 pr-4 py-2.5"
                    />
                    {playerQ.length >= 2 && (
                      <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        {playerLoading ? (
                          <div className="p-3 text-sm text-gray-400 flex items-center gap-2"><RefreshCw className="w-3 h-3 animate-spin" /> {t('createModal.buscando')}</div>
                        ) : playerResults.length === 0 ? (
                          <div className="p-3 text-sm text-gray-400">{t('createModal.sinResultados')}</div>
                        ) : playerResults.map((u) => (
                          <button key={u.id} onClick={() => {
                            setSelectedUser(u); setPlayerQ('')
                            if (selectedSlot) checkOwnerMembership(u.id, selectedSlot.id)
                            checkUserCredit(u.id)
                          }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left">
                            <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">{u.name.charAt(0)}</div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{u.name}</p>
                              <p className="text-xs text-gray-400">{u.email}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Jugadores adicionales */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <span className="flex items-center gap-1.5"><UserPlus className="w-4 h-4" /> {t('createModal.jugadoresAdicionales')} <span className="text-gray-400 font-normal">{t('createModal.opcional')}</span></span>
                </label>
                {(() => {
                  const capacity = selectedSlot?.court.capacity ?? 4
                  const capacityReached = 1 + extraPlayers.length + extraGuests.length >= capacity
                  return capacityReached && selectedSlot ? (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                      {t('createModal.cupoCompleto', { capacity, court: selectedSlot.court.name })}
                    </p>
                  ) : null
                })()}

                {extraPlayers.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {extraPlayers.map((p) => (
                      <div key={p.id} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold text-xs shrink-0">
                            {p.name.charAt(0)}
                          </div>
                          <span className="text-sm font-medium text-gray-800 flex-1 break-words leading-snug">{p.name}</span>
                          <button onClick={() => {
                            setExtraPlayers((prev) => prev.filter((x) => x.id !== p.id))
                            setExtraPlayersCourtesy((prev) => { const { [p.id]: _drop, ...rest } = prev; return rest })
                            setExtraPlayersCoverage((prev) => { const { [p.id]: _drop, ...rest } = prev; return rest })
                          }} className="text-gray-400 hover:text-gray-600 shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 pl-10">
                          {extraPlayersCoverage[p.id] ? (
                            <span className={`inline-block text-xs font-semibold rounded-lg px-2.5 py-1 border ${extraPlayersCoverage[p.id]!.type === 'membership' ? 'text-violet-700 bg-violet-50 border-violet-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
                              {extraPlayersCoverage[p.id]!.type === 'membership'
                                ? t('createModal.membresiaNoPaga', { label: extraPlayersCoverage[p.id]!.label })
                                : t('createModal.cubiertoCredito', { label: extraPlayersCoverage[p.id]!.label })}
                            </span>
                          ) : (
                            <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden">
                              <button type="button"
                                onClick={() => { setExtraPlayersPay((prev) => ({ ...prev, [p.id]: false })); setExtraPlayersCourtesy((prev) => ({ ...prev, [p.id]: false })) }}
                                className={`px-2 py-1 text-xs font-semibold whitespace-nowrap ${!extraPlayersPay[p.id] && !extraPlayersCourtesy[p.id] ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                {t('createModal.app')}
                              </button>
                              <button type="button"
                                onClick={() => { setExtraPlayersPay((prev) => ({ ...prev, [p.id]: true })); setExtraPlayersCourtesy((prev) => ({ ...prev, [p.id]: false })) }}
                                className={`px-2 py-1 text-xs font-semibold whitespace-nowrap border-l border-gray-200 ${extraPlayersPay[p.id] && !extraPlayersCourtesy[p.id] ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                {t('createModal.ahora')}
                              </button>
                              <button type="button"
                                onClick={() => { setExtraPlayersCourtesy((prev) => ({ ...prev, [p.id]: true })); setExtraPlayersPay((prev) => ({ ...prev, [p.id]: false })) }}
                                className={`px-2 py-1 text-xs font-semibold whitespace-nowrap border-l border-gray-200 ${extraPlayersCourtesy[p.id] ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                {t('createModal.cortesia')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative" style={{ display: selectedSlot && 1 + extraPlayers.length + extraGuests.length >= (selectedSlot.court.capacity ?? 4) ? 'none' : undefined }}>
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="text" value={extraQ} onChange={(e) => setExtraQ(e.target.value)}
                    placeholder={t('createModal.agregarCompaneroPlaceholder')}
                    className="pl-9 pr-4 py-2.5"
                  />
                  {extraQ.length >= 2 && (
                    <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {extraLoading ? (
                        <div className="p-3 text-sm text-gray-400 flex items-center gap-2"><RefreshCw className="w-3 h-3 animate-spin" /> {t('createModal.buscando')}</div>
                      ) : extraResults.filter((u) => !extraPlayers.find((x) => x.id === u.id) && u.id !== selectedUser?.id).length === 0 ? (
                        <div className="p-3 text-sm text-gray-400">{t('createModal.sinResultados')}</div>
                      ) : extraResults
                          .filter((u) => !extraPlayers.find((x) => x.id === u.id) && u.id !== selectedUser?.id)
                          .map((u) => (
                            <button key={u.id} onClick={() => {
                              setExtraPlayers((prev) => [...prev, u]); setExtraQ('')
                              if (selectedSlot) checkExtraPlayerCoverage(u.id, selectedSlot.id)
                            }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left">
                              <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">{u.name.charAt(0)}</div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{u.name}</p>
                                <p className="text-xs text-gray-400">{u.email}</p>
                              </div>
                            </button>
                          ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">{t('createModal.hintPago')}</p>
              </div>

              {/* Invitados sin cuenta */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <span className="flex items-center gap-1.5"><UserPlus className="w-4 h-4" /> {t('createModal.invitadoSinCuenta')} <span className="text-gray-400 font-normal">{t('createModal.opcional')}</span></span>
                </label>

                {extraGuests.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {extraGuests.map((g) => (
                      <div key={g.tempId} className="bg-amber-50/60 border border-amber-200 rounded-xl px-4 py-2.5">
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
                            {g.name.charAt(0)}
                          </div>
                          <span className="text-sm font-medium text-gray-800 flex-1 break-words leading-snug">
                            {g.name} <span className="text-xs text-amber-600 font-normal">({t('createModal.invitado')})</span>
                          </span>
                          <button onClick={() => {
                            setExtraGuests((prev) => prev.filter((x) => x.tempId !== g.tempId))
                            setExtraGuestsMode((prev) => { const { [g.tempId]: _drop, ...rest } = prev; return rest })
                          }} className="text-gray-400 hover:text-gray-600 shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 pl-10">
                          <div className="inline-flex flex-wrap border border-gray-200 rounded-lg overflow-hidden">
                            <button type="button"
                              onClick={() => setExtraGuestsMode((prev) => ({ ...prev, [g.tempId]: 'pending' }))}
                              className={`px-2 py-1 text-xs font-semibold whitespace-nowrap ${extraGuestsMode[g.tempId] === 'pending' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                              {t('createModal.pendienteDashboard')}
                            </button>
                            <button type="button"
                              onClick={() => setExtraGuestsMode((prev) => ({ ...prev, [g.tempId]: 'owner' }))}
                              className={`px-2 py-1 text-xs font-semibold whitespace-nowrap border-l border-gray-200 ${extraGuestsMode[g.tempId] === 'owner' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                              {t('createModal.paganDueno')}
                            </button>
                            <button type="button"
                              onClick={() => setExtraGuestsMode((prev) => ({ ...prev, [g.tempId]: 'link' }))}
                              className={`px-2 py-1 text-xs font-semibold whitespace-nowrap border-l border-gray-200 ${extraGuestsMode[g.tempId] === 'link' ? 'bg-sky-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                              {t('createModal.linkDePago')}
                            </button>
                            <button type="button"
                              onClick={() => setExtraGuestsMode((prev) => ({ ...prev, [g.tempId]: 'courtesy' }))}
                              className={`px-2 py-1 text-xs font-semibold whitespace-nowrap border-l border-gray-200 ${extraGuestsMode[g.tempId] === 'courtesy' ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                              {t('createModal.cortesia')}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className="flex gap-2"
                  style={{ display: selectedSlot && 1 + extraPlayers.length + extraGuests.length >= (selectedSlot.court.capacity ?? 4) ? 'none' : undefined }}
                >
                  <Input
                    type="text" value={guestNameInput} onChange={(e) => setGuestNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest() } }}
                    placeholder={t('createModal.nombreInvitadoPlaceholder')}
                    className="flex-1"
                  />
                  <Button type="button" variant="secondary" onClick={addGuest} disabled={!guestNameInput.trim()}>
                    {t('createModal.agregarInvitadoBtn')}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">{t('createModal.hintInvitado')}</p>
              </div>

              {/* Motivo de cortesía */}
              {(mainPlayerCourtesy || extraPlayers.some((p) => extraPlayersCourtesy[p.id]) || extraGuests.some((g) => extraGuestsMode[g.tempId] === 'courtesy')) && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('createModal.motivoCortesia')}</label>
                  <Textarea
                    value={createCourtesyReason}
                    onChange={(e) => setCreateCourtesyReason(e.target.value)}
                    placeholder={t('createModal.motivoPlaceholder')}
                    rows={2}
                    className="focus:ring-violet-500/40 focus:border-violet-400"
                  />
                </div>
              )}

              {/* Resumen de cobro */}
              {selectedSlot && selectedUser && (() => {
                const isMemberIncluded = ownerMembership?.pricingType === 'membership_included'
                const payingNow = [
                  (!isMemberIncluded && mainPlayerPay) ? selectedUser.name.split(' ')[0] : null,
                  ...extraPlayers.filter((p) => extraPlayersPay[p.id]).map((p) => p.name.split(' ')[0]),
                ].filter(Boolean) as string[]
                const methodLabel = createPaymentMethod === 'cash' ? t('createModal.metodoEfectivo') : t('createModal.metodoTarjeta')
                return (
                  <div className="space-y-3">
                    {payingNow.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-1.5">{t('createModal.comoSeCobra')}</p>
                        <div className="flex border border-gray-200 rounded-xl overflow-hidden w-fit">
                          <button type="button" onClick={() => setCreatePaymentMethod('cash')}
                            className={`px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${createPaymentMethod === 'cash' ? 'bg-amber-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                            {t('createModal.efectivo')}
                          </button>
                          <button type="button" onClick={() => setCreatePaymentMethod('card')}
                            className={`px-3 py-1.5 text-xs font-semibold whitespace-nowrap border-l border-gray-200 ${createPaymentMethod === 'card' ? 'bg-sky-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                            {t('createModal.tarjeta')}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className={`border rounded-xl px-4 py-3 text-sm ${isMemberIncluded ? 'bg-violet-50 border-violet-200' : 'bg-emerald-50 border-emerald-200'}`}>
                      <p className={`font-semibold mb-1 ${isMemberIncluded ? 'text-violet-800' : 'text-emerald-800'}`}>
                        {selectedSlot.court.name} · {selectedSlot.startTime.slice(0,5)}–{selectedSlot.endTime.slice(0,5)}
                      </p>
                      <p className={isMemberIncluded ? 'text-violet-700' : 'text-emerald-700'}>
                        {t('createModal.jugadoresCount', { count: 1 + extraPlayers.length + extraGuests.length })}
                        {isMemberIncluded && <span className="ml-1">{t('createModal.cubiertoPorMembresia', { name: selectedUser.name.split(' ')[0] })}</span>}
                        {!isMemberIncluded && <>{' · '}{payingNow.length > 0 ? t('createModal.pagaAhora', { names: payingNow.join(', '), count: payingNow.length, method: methodLabel }) : t('createModal.todosPaganApp')}</>}
                        {isMemberIncluded && extraPlayers.length > 0 && (
                          <span className="block mt-0.5">
                            {payingNow.length > 0 ? t('createModal.extrasPagan', { names: payingNow.join(', '), count: payingNow.length, method: methodLabel }) : t('createModal.extrasPaganApp')}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowCreate(false); resetCreate() }}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl py-3 hover:bg-gray-50 transition-colors">
                {t('createModal.cancelar')}
              </button>
              <button
                onClick={handleCreate}
                disabled={!selectedSlot || !selectedUser || creating || ((mainPlayerCourtesy || extraPlayers.some((p) => extraPlayersCourtesy[p.id]) || extraGuests.some((g) => extraGuestsMode[g.tempId] === 'courtesy')) && !createCourtesyReason.trim())}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl py-3 transition-colors"
              >
                {creating ? t('createModal.creando') : t('createModal.crearReserva')}
              </button>
            </div>
      </Modal>

      {/* ── Modal: links de pago generados al crear la reserva ────────────────── */}
      {createdGuestLinks && (
        <Modal open onClose={() => setCreatedGuestLinks(null)} maxWidth="sm">
          <div className="space-y-4">
            <h2 className="text-base font-bold text-gray-900">{t('createModal.linksGeneradosTitulo')}</h2>
            <p className="text-xs text-gray-400">{t('createModal.linksGeneradosDescripcion')}</p>
            <div className="space-y-2">
              {createdGuestLinks.map((l) => (
                <div key={l.url} className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5">
                  <p className="text-sm font-semibold text-sky-900 mb-1">{l.name}</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={l.url} className="flex-1 min-w-0 text-xs text-sky-700 bg-white border border-sky-200 rounded-lg px-2 py-1.5 truncate" />
                    <button
                      onClick={() => navigator.clipboard.writeText(l.url)}
                      className="shrink-0 text-xs font-semibold text-sky-700 hover:text-sky-900 border border-sky-300 hover:border-sky-400 bg-white rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      {t('createModal.copiarLink')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setCreatedGuestLinks(null)}
              className="w-full border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl py-2.5 hover:bg-gray-50 transition-colors">
              {t('createModal.cerrar')}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Bloquear slot ────────────────────────────────────────────── */}
      {blockingSlot && (
        <Modal open={true} onClose={closeBlockModal} maxWidth="sm">
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('blockModal.titulo')}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {t('blockModal.detalle', { court: blockingSlot.court.name, time: blockingSlot.startTime.slice(0, 5) })}
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('blockModal.razon')}</label>
              <Textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder={t('blockModal.razonPlaceholder')}
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('blockModal.reservarPara')}</label>
              {blockForUser ? (
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                  <span className="text-sm text-gray-800 flex-1 truncate">{blockForUser.name}</span>
                  <button onClick={() => setBlockForUser(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    type="text" value={blockUserQ} onChange={(e) => setBlockUserQ(e.target.value)}
                    placeholder={t('blockModal.buscarJugadorPlaceholder')}
                  />
                  {blockUserQ.length >= 2 && (
                    <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {blockUserLoading ? (
                        <div className="p-3 text-sm text-gray-400">{t('blockModal.buscando')}</div>
                      ) : blockUserResults.length === 0 ? (
                        <div className="p-3 text-sm text-gray-400">{t('blockModal.sinResultados')}</div>
                      ) : blockUserResults.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => { setBlockForUser(u); setBlockUserQ('') }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
                        >
                          <span className="text-sm text-gray-900">{u.name}</span>
                          <span className="text-xs text-gray-400 truncate">{u.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={closeBlockModal}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl py-2.5 hover:bg-gray-50 transition-colors"
              >
                {t('blockModal.cancelar')}
              </button>
              <button
                onClick={submitBlockSlot}
                disabled={!blockReason.trim() || blockSubmitting}
                className="flex-1 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-semibold rounded-xl py-2.5 transition-colors"
              >
                {blockSubmitting ? '…' : t('blockModal.bloquear')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Pago de cortesía ─────────────────────────────────────────── */}
      {courtesyTarget && (
        <Modal open={true} onClose={closeCourtesyModal} maxWidth="sm" zIndex={60}>
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('courtesyModal.titulo', { name: courtesyTarget.name })}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{t('courtesyModal.descripcion')}</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('courtesyModal.motivo')}</label>
              <Textarea
                value={courtesyReason}
                onChange={(e) => setCourtesyReason(e.target.value)}
                placeholder={t('courtesyModal.motivoPlaceholder')}
                rows={3}
                className="focus:ring-violet-500/40 focus:border-violet-400"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={closeCourtesyModal}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl py-2.5 hover:bg-gray-50 transition-colors"
              >
                {t('courtesyModal.cancelar')}
              </button>
              <button
                onClick={submitCourtesy}
                disabled={!courtesyReason.trim() || courtesySubmitting}
                className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl py-2.5 transition-colors"
              >
                {courtesySubmitting ? '…' : t('courtesyModal.confirmar')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Convertir invitado en jugador registrado ─────────────────── */}
      {makePlayerTarget && (
        <Modal open={true} onClose={closeMakePlayerModal} maxWidth="sm" zIndex={60}>
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('makePlayerModal.titulo', { name: makePlayerTarget.name })}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{t('makePlayerModal.descripcion')}</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('makePlayerModal.email')}</label>
              <Input
                type="email"
                value={makePlayerEmail}
                onChange={(e) => setMakePlayerEmail(e.target.value)}
                placeholder={t('makePlayerModal.emailPlaceholder')}
              />
              {makePlayerError && <p className="text-xs text-red-600 mt-1.5">{makePlayerError}</p>}
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={closeMakePlayerModal}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl py-2.5 hover:bg-gray-50 transition-colors"
              >
                {t('courtesyModal.cancelar')}
              </button>
              <button
                onClick={submitMakePlayer}
                disabled={!makePlayerEmail.trim() || makePlayerSubmitting}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl py-2.5 transition-colors"
              >
                {makePlayerSubmitting ? '…' : t('makePlayerModal.confirmar')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Quitar jugador que ya pagó ───────────────────────────────── */}
      {removeConfirm && (
        <Modal open={true} onClose={() => setRemoveConfirm(null)} maxWidth="sm" zIndex={60}>
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('removeModal.titulo', { name: removeConfirm.name })}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {t('removeModal.descripcion', { amount: formatCurrency(removeConfirm.amountPaid, editBooking?.currency) })}
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => confirmRemovePlayer(true)}
                disabled={removeSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl py-2.5 transition-colors"
              >
                {removeSubmitting ? '…' : t('removeModal.quitarConCredito')}
              </button>
              <button
                onClick={() => confirmRemovePlayer(false)}
                disabled={removeSubmitting}
                className="w-full border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl py-2.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {t('removeModal.quitarSinCredito')}
              </button>
              <button
                onClick={() => setRemoveConfirm(null)}
                disabled={removeSubmitting}
                className="w-full text-gray-400 hover:text-gray-600 text-sm font-medium py-1.5 transition-colors"
              >
                {t('removeModal.cancelar')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Confirmar cancelación ───────────────────────────────────── */}
      {confirmCancelBooking && (
        <Modal open={true} onClose={() => setConfirmCancelBooking(null)} maxWidth="sm">
          <div className="space-y-4">
            <h2 className="text-base font-bold text-gray-900">{t('cancelModal.titulo')}</h2>
            {(() => {
              const payers = (confirmCancelBooking.players ?? []).filter(
                (p) => p.userId && (p.amountPaid ?? 0) > 0 && !(p as any).coveredBy
              )
              if (payers.length === 0) {
                return <p className="text-sm text-gray-500">{t('cancelModal.noSePuedeDeshacer')}</p>
              }
              const total = payers.reduce((s, p) => s + (p.amountPaid ?? 0), 0)
              return (
                <p className="text-sm text-gray-500">
                  {t('cancelModal.jugadoresPagaron', { count: payers.length, amount: formatCurrency(total, confirmCancelBooking.currency) })}
                </p>
              )
            })()}
            <div className="flex flex-col gap-2 pt-1">
              {(() => {
                const payers = (confirmCancelBooking.players ?? []).filter(
                  (p) => p.userId && (p.amountPaid ?? 0) > 0 && !(p as any).coveredBy
                )
                if (payers.length > 0) {
                  return (
                    <>
                      <button
                        onClick={() => doCancel(confirmCancelBooking.id, true)}
                        disabled={cancellingId === confirmCancelBooking.id}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl py-2.5 transition-colors"
                      >
                        {t('cancelModal.cancelarConCredito')}
                      </button>
                      <button
                        onClick={() => doCancel(confirmCancelBooking.id, false)}
                        disabled={cancellingId === confirmCancelBooking.id}
                        className="w-full border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl py-2.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        {t('cancelModal.cancelarSinCredito')}
                      </button>
                    </>
                  )
                }
                return (
                  <button
                    onClick={() => doCancel(confirmCancelBooking.id, false)}
                    disabled={cancellingId === confirmCancelBooking.id}
                    className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl py-2.5 transition-colors"
                  >
                    {t('cancelModal.siCancelar')}
                  </button>
                )
              })()}
              <button
                onClick={() => setConfirmCancelBooking(null)}
                disabled={cancellingId === confirmCancelBooking.id}
                className="w-full text-gray-400 hover:text-gray-600 text-sm font-medium py-1.5 transition-colors"
              >
                {t('cancelModal.noMantener')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Editar reserva ───────────────────────────────────────────── */}
      {editBooking && (
        <Modal
          open={true}
          onClose={() => setEditBooking(null)}
          maxWidth="md"
          title={
            <>
              {t('editModal.titulo')}
              <span className="block text-xs font-normal text-gray-400 mt-0.5">
                {t('editModal.subtitulo', { court: editBooking.slot?.court?.name ?? '', time: editBooking.slot?.startTime?.slice(0, 5) ?? '', date: editBooking.slot?.date ?? '' })}
              </span>
            </>
          }
        >
            <div className="space-y-5">

              {/* Pagos por jugador */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">{t('editModal.estadoPagoPorJugador')}</p>
                {editPlayers.length > 0 ? (
                  <div className="space-y-2">
                    {editPlayers.map((p, i) => {
                      const playerId = playerRouteId(p)
                      const bookingPlayer = (editBooking.players ?? []).find((bp) => playerRouteId(bp) === playerId)
                      const isPaid = bookingPlayer?.paymentStatus === 'paid'
                      const isCourtesy = bookingPlayer?.paymentStatus === 'courtesy'
                      const isGuest = !p.userId && !!p.guestId
                      const shownLink = isGuest ? guestLinks[p.guestId!] : undefined
                      return (
                        <div key={playerId || i} className={`border rounded-xl px-4 py-2.5 ${isGuest ? 'bg-amber-50/60 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 mt-0.5 ${isPaid ? 'bg-emerald-600' : isCourtesy ? 'bg-violet-600' : isGuest ? 'bg-amber-500' : 'bg-gray-400'}`}>
                              {p.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 leading-snug break-words">
                                {p.name}
                                {isGuest && <span className="ml-1.5 text-xs text-amber-600 font-normal">({t('createModal.invitado')})</span>}
                              </p>
                              {(p as any).isOwner && <p className="text-xs text-gray-400">{t('editModal.reservo')}</p>}
                            </div>
                            <button
                              onClick={() => handleRemovePlayer(i)}
                              className="text-gray-300 hover:text-gray-500 shrink-0 mt-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center justify-end flex-wrap gap-1.5 mt-2 pl-10">
                            {isPaid ? (
                              <span className="text-xs font-semibold text-emerald-600">{t('editModal.pagado')}</span>
                            ) : isCourtesy ? (
                              <span className="text-xs font-semibold text-violet-600">{t('editModal.cortesia')}</span>
                            ) : playerId && (
                              <>
                                <MarkPaidButtons
                                  isPending={markingPaid === `${editBooking.id}|${playerId}`}
                                  onMark={(method) => handleMarkPlayerPaid(editBooking.id, playerId, method)}
                                />
                                <button
                                  onClick={() => setCourtesyTarget({ bookingId: editBooking.id, playerId, name: p.name })}
                                  className="text-xs font-semibold text-violet-600 hover:text-violet-800 border border-violet-200 hover:border-violet-400 bg-violet-50 rounded-lg px-2.5 py-1 transition-colors"
                                >
                                  {t('editModal.cortesia')}
                                </button>
                                {isGuest && (
                                  <button
                                    onClick={() => generateGuestLink(editBooking.id, p.guestId!)}
                                    disabled={generatingLink === p.guestId}
                                    className="text-xs font-semibold text-sky-600 hover:text-sky-800 border border-sky-200 hover:border-sky-400 bg-sky-50 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                                  >
                                    {generatingLink === p.guestId ? '…' : t('editModal.generarLink')}
                                  </button>
                                )}
                              </>
                            )}
                            {isGuest && !isPaid && !isCourtesy && (
                              <button
                                onClick={() => setMakePlayerTarget({ bookingId: editBooking.id, guestId: p.guestId!, name: p.name })}
                                className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-400 bg-emerald-50 rounded-lg px-2.5 py-1 transition-colors"
                              >
                                {t('editModal.hacerJugador')}
                              </button>
                            )}
                          </div>
                          {isCourtesy && bookingPlayer?.courtesyReason && (
                            <p className="text-xs text-violet-500 mt-1.5 pl-10">{bookingPlayer.courtesyReason}</p>
                          )}
                          {shownLink && (
                            <div className="mt-2 pl-10 flex items-center gap-2">
                              <input readOnly value={shownLink} className="flex-1 min-w-0 text-xs text-sky-700 bg-white border border-sky-200 rounded-lg px-2 py-1.5 truncate" />
                              <button
                                onClick={() => navigator.clipboard.writeText(shownLink)}
                                className="shrink-0 text-xs font-semibold text-sky-700 hover:text-sky-900 border border-sky-300 hover:border-sky-400 bg-white rounded-lg px-2.5 py-1.5 transition-colors"
                              >
                                {t('createModal.copiarLink')}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">{t('editModal.sinJugadores')}</p>
                )}
              </div>

              {/* Agregar jugador */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">{t('editModal.agregarJugador')}</p>
                {(() => {
                  const capacity = editBooking.slot?.court?.capacity ?? 4
                  return editPlayers.length >= capacity ? (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      {t('editModal.cupoCompleto', { capacity, court: editBooking.slot?.court?.name ?? '' })}
                    </p>
                  ) : (
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="text" value={editQ} onChange={(e) => setEditQ(e.target.value)}
                    placeholder={t('editModal.buscarJugadorPlaceholder')}
                    className="pl-9 pr-4 py-2.5"
                  />
                  {editQ.length >= 2 && (
                    <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {editLoading ? (
                        <div className="p-3 text-sm text-gray-400 flex items-center gap-2">
                          <RefreshCw className="w-3 h-3 animate-spin" /> {t('editModal.buscando')}
                        </div>
                      ) : editResults.filter((u) => !editPlayers.find((p) => p.userId === u.id)).length === 0 ? (
                        <div className="p-3 text-sm text-gray-400">{t('editModal.sinResultados')}</div>
                      ) : editResults
                          .filter((u) => !editPlayers.find((p) => p.userId === u.id))
                          .map((u) => (
                            <button
                              key={u.id}
                              onClick={() => handleAddPlayer(u)}
                              disabled={savingPlayers}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
                            >
                              <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">
                                {u.name.charAt(0)}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{u.name}</p>
                                <p className="text-xs text-gray-400">{u.email}</p>
                              </div>
                            </button>
                          ))}
                    </div>
                  )}
                </div>
                  )
                })()}
              </div>
            </div>

            {editBooking.status !== 'cancelled' && editBooking.status !== 'completed' && (
              <div className="pt-2">
                <button
                  onClick={() => { const b = editBooking; setEditBooking(null); setConfirmCancelBooking(b) }}
                  className="w-full text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-xl py-2 transition-colors"
                >
                  {t('editModal.cancelarReserva')}
                </button>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditBooking(null)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl py-3 hover:bg-gray-50 transition-colors">
                {t('editModal.cerrar')}
              </button>
              <button
                onClick={handleSavePlayers}
                disabled={savingPlayers}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl py-3 transition-colors"
              >
                {savingPlayers ? t('editModal.guardando') : t('editModal.guardarJugadores')}
              </button>
            </div>
        </Modal>
      )}

      {editClassSlot && (
        <ClassEditModal
          slot={editClassSlot}
          courts={courts}
          saving={savingClass}
          error={classError}
          payingBookingId={payingClassBookingId}
          cancellingBookingId={cancellingClassBookingId}
          onClose={() => { setEditClassSlot(null); setClassError(''); setAddClassStudentError('') }}
          onSave={saveClassSlot}
          onCancelClass={cancelClassSlot}
          onMarkPaid={markClassBookingPaid}
          onCancelStudent={cancelClassBooking}
          onAddStudent={addClassStudent}
          addingStudent={addingClassStudent}
          addStudentError={addClassStudentError}
        />
      )}
    </div>
  )
}

// Fila de la Lista para una clase — misma estructura de columnas que una reserva de
// cancha, pero teñida de violeta y con 🎓 para distinguirla de un vistazo, con el
// mismo "Editar"/"Cancelar" que las reservas normales (abre el mismo ClassEditModal
// que ya usa la Cuadrícula y el link de Overview).
function ClassListRow({ slot, onEdit, onCancel }: { slot: ClassSlotRow; onEdit: (s: ClassSlotRow) => void; onCancel: (s: ClassSlotRow) => void }) {
  const t = useTranslations('Reservas')
  const activeBookings = slot.bookings.filter((b) => b.status === 'active')
  const studentNames = activeBookings.map((b) => b.studentName)
  const isCancelled = slot.status === 'cancelled'
  const totalOwed = activeBookings.reduce((s, b) => s + b.amountOwed, 0)
  const totalPaid = activeBookings.reduce((s, b) => s + b.amountPaid, 0)

  return (
    <TableRow className="hover:bg-violet-50/40 bg-violet-50/20">
      <Td className="whitespace-nowrap">
        <p className="text-sm font-bold text-gray-900">{slot.startTime} – {fmtMin(toMin(slot.startTime) + slot.durationMinutes)}</p>
        <p className="text-xs text-gray-400">{slot.date}</p>
      </Td>
      <Td>
        <p className="text-sm font-medium text-gray-900">{slot.court?.name ?? '—'}</p>
      </Td>
      <Td className="max-w-[260px]">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-700 leading-snug break-words">
            🎓 {slot.professor.name} <span className="text-gray-400">{t('classListRow.profesorLabel')}</span>
          </span>
          {studentNames.length > 0 ? studentNames.map((n, i) => (
            <span key={i} className="text-xs text-gray-700 leading-snug break-words">{n}</span>
          )) : (
            <span className="text-xs text-gray-300">{t('classListRow.sinAlumnos')}</span>
          )}
        </div>
      </Td>
      <Td>
        <Badge tone="violet">
          <span className="inline-flex items-center gap-1">
            {slot.professor.sport === 'padel' ? <PadelIcon size={12} /> : <PickleballIcon size={12} />}
            {t('classListRow.claseBadge')}
          </span>
        </Badge>
      </Td>
      <Td>
        <span className="text-sm font-bold text-gray-900">{formatCurrency(totalOwed, slot.currency)}</span>
        {totalOwed > 0 && totalPaid < totalOwed && (
          <p className="text-xs text-amber-600 mt-0.5">{t('classListRow.cobrado', { amount: formatCurrency(totalPaid, slot.currency) })}</p>
        )}
        {totalOwed > 0 && totalPaid >= totalOwed && (
          <p className="text-xs text-emerald-600 mt-0.5">{t('classListRow.cobradoCheck')}</p>
        )}
      </Td>
      <Td>
        <Badge tone={isCancelled ? 'red' : 'violet'}>{isCancelled ? t('classListRow.cancelada') : t('classListRow.cuposCount', { active: activeBookings.length, max: slot.maxStudents })}</Badge>
      </Td>
      <Td>
        <div className="flex flex-col gap-1.5">
          {!isCancelled && (
            <button
              onClick={() => onEdit(slot)}
              className="text-xs font-semibold text-violet-600 hover:text-violet-800 border border-violet-200 hover:border-violet-400 bg-violet-50 rounded-lg px-3 py-1.5 transition-colors"
            >
              {t('classListRow.editar')}
            </button>
          )}
          {!isCancelled && (
            <button
              onClick={() => onCancel(slot)}
              className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-3 py-1.5 transition-colors"
            >
              {t('classListRow.cancelar')}
            </button>
          )}
        </div>
      </Td>
    </TableRow>
  )
}

// Editar una clase desde la cuadrícula de Reservas — mismos campos que el editor de
// la página Clases (fecha/hora/pista/duración/cupos/precio), más el roster completo
// de alumnos inscritos (quién toma la clase y cómo pagó) para no tener que saltar a
// otra pantalla solo para ver o cobrar a los alumnos.
function ClassEditModal({
  slot, courts, saving, error, payingBookingId, cancellingBookingId, onClose, onSave, onCancelClass, onMarkPaid, onCancelStudent,
  onAddStudent, addingStudent, addStudentError,
}: {
  slot: ClassSlotRow
  courts: CourtRow[]
  saving: boolean
  error: string
  payingBookingId: string | null
  cancellingBookingId: string | null
  onClose: () => void
  onSave: (data: Record<string, unknown>) => void
  onCancelClass: (s: ClassSlotRow) => void
  onMarkPaid: (b: ClassBookingRow, method: 'cash' | 'card') => void
  onCancelStudent: (s: ClassSlotRow, b: ClassBookingRow) => void
  onAddStudent: (s: ClassSlotRow, student: { id: string; name: string }, pay: 'pending' | 'cash' | 'card') => void
  addingStudent: boolean
  addStudentError: string
}) {
  const t = useTranslations('Reservas')
  const [form, setForm] = useState({
    courtId: slot.courtId ?? '',
    date: slot.date,
    startTime: slot.startTime,
    durationMinutes: slot.durationMinutes,
    maxStudents: slot.maxStudents,
    price: slot.price,
  })
  const activeBookings = slot.bookings.filter((b) => b.status === 'active')
  const isCancelled = slot.status === 'cancelled'
  const isFull = activeBookings.length >= slot.maxStudents

  const [showAddStudent, setShowAddStudent] = useState(false)
  const [studentQuery, setStudentQuery] = useState('')
  const [studentResults, setStudentResults] = useState<{ id: string; name: string; email: string }[]>([])
  const [searchingStudent, setSearchingStudent] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null)
  const [studentPayNow, setStudentPayNow] = useState<'pending' | 'cash' | 'card'>('pending')

  useEffect(() => {
    if (studentQuery.trim().length < 2) { setStudentResults([]); return }
    const t = setTimeout(async () => {
      setSearchingStudent(true)
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(studentQuery)}`)
        const json = await res.json()
        setStudentResults(json.data ?? [])
      } finally { setSearchingStudent(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [studentQuery])

  function handleAddStudent() {
    if (!selectedStudent) return
    onAddStudent(slot, selectedStudent, studentPayNow)
    setSelectedStudent(null); setStudentQuery(''); setStudentResults([]); setStudentPayNow('pending'); setShowAddStudent(false)
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="md">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-gray-900 flex items-center gap-1.5">{t('classEditModal.titulo', { name: slot.professor.name })}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">{slot.professor.isExternal ? t('classEditModal.profesorExterno') : t('classEditModal.profesorClub')}{isCancelled && t('classEditModal.claseCancelada')}</p>
        {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</p>}

        {!isCancelled && (
          <div className="space-y-3 mb-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('classEditModal.pista')}</label>
              <Select value={form.courtId} onChange={(e) => setForm({ ...form, courtId: e.target.value })}>
                <option value="">{t('classEditModal.sinAsignar')}</option>
                {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t('classEditModal.fecha')}</label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t('classEditModal.hora')}</label>
                <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t('classEditModal.minutos')}</label>
                <Input type="number" min={15} step={15} value={form.durationMinutes}
                  onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t('classEditModal.cupos')}</label>
                <Input type="number" min={activeBookings.length || 1} value={form.maxStudents}
                  onChange={(e) => setForm({ ...form, maxStudents: Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t('classEditModal.precio')}</label>
                <Input type="number" min={0} value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
              </div>
            </div>
            <Button
              onClick={() => onSave({
                courtId: form.courtId || null, date: form.date, startTime: form.startTime,
                durationMinutes: Number(form.durationMinutes), maxStudents: Number(form.maxStudents), price: Number(form.price),
              })}
              disabled={saving}
              className="w-full"
            >
              {saving ? t('classEditModal.guardando') : t('classEditModal.guardarCambios')}
            </Button>
          </div>
        )}

        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('classEditModal.alumnosCount', { active: activeBookings.length, max: slot.maxStudents })}
            </p>
            {!isCancelled && !isFull && !showAddStudent && (
              <button
                onClick={() => setShowAddStudent(true)}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-400 bg-emerald-50 rounded-lg px-2.5 py-1"
              >
                {t('classEditModal.agregarAlumno')}
              </button>
            )}
          </div>

          {showAddStudent && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3 space-y-2.5">
              {addStudentError && <p className="text-red-600 text-xs bg-red-50 rounded-lg px-2.5 py-1.5">{addStudentError}</p>}
              {selectedStudent ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">
                  <p className="text-sm font-semibold text-emerald-800 break-words">{selectedStudent.name}</p>
                  <button onClick={() => setSelectedStudent(null)} className="text-emerald-600 hover:text-emerald-800"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <div>
                  <Input
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder={t('classEditModal.buscarJugadorPlaceholder')}
                  />
                  {searchingStudent && <p className="text-xs text-gray-400 mt-1">{t('classEditModal.buscando')}</p>}
                  {studentResults.length > 0 && (
                    <div className="mt-1.5 border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-32 overflow-y-auto bg-white">
                      {studentResults.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => { setSelectedStudent({ id: u.id, name: u.name }); setStudentQuery(''); setStudentResults([]) }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        >
                          <p className="text-sm font-medium text-gray-800 break-words">{u.name}</p>
                          <p className="text-xs text-gray-400 break-words">{u.email}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" onClick={() => setStudentPayNow('pending')}
                  className={`py-1.5 rounded-lg text-xs font-semibold border ${studentPayNow === 'pending' ? 'bg-gray-100 border-gray-400 text-gray-700' : 'border-gray-200 text-gray-400'}`}>
                  {t('classEditModal.pendiente')}
                </button>
                <button type="button" onClick={() => setStudentPayNow('cash')}
                  className={`py-1.5 rounded-lg text-xs font-semibold border ${studentPayNow === 'cash' ? 'bg-amber-50 border-amber-400 text-amber-700' : 'border-gray-200 text-gray-400'}`}>
                  {t('classEditModal.efectivo')}
                </button>
                <button type="button" onClick={() => setStudentPayNow('card')}
                  className={`py-1.5 rounded-lg text-xs font-semibold border ${studentPayNow === 'card' ? 'bg-sky-50 border-sky-400 text-sky-700' : 'border-gray-200 text-gray-400'}`}>
                  {t('classEditModal.tarjeta')}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowAddStudent(false); setSelectedStudent(null); setStudentQuery(''); setStudentResults([]) }}
                  className="flex-1 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg py-2 hover:bg-gray-100"
                >
                  {t('classEditModal.cancelar')}
                </button>
                <button
                  onClick={handleAddStudent}
                  disabled={!selectedStudent || addingStudent}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg py-2"
                >
                  {addingStudent ? t('classEditModal.agregando') : t('classEditModal.agregar')}
                </button>
              </div>
            </div>
          )}
          {activeBookings.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">{t('classEditModal.nadieInscrito')}</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {activeBookings.map((b) => (
                <div key={b.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 break-words">{b.studentName}</p>
                    <p className="text-xs text-gray-400">{formatCurrency(b.amountOwed, slot.currency)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {b.paymentStatus === 'paid' ? (
                      <Badge tone="emerald">{b.paymentMethod === 'cash' ? t('classEditModal.pagadoEfectivo') : t('classEditModal.pagadoTarjeta')}</Badge>
                    ) : (
                      <>
                        <button
                          onClick={() => onMarkPaid(b, 'cash')}
                          disabled={payingBookingId === b.id}
                          className="text-xs font-semibold text-amber-600 hover:text-amber-800 border border-amber-200 hover:border-amber-400 bg-amber-50 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                        >
                          {payingBookingId === b.id ? '…' : t('classEditModal.efectivo')}
                        </button>
                        <button
                          onClick={() => onMarkPaid(b, 'card')}
                          disabled={payingBookingId === b.id}
                          className="text-xs font-semibold text-sky-600 hover:text-sky-800 border border-sky-200 hover:border-sky-400 bg-sky-50 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                        >
                          {payingBookingId === b.id ? '…' : t('classEditModal.tarjeta')}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => onCancelStudent(slot, b)}
                      disabled={cancellingBookingId === b.id}
                      title={t('classEditModal.cancelarCupoTitle')}
                      className="text-gray-300 hover:text-red-500 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!isCancelled && (
          <button
            onClick={() => onCancelClass(slot)}
            disabled={saving}
            className="w-full mt-4 text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-xl py-2 transition-colors disabled:opacity-50"
          >
            {t('classEditModal.cancelarClase')}
          </button>
        )}
    </Modal>
  )
}
