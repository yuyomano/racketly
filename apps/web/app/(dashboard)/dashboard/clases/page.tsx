'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { GraduationCap, Plus, X, Loader2, Power, Pencil, CalendarDays, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Card, CardBody } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'

const GW = '' // relative — middleware inyecta auth, next.config reescribe al gateway

type Professor = {
  id: string
  clubId: string
  userId: string | null
  name: string
  avatarUrl: string | null
  bio: string | null
  phone: string | null
  sport: string
  isExternal: boolean
  hourlyRate: number
  currency: string
  isActive: boolean
}

type ClassBooking = {
  id: string
  studentUserId: string
  studentName: string
  amountOwed: number
  amountPaid: number
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded'
  paymentMethod: 'cash' | 'card' | null
  status: string
}

type ClassSlot = {
  id: string
  clubId: string
  professorId: string
  courtId: string | null
  date: string
  startTime: string
  durationMinutes: number
  maxStudents: number
  price: number
  currency: string
  status: string
  notes: string | null
  professor: Professor
  court: { id: string; name: string } | null
  bookings: ClassBooking[]
}

type CourtOption = { id: string; name: string; isActive: boolean }

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function ClasesPage() {
  const t = useTranslations('Clases')
  const [clubId, setClubId]     = useState<string | null>(null)
  const [clubName, setClubName] = useState('')
  const [professors, setProfessors] = useState<Professor[]>([])
  const [slots, setSlots]       = useState<ClassSlot[]>([])
  const [courts, setCourts]     = useState<CourtOption[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [showProfModal, setShowProfModal] = useState(false)
  const [editingProf, setEditingProf] = useState<Professor | null>(null)
  const [showSlotModal, setShowSlotModal] = useState(false)
  const [editingSlot, setEditingSlot] = useState<ClassSlot | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [addStudentSlot, setAddStudentSlot] = useState<ClassSlot | null>(null)
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null)

  const loadAll = useCallback(async (id: string) => {
    setLoading(true); setError('')
    try {
      const [profRes, slotsRes, clubRes] = await Promise.all([
        fetch(`${GW}/api/professors/${id}?all=1`),
        fetch(`${GW}/api/classes/${id}`),
        fetch(`${GW}/api/clubs/${id}`),
      ])
      const profJson = await profRes.json()
      const slotsJson = await slotsRes.json()
      const clubJson = await clubRes.json()
      if (!profRes.ok) throw new Error(profJson.error || t('errorLoadProfessors'))
      setProfessors(profJson.data ?? [])
      setSlots(slotsJson.data ?? [])
      setCourts((clubJson.data?.courts ?? []).filter((c: CourtOption) => c.isActive))
    } catch (e: any) {
      setError(e.message || t('errorGeneric'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const stored = localStorage.getItem('racketly_active_club') || ''
    let cId = stored, cName = ''
    try { const p = JSON.parse(stored); if (p?.id) { cId = p.id; cName = p.name ?? '' } } catch { /* plain string */ }
    if (cId) { setClubId(cId); setClubName(cName); loadAll(cId) } else { setLoading(false) }

    function onClubChange(e: Event) {
      const club = (e as CustomEvent).detail
      setClubId(club.id); setClubName(club.name ?? '')
      loadAll(club.id)
    }
    window.addEventListener('club-changed', onClubChange)
    return () => window.removeEventListener('club-changed', onClubChange)
  }, [loadAll])

  async function toggleProfActive(prof: Professor) {
    if (!clubId) return
    const res = await fetch(`${GW}/api/professors/${prof.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !prof.isActive }),
    })
    const data = await res.json()
    if (res.ok) setProfessors(professors.map((p) => p.id === prof.id ? data.data : p))
  }

  async function cancelSlot(slot: ClassSlot) {
    if (!confirm(t('confirmCancelSlot'))) return
    const res = await fetch(`${GW}/api/classes/${slot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    const data = await res.json()
    if (res.ok) setSlots(slots.map((s) => s.id === slot.id ? data.data : s))
  }

  async function markPaid(booking: ClassBooking, method: 'cash' | 'card') {
    setPayingId(booking.id)
    try {
      const res = await fetch(`${GW}/api/classes/bookings/${booking.id}/pay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: method }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('errorMarkPaid'))
      setSlots(slots.map((s) => ({
        ...s,
        bookings: s.bookings.map((b) => b.id === booking.id ? data.data : b),
      })))
    } catch (e: any) {
      alert(t('errorPrefix', { message: e.message }))
    } finally {
      setPayingId(null)
    }
  }

  async function cancelStudentBooking(slot: ClassSlot, booking: ClassBooking) {
    const classStart = new Date(`${slot.date}T${slot.startTime}:00`)
    const hoursUntil = (classStart.getTime() - Date.now()) / (1000 * 60 * 60)
    const withinFreeCancelWindow = hoursUntil >= 24
    const msg = withinFreeCancelWindow
      ? t('confirmCancelBookingFree', { name: booking.studentName })
      : t('confirmCancelBookingNoRefund', { name: booking.studentName })
    if (!confirm(msg)) return
    setCancellingBookingId(booking.id)
    try {
      const res = await fetch(`${GW}/api/classes/bookings/${booking.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('errorCancelBooking'))
      setSlots(slots.map((s) => s.id === slot.id ? { ...s, bookings: s.bookings.filter((b) => b.id !== booking.id) } : s))
      if (data.refunded) alert(t('refundedAlert', { amount: formatCurrency(booking.amountOwed, slot.currency), name: booking.studentName }))
    } catch (e: any) {
      alert(t('errorPrefix', { message: e.message }))
    } finally {
      setCancellingBookingId(null)
    }
  }

  if (!clubId && !loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <EmptyState icon={GraduationCap} title={t('selectClubTitle')} description={t('selectClubDescription')} />
      </div>
    )
  }

  const activeProfessors = professors.filter((p) => p.isActive)
  const today = todayStr()
  const upcomingSlots = slots.filter((s) => s.date >= today && s.status !== 'cancelled')
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
  const pastSlots = slots.filter((s) => s.date < today || s.status === 'cancelled')
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))
  const pendingRevenue = upcomingSlots.reduce((sum, s) =>
    sum + s.bookings.filter((b) => b.status === 'active' && b.paymentStatus !== 'paid').reduce((a, b) => a + (b.amountOwed - b.amountPaid), 0), 0)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={GraduationCap} label={t('statActiveProfessors')} value={String(activeProfessors.length)} />
        <StatCard icon={CalendarDays} label={t('statUpcomingClasses')} value={String(upcomingSlots.length)} />
        <StatCard icon={DollarSign} tone="amber" label={t('statPendingRevenue')}
          value={formatCurrency(pendingRevenue, upcomingSlots[0]?.currency ?? professors[0]?.currency ?? 'DOP')} />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('pageTitle')}</h1>
          <p className="text-sm text-gray-400">{t('pageSubtitle', { clubName: clubName || t('defaultClubName') })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowProfModal(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> {t('addProfessorButton')}
          </Button>
          <Button onClick={() => setShowSlotModal(true)} disabled={activeProfessors.length === 0}>
            <Plus className="w-4 h-4 mr-1.5" /> {t('scheduleClassButton')}
          </Button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">{error}</p>}

      <Card>
        <CardBody>
          <p className="text-sm font-bold text-gray-700 mb-3">{t('professorsSectionTitle')}</p>
          {professors.length === 0 ? (
            <p className="text-sm text-gray-400">{t('noProfessors')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {professors.map((p) => (
                <div key={p.id} className={`border border-gray-100 rounded-xl p-3 flex items-start justify-between gap-2 ${!p.isActive ? 'opacity-50' : ''}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800 break-words">{p.name}</p>
                      <Badge tone={p.isExternal ? 'violet' : 'emerald'}>{p.isExternal ? t('badgeExternal') : t('badgeClub')}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{t('professorRateLine', { rate: formatCurrency(p.hourlyRate, p.currency), sport: p.sport })}</p>
                    {p.phone && <p className="text-xs text-gray-400">{p.phone}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditingProf(p)} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-gray-50">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => toggleProfActive(p)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50">
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {loading ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          <div>
            <p className="text-sm font-bold text-gray-700 mb-3">{t('upcomingClassesTitle')}</p>
            {upcomingSlots.length === 0 ? (
              <EmptyState icon={CalendarDays} title={t('emptyUpcomingTitle')}
                description={t('emptyUpcomingDescription')}
                action={<Button onClick={() => setShowSlotModal(true)} disabled={activeProfessors.length === 0}><Plus className="w-4 h-4 mr-1.5" /> {t('scheduleClassButton')}</Button>} />
            ) : (
              <div className="space-y-3">
                {upcomingSlots.map((s) => (
                  <SlotCard key={s.id} slot={s} onCancel={cancelSlot} onEdit={setEditingSlot} onMarkPaid={markPaid} payingId={payingId}
                    onAddStudent={setAddStudentSlot} onCancelStudent={cancelStudentBooking} cancellingBookingId={cancellingBookingId} />
                ))}
              </div>
            )}
          </div>

          {pastSlots.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-700 mb-3">{t('pastClassesTitle')}</p>
              <div className="space-y-3">
                {pastSlots.slice(0, 20).map((s) => (
                  <SlotCard key={s.id} slot={s} onCancel={cancelSlot} onEdit={setEditingSlot} onMarkPaid={markPaid} payingId={payingId}
                    onAddStudent={setAddStudentSlot} onCancelStudent={cancelStudentBooking} cancellingBookingId={cancellingBookingId} past />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {(showProfModal || editingProf) && clubId && (
        <ProfessorModal
          clubId={clubId}
          professor={editingProf ?? undefined}
          onClose={() => { setShowProfModal(false); setEditingProf(null) }}
          onSaved={(p) => {
            setProfessors(editingProf ? professors.map((x) => x.id === p.id ? p : x) : [...professors, p])
            setShowProfModal(false); setEditingProf(null)
          }}
        />
      )}
      {(showSlotModal || editingSlot) && clubId && (
        <SlotModal
          clubId={clubId}
          professors={activeProfessors}
          courts={courts}
          slot={editingSlot ?? undefined}
          onClose={() => { setShowSlotModal(false); setEditingSlot(null) }}
          onSaved={(s) => {
            setSlots(editingSlot ? slots.map((x) => x.id === s.id ? s : x) : [...slots, s])
            setShowSlotModal(false); setEditingSlot(null)
          }}
        />
      )}
      {addStudentSlot && clubId && (
        <AddStudentModal
          slot={addStudentSlot}
          clubId={clubId}
          onClose={() => setAddStudentSlot(null)}
          onSaved={(booking) => {
            setSlots(slots.map((s) => s.id === addStudentSlot.id ? { ...s, bookings: [...s.bookings, booking] } : s))
            setAddStudentSlot(null)
          }}
        />
      )}
    </div>
  )
}

function SlotCard({ slot, onCancel, onEdit, onMarkPaid, payingId, onAddStudent, onCancelStudent, cancellingBookingId, past }: {
  slot: ClassSlot
  onCancel: (s: ClassSlot) => void
  onEdit: (s: ClassSlot) => void
  onMarkPaid: (b: ClassBooking, method: 'cash' | 'card') => void
  payingId: string | null
  onAddStudent: (s: ClassSlot) => void
  onCancelStudent: (s: ClassSlot, b: ClassBooking) => void
  cancellingBookingId: string | null
  past?: boolean
}) {
  const t = useTranslations('Clases')
  const locale = useLocale()
  const activeBookings = slot.bookings.filter((b) => b.status === 'active')
  const cuposFull = activeBookings.length >= slot.maxStudents
  const dateObj = new Date(slot.date + 'T00:00:00')
  return (
    <Card className={slot.status === 'cancelled' ? 'opacity-60' : undefined}>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            {/* Bloque de fecha/hora — lo primero que el ojo capta al escanear la lista,
                en vez de tener que leer el párrafo completo para saber cuándo es. */}
            <div className="shrink-0 text-center bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5 w-[4.25rem]">
              <p className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wide truncate">{dateObj.toLocaleDateString(locale, { weekday: 'short' })}</p>
              <p className="text-lg font-black text-gray-900 leading-none mt-1">{dateObj.getDate()}</p>
              <p className="text-[0.6875rem] font-semibold text-emerald-600 mt-1 truncate">{slot.startTime}</p>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-gray-900">{slot.professor.name}</p>
                <Badge tone={slot.professor.isExternal ? 'violet' : 'emerald'}>{slot.professor.isExternal ? t('badgeExternal') : t('badgeClub')}</Badge>
                {slot.status === 'cancelled' && <Badge tone="red">{t('badgeCancelled')}</Badge>}
                {slot.status === 'full' && <Badge tone="amber">{t('badgeFull')}</Badge>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                <span className="text-xs text-gray-500 bg-gray-50 rounded-full px-2 py-0.5">{t('durationPill', { minutes: slot.durationMinutes })}</span>
                {slot.court && <span className="text-xs text-gray-500 bg-gray-50 rounded-full px-2 py-0.5">{t('courtPill', { court: slot.court.name })}</span>}
                <span className="text-xs text-gray-500 bg-gray-50 rounded-full px-2 py-0.5">{t('pricePerStudentPill', { price: formatCurrency(slot.price, slot.currency) })}</span>
                <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${cuposFull ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500'}`}>{t('cuposPill', { active: activeBookings.length, max: slot.maxStudents })}</span>
              </div>
            </div>
          </div>
          {!past && slot.status !== 'cancelled' && (
            <div className="flex items-center gap-1.5 shrink-0">
              {activeBookings.length < slot.maxStudents && (
                <button onClick={() => onAddStudent(slot)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-400 bg-emerald-50 rounded-lg px-2.5 py-1.5">
                  {t('addStudentButton')}
                </button>
              )}
              <button onClick={() => onEdit(slot)} className="text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5">
                {t('editButton')}
              </button>
              <button onClick={() => onCancel(slot)} className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 bg-red-50 rounded-lg px-2.5 py-1.5">
                {t('cancelClassButton')}
              </button>
            </div>
          )}
        </div>

        {activeBookings.length > 0 && (
          <div className="divide-y divide-gray-50 border-t border-gray-100 pt-2">
            {activeBookings.map((b) => (
              <div key={b.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 break-words">{b.studentName}</p>
                  <p className="text-xs text-gray-400">{formatCurrency(b.amountOwed, slot.currency)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {b.paymentStatus === 'paid' ? (
                    <Badge tone="emerald">{b.paymentMethod === 'cash' ? t('paidCash') : t('paidCard')}</Badge>
                  ) : (
                    <>
                      <button
                        onClick={() => onMarkPaid(b, 'cash')}
                        disabled={payingId === b.id}
                        className="text-xs font-semibold text-amber-600 hover:text-amber-800 border border-amber-200 hover:border-amber-400 bg-amber-50 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {payingId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('payCash')}
                      </button>
                      <button
                        onClick={() => onMarkPaid(b, 'card')}
                        disabled={payingId === b.id}
                        className="text-xs font-semibold text-sky-600 hover:text-sky-800 border border-sky-200 hover:border-sky-400 bg-sky-50 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {payingId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('payCard')}
                      </button>
                    </>
                  )}
                  {!past && (
                    <button
                      onClick={() => onCancelStudent(slot, b)}
                      disabled={cancellingBookingId === b.id}
                      title={t('cancelBookingTitle')}
                      className="text-gray-300 hover:text-red-500 disabled:opacity-50"
                    >
                      {cancellingBookingId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

// Un profesor "del club" siempre debe estar atado a un jugador registrado (se
// busca y selecciona igual que un alumno o un socio) — así tiene datos completos
// (contacto, perfil) y cuenta como jugador activo del club. Solo un profesor
// "externo" (invitado sin cuenta) admite nombre libre.
function ProfessorModal({ clubId, professor, onClose, onSaved }: {
  clubId: string
  professor?: Professor
  onClose: () => void
  onSaved: (p: Professor) => void
}) {
  const t = useTranslations('Clases')
  const [form, setForm] = useState({
    name: professor?.name ?? '',
    phone: professor?.phone ?? '',
    bio: professor?.bio ?? '',
    sport: professor?.sport ?? 'padel',
    isExternal: professor?.isExternal ?? false,
    hourlyRate: professor?.hourlyRate ?? 0,
    currency: professor?.currency ?? 'DOP',
  })
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(
    professor?.userId ? { id: professor.userId, name: professor.name } : null
  )
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; email: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`${GW}/api/users/search?q=${encodeURIComponent(query)}`)
        const json = await res.json()
        setResults(json.data ?? [])
      } finally { setSearching(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [query])

  async function handleSave() {
    if (!form.isExternal && !selectedPlayer) { setError(t('errorSelectProfessorPlayer')); return }
    if (form.isExternal && !form.name.trim()) { setError(t('errorNameRequired')); return }
    if (form.hourlyRate < 0) { setError(t('errorRateNegative')); return }
    setSaving(true); setError('')
    try {
      const url = professor ? `${GW}/api/professors/${professor.id}` : `${GW}/api/professors`
      const res = await fetch(url, {
        method: professor ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(professor ? {} : { clubId }),
          userId: form.isExternal ? null : selectedPlayer?.id,
          name: form.isExternal ? form.name.trim() : (selectedPlayer?.name ?? ''),
          phone: form.phone.trim() || null,
          bio: form.bio.trim() || null,
          sport: form.sport,
          isExternal: form.isExternal,
          hourlyRate: Number(form.hourlyRate),
          currency: form.currency.trim() || 'DOP',
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? t('errorSave')); return }
      onSaved(data.data)
    } catch { setError(t('errorGeneric')) }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={professor ? t('editProfessorTitle') : t('newProfessorTitle')} maxWidth="sm">
        {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('typeLabel')}</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, isExternal: false })}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border ${!form.isExternal ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'border-gray-200 text-gray-500'}`}>
                {t('badgeClub')}
              </button>
              <button type="button" onClick={() => setForm({ ...form, isExternal: true })}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border ${form.isExternal ? 'bg-violet-50 border-violet-400 text-violet-700' : 'border-gray-200 text-gray-500'}`}>
                {t('badgeExternal')}
              </button>
            </div>
          </div>

          {form.isExternal ? (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('nameLabel')}</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('namePlaceholder')} />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('playerLabel')}</label>
              {selectedPlayer ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                  <p className="text-sm font-semibold text-emerald-800 break-words">{selectedPlayer.name}</p>
                  <button onClick={() => setSelectedPlayer(null)} className="text-emerald-600 hover:text-emerald-800"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <>
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlayerPlaceholder')} />
                  {searching && <p className="text-xs text-gray-400 mt-1">{t('searching')}</p>}
                  {results.length > 0 && (
                    <div className="mt-1.5 border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-40 overflow-y-auto">
                      {results.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => { setSelectedPlayer({ id: u.id, name: u.name }); setQuery(''); setResults([]) }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        >
                          <p className="text-sm font-medium text-gray-800 break-words">{u.name}</p>
                          <p className="text-xs text-gray-400 break-words">{u.email}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              <p className="text-xs text-gray-400 mt-1">{t('playerMustBeRegistered')}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('phoneLabel')}</label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('hourlyRateLabel')}</label>
              <Input type="number" min={0} value={form.hourlyRate}
                onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('currencyLabel')}</label>
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                maxLength={3} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('bioLabel')}</label>
            <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={2} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">{t('cancelButton')}</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('saving')}</span> : t('saveButton')}
          </Button>
        </div>
    </Modal>
  )
}

function SlotModal({ clubId, professors, courts, slot, onClose, onSaved }: {
  clubId: string
  professors: Professor[]
  courts: CourtOption[]
  slot?: ClassSlot
  onClose: () => void
  onSaved: (s: ClassSlot) => void
}) {
  const t = useTranslations('Clases')
  const firstProf = professors[0]
  const [form, setForm] = useState({
    professorId: slot?.professorId ?? firstProf?.id ?? '',
    courtId: slot?.courtId ?? '',
    date: slot?.date ?? todayStr(),
    startTime: slot?.startTime ?? '09:00',
    durationMinutes: slot?.durationMinutes ?? 60,
    maxStudents: slot?.maxStudents ?? 1,
    price: slot?.price ?? firstProf?.hourlyRate ?? 0,
    currency: slot?.currency ?? firstProf?.currency ?? 'DOP',
    notes: slot?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.professorId) { setError(t('errorSelectProfessor')); return }
    if (!form.date || !form.startTime) { setError(t('errorDateTimeRequired')); return }
    if (form.price < 0) { setError(t('errorPriceNegative')); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${GW}/api/classes${slot ? `/${slot.id}` : ''}`, {
        method: slot ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(slot ? {} : { clubId }),
          professorId: form.professorId,
          courtId: form.courtId || null,
          date: form.date,
          startTime: form.startTime,
          durationMinutes: Number(form.durationMinutes),
          maxStudents: Number(form.maxStudents),
          price: Number(form.price),
          currency: form.currency.trim() || 'DOP',
          notes: form.notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? t('errorSave')); return }
      onSaved(data.data)
    } catch { setError(t('errorGeneric')) }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={slot ? t('editClassTitle') : t('scheduleClassTitle')} maxWidth="sm">
        {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('professorLabel')}</label>
            <Select value={form.professorId} onChange={(e) => {
              const prof = professors.find((p) => p.id === e.target.value)
              setForm({ ...form, professorId: e.target.value, price: prof?.hourlyRate ?? form.price, currency: prof?.currency ?? form.currency })
            }}>
              {professors.map((p) => <option key={p.id} value={p.id}>{p.name} {p.isExternal ? t('professorExternalSuffix') : t('professorClubSuffix')}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('courtLabel')}</label>
            <Select value={form.courtId} onChange={(e) => setForm({ ...form, courtId: e.target.value })}>
              <option value="">{t('noCourtOption')}</option>
              {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('dateLabel')}</label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('timeLabel')}</label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('durationLabel')}</label>
              <Input type="number" min={15} step={15} value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('maxStudentsLabel')}</label>
              <Input type="number" min={1} value={form.maxStudents}
                onChange={(e) => setForm({ ...form, maxStudents: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('pricePerStudentLabel')}</label>
              <Input type="number" min={0} value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('currencyLabel')}</label>
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                maxLength={3} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('notesLabel')}</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">{t('cancelButton')}</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('saving')}</span> : (slot ? t('saveChangesButton') : t('scheduleButton'))}
          </Button>
        </div>
    </Modal>
  )
}

// El alumno siempre debe ser un jugador registrado en la plataforma — se busca y
// selecciona de la lista de usuarios reales, igual que al agregar jugadores a una
// reserva de cancha. No se admite escribir un nombre suelto sin cuenta.
function AddStudentModal({ slot, clubId, onClose, onSaved }: {
  slot: ClassSlot
  clubId: string
  onClose: () => void
  onSaved: (b: ClassBooking) => void
}) {
  const t = useTranslations('Clases')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; email: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const [payNow, setPayNow] = useState<'pending' | 'cash' | 'card'>('pending')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`${GW}/api/users/search?q=${encodeURIComponent(query)}`)
        const json = await res.json()
        setResults(json.data ?? [])
      } finally { setSearching(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [query])

  async function handleSave() {
    if (!selected) { setError(t('errorSelectPlayer')); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${GW}/api/classes/${slot.id}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentUserId: selected.id,
          studentName: selected.name,
          clubId,
          pay: payNow !== 'pending',
          paymentMethod: payNow === 'pending' ? undefined : payNow,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? t('errorAddStudent')); return }
      onSaved(data.data)
    } catch { setError(t('errorGeneric')) }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={t('addStudentTitle')} maxWidth="sm">
        <p className="text-xs text-gray-400 mb-3">
          {slot.professor.name} · {slot.date} · {slot.startTime} · {formatCurrency(slot.price, slot.currency)}
        </p>
        {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</p>}

        {selected ? (
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 mb-3">
            <p className="text-sm font-semibold text-emerald-800 break-words">{selected.name}</p>
            <button onClick={() => setSelected(null)} className="text-emerald-600 hover:text-emerald-800"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="mb-3">
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('playerLabel')}</label>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlayerPlaceholder')} />
            {searching && <p className="text-xs text-gray-400 mt-1">{t('searching')}</p>}
            {results.length > 0 && (
              <div className="mt-1.5 border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-40 overflow-y-auto">
                {results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelected({ id: u.id, name: u.name }); setQuery(''); setResults([]) }}
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

        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('paymentLabel')}</label>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setPayNow('pending')}
              className={`py-2 rounded-xl text-xs font-semibold border ${payNow === 'pending' ? 'bg-gray-100 border-gray-400 text-gray-700' : 'border-gray-200 text-gray-400'}`}>
              {t('paymentPending')}
            </button>
            <button type="button" onClick={() => setPayNow('cash')}
              className={`py-2 rounded-xl text-xs font-semibold border ${payNow === 'cash' ? 'bg-amber-50 border-amber-400 text-amber-700' : 'border-gray-200 text-gray-400'}`}>
              {t('payCash')}
            </button>
            <button type="button" onClick={() => setPayNow('card')}
              className={`py-2 rounded-xl text-xs font-semibold border ${payNow === 'card' ? 'bg-sky-50 border-sky-400 text-sky-700' : 'border-gray-200 text-gray-400'}`}>
              {t('payCard')}
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">{t('cancelButton')}</Button>
          <Button onClick={handleSave} disabled={saving || !selected} className="flex-1">
            {saving ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('saving')}</span> : t('addButton')}
          </Button>
        </div>
    </Modal>
  )
}
