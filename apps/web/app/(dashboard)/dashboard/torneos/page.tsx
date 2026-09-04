'use client'

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import {
  Trophy,
  Plus,
  X,
  Building2,
  Loader2,
  Users,
  ChevronDown,
  ChevronUp,
  Trash2,
  Pencil,
  Search,
  RefreshCw,
  UserPlus,
  AlertTriangle,
  CalendarRange,
  Clock,
  MapPin,
  Calendar,
  Gift,
  Layers,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { Modal } from '@/components/ui/Modal'
import { SkeletonCards } from '@/components/ui/Skeleton'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import {
  MATCH_FORMAT_LABELS,
  KNOCKOUT_STAGE_KEYS,
  KNOCKOUT_STAGE_LABELS,
  resolveMatchFormat,
  knockoutStageKeyForRound,
  normalizeSetScore,
  type MatchFormat,
  type MatchFormatOverrides,
} from '@racketly/utils'

// Cuántos sets se capturan según la modalidad: formatos a set único (pro set,
// set a 6, tiempo fijo) solo permiten 1; a 2 sets + super tie-break hasta 3;
// a 3 sets completos hasta 3.
function maxSetsForFormat(format?: string): number {
  switch (format) {
    case 'pro_set_8':
    case 'pro_set_10':
    case 'single_set_6':
    case 'timed_30':
    case 'timed_40':
      return 1
    default:
      return 3
  }
}
function defaultSetsForFormat(format?: string): number {
  return maxSetsForFormat(format) === 1 ? 1 : 2
}

const GW = '' // relative — middleware inyecta auth, next.config reescribe al gateway

type BadgeTone = 'emerald' | 'amber' | 'gray' | 'red' | 'blue' | 'violet'

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'gray',
  open: 'emerald',
  in_progress: 'blue',
  completed: 'gray',
  cancelled: 'red',
}

// Botones de acción disponibles por estado — labelKey se resuelve con t('statusActions.<key>')
const STATUS_ACTIONS: Record<string, { labelKey: string; next: string; primary: boolean }[]> = {
  draft: [
    { labelKey: 'openRegistration', next: 'open', primary: true },
    { labelKey: 'cancelTournament', next: 'cancelled', primary: false },
  ],
  open: [
    { labelKey: 'startTournament', next: 'in_progress', primary: true },
    { labelKey: 'cancelTournament', next: 'cancelled', primary: false },
  ],
  in_progress: [
    { labelKey: 'finishTournament', next: 'completed', primary: true },
    { labelKey: 'cancelTournament', next: 'cancelled', primary: false },
  ],
  completed: [],
  cancelled: [],
}

// tone del badge de pago — el label traducido se resuelve con t('paymentStatus.<key>')
const PAYMENT_TONE: Record<string, string> = {
  pending: 'amber',
  paid: 'emerald',
  courtesy: 'violet',
  refunded: 'gray',
  cancelled: 'red',
}

type UserResult = { id: string; name: string; email: string }

function useUserSearch(q: string) {
  const [results, setResults] = useState<UserResult[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`${GW}/api/users/search?q=${encodeURIComponent(q)}`)
        const json = await res.json()
        setResults(json.data ?? [])
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [q])
  return { results, loading }
}

// Claves de formato/género válidas — el label traducido se resuelve con
// t('tournamentFormat.<key>') / t('gender.<key>')
const FORMAT_KEYS = ['round_robin', 'elimination', 'groups_bracket', 'swiss']
const GENDER_KEYS = ['masculino', 'femenino', 'mixto']

function getUserId(): string {
  try {
    const m = document.cookie.split(';').find((c) => c.trim().startsWith('racketly_user='))
    if (!m) return ''
    return JSON.parse(decodeURIComponent(m.split('=')[1]))?.id ?? ''
  } catch {
    return ''
  }
}

function formatMatchDateTime(scheduledAt: string, locale: string): string {
  return new Date(scheduledAt).toLocaleString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// El marcador de un set puede venir como tupla [p1, p2] (datos de simulación/import)
// o como objeto {p1, p2} (lo que guarda el modal de resultado) — se normaliza en un
// único lugar para que todas las vistas lo muestren igual sin importar el origen.
// Claves válidas de estado de partido — el label traducido se resuelve con
// t('matchStatus.<key>')
const MATCH_STATUS_KEYS = ['scheduled', 'in_progress', 'completed', 'walkover', 'cancelled']

function roundLabel(t: (key: string, values?: any) => string, total: number, idx: number): string {
  const fromEnd = total - 1 - idx
  if (fromEnd === 0) return t('roundLabel.final')
  if (fromEnd === 1) return t('roundLabel.semifinal')
  if (fromEnd === 2) return t('roundLabel.quarterfinal')
  if (fromEnd === 3) return t('roundLabel.roundOf16')
  return t('roundLabel.generic', { n: idx + 1 })
}

// ─── Eventos (agrupan varios torneos del mismo fin de semana) ────────────────

// tone del badge de estado de evento — el label traducido se resuelve con
// t('eventStatus.<key>')
const EVENT_STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'gray',
  scheduled: 'blue',
  in_progress: 'amber',
  completed: 'gray',
  cancelled: 'red',
}

type SchedulingWindowRow = { date: string; openTime: string; closeTime: string }

function CreateEventModal({
  clubId,
  onClose,
  onCreated,
}: {
  clubId: string
  onClose: () => void
  onCreated: (ev: unknown) => void
}) {
  const t = useTranslations('Torneos.createEventModal')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [windows, setWindows] = useState<SchedulingWindowRow[]>([
    { date: '', openTime: '08:00', closeTime: '21:00' },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function updateWindow(i: number, patch: Partial<SchedulingWindowRow>) {
    setWindows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError(t('errorNameRequired'))
      return
    }
    if (!startDate || !endDate) {
      setError(t('errorDatesRequired'))
      return
    }
    const organizerId = getUserId()
    if (!organizerId) {
      setError(t('errorNoUser'))
      return
    }
    const validWindows = windows.filter((w) => w.date && w.openTime && w.closeTime)
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`${GW}/api/tournament-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubId,
          organizerId,
          name: name.trim(),
          description: description.trim() || null,
          startDate: new Date(startDate + 'T00:00:00').toISOString(),
          endDate: new Date(endDate + 'T23:59:59').toISOString(),
          schedulingWindows: validWindows.length > 0 ? validWindows : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('errorGeneric'))
        return
      }
      onCreated(data.data)
    } catch {
      setError(t('errorConnection'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('title')}
      maxWidth="lg"
      footer={
        <div className="flex gap-3 w-full">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('submit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-4 py-2">{error}</p>
        )}
        <p className="text-xs text-ink-400">{t('infoText')}</p>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">{t('nameLabel')}</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('descriptionLabel')}
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('startDateLabel')}
            </label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('endDateLabel')}
            </label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="border border-ink-100 rounded-2xl p-3.5 bg-ink-50/50 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-ink-500 uppercase tracking-wide">
              {t('windowsTitle')}
            </p>
            <button
              type="button"
              onClick={() =>
                setWindows((rows) => [...rows, { date: '', openTime: '08:00', closeTime: '21:00' }])
              }
              className="text-xs font-semibold text-court-600 hover:text-court-700"
            >
              {t('addDay')}
            </button>
          </div>
          <p className="text-xs text-ink-400">{t('windowsHint')}</p>
          {windows.map((w, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
              <Input
                type="date"
                value={w.date}
                onChange={(e) => updateWindow(i, { date: e.target.value })}
                className="border border-ink-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-court-500"
              />
              <Input
                type="time"
                value={w.openTime}
                onChange={(e) => updateWindow(i, { openTime: e.target.value })}
                className="border border-ink-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-court-500 w-24"
              />
              <Input
                type="time"
                value={w.closeTime}
                onChange={(e) => updateWindow(i, { closeTime: e.target.value })}
                className="border border-ink-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-court-500 w-24"
              />
              <button
                type="button"
                onClick={() => setWindows((rows) => rows.filter((_, idx) => idx !== i))}
                className="text-ink-300 hover:text-referee-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function EditEventModal({
  event,
  onClose,
  onSaved,
}: {
  event: any
  onClose: () => void
  onSaved: (ev: unknown) => void
}) {
  const t = useTranslations('Torneos.editEventModal')
  const [name, setName] = useState(event.name ?? '')
  const [description, setDescription] = useState(event.description ?? '')
  const [startDate, setStartDate] = useState(
    event.startDate ? new Date(event.startDate).toISOString().slice(0, 10) : ''
  )
  const [endDate, setEndDate] = useState(
    event.endDate ? new Date(event.endDate).toISOString().slice(0, 10) : ''
  )
  const [windows, setWindows] = useState<SchedulingWindowRow[]>(
    Array.isArray(event.schedulingWindows) && event.schedulingWindows.length > 0
      ? event.schedulingWindows
      : [{ date: '', openTime: '08:00', closeTime: '21:00' }]
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function updateWindow(i: number, patch: Partial<SchedulingWindowRow>) {
    setWindows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError(t('errorNameRequired'))
      return
    }
    if (!startDate || !endDate) {
      setError(t('errorDatesRequired'))
      return
    }
    const validWindows = windows.filter((w) => w.date && w.openTime && w.closeTime)
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`${GW}/api/tournament-events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          startDate: new Date(startDate + 'T00:00:00').toISOString(),
          endDate: new Date(endDate + 'T23:59:59').toISOString(),
          schedulingWindows: validWindows.length > 0 ? validWindows : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('errorGeneric'))
        return
      }
      onSaved(data.data)
    } catch {
      setError(t('errorConnection'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('title')}
      maxWidth="lg"
      footer={
        <div className="flex gap-3 w-full">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-4 py-2">{error}</p>
        )}
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">{t('nameLabel')}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('descriptionLabel')}
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('startDateLabel')}
            </label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('endDateLabel')}
            </label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="border border-ink-100 rounded-2xl p-3.5 bg-ink-50/50 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-ink-500 uppercase tracking-wide">
              {t('windowsTitle')}
            </p>
            <button
              type="button"
              onClick={() =>
                setWindows((rows) => [...rows, { date: '', openTime: '08:00', closeTime: '21:00' }])
              }
              className="text-xs font-semibold text-court-600 hover:text-court-700"
            >
              {t('addDay')}
            </button>
          </div>
          <p className="text-xs text-ink-400">{t('windowsHint')}</p>
          {windows.map((w, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
              <Input
                type="date"
                value={w.date}
                onChange={(e) => updateWindow(i, { date: e.target.value })}
                className="border border-ink-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-court-500"
              />
              <Input
                type="time"
                value={w.openTime}
                onChange={(e) => updateWindow(i, { openTime: e.target.value })}
                className="border border-ink-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-court-500 w-24"
              />
              <Input
                type="time"
                value={w.closeTime}
                onChange={(e) => updateWindow(i, { closeTime: e.target.value })}
                className="border border-ink-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-court-500 w-24"
              />
              <button
                type="button"
                onClick={() => setWindows((rows) => rows.filter((_, idx) => idx !== i))}
                className="text-ink-300 hover:text-referee-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

// ─── Selector de pistas para el agendador automático ──────────────────────────
// Deja elegir en qué pistas del club se reparten los partidos (torneo o evento) —
// si no se elige ninguna, el backend usa todas las pistas activas del deporte.

type CourtOption = { id: string; name: string; sport: string; isActive: boolean }

function CourtPickerModal({
  courts,
  defaultSport,
  preselectedIds,
  onClose,
  onConfirm,
  confirming,
  error,
}: {
  courts: CourtOption[]
  defaultSport?: string
  preselectedIds?: string[]
  onClose: () => void
  onConfirm: (courtIds: string[]) => void
  confirming: boolean
  error: string
}) {
  const t = useTranslations('Torneos.courtPickerModal')
  const activeCourts = courts.filter((c) => c.isActive)
  const [selected, setSelected] = useState<Set<string>>(
    new Set(
      preselectedIds && preselectedIds.length > 0
        ? preselectedIds
        : activeCourts.filter((c) => !defaultSport || c.sport === defaultSport).map((c) => c.id)
    )
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('title')}
      maxWidth="sm"
      zIndex={60}
      footer={
        <div className="flex gap-3 w-full">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            {t('cancel')}
          </Button>
          <Button
            onClick={() => onConfirm([...selected])}
            disabled={confirming || selected.size === 0}
            className="flex-1"
          >
            {confirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              t('confirm', { count: selected.size })
            )}
          </Button>
        </div>
      }
    >
      <p className="text-xs text-ink-400 mb-4">{t('hint')}</p>
      {error && (
        <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-4 py-2 mb-3">{error}</p>
      )}
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {activeCourts.map((c) => (
          <label
            key={c.id}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-ink-100 hover:bg-ink-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              className="w-4 h-4 accent-court-600"
            />
            <span className="text-sm text-ink-700 flex-1">{c.name}</span>
            <span className="text-xs text-ink-400 uppercase">{c.sport}</span>
          </label>
        ))}
        {activeCourts.length === 0 && (
          <p className="text-sm text-ink-400 py-4 text-center">{t('noCourts')}</p>
        )}
      </div>
    </Modal>
  )
}

function EventCard({
  event,
  courts,
  onScheduled,
  onUpdated,
}: {
  event: any
  courts: CourtOption[]
  onScheduled: (id: string, result: any) => void
  onUpdated: (ev: unknown) => void
}) {
  const [scheduling, setScheduling] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerError, setPickerError] = useState('')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [matches, setMatches] = useState<GridMatch[] | null>(null)
  const [showGrid, setShowGrid] = useState(false)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const t = useTranslations('Torneos')
  const locale = useLocale()
  const eventStatusKey = event.status && EVENT_STATUS_TONE[event.status] ? event.status : 'draft'
  const statusTone = EVENT_STATUS_TONE[eventStatusKey]
  const tournaments = event.tournaments ?? []
  const sports = [...new Set(tournaments.map((t: any) => t.sport))]
  const uniformSport = sports.length === 1 ? (sports[0] as string) : undefined

  async function loadMatches(): Promise<GridMatch[]> {
    setLoadingMatches(true)
    try {
      const res = await fetch(`${GW}/api/tournament-events/${event.id}/matches`)
      const data = await res.json()
      const list: GridMatch[] = res.ok ? (data.data ?? []) : []
      setMatches(list)
      return list
    } catch {
      setMatches([])
      return []
    } finally {
      setLoadingMatches(false)
    }
  }

  useEffect(() => {
    if (tournaments.length > 0) loadMatches()
  }, [event.id, tournaments.length])

  const usedCourtIds = [...new Set((matches ?? []).filter((m) => m.courtId).map((m) => m.courtId!))]
  const usedCourtNames = usedCourtIds
    .map((id) => courts.find((c) => c.id === id)?.name)
    .filter(Boolean) as string[]

  async function handleSchedule(courtIds: string[]) {
    setScheduling(true)
    setToast(null)
    setPickerError('')
    try {
      const res = await fetch(`${GW}/api/tournament-events/${event.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courtIds, ...(uniformSport ? { sport: uniformSport } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPickerError(data.error ?? t('eventCard.scheduleError'))
        return
      }
      setToast({
        msg: t('eventCard.scheduledToast', {
          scheduled: data.data.scheduledMatches,
          courts: data.data.courtsUsed,
        }),
        ok: true,
      })
      onScheduled(event.id, data.data)
      await loadMatches()
      setShowPicker(false)
    } catch {
      setPickerError(t('eventCard.connectionError'))
    } finally {
      setScheduling(false)
    }
  }

  return (
    <Card className="p-5">
      {showPicker && (
        <CourtPickerModal
          courts={courts}
          defaultSport={uniformSport}
          preselectedIds={usedCourtIds}
          onClose={() => {
            setShowPicker(false)
            setPickerError('')
          }}
          onConfirm={handleSchedule}
          confirming={scheduling}
          error={pickerError}
        />
      )}
      {showEdit && (
        <EditEventModal
          event={event}
          onClose={() => setShowEdit(false)}
          onSaved={(ev) => {
            onUpdated(ev)
            setShowEdit(false)
          }}
        />
      )}
      {showGrid && (
        <ScheduleGridModal
          title={t('eventCard.scheduleTitle', { name: event.name })}
          initialMatches={matches ?? []}
          courts={courts}
          canEdit
          onClose={() => setShowGrid(false)}
        />
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {/* Estado primero — es lo que un admin escaneando la lista de eventos necesita
              ver antes que nada (¿está listo? ¿todavía en borrador?), no el nombre. */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge tone={statusTone} dot>
              {t(`eventStatus.${eventStatusKey}`)}
            </Badge>
            {tournaments.length > 0 && (
              <span className="text-xs font-semibold text-ink-500 bg-ink-50 rounded-full px-2.5 py-0.5">
                {t('eventCard.tournamentsProgress', {
                  done: tournaments.filter((tr: any) => tr.status === 'completed').length,
                  total: tournaments.length,
                })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h3 className="font-bold text-ink-900 text-base">{event.name}</h3>
            <button
              onClick={() => setShowEdit(true)}
              title={t('eventCard.editEvent')}
              className="text-ink-300 hover:text-ink-600"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ink-400 mb-1">
            <CalendarRange className="w-3.5 h-3.5" />
            <span>
              {new Date(event.startDate).toLocaleDateString(locale)} —{' '}
              {new Date(event.endDate).toLocaleDateString(locale)}
            </span>
          </div>
          {Array.isArray(event.schedulingWindows) && event.schedulingWindows.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-ink-400 flex-wrap">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              {event.schedulingWindows.map((w: SchedulingWindowRow, i: number) => (
                <span key={i} className="bg-ink-50 border border-ink-100 rounded-lg px-2 py-0.5">
                  {new Date(w.date + 'T00:00:00').toLocaleDateString(locale, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  {w.openTime}-{w.closeTime}
                </span>
              ))}
            </div>
          )}
          {usedCourtNames.length > 0 && (
            <p className="text-xs text-ink-400 mt-1">
              {t('eventCard.courtsInUse')}{' '}
              <span className="text-ink-600 font-medium">{usedCourtNames.join(', ')}</span>
            </p>
          )}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {tournaments.length === 0 ? (
              <span className="text-xs text-ink-400">{t('eventCard.noTournaments')}</span>
            ) : (
              tournaments.map((tr: any) => (
                <Badge key={tr.id} tone={STATUS_TONE[tr.status] ?? 'gray'}>
                  {tr.category}{' '}
                  {tr.genderCategory === 'femenino'
                    ? '♀'
                    : tr.genderCategory === 'masculino'
                      ? '♂'
                      : ''}
                </Badge>
              ))
            )}
          </div>
          {toast && (
            <p
              className={`mt-2 text-xs px-3 py-1.5 rounded-lg inline-block ${toast.ok ? 'bg-court-50 text-court-700' : 'bg-referee-50 text-referee-700'}`}
            >
              {toast.msg}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              loadMatches()
              setShowGrid(true)
            }}
            disabled={loadingMatches || tournaments.length === 0}
          >
            {t('eventCard.viewSchedule')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowPicker(true)}
            disabled={tournaments.length === 0}
          >
            {usedCourtNames.length > 0 ? t('eventCard.changeCourts') : t('eventCard.scheduleAuto')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function EventsPanel({
  clubId,
  events,
  courts,
  loading,
  onCreated,
  onScheduled,
  onUpdated,
}: {
  clubId: string
  events: any[]
  courts: CourtOption[]
  loading: boolean
  onCreated: (ev: unknown) => void
  onScheduled: (id: string, result: any) => void
  onUpdated: (ev: unknown) => void
}) {
  const t = useTranslations('Torneos.eventsPanel')
  const [showCreate, setShowCreate] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-900">{t('title')}</h2>
          <p className="text-xs text-ink-400 mt-0.5">{t('subtitle')}</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            if (!clubId) {
              alert(t('selectClubFirst'))
              return
            }
            setShowCreate(true)
          }}
        >
          <Plus className="w-3.5 h-3.5" /> {t('createEvent')}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-ink-400 text-sm">{t('loading')}</div>
      ) : (
        events.length > 0 && (
          <div className="space-y-3">
            {events.map((ev) => (
              <EventCard
                key={ev.id}
                event={ev}
                courts={courts}
                onScheduled={onScheduled}
                onUpdated={onUpdated}
              />
            ))}
          </div>
        )
      )}

      {showCreate && (
        <CreateEventModal
          clubId={clubId}
          onClose={() => setShowCreate(false)}
          onCreated={(ev) => {
            onCreated(ev)
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Modal crear ─────────────────────────────────────────────────────────────

// ─── Modalidad de juego (general + por ronda eliminatoria) ────────────────────
// Reutilizado en crear/editar torneo: modalidad general (usada en fase de grupos o
// round-robin, y como fallback de cualquier ronda sin modalidad propia) + descanso
// mínimo, más overrides opcionales de modalidad para octavos/cuartos/semifinal/final.

type MatchFormatFieldsValue = {
  matchFormat: string
  matchFormatOverrides: Record<string, string>
  minRestMinutes: number
}

function MatchFormatFields({
  value,
  onChange,
}: {
  value: MatchFormatFieldsValue
  onChange: (patch: Partial<MatchFormatFieldsValue>) => void
}) {
  const t = useTranslations('Torneos.matchFormatFields')
  return (
    <div className="space-y-3 border border-ink-100 rounded-2xl p-3.5 bg-ink-50/50">
      <p className="text-xs font-bold text-ink-500 uppercase tracking-wide">{t('title')}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('generalFormatLabel')}
          </label>
          <Select
            value={value.matchFormat}
            onChange={(e) => onChange({ matchFormat: e.target.value })}
          >
            {Object.entries(MATCH_FORMAT_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('minRestLabel')}
          </label>
          <Input
            type="number"
            min={0}
            value={value.minRestMinutes}
            onChange={(e) => onChange({ minRestMinutes: Number(e.target.value) })}
          />
        </div>
      </div>
      <p className="text-xs text-ink-400">{t('hint')}</p>
      <div>
        <p className="text-xs font-semibold text-ink-600 mb-1.5">{t('perRoundTitle')}</p>
        <div className="grid grid-cols-2 gap-2.5">
          {KNOCKOUT_STAGE_KEYS.map((key) => (
            <div key={key}>
              <label className="block text-xs text-ink-500 mb-1">
                {KNOCKOUT_STAGE_LABELS[key]}
              </label>
              <Select
                value={value.matchFormatOverrides[key] ?? ''}
                onChange={(e) =>
                  onChange({
                    matchFormatOverrides: { ...value.matchFormatOverrides, [key]: e.target.value },
                  })
                }
              >
                <option value="">{t('sameAsGeneral')}</option>
                {Object.entries(MATCH_FORMAT_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CreateTournamentModal({
  clubId,
  events,
  onClose,
  onCreated,
}: {
  clubId: string
  events: any[]
  onClose: () => void
  onCreated: (t: unknown) => void
}) {
  const t = useTranslations('Torneos.createTournamentModal')
  const tCommon = useTranslations('Torneos')
  const [form, setForm] = useState({
    name: '',
    description: '',
    sport: 'padel',
    format: 'round_robin',
    category: 'B2',
    genderCategory: 'mixto',
    maxParticipants: 16,
    startDate: '',
    endDate: '',
    location: '',
    eventId: '',
    entryFee: 0,
    currency: 'COP',
    prizeInfo: '',
    rules: '',
    matchFormat: 'best_of_3_full',
    minRestMinutes: 30,
    matchFormatOverrides: {} as Record<string, string>,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.startDate || !form.location.trim()) {
      setError(t('errorRequired'))
      return
    }
    const organizerId = getUserId()
    if (!organizerId) {
      setError(t('errorNoUser'))
      return
    }
    const startISO = new Date(form.startDate + 'T12:00:00').toISOString()
    const endISO = form.endDate ? new Date(form.endDate + 'T23:59:59').toISOString() : startISO
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${GW}/api/tournaments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          sport: form.sport,
          format: form.format,
          category: form.category,
          genderCategory: form.genderCategory,
          maxParticipants: Number(form.maxParticipants),
          location: form.location.trim(),
          entryFee: Number(form.entryFee),
          currency: form.currency.trim() || 'USD',
          prizeInfo: form.prizeInfo.trim() || null,
          rules: form.rules.trim() || null,
          matchFormat: form.matchFormat,
          matchFormatOverrides: Object.fromEntries(
            Object.entries(form.matchFormatOverrides).filter(([, v]) => v)
          ),
          minRestMinutes: Number(form.minRestMinutes),
          clubId,
          organizerId,
          startDate: startISO,
          endDate: endISO,
          registrationStart: new Date().toISOString(),
          registrationEnd: startISO,
          eventId: form.eventId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('errorGeneric'))
        return
      }
      onCreated(data.data)
    } catch {
      setError(t('errorConnection'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={t('title')} maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-4 py-2">{error}</p>
        )}
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">{t('nameLabel')}</label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('namePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('descriptionLabel')}
          </label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('sportLabel')}
            </label>
            <Select
              value={form.sport}
              onChange={(e) => setForm({ ...form, sport: e.target.value })}
            >
              <option value="padel">{t('padel')}</option>
              <option value="pickleball">{t('pickleball')}</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('categoryLabel')}
            </label>
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {['A', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'C4', 'Open'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('genderLabel')}
          </label>
          <Select
            value={form.genderCategory}
            onChange={(e) => setForm({ ...form, genderCategory: e.target.value })}
          >
            {GENDER_KEYS.map((v) => (
              <option key={v} value={v}>
                {tCommon(`gender.${v}`)}
              </option>
            ))}
          </Select>
          {form.genderCategory === 'masculino' && (
            <p className="text-xs text-ink-400 mt-1">{t('genderHint')}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('formatLabel')}
          </label>
          <Select
            value={form.format}
            onChange={(e) => setForm({ ...form, format: e.target.value })}
          >
            {FORMAT_KEYS.map((v) => (
              <option key={v} value={v}>
                {tCommon(`tournamentFormat.${v}`)}
              </option>
            ))}
          </Select>
        </div>
        <MatchFormatFields
          value={{
            matchFormat: form.matchFormat,
            matchFormatOverrides: form.matchFormatOverrides,
            minRestMinutes: form.minRestMinutes,
          }}
          onChange={(patch) => setForm({ ...form, ...patch })}
        />
        {events.length > 0 && (
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('eventLabel')}
            </label>
            <Select
              value={form.eventId}
              onChange={(e) => setForm({ ...form, eventId: e.target.value })}
            >
              <option value="">{t('noEvent')}</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </Select>
            <p className="text-xs text-ink-400 mt-1">{t('eventHint')}</p>
          </div>
        )}
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('locationLabel')}
          </label>
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder={t('locationPlaceholder')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('startDateLabel')}
            </label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('endDateLabel')}
            </label>
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('maxParticipantsLabel')}
            </label>
            <Input
              type="number"
              min={4}
              max={256}
              value={form.maxParticipants}
              onChange={(e) => setForm({ ...form, maxParticipants: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('entryFeeLabel')}
            </label>
            <Input
              type="number"
              min={0}
              value={form.entryFee}
              onChange={(e) => setForm({ ...form, entryFee: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('currencyLabel')}
            </label>
            <Input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              maxLength={3}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">{t('prizeLabel')}</label>
          <Input
            value={form.prizeInfo}
            onChange={(e) => setForm({ ...form, prizeInfo: e.target.value })}
            placeholder={t('prizePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">{t('rulesLabel')}</label>
          <Textarea
            value={form.rules}
            onChange={(e) => setForm({ ...form, rules: e.target.value })}
            rows={3}
            placeholder={t('rulesPlaceholder')}
            className="resize-none"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Modal editar ─────────────────────────────────────────────────────────────

function EditTournamentModal({
  tournament: t,
  events,
  onClose,
  onSaved,
}: {
  tournament: any
  events: any[]
  onClose: () => void
  onSaved: (updated: any) => void
}) {
  const tr = useTranslations('Torneos.editTournamentModal')
  const tCommon = useTranslations('Torneos')
  const [form, setForm] = useState({
    name: t.name ?? '',
    description: t.description ?? '',
    sport: t.sport ?? 'padel',
    format: t.format ?? 'round_robin',
    category: t.category ?? 'B2',
    genderCategory: t.genderCategory ?? 'mixto',
    maxParticipants: t.maxParticipants ?? 16,
    startDate: t.startDate ? (t.startDate as string).slice(0, 10) : '',
    endDate: t.endDate ? (t.endDate as string).slice(0, 10) : '',
    location: t.location ?? '',
    eventId: t.eventId ?? '',
    entryFee: t.entryFee ?? 0,
    prizeInfo: t.prizeInfo ?? '',
    currency: t.currency ?? 'COP',
    rules: t.rules ?? '',
    matchFormat: t.matchFormat ?? 'best_of_3_full',
    minRestMinutes: t.minRestMinutes ?? 30,
    matchFormatOverrides: { ...(t.matchFormatOverrides ?? {}) } as Record<string, string>,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.name.trim() || !form.startDate || !form.location.trim()) {
      setError(tr('errorRequired'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${GW}/api/tournaments/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          sport: form.sport,
          eventId: form.eventId || null,
          format: form.format,
          category: form.category,
          genderCategory: form.genderCategory,
          maxParticipants: Number(form.maxParticipants),
          startDate: new Date(form.startDate + 'T12:00:00').toISOString(),
          endDate: new Date((form.endDate || form.startDate) + 'T23:59:59').toISOString(),
          location: form.location.trim(),
          entryFee: Number(form.entryFee),
          prizeInfo: form.prizeInfo.trim() || null,
          currency: form.currency.trim() || 'USD',
          rules: form.rules.trim() || null,
          matchFormat: form.matchFormat,
          matchFormatOverrides: Object.fromEntries(
            Object.entries(form.matchFormatOverrides).filter(([, v]) => v)
          ),
          minRestMinutes: Number(form.minRestMinutes),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? tr('errorGeneric'))
        return
      }
      onSaved(data.data)
    } catch {
      setError(tr('errorConnection'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={tr('title')}
      maxWidth="lg"
      footer={
        <div className="flex gap-3 w-full">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            {tr('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> {tr('saving')}
              </span>
            ) : (
              tr('save')
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-4 py-2">{error}</p>
        )}
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">{tr('nameLabel')}</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {tr('descriptionLabel')}
          </label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {tr('sportLabel')}
            </label>
            <Select
              value={form.sport}
              onChange={(e) => setForm({ ...form, sport: e.target.value })}
            >
              <option value="padel">{tr('padel')}</option>
              <option value="pickleball">{tr('pickleball')}</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {tr('categoryLabel')}
            </label>
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {['A', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'C4', 'Open'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {tr('genderLabel')}
          </label>
          <Select
            value={form.genderCategory}
            onChange={(e) => setForm({ ...form, genderCategory: e.target.value })}
          >
            {GENDER_KEYS.map((v) => (
              <option key={v} value={v}>
                {tCommon(`gender.${v}`)}
              </option>
            ))}
          </Select>
          {form.genderCategory === 'masculino' && (
            <p className="text-xs text-ink-400 mt-1">{tr('genderHint')}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {tr('formatLabel')}
          </label>
          <Select
            value={form.format}
            onChange={(e) => setForm({ ...form, format: e.target.value })}
          >
            {FORMAT_KEYS.map((v) => (
              <option key={v} value={v}>
                {tCommon(`tournamentFormat.${v}`)}
              </option>
            ))}
          </Select>
        </div>
        <MatchFormatFields
          value={{
            matchFormat: form.matchFormat,
            matchFormatOverrides: form.matchFormatOverrides,
            minRestMinutes: form.minRestMinutes,
          }}
          onChange={(patch) => setForm({ ...form, ...patch })}
        />
        {events.length > 0 && (
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {tr('eventLabel')}
            </label>
            <Select
              value={form.eventId}
              onChange={(e) => setForm({ ...form, eventId: e.target.value })}
            >
              <option value="">{tr('noEvent')}</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {tr('locationLabel')}
          </label>
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder={tr('locationPlaceholder')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {tr('startDateLabel')}
            </label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {tr('endDateLabel')}
            </label>
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {tr('maxParticipantsLabel')}
            </label>
            <Input
              type="number"
              min={4}
              max={256}
              value={form.maxParticipants}
              onChange={(e) => setForm({ ...form, maxParticipants: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {tr('entryFeeLabel')}
            </label>
            <Input
              type="number"
              min={0}
              value={form.entryFee}
              onChange={(e) => setForm({ ...form, entryFee: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {tr('currencyLabel')}
            </label>
            <Input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              maxLength={3}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {tr('prizeLabel')}
          </label>
          <Input
            value={form.prizeInfo}
            onChange={(e) => setForm({ ...form, prizeInfo: e.target.value })}
            placeholder={tr('prizePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {tr('rulesLabel')}
          </label>
          <Textarea
            value={form.rules}
            onChange={(e) => setForm({ ...form, rules: e.target.value })}
            rows={3}
            placeholder={tr('rulesPlaceholder')}
            className="resize-none"
          />
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal resultado de partido ───────────────────────────────────────────────

function MatchScoreModal({
  match,
  tournamentId,
  onClose,
  onSaved,
}: {
  match: any
  tournamentId: string
  onClose: () => void
  onSaved: (updated: any) => void
}) {
  const t = useTranslations('Torneos.matchScoreModal')
  const tCommon = useTranslations('Torneos')
  const format = match.effectiveFormat as string | undefined
  const maxSets = maxSetsForFormat(format)

  const initSets =
    Array.isArray(match.score) && match.score.length > 0
      ? match.score.map((s: any) => {
          const n = normalizeSetScore(s)
          return { p1: String(n.p1), p2: String(n.p2) }
        })
      : Array.from({ length: defaultSetsForFormat(format) }, () => ({ p1: '', p2: '' }))

  const [sets, setSets] = useState<{ p1: string; p2: string }[]>(initSets)
  const [status, setStatus] = useState<string>(match.status ?? 'scheduled')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const p1Name =
    (match.player1?.displayName ?? t('player1Fallback')) +
    (match.player1PartnerName ? ` / ${match.player1PartnerName}` : '')
  const p2Name =
    (match.player2?.displayName ?? t('player2Fallback')) +
    (match.player2PartnerName ? ` / ${match.player2PartnerName}` : '')

  function computeWinner(): string | null {
    const valid = sets.filter((s) => s.p1 !== '' && s.p2 !== '')
    if (valid.length === 0) return null
    const p1w = valid.filter((s) => Number(s.p1) > Number(s.p2)).length
    const p2w = valid.filter((s) => Number(s.p2) > Number(s.p1)).length
    if (p1w > p2w) return match.player1Id
    if (p2w > p1w) return match.player2Id
    return null
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const validSets = sets.filter((s) => s.p1 !== '' && s.p2 !== '')
    const score = validSets.map((s) => ({ p1: Number(s.p1), p2: Number(s.p2) }))
    const winnerId = status === 'completed' ? computeWinner() : undefined
    try {
      const res = await fetch(`${GW}/api/tournaments/${tournamentId}/matches/${match.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, status, ...(winnerId !== undefined ? { winnerId } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('errorGeneric'))
        return
      }
      onSaved(data.data)
    } catch {
      setError(t('errorConnection'))
    } finally {
      setSaving(false)
    }
  }

  const winner = status === 'completed' ? computeWinner() : null
  const winnerName =
    winner === match.player1Id ? p1Name : winner === match.player2Id ? p2Name : null

  return (
    <Modal
      open
      onClose={onClose}
      title={t('title')}
      maxWidth="sm"
      zIndex={60}
      footer={
        <div className="flex gap-3 w-full">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('saving')}
              </span>
            ) : (
              t('save')
            )}
          </Button>
        </div>
      }
    >
      {error && (
        <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-3 py-2 mb-3">{error}</p>
      )}

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-ink-700">
              {maxSets === 1 ? t('result') : t('sets')}
              {format && (
                <span className="ml-1.5 text-xs font-normal text-ink-400">
                  · {MATCH_FORMAT_LABELS[format as MatchFormat] ?? format}
                </span>
              )}
            </span>
            {sets.length < maxSets && (
              <button
                onClick={() => setSets((s) => [...s, { p1: '', p2: '' }])}
                className="text-xs text-court-600 hover:text-court-700 font-semibold"
              >
                {t('addSet')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-[1fr_12px_1fr_20px] gap-2 mb-1.5 items-start">
            <span className="text-xs font-semibold text-ink-500 leading-tight break-words">
              {p1Name}
            </span>
            <span />
            <span className="text-xs font-semibold text-ink-500 leading-tight break-words">
              {p2Name}
            </span>
            <span />
          </div>

          <div className="space-y-2">
            {sets.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_12px_1fr_20px] gap-2 items-center">
                <Input
                  type="number"
                  min={0}
                  max={99}
                  value={s.p1}
                  placeholder="0"
                  onChange={(e) =>
                    setSets(sets.map((ss, idx) => (idx === i ? { ...ss, p1: e.target.value } : ss)))
                  }
                  className="border border-ink-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-court-500"
                />
                <span className="text-ink-300 text-xs text-center">—</span>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  value={s.p2}
                  placeholder="0"
                  onChange={(e) =>
                    setSets(sets.map((ss, idx) => (idx === i ? { ...ss, p2: e.target.value } : ss)))
                  }
                  className="border border-ink-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-court-500"
                />
                <button
                  onClick={() => setSets(sets.filter((_, idx) => idx !== i))}
                  className="text-ink-300 hover:text-referee-400 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('statusLabel')}
          </label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {MATCH_STATUS_KEYS.map((v) => (
              <option key={v} value={v}>
                {tCommon(`matchStatus.${v}`)}
              </option>
            ))}
          </Select>
        </div>

        {winnerName && (
          <p className="text-xs text-court-700 bg-court-50 rounded-lg px-3 py-1.5">
            {t('autoWinner', { name: winnerName })}
          </p>
        )}
      </div>
    </Modal>
  )
}

// ─── Fila de jugador dentro de una tarjeta de partido ─────────────────────────

function MatchPlayerRow({
  name,
  partnerName,
  scores,
  isWinner,
  isEmpty,
}: {
  name: string
  partnerName?: string | null
  scores: number[]
  isWinner: boolean
  isEmpty: boolean
}) {
  const t = useTranslations('Torneos.matchPlayerRow')
  const displayName = !isEmpty && partnerName ? `${name} / ${partnerName}` : name
  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${isWinner ? 'bg-court-50' : ''}`}>
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
          isEmpty
            ? 'bg-ink-100 text-ink-300'
            : isWinner
              ? 'bg-court-500 text-white'
              : 'bg-ink-100 text-ink-500'
        }`}
      >
        {isEmpty ? '?' : name.slice(0, 2).toUpperCase()}
      </div>
      <span
        className={`flex-1 min-w-0 text-xs leading-tight break-words ${
          isEmpty ? 'text-ink-300 italic' : isWinner ? 'font-bold text-court-700' : 'text-ink-700'
        }`}
        title={displayName}
      >
        {isEmpty ? t('tbd') : displayName}
      </span>
      {scores.length > 0 && (
        <div className="flex gap-1 shrink-0">
          {scores.map((s, i) => (
            <span
              key={i}
              className={`text-xs font-bold w-5 text-center tabular-nums ${isWinner ? 'text-court-600' : 'text-ink-400'}`}
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tarjeta de partido ───────────────────────────────────────────────────────

function MatchCard({
  match,
  canEdit,
  onEdit,
  onEditSchedule,
}: {
  match: any
  canEdit: boolean
  onEdit: () => void
  onEditSchedule?: () => void
}) {
  const t = useTranslations('Torneos.matchCard')
  const tCommon = useTranslations('Torneos')
  const locale = useLocale()
  const hasScore = Array.isArray(match.score) && match.score.length > 0
  const p1Won = match.winnerId && match.winnerId === match.player1Id
  const p2Won = match.winnerId && match.winnerId === match.player2Id
  const normalizedScore = hasScore ? (match.score as any[]).map(normalizeSetScore) : []
  const p1Scores = normalizedScore.map((s) => s.p1)
  const p2Scores = normalizedScore.map((s) => s.p2)
  const canEditSchedule =
    canEdit && !!onEditSchedule && match.status !== 'cancelled' && match.status !== 'completed'

  return (
    <div className="border border-ink-200 rounded-2xl overflow-hidden bg-white shadow-sm hover:border-ink-300 transition-colors">
      {(match.courtName || match.scheduledAt || canEditSchedule) && (
        <div className="px-3 py-1 bg-court-50/70 border-b border-ink-100 text-[10px] font-semibold text-court-700 flex items-center gap-1.5 justify-between">
          <span className="flex items-center gap-1.5">
            {match.courtName && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {match.courtName}
              </span>
            )}
            {match.scheduledAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> {formatMatchDateTime(match.scheduledAt, locale)}
              </span>
            )}
            {!match.courtName && !match.scheduledAt && (
              <span className="text-court-400">{t('unscheduled')}</span>
            )}
          </span>
          {canEditSchedule && (
            <button
              onClick={onEditSchedule}
              title={t('changeSchedule')}
              className="text-court-600 hover:text-court-800 shrink-0"
            >
              <Clock className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
      <MatchPlayerRow
        name={match.player1?.displayName ?? ''}
        partnerName={match.player1PartnerName}
        scores={p1Scores}
        isWinner={!!p1Won}
        isEmpty={!match.player1Id}
      />
      <div className="h-px bg-ink-100 mx-2" />
      <MatchPlayerRow
        name={match.player2?.displayName ?? ''}
        partnerName={match.player2PartnerName}
        scores={p2Scores}
        isWinner={!!p2Won}
        isEmpty={!match.player2Id}
      />
      <div className="px-3 py-1.5 bg-ink-50 border-t border-ink-100 flex items-center justify-between">
        <span className="text-[10px] font-medium text-ink-400 uppercase tracking-wide">
          {MATCH_STATUS_KEYS.includes(match.status)
            ? tCommon(`matchStatus.${match.status}`)
            : match.status}
        </span>
        {canEdit && match.status !== 'completed' && match.status !== 'cancelled' && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-[10px] font-semibold text-court-600 hover:text-court-700 uppercase tracking-wide"
          >
            <Pencil className="w-2.5 h-2.5" /> {t('edit')}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Modal: cambiar pista/horario de un partido (ajuste manual post-agendado) ─

function MatchScheduleModal({
  match,
  tournamentId,
  courts,
  onClose,
  onSaved,
}: {
  match: any
  tournamentId: string
  courts: CourtOption[]
  onClose: () => void
  onSaved: (updates: { id: string; courtId: string | null; scheduledAt: string | null }[]) => void
}) {
  const t = useTranslations('Torneos.matchScheduleModal')
  const tScore = useTranslations('Torneos.matchScoreModal')
  const initial = match.scheduledAt ? new Date(match.scheduledAt) : null
  const [courtId, setCourtId] = useState(match.courtId ?? courts[0]?.id ?? '')
  const [date, setDate] = useState(initial ? initial.toISOString().slice(0, 10) : '')
  const [time, setTime] = useState(initial ? initial.toISOString().slice(11, 16) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<string | null>(null)

  const p1Name =
    (match.player1?.displayName ?? tScore('player1Fallback')) +
    (match.player1PartnerName ? ` / ${match.player1PartnerName}` : '')
  const p2Name =
    (match.player2?.displayName ?? tScore('player2Fallback')) +
    (match.player2PartnerName ? ` / ${match.player2PartnerName}` : '')

  async function submit(resolveConflict: boolean) {
    if (!courtId || !date || !time) {
      setError(t('errorFields'))
      return
    }
    setSaving(true)
    setError('')
    if (!resolveConflict) setConflict(null)
    try {
      const scheduledAt = new Date(`${date}T${time}:00.000Z`).toISOString()
      const res = await fetch(
        `${GW}/api/tournaments/${tournamentId}/matches/${match.id}/reschedule`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courtId, scheduledAt, resolveConflict }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && !resolveConflict) {
          setConflict(data.error ?? t('errorConflictDefault'))
          return
        }
        setError(data.error ?? t('errorGeneric'))
        return
      }
      onSaved(data.data.updates)
    } catch {
      setError(t('errorConnection'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={t('title')} maxWidth="sm" zIndex={60}>
      <p className="text-xs text-ink-400 mb-4 truncate">
        {p1Name} vs {p2Name}
      </p>

      {error && (
        <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-3 py-2 mb-3">{error}</p>
      )}

      {conflict ? (
        <div className="space-y-3">
          <p className="text-sm text-trophy-700 bg-trophy-50 rounded-xl px-3 py-2.5 flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {conflict}
          </p>
          <p className="text-xs text-ink-400">{t('conflictHint')}</p>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConflict(null)}
              className="flex-1"
            >
              {t('back')}
            </Button>
            <Button onClick={() => submit(true)} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('moveBoth')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-ink-700 mb-1">
                {t('courtLabel')}
              </label>
              <Select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
                {courts
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-ink-700 mb-1">
                  {t('dateLabel')}
                </label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink-700 mb-1">
                  {t('timeLabel')}
                </label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-ink-400">{t('hint')}</p>
          </div>
          <div className="flex gap-3 mt-5">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              {t('cancel')}
            </Button>
            <Button onClick={() => submit(false)} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('save')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ─── Grilla de agenda: pistas en filas, horas en columnas ─────────────────────
// Vista tipo "reservas" para ver de un vistazo el orden del día de un evento o
// torneo, y editar resultado / reprogramar cada partido con un click.

type GridMatch = {
  id: string
  tournamentId: string
  tournamentName?: string
  category?: string
  genderCategory?: string
  status: string
  courtId: string | null
  courtName: string | null
  scheduledAt: string | null
  durationMinutes: number
  effectiveFormat?: string
  player1Id: string | null
  player2Id: string | null
  player1?: { displayName: string } | null
  player2?: { displayName: string } | null
  player1PartnerName?: string | null
  player2PartnerName?: string | null
  score?: any
  winnerId?: string | null
}

const MATCH_BLOCK_TONE: Record<string, string> = {
  scheduled: 'bg-court-50 border-court-200 hover:border-court-300',
  in_progress: 'bg-trophy-50 border-trophy-100 hover:border-trophy-400',
  completed: 'bg-court-50 border-court-200 hover:border-court-300',
  walkover: 'bg-court-50 border-court-200 hover:border-court-300',
  cancelled: 'bg-ink-50 border-ink-200 opacity-60',
}

const PX_PER_MIN = 2.4

function ScheduleGridModal({
  title,
  initialMatches,
  courts,
  canEdit,
  onClose,
}: {
  title: string
  initialMatches: GridMatch[]
  courts: CourtOption[]
  canEdit: boolean
  onClose: () => void
}) {
  const tt = useTranslations('Torneos.scheduleGridModal')
  const tRow = useTranslations('Torneos.matchPlayerRow')
  const locale = useLocale()
  const [matches, setMatches] = useState<GridMatch[]>(initialMatches)
  const [editingMatch, setEditingMatch] = useState<GridMatch | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<GridMatch | null>(null)

  const scheduled = matches.filter((m) => m.scheduledAt && m.courtId)
  const days = [...new Set(scheduled.map((m) => m.scheduledAt!.slice(0, 10)))].sort()
  const [selectedDay, setSelectedDay] = useState(days[0] ?? '')
  useEffect(() => {
    if (!selectedDay && days.length > 0) setSelectedDay(days[0])
  }, [days.join(',')])

  function applyResultUpdate(updated: any) {
    setMatches((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)))
  }
  function applyReschedule(
    updates: { id: string; courtId: string | null; scheduledAt: string | null }[]
  ) {
    setMatches((prev) =>
      prev.map((m) => {
        const u = updates.find((x) => x.id === m.id)
        if (!u) return m
        return {
          ...m,
          courtId: u.courtId,
          scheduledAt: u.scheduledAt,
          courtName: courts.find((c) => c.id === u.courtId)?.name ?? m.courtName,
        }
      })
    )
  }

  const dayMatches = scheduled
    .filter((m) => m.scheduledAt!.slice(0, 10) === selectedDay)
    .map((m) => {
      const d = new Date(m.scheduledAt!)
      const startMin = d.getHours() * 60 + d.getMinutes()
      return { ...m, startMin, endMin: startMin + m.durationMinutes }
    })

  const courtIdsInDay = [...new Set(dayMatches.map((m) => m.courtId!))]
  const rowCourts = courts
    .filter((c) => courtIdsInDay.includes(c.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  const gridStart =
    dayMatches.length > 0
      ? Math.floor(Math.min(...dayMatches.map((m) => m.startMin)) / 60) * 60
      : 8 * 60
  const gridEnd =
    dayMatches.length > 0
      ? Math.ceil(Math.max(...dayMatches.map((m) => m.endMin)) / 60) * 60
      : 21 * 60
  const totalWidth = (gridEnd - gridStart) * PX_PER_MIN
  const hourTicks: number[] = []
  for (let t = gridStart; t <= gridEnd; t += 60) hourTicks.push(t)

  function fmtHour(mins: number): string {
    const h = Math.floor(mins / 60)
    return `${h.toString().padStart(2, '0')}:00`
  }
  function playerLabel(name?: string, partner?: string | null): string {
    if (!name) return tRow('tbd')
    return partner ? `${name} / ${partner}` : name
  }

  return (
    <Modal open onClose={onClose} maxWidth="6xl" noPadding>
      <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-ink-900">{title}</h2>
          <p className="text-xs text-ink-400 mt-0.5">{tt('subtitle')}</p>
        </div>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {days.length === 0 ? (
        <div className="px-6 pb-8 text-sm text-ink-400 text-center py-10">{tt('noScheduled')}</div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 px-6 pb-3 flex-wrap shrink-0">
            {days.map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  d === selectedDay
                    ? 'bg-court-600 border-court-600 text-white'
                    : 'bg-white border-ink-200 text-ink-500 hover:border-ink-300'
                }`}
              >
                {new Date(d + 'T00:00:00').toLocaleDateString(locale, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                })}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto px-6 pb-6">
            {rowCourts.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-10">
                Sin partidos agendados este día.
              </p>
            ) : (
              <div style={{ minWidth: totalWidth + 140 }}>
                {/* Encabezado de horas */}
                <div className="flex sticky top-0 bg-white z-20">
                  <div style={{ width: 140 }} className="shrink-0" />
                  <div className="relative" style={{ width: totalWidth, height: 24 }}>
                    {hourTicks.map((t) => (
                      <div
                        key={t}
                        className="absolute top-0 text-[10px] font-semibold text-ink-400 border-l border-ink-100 pl-1"
                        style={{ left: (t - gridStart) * PX_PER_MIN, height: 24 }}
                      >
                        {fmtHour(t)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Filas por pista */}
                <div className="space-y-1.5 mt-1">
                  {rowCourts.map((court) => (
                    <div key={court.id} className="flex items-stretch">
                      <div style={{ width: 140 }} className="shrink-0 flex items-center pr-3">
                        <span className="text-xs font-semibold text-ink-600 truncate">
                          {court.name}
                        </span>
                      </div>
                      <div
                        className="relative bg-ink-50/60 rounded-lg border border-ink-100"
                        style={{ width: totalWidth, height: 64 }}
                      >
                        {hourTicks.map((t) => (
                          <div
                            key={t}
                            className="absolute top-0 bottom-0 border-l border-ink-100"
                            style={{ left: (t - gridStart) * PX_PER_MIN }}
                          />
                        ))}
                        {dayMatches
                          .filter((m) => m.courtId === court.id)
                          .map((m) => {
                            // Reprogramar solo tiene sentido antes de que el partido termine — una vez
                            // finalizado, el bloque queda de solo lectura (se puede revisar el marcador,
                            // pero no mover de pista/horario ni reabrir edición).
                            const canReschedule =
                              canEdit && m.status !== 'cancelled' && m.status !== 'completed'
                            const canOpenResult = canReschedule
                            const hasScore = Array.isArray(m.score) && m.score.length > 0
                            const normalizedScore = hasScore
                              ? (m.score as any[]).map(normalizeSetScore)
                              : []
                            const p1Scores = normalizedScore.map((s) => s.p1)
                            const p2Scores = normalizedScore.map((s) => s.p2)
                            return (
                              <div
                                key={m.id}
                                onClick={() => canOpenResult && setEditingMatch(m)}
                                className={`absolute top-1 bottom-1 rounded-lg border px-2 py-1 text-[10px] leading-tight overflow-hidden transition-colors ${MATCH_BLOCK_TONE[m.status] ?? 'bg-white border-ink-200'} ${canOpenResult ? 'cursor-pointer' : ''}`}
                                style={{
                                  left: (m.startMin - gridStart) * PX_PER_MIN + 2,
                                  width: Math.max(m.durationMinutes * PX_PER_MIN - 4, 60),
                                }}
                                title={`${m.tournamentName ?? ''} · ${playerLabel(m.player1?.displayName, m.player1PartnerName)} vs ${playerLabel(m.player2?.displayName, m.player2PartnerName)}`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-ink-700 truncate">
                                    {m.category ?? m.tournamentName}
                                  </span>
                                  <span className="flex items-center gap-1 shrink-0">
                                    {m.status === 'in_progress' && (
                                      <span
                                        className="text-trophy-600 font-bold"
                                        title={tt('live')}
                                      >
                                        ●
                                      </span>
                                    )}
                                    {canReschedule && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setEditingSchedule(m)
                                        }}
                                        className="text-ink-400 hover:text-ink-700"
                                        title={tt('reschedule')}
                                      >
                                        <Clock className="w-2.5 h-2.5" />
                                      </button>
                                    )}
                                  </span>
                                </div>
                                <div
                                  className={`flex items-center justify-between gap-1 truncate ${m.winnerId === m.player1Id ? 'font-bold text-court-700' : 'text-ink-600'}`}
                                >
                                  <span className="truncate">
                                    {playerLabel(m.player1?.displayName, m.player1PartnerName)}
                                  </span>
                                  {p1Scores.length > 0 && (
                                    <span className="shrink-0 tabular-nums">
                                      {p1Scores.join('-')}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className={`flex items-center justify-between gap-1 truncate ${m.winnerId === m.player2Id ? 'font-bold text-court-700' : 'text-ink-600'}`}
                                >
                                  <span className="truncate">
                                    {playerLabel(m.player2?.displayName, m.player2PartnerName)}
                                  </span>
                                  {p2Scores.length > 0 && (
                                    <span className="shrink-0 tabular-nums">
                                      {p2Scores.join('-')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {editingMatch && (
        <MatchScoreModal
          match={editingMatch}
          tournamentId={editingMatch.tournamentId}
          onClose={() => setEditingMatch(null)}
          onSaved={(updated) => {
            applyResultUpdate(updated)
            setEditingMatch(null)
          }}
        />
      )}
      {editingSchedule && (
        <MatchScheduleModal
          match={editingSchedule}
          tournamentId={editingSchedule.tournamentId}
          courts={courts}
          onClose={() => setEditingSchedule(null)}
          onSaved={(updates) => {
            applyReschedule(updates)
            setEditingSchedule(null)
          }}
        />
      )}
    </Modal>
  )
}

// ─── Bracket de eliminación (columnas) ───────────────────────────────────────

function EliminationBracket({
  bracket,
  tournament,
  canEdit,
  onEditMatch,
  onEditSchedule,
}: {
  bracket: Record<string, any[]>
  tournament: any
  canEdit: boolean
  onEditMatch: (m: any) => void
  onEditSchedule: (m: any) => void
}) {
  const t = useTranslations('Torneos')
  const rounds = Object.keys(bracket).sort((a, b) => Number(a) - Number(b))
  const maxRound = Math.max(...rounds.map(Number))

  return (
    <div className="flex gap-5 items-start">
      {rounds.map((r, idx) => {
        const matches = bracket[r]
        const stageKey = knockoutStageKeyForRound(Number(r), maxRound)
        const format = resolveMatchFormat(tournament, stageKey)
        return (
          <div key={r} style={{ minWidth: 260, flex: '0 0 260px' }}>
            <p className="text-xs font-bold text-ink-400 uppercase tracking-wider mb-3 text-center">
              {roundLabel(t, rounds.length, idx)}
            </p>
            <div className="flex flex-col" style={{ gap: `${Math.pow(2, idx) * 6}px` }}>
              {matches.map((m: any) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  canEdit={canEdit}
                  onEdit={() => onEditMatch({ ...m, effectiveFormat: format })}
                  onEditSchedule={() => onEditSchedule(m)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Lista de rondas (round robin / swiss) ────────────────────────────────────

function RoundList({
  bracket,
  tournament,
  canEdit,
  onEditMatch,
  onEditSchedule,
}: {
  bracket: Record<string, any[]>
  tournament: any
  canEdit: boolean
  onEditMatch: (m: any) => void
  onEditSchedule: (m: any) => void
}) {
  const t = useTranslations('Torneos')
  const rounds = Object.keys(bracket).sort((a, b) => Number(a) - Number(b))

  return (
    <div className="space-y-8">
      {rounds.map((r) => (
        <div key={r}>
          <p className="text-sm font-bold text-ink-600 mb-3">{t('roundLabel.generic', { n: r })}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bracket[r].map((m: any) => (
              <MatchCard
                key={m.id}
                match={m}
                canEdit={canEdit}
                onEdit={() => onEditMatch({ ...m, effectiveFormat: tournament.matchFormat })}
                onEditSchedule={() => onEditSchedule(m)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Modal bracket ────────────────────────────────────────────────────────────

function BracketModal({ tournament, onClose }: { tournament: any; onClose: () => void }) {
  const t = useTranslations('Torneos')
  const tm = useTranslations('Torneos.bracketModal')
  const isGroupsFormat = tournament.format === 'groups_bracket'
  const [viewTab, setViewTab] = useState<'groups' | 'bracket'>(
    isGroupsFormat ? 'groups' : 'bracket'
  )
  const [bracket, setBracket] = useState<Record<string, any[]> | null>(null)
  const [groups, setGroups] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingGroups, setLoadingGroups] = useState(isGroupsFormat)
  const [editingMatch, setEditingMatch] = useState<any | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null)
  const [courts, setCourts] = useState<CourtOption[]>([])
  const [advancing, setAdvancing] = useState(false)
  const [advanceError, setAdvanceError] = useState('')

  useEffect(() => {
    fetch(`${GW}/api/tournaments/${tournament.id}/bracket`)
      .then((r) => r.json())
      .then((d) => setBracket(d.data ?? {}))
      .catch(() => setBracket({}))
      .finally(() => setLoading(false))
  }, [tournament.id])

  useEffect(() => {
    if (!isGroupsFormat) return
    fetch(`${GW}/api/tournaments/${tournament.id}/groups`)
      .then((r) => r.json())
      .then((d) => setGroups(d.data ?? []))
      .catch(() => setGroups([]))
      .finally(() => setLoadingGroups(false))
  }, [tournament.id, isGroupsFormat])

  useEffect(() => {
    if (!tournament.clubId) return
    fetch(`${GW}/api/clubs/${tournament.clubId}`)
      .then((r) => r.json())
      .then((d) => setCourts(Array.isArray(d.data?.courts) ? d.data.courts : []))
      .catch(() => setCourts([]))
  }, [tournament.clubId])

  function updateMatchInBracket(updated: any) {
    // Actualizador funcional: cuando se mueven 2 partidos a la vez (swap por
    // conflicto), cada llamada debe partir del estado más reciente, no de la
    // closure capturada al render — si no, la segunda llamada pisa a la primera.
    setBracket((prev) => {
      if (!prev) return prev
      const next: Record<string, any[]> = {}
      for (const r of Object.keys(prev)) {
        next[r] = prev[r].map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
      }
      return next
    })
  }

  function updateMatchInGroups(updated: any) {
    setGroups(
      (prev) =>
        prev &&
        prev.map((g) => ({
          ...g,
          matches: g.matches.map((m: any) => (m.id === updated.id ? { ...m, ...updated } : m)),
        }))
    )
  }

  function courtName(id: string | null) {
    return id ? (courts.find((c) => c.id === id)?.name ?? id) : null
  }

  // El endpoint de reagendado puede devolver 1 (movido) o 2 (movido + el que
  // estaba en conflicto, reubicado también) partidos actualizados.
  function applyScheduleUpdates(
    updates: { id: string; courtId: string | null; scheduledAt: string | null }[]
  ) {
    for (const u of updates) {
      const patch = {
        courtId: u.courtId,
        scheduledAt: u.scheduledAt,
        courtName: courtName(u.courtId),
      }
      updateMatchInBracket({ id: u.id, ...patch })
      updateMatchInGroups({ id: u.id, ...patch })
    }
  }

  const isElimination =
    tournament.format === 'elimination' || tournament.format === 'groups_bracket'
  const canEdit = tournament.status === 'in_progress'
  const rounds = bracket ? Object.keys(bracket) : []

  // Fase de grupos: solo se puede cerrar y generar el cuadro cuando TODOS los
  // partidos de grupo ya tienen resultado, y todavía no existe un bracket generado
  // (el endpoint rechaza generarlo dos veces).
  const allGroupMatchesDone =
    !!groups &&
    groups.length > 0 &&
    groups.every((g) =>
      g.matches.every((m: any) => m.status === 'completed' || m.status === 'walkover')
    )
  const bracketAlreadyGenerated = rounds.length > 0

  async function advanceToKnockout() {
    setAdvancing(true)
    setAdvanceError('')
    try {
      const res = await fetch(`${GW}/api/tournaments/${tournament.id}/advance-to-knockout`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setAdvanceError(data.error ?? tm('advanceError'))
        return
      }
      const grouped: Record<string, any[]> = {}
      for (const m of data.data) (grouped[m.round] ??= []).push(m)
      setBracket(grouped)
      setViewTab('bracket')
    } catch {
      setAdvanceError(tm('connectionError'))
    } finally {
      setAdvancing(false)
    }
  }

  return (
    <Modal open onClose={onClose} maxWidth="7xl" noPadding>
      <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-ink-900">{tournament.name}</h2>
          <p className="text-sm text-ink-400">
            {t(`tournamentFormat.${tournament.format}`)} · {tournament.category}
            {canEdit && (
              <span className="ml-2 text-court-600 font-medium">{tm('activeEditing')}</span>
            )}
          </p>
        </div>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-600 p-1">
          <X className="w-5 h-5" />
        </button>
      </div>

      {isGroupsFormat && (
        <div className="flex gap-1.5 px-6 pt-4 shrink-0">
          {(['groups', 'bracket'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setViewTab(tab)}
              className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${
                viewTab === tab
                  ? 'bg-court-600 text-white'
                  : 'bg-ink-50 text-ink-500 hover:bg-ink-100'
              }`}
            >
              {tab === 'groups' ? tm('groupsTab') : tm('bracketTab')}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        {viewTab === 'groups' ? (
          loadingGroups ? (
            <div className="flex items-center gap-2 text-sm text-ink-400 py-12 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> {tm('loadingGroups')}
            </div>
          ) : !groups || groups.length === 0 ? (
            <div className="text-center py-16 text-ink-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">{tm('groupsNotGenerated')}</p>
              <p className="text-xs mt-1 text-ink-300">{tm('groupsGeneratedHint')}</p>
            </div>
          ) : (
            <>
              {canEdit && !bracketAlreadyGenerated && (
                <div className="mb-5 flex items-center justify-between gap-3 bg-court-50 border border-court-100 rounded-2xl px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-court-900">
                      {allGroupMatchesDone
                        ? tm('groupsCompleteTitle')
                        : tm('groupsInProgressTitle')}
                    </p>
                    <p className="text-xs text-court-700/80 mt-0.5">
                      {allGroupMatchesDone ? tm('groupsCompleteHint') : tm('groupsInProgressHint')}
                    </p>
                    {advanceError && (
                      <p className="text-xs text-referee-600 mt-1">{advanceError}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={advanceToKnockout}
                    disabled={!allGroupMatchesDone || advancing}
                  >
                    {advancing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      tm('advanceToBracket')
                    )}
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {groups.map((g) => (
                  <AdminGroupCard
                    key={g.groupNumber}
                    group={g}
                    tournament={tournament}
                    canEdit={canEdit}
                    onEditMatch={setEditingMatch}
                    onEditSchedule={setEditingSchedule}
                  />
                ))}
              </div>
            </>
          )
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-ink-400 py-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> {tm('loadingBracket')}
          </div>
        ) : rounds.length === 0 ? (
          <div className="text-center py-16 text-ink-400">
            <Trophy className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">{tm('noMatchesGenerated')}</p>
            <p className="text-xs mt-1 text-ink-300">
              {isGroupsFormat ? tm('bracketFromGroupsHint') : tm('bracketOnStartHint')}
            </p>
          </div>
        ) : isElimination ? (
          <EliminationBracket
            bracket={bracket!}
            tournament={tournament}
            canEdit={canEdit}
            onEditMatch={setEditingMatch}
            onEditSchedule={setEditingSchedule}
          />
        ) : (
          <RoundList
            bracket={bracket!}
            tournament={tournament}
            canEdit={canEdit}
            onEditMatch={setEditingMatch}
            onEditSchedule={setEditingSchedule}
          />
        )}
      </div>

      {editingMatch && (
        <MatchScoreModal
          match={editingMatch}
          tournamentId={tournament.id}
          onClose={() => setEditingMatch(null)}
          onSaved={(updated) => {
            updateMatchInBracket(updated)
            updateMatchInGroups(updated)
            setEditingMatch(null)
          }}
        />
      )}

      {editingSchedule && (
        <MatchScheduleModal
          match={editingSchedule}
          tournamentId={tournament.id}
          courts={courts}
          onClose={() => setEditingSchedule(null)}
          onSaved={(updates) => {
            applyScheduleUpdates(updates)
            setEditingSchedule(null)
          }}
        />
      )}
    </Modal>
  )
}

// ─── Vista de grupo (dashboard admin): standings + partidos editables ─────────

function AdminGroupCard({
  group,
  tournament,
  canEdit,
  onEditMatch,
  onEditSchedule,
}: {
  group: any
  tournament: any
  canEdit: boolean
  onEditMatch: (m: any) => void
  onEditSchedule: (m: any) => void
}) {
  const t = useTranslations('Torneos')
  const tm = useTranslations('Torneos.adminGroupCard')
  const locale = useLocale()
  return (
    <div className="border border-ink-200 rounded-2xl overflow-hidden bg-white shadow-sm">
      <div className="px-4 py-3 bg-ink-50 border-b border-ink-100 flex items-center justify-between">
        <p className="text-sm font-bold text-ink-900">
          {tm('groupTitle', { number: group.groupNumber })}
        </p>
        {group.isComplete && (
          <span className="text-xs font-semibold text-court-600">{tm('closed')}</span>
        )}
      </div>

      <div className="px-4 py-3 overflow-x-auto">
        <Table className="w-full text-xs">
          <TableHead className="normal-case bg-transparent">
            <tr className="text-ink-400 text-left">
              <Th className="pb-1.5 px-0 py-0 font-semibold">{tm('pairHeader')}</Th>
              <Th className="pb-1.5 px-0 py-0 font-semibold text-center">{tm('pointsHeader')}</Th>
              <Th className="pb-1.5 px-0 py-0 font-semibold text-center">{tm('playedHeader')}</Th>
              <Th className="pb-1.5 px-0 py-0 font-semibold text-center">{tm('setsHeader')}</Th>
            </tr>
          </TableHead>
          <TableBody className="divide-y-0">
            {group.standings.map((s: any, i: number) => (
              <TableRow key={s.playerId} className="border-t border-ink-100 hover:bg-transparent">
                <Td className="py-1.5 px-0">
                  <span className={i < 2 ? 'font-semibold text-court-700' : 'text-ink-700'}>
                    {i + 1}. {s.displayName}
                    {s.partnerName ? ` / ${s.partnerName}` : ''}
                  </span>
                </Td>
                <Td className="py-1.5 px-0 text-center font-semibold">{s.points}</Td>
                <Td className="py-1.5 px-0 text-center text-ink-500">{s.played}</Td>
                <Td className="py-1.5 px-0 text-center text-ink-500">
                  {s.setsWon}-{s.setsLost}
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="px-4 pb-4 space-y-2">
        {group.matches.map((m: any) => (
          <div
            key={m.id}
            className="border border-ink-100 rounded-xl px-3 py-2 flex items-start justify-between gap-2"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-700 leading-snug break-words">
                {(m.player1?.displayName ?? '?') +
                  (m.player1PartnerName ? ` / ${m.player1PartnerName}` : '')}
                {' vs '}
                {(m.player2?.displayName ?? '?') +
                  (m.player2PartnerName ? ` / ${m.player2PartnerName}` : '')}
              </p>
              <p className="text-[10px] text-ink-400 truncate flex items-center gap-1.5">
                {m.courtName && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {m.courtName}
                  </span>
                )}
                {m.scheduledAt && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatMatchDateTime(m.scheduledAt, locale)}
                  </span>
                )}
                {!m.courtName && !m.scheduledAt && t(`matchStatus.${m.status}`)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {m.score?.length > 0 && (
                <span className="text-xs font-bold text-ink-600">
                  {m.score
                    .map((s: any) => {
                      const n = normalizeSetScore(s)
                      return `${n.p1}-${n.p2}`
                    })
                    .join(' ')}
                </span>
              )}
              {canEdit && m.status !== 'cancelled' && m.status !== 'completed' && (
                <button
                  onClick={() => onEditSchedule(m)}
                  title={tm('changeSchedule')}
                  className="text-court-600 hover:text-court-800"
                >
                  <Clock className="w-3.5 h-3.5" />
                </button>
              )}
              {canEdit &&
                m.status !== 'completed' &&
                m.status !== 'cancelled' &&
                m.player1Id &&
                m.player2Id && (
                  <button
                    onClick={() => onEditMatch({ ...m, effectiveFormat: tournament.matchFormat })}
                    className="text-court-600 hover:text-court-700"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Modal: crear jugador nuevo + invitación ───────────────────────────────────

function CreatePlayerModal({
  initialQuery,
  onClose,
  onCreated,
}: {
  initialQuery?: string
  onClose: () => void
  onCreated: (u: UserResult) => void
}) {
  const t = useTranslations('Torneos.createPlayerModal')
  const looksLikeEmail = !!initialQuery && initialQuery.includes('@')
  const [name, setName] = useState(looksLikeEmail ? '' : (initialQuery ?? ''))
  const [email, setEmail] = useState(looksLikeEmail ? (initialQuery ?? '') : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ link: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit() {
    if (!name.trim()) {
      setError(t('errorNameRequired'))
      return
    }
    if (!email.trim()) {
      setError(t('errorEmailRequired'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`${GW}/api/auth/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          invitedBy: getUserId() || 'admin',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('errorGeneric'))
        return
      }
      setResult({ link: data.data.invite.link, name: data.data.user.displayName })
      onCreated({
        id: data.data.user.id,
        name: data.data.user.displayName,
        email: data.data.user.email,
      })
    } catch {
      setError(t('errorConnection'))
    } finally {
      setSubmitting(false)
    }
  }

  function copyLink() {
    if (!result) return
    navigator.clipboard.writeText(result.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal open onClose={onClose} maxWidth="sm" zIndex={60}>
      {result ? (
        <>
          <h3 className="font-bold text-ink-900 mb-1">{t('createdTitle')}</h3>
          <p className="text-sm text-ink-500 mb-4">{t('createdSubtitle', { name: result.name })}</p>
          <div className="flex items-center gap-2 bg-ink-50 border border-ink-200 rounded-xl px-3 py-2.5">
            <span className="text-xs text-ink-600 truncate flex-1">{result.link}</span>
            <button
              onClick={copyLink}
              className="text-xs font-semibold text-court-600 hover:text-court-700 shrink-0"
            >
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
          <p className="text-[11px] text-ink-400 mt-2">{t('linkExpiry')}</p>
          <Button className="w-full mt-5" onClick={onClose}>
            {t('done')}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-ink-900">{t('title')}</h3>
            <button onClick={onClose} className="text-ink-400 hover:text-ink-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && (
            <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-3 py-2 mb-3">
              {error}
            </p>
          )}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-ink-700 mb-1">
                {t('nameLabel')}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink-700 mb-1">
                {t('emailLabel')}
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
              />
            </div>
            <p className="text-xs text-ink-400">{t('hint')}</p>
          </div>
          <div className="flex gap-3 mt-5">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              {t('cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('submit')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ─── Modal: inscribir pareja/jugador ───────────────────────────────────────────

function PlayerSearchField({
  label,
  selected,
  onSelect,
  onClear,
}: {
  label: string
  selected: UserResult | null
  onSelect: (u: UserResult) => void
  onClear: () => void
}) {
  const t = useTranslations('Torneos.playerSearchField')
  const [q, setQ] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const { results, loading } = useUserSearch(q)
  return (
    <div>
      <label className="block text-sm font-semibold text-ink-700 mb-1">{label}</label>
      {showCreate && (
        <CreatePlayerModal
          initialQuery={q}
          onClose={() => setShowCreate(false)}
          onCreated={(u) => {
            onSelect(u)
            setQ('')
          }}
        />
      )}
      {selected ? (
        <div className="flex items-center justify-between gap-2 border border-ink-200 rounded-xl px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-court-600 flex items-center justify-center text-white font-bold text-[10px] shrink-0">
              {selected.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-900 truncate">{selected.name}</p>
              <p className="text-xs text-ink-400 truncate">{selected.email}</p>
            </div>
          </div>
          <button onClick={onClear} className="text-ink-400 hover:text-ink-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <Input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('placeholder')}
            className="w-full border border-ink-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40"
          />
          {q.length >= 2 && (
            <div className="absolute z-10 top-full mt-1 w-full bg-white border border-ink-200 rounded-xl shadow-lg overflow-hidden">
              {loading ? (
                <div className="p-3 text-sm text-ink-400 flex items-center gap-2">
                  <RefreshCw className="w-3 h-3 animate-spin" /> {t('searching')}
                </div>
              ) : results.length === 0 ? (
                <div className="p-3 text-sm text-ink-400">{t('noResults')}</div>
              ) : (
                results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      onSelect(u)
                      setQ('')
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50 text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-court-600 flex items-center justify-center text-white font-bold text-xs">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-900">{u.name}</p>
                      <p className="text-xs text-ink-400">{u.email}</p>
                    </div>
                  </button>
                ))
              )}
              <button
                onClick={() => setShowCreate(true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-court-50 text-left border-t border-ink-100 text-court-600"
              >
                <UserPlus className="w-4 h-4" />
                <span className="text-sm font-semibold">{t('createNew')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RegisterModal({
  tournament,
  onClose,
  onRegistered,
}: {
  tournament: any
  onClose: () => void
  onRegistered: () => void
}) {
  const t = useTranslations('Torneos.registerModal')
  const requiresPair = tournament.type === 'pairs'
  const [player, setPlayer] = useState<UserResult | null>(null)
  const [partner, setPartner] = useState<UserResult | null>(null)
  const [payStatus, setPayStatus] = useState<'pending' | 'paid' | 'courtesy'>('pending')
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('cash')
  const [courtesyReason, setCourtesyReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!player) {
      setError(t('errorSelectPlayer'))
      return
    }
    if (payStatus === 'courtesy' && !courtesyReason.trim()) {
      setError(t('errorCourtesyReason'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`${GW}/api/tournaments/${tournament.id}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.id,
          partnerId: partner?.id,
          paymentStatus: payStatus,
          courtesyReason: payStatus === 'courtesy' ? courtesyReason.trim() : undefined,
          paymentMethod: payStatus === 'paid' ? payMethod : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('errorGeneric'))
        return
      }
      onRegistered()
    } catch {
      setError(t('errorConnection'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={requiresPair ? t('titlePair') : t('titlePlayer')}
      maxWidth="md"
      footer={
        <div className="flex gap-3 w-full">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('submit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-4 py-2">{error}</p>
        )}

        <PlayerSearchField
          label={t('playerLabel')}
          selected={player}
          onSelect={setPlayer}
          onClear={() => setPlayer(null)}
        />

        {requiresPair && (
          <PlayerSearchField
            label={t('partnerLabel')}
            selected={partner}
            onSelect={setPartner}
            onClear={() => setPartner(null)}
          />
        )}

        {requiresPair && !partner && (
          <p className="text-xs text-trophy-600 bg-trophy-50 rounded-lg px-3 py-2 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {t('noPairWarning')}
          </p>
        )}

        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1.5">
            {t('paymentLabel')}
          </label>
          <div className="flex gap-2">
            {(['pending', 'paid', 'courtesy'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPayStatus(s)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                  payStatus === s
                    ? 'border-court-500 bg-court-50 text-court-700'
                    : 'border-ink-200 text-ink-500 hover:border-ink-300'
                }`}
              >
                {s === 'pending'
                  ? t('paymentPending')
                  : s === 'paid'
                    ? t('paymentPaid')
                    : t('paymentCourtesy')}
              </button>
            ))}
          </div>
          {payStatus === 'courtesy' && (
            <Textarea
              value={courtesyReason}
              onChange={(e) => setCourtesyReason(e.target.value)}
              placeholder={t('courtesyPlaceholder')}
              rows={2}
              className="resize-none mt-2"
            />
          )}
          {payStatus === 'paid' && (
            <div className="flex gap-2 mt-2">
              {(['cash', 'card'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    payMethod === m
                      ? 'border-court-400 bg-court-50 text-court-700'
                      : 'border-ink-200 text-ink-500 hover:border-ink-300'
                  }`}
                >
                  {m === 'cash' ? t('methodCash') : t('methodCard')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Tarjeta de torneo ────────────────────────────────────────────────────────

function TournamentCard({
  tournament: initial,
  events,
  courts,
  onStatusChange,
  onEventChange,
}: {
  tournament: any
  events: any[]
  courts: CourtOption[]
  onStatusChange: (id: string, newStatus: string) => void
  onEventChange: () => void
}) {
  const [t, setT] = useState(initial)
  const [transitioning, setTr] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [showBracket, setShowBracket] = useState(false)
  const [showPax, setShowPax] = useState(false)
  const [participants, setParticipants] = useState<any[] | null>(null)
  const [loadingPax, setLoadingPax] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [courtesyFor, setCourtesyFor] = useState<any | null>(null)
  const [courtesyReasonInput, setCourtesyReasonInput] = useState('')
  const [savingReserved, setSavingReserved] = useState(false)
  const [showCourtPicker, setShowCourtPicker] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [pickerError, setPickerError] = useState('')
  const [showGrid, setShowGrid] = useState(false)
  const [gridMatches, setGridMatches] = useState<GridMatch[]>([])
  const [loadingGrid, setLoadingGrid] = useState(false)
  const tt = useTranslations('Torneos')
  const tc = useTranslations('Torneos.tournamentCard')
  const locale = useLocale()

  async function loadGridMatches() {
    setLoadingGrid(true)
    try {
      const res = await fetch(`${GW}/api/tournaments/${t.id}/matches`)
      const data = await res.json()
      setGridMatches(res.ok ? (data.data ?? []) : [])
    } catch {
      setGridMatches([])
    } finally {
      setLoadingGrid(false)
    }
  }

  async function handleSchedule(courtIds: string[]) {
    setScheduling(true)
    setPickerError('')
    try {
      const res = await fetch(`${GW}/api/tournaments/${t.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courtIds }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPickerError(data.error ?? tc('scheduleError'))
        return
      }
      showToastMsg(
        tc('scheduledToast', {
          scheduled: data.data.scheduledMatches,
          courts: data.data.courtsUsed,
        }),
        true
      )
      setShowCourtPicker(false)
    } catch {
      setPickerError(tc('connectionError'))
    } finally {
      setScheduling(false)
    }
  }

  const statusLabel = tt(`tournamentStatus.${t.status}`)
  const actions = STATUS_ACTIONS[t.status] ?? []
  const canEdit = t.status === 'draft' || t.status === 'open'
  const pct =
    t.maxParticipants > 0 ? Math.round((t.currentParticipants / t.maxParticipants) * 100) : 0

  function showToastMsg(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  async function loadParticipants(force = false) {
    if (participants !== null && !force) return
    setLoadingPax(true)
    try {
      const res = await fetch(`${GW}/api/tournaments/${t.id}`)
      const data = await res.json()
      setParticipants(data.data?.participants ?? [])
      if (data.data)
        setT((prev: any) => ({ ...prev, currentParticipants: data.data.currentParticipants }))
    } catch {
      setParticipants([])
    } finally {
      setLoadingPax(false)
    }
  }

  function togglePax() {
    if (!showPax && participants === null) loadParticipants()
    setShowPax((p) => !p)
  }

  async function removeParticipant(participantId: string) {
    setRemovingId(participantId)
    try {
      const res = await fetch(`${GW}/api/tournaments/${t.id}/participants/${participantId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        showToastMsg(tc('removeError'), false)
        return
      }
      await loadParticipants(true)
    } catch {
      showToastMsg(tc('connectionErrorGeneric'), false)
    } finally {
      setRemovingId(null)
    }
  }

  async function updatePayment(
    participantId: string,
    paymentStatus: 'paid' | 'pending' | 'courtesy',
    reason?: string,
    paymentMethod?: 'cash' | 'card'
  ) {
    setPayingId(participantId)
    try {
      const res = await fetch(
        `${GW}/api/tournaments/${t.id}/participants/${participantId}/payment`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentStatus, courtesyReason: reason, paymentMethod }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        showToastMsg(data.error ?? tc('paymentError'), false)
        return
      }
      setParticipants(
        (prev) => prev?.map((p) => (p.id === participantId ? { ...p, ...data.data } : p)) ?? []
      )
      showToastMsg(tc('paymentUpdated'), true)
    } catch {
      showToastMsg(tc('connectionErrorGeneric'), false)
    } finally {
      setPayingId(null)
      setCourtesyFor(null)
      setCourtesyReasonInput('')
    }
  }

  async function changeReservedPairs(delta: number) {
    const currentPairs = Math.floor((t.reservedSlots ?? 0) / 2)
    const nextPairs = Math.max(0, currentPairs + delta)
    setSavingReserved(true)
    try {
      const res = await fetch(`${GW}/api/tournaments/${t.id}/reserved-slots`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservedPairs: nextPairs }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToastMsg(data.error ?? tc('reservedError'), false)
        return
      }
      setT((prev: any) => ({ ...prev, reservedSlots: data.data.reservedSlots }))
    } catch {
      showToastMsg(tc('connectionErrorGeneric'), false)
    } finally {
      setSavingReserved(false)
    }
  }

  async function handleStatusChange(next: string) {
    setTr(next)
    try {
      const res = await fetch(`${GW}/api/tournaments/${t.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToastMsg(data.error ?? 'Error', false)
        return
      }
      setT((prev: any) => ({ ...prev, status: next }))
      onStatusChange(t.id, next)
      showToastMsg(tt(`tournamentStatus.${next}`) ?? next, true)
    } catch {
      showToastMsg(tc('connectionErrorGeneric'), false)
    } finally {
      setTr(null)
    }
  }

  return (
    <div>
      {showEdit && (
        <EditTournamentModal
          tournament={t}
          events={events}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            const eventChanged = updated.eventId !== t.eventId
            setT((prev: any) => ({ ...prev, ...updated }))
            setShowEdit(false)
            showToastMsg(tc('tournamentUpdated'), true)
            if (eventChanged) onEventChange()
          }}
        />
      )}
      {showBracket && <BracketModal tournament={t} onClose={() => setShowBracket(false)} />}
      {showCourtPicker && (
        <CourtPickerModal
          courts={courts}
          defaultSport={t.sport}
          onClose={() => {
            setShowCourtPicker(false)
            setPickerError('')
          }}
          onConfirm={handleSchedule}
          confirming={scheduling}
          error={pickerError}
        />
      )}
      {showGrid && (
        <ScheduleGridModal
          title={tc('scheduleTitle', { name: t.name })}
          initialMatches={gridMatches}
          courts={courts}
          canEdit={t.status !== 'completed' && t.status !== 'cancelled'}
          onClose={() => setShowGrid(false)}
        />
      )}
      {showRegister && (
        <RegisterModal
          tournament={t}
          onClose={() => setShowRegister(false)}
          onRegistered={async () => {
            setShowRegister(false)
            await loadParticipants(true)
            setShowPax(true)
            showToastMsg(tc('registeredToast'), true)
          }}
        />
      )}
      <Modal
        open={!!courtesyFor}
        onClose={() => {
          setCourtesyFor(null)
          setCourtesyReasonInput('')
        }}
        title={tc('courtesyModalTitle')}
        maxWidth="sm"
        zIndex={60}
        footer={
          <div className="flex gap-3 w-full">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setCourtesyFor(null)
                setCourtesyReasonInput('')
              }}
            >
              {tt('editEventModal.cancel')}
            </Button>
            <Button
              className="flex-1"
              disabled={!courtesyReasonInput.trim() || payingId === courtesyFor?.id}
              onClick={() =>
                courtesyFor && updatePayment(courtesyFor.id, 'courtesy', courtesyReasonInput)
              }
            >
              {payingId === courtesyFor?.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                tc('confirmCourtesy')
              )}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-400">
          {courtesyFor?.player?.displayName ?? tc('playerFallback')}
        </p>
        <Textarea
          value={courtesyReasonInput}
          onChange={(e) => setCourtesyReasonInput(e.target.value)}
          placeholder={tc('courtesyModalPlaceholder')}
          rows={3}
          className="resize-none mt-4"
        />
      </Modal>
      <Card className="p-5 hover:border-ink-200 transition-all">
        <div className="flex items-start justify-between gap-4">
          {/* Columna izquierda */}
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div
              className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center ${
                t.sport === 'padel' ? 'bg-court-50 text-court-600' : 'bg-trophy-50 text-trophy-600'
              }`}
            >
              {t.sport === 'padel' ? <PadelIcon size={26} /> : <PickleballIcon size={26} />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-bold text-ink-900 text-base break-words">{t.name}</h3>
                <Badge tone={STATUS_TONE[t.status] ?? 'gray'} dot>
                  {statusLabel}
                </Badge>
              </div>

              {t.club?.name && (
                <div className="flex items-center gap-1 text-xs text-ink-400 mb-1.5 min-w-0">
                  <Building2 className="w-3 h-3 shrink-0" />
                  <span className="truncate">{t.club.name}</span>
                </div>
              )}

              <div className="flex items-center gap-3 text-sm text-ink-500 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {t.location}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />{' '}
                  {new Date(t.startDate).toLocaleDateString(locale)}
                </span>
                <Badge tone="violet">{tt(`tournamentFormat.${t.format}`) || t.format}</Badge>
                <Badge tone="gray">{t.category}</Badge>
                <Badge
                  tone={
                    t.genderCategory === 'femenino'
                      ? 'red'
                      : t.genderCategory === 'masculino'
                        ? 'blue'
                        : 'violet'
                  }
                >
                  {t.genderCategory ? tt(`gender.${t.genderCategory}`) : tt('gender.mixto')}
                </Badge>
                {t.eventId && (
                  <Badge tone="amber" className="max-w-full">
                    <span className="break-words inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3 shrink-0" />{' '}
                      {events.find((ev) => ev.id === t.eventId)?.name ?? tc('eventFallback')}
                    </span>
                  </Badge>
                )}
              </div>

              {t.matchFormat && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-400 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Layers className="w-3 h-3" />{' '}
                    {MATCH_FORMAT_LABELS[t.matchFormat as MatchFormat] ?? t.matchFormat}
                  </span>
                  {t.matchFormatOverrides && Object.keys(t.matchFormatOverrides).length > 0 && (
                    <span className="text-ink-300">
                      ·{' '}
                      {KNOCKOUT_STAGE_KEYS.filter(
                        (k) => (t.matchFormatOverrides as MatchFormatOverrides)[k]
                      )
                        .map(
                          (k) =>
                            `${KNOCKOUT_STAGE_LABELS[k]}: ${MATCH_FORMAT_LABELS[(t.matchFormatOverrides as MatchFormatOverrides)[k]!]}`
                        )
                        .join(' · ')}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 max-w-xs">
                  <div className="flex justify-between text-xs text-ink-400 mb-1">
                    <span>{tc('inscriptionsLabel')}</span>
                    <span className="font-semibold text-ink-700">
                      {t.currentParticipants}/{t.maxParticipants}
                    </span>
                  </div>
                  <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 90 ? 'bg-referee-400' : pct >= 70 ? 'bg-trophy-400' : 'bg-court-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                {t.entryFee > 0 && (
                  <span className="text-xs font-bold text-trophy-600">
                    {formatCurrency(t.entryFee, t.currency)}
                  </span>
                )}
                {t.prizeInfo && (
                  <span className="text-xs font-bold text-trophy-600 inline-flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5" /> {t.prizeInfo}
                  </span>
                )}
              </div>

              {canEdit && (
                <div className="mt-2 flex items-center gap-2 text-xs text-ink-400">
                  <span>{tc('reservedPairsLabel')}</span>
                  <button
                    onClick={() => changeReservedPairs(-1)}
                    disabled={savingReserved || (t.reservedSlots ?? 0) <= 0}
                    className="w-5 h-5 rounded-md border border-ink-200 text-ink-500 hover:bg-ink-50 disabled:opacity-40 flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="font-semibold text-ink-600 w-4 text-center">
                    {Math.floor((t.reservedSlots ?? 0) / 2)}
                  </span>
                  <button
                    onClick={() => changeReservedPairs(1)}
                    disabled={savingReserved}
                    className="w-5 h-5 rounded-md border border-ink-200 text-ink-500 hover:bg-ink-50 disabled:opacity-40 flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              )}

              {toast && (
                <div
                  className={`mt-2 text-xs px-3 py-1.5 rounded-lg ${
                    toast.ok ? 'bg-court-50 text-court-700' : 'bg-referee-50 text-referee-700'
                  }`}
                >
                  {toast.msg}
                </div>
              )}
            </div>
          </div>

          {/* Columna de acciones */}
          <div className="flex flex-col gap-2 shrink-0 min-w-[130px]">
            <Button size="sm" variant="secondary" onClick={() => setShowBracket(true)}>
              {tc('viewBracket')}
            </Button>
            <button
              onClick={togglePax}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-ink-200 text-ink-600 hover:bg-ink-50 transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              {t.type === 'pairs'
                ? tc('pairs', { count: Math.ceil(t.currentParticipants / 2) })
                : tc('players', { count: t.currentParticipants })}
              {showPax ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={() => setShowEdit(true)}>
                {tc('edit')}
              </Button>
            )}
            {t.status === 'in_progress' && !t.eventId && (
              <Button size="sm" variant="ghost" onClick={() => setShowCourtPicker(true)}>
                {tc('scheduleCourts')}
              </Button>
            )}
            {(t.status === 'in_progress' || t.status === 'completed') && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  loadGridMatches()
                  setShowGrid(true)
                }}
                disabled={loadingGrid}
              >
                {tc('viewSchedule')}
              </Button>
            )}
            {t.status === 'open' && (
              <button
                onClick={() => setShowRegister(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-court-200 text-court-700 hover:bg-court-50 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" /> {tc('register')}
              </button>
            )}
            {actions.map((a) => (
              <button
                key={a.next}
                onClick={() => handleStatusChange(a.next)}
                disabled={transitioning !== null}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ${
                  a.primary
                    ? 'bg-court-600 text-white hover:bg-court-700'
                    : 'border border-ink-200 text-ink-500 hover:bg-ink-50'
                }`}
              >
                {transitioning === a.next ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  tt(`statusActions.${a.labelKey}`)
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Panel de participantes */}
        {showPax && (
          <div className="mt-4 pt-4 border-t border-ink-100">
            {loadingPax ? (
              <div className="flex items-center gap-2 text-sm text-ink-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> {tc('loadingParticipants')}
              </div>
            ) : !participants || participants.length === 0 ? (
              <p className="text-sm text-ink-400 py-2">{tc('noParticipants')}</p>
            ) : (
              <div className="space-y-3">
                {(() => {
                  function renderRow(p: any) {
                    const name = p.player?.displayName ?? tc('playerFallback')
                    const initials = name
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                    const pTone = PAYMENT_TONE[p.paymentStatus] ?? 'gray'
                    const pLabel = tt(`paymentStatus.${p.paymentStatus}`) ?? p.paymentStatus
                    return (
                      <div key={p.id} className="flex items-center gap-3 py-1">
                        <div className="w-8 h-8 rounded-full bg-court-100 text-court-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-ink-800 break-words">
                              {name}
                            </span>
                            {p.player?.category && <Badge tone="violet">{p.player.category}</Badge>}
                            {p.teamName && (
                              <span className="text-xs text-ink-400 truncate">— {p.teamName}</span>
                            )}
                          </div>
                          {p.paymentStatus === 'courtesy' && p.courtesyReason && (
                            <p className="text-xs text-trophy-500 mt-0.5 truncate inline-flex items-center gap-1">
                              <Gift className="w-3 h-3 shrink-0" /> {p.courtesyReason}
                            </p>
                          )}
                        </div>
                        {canEdit && p.paymentStatus !== 'paid' && p.paymentStatus !== 'courtesy' ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => updatePayment(p.id, 'paid', undefined, 'cash')}
                              disabled={payingId === p.id}
                              title={tc('markPaidCashTitle')}
                              className="text-xs font-semibold px-2 py-1 rounded-lg border border-trophy-100 text-trophy-700 hover:bg-trophy-50 transition-colors disabled:opacity-50"
                            >
                              {payingId === p.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                tc('markPaidCash')
                              )}
                            </button>
                            <button
                              onClick={() => updatePayment(p.id, 'paid', undefined, 'card')}
                              disabled={payingId === p.id}
                              title={tc('markPaidCardTitle')}
                              className="text-xs font-semibold px-2 py-1 rounded-lg border border-court-200 text-court-700 hover:bg-court-50 transition-colors disabled:opacity-50"
                            >
                              {payingId === p.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                tc('markPaidCard')
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setCourtesyFor(p)
                                setCourtesyReasonInput('')
                              }}
                              className="text-xs font-semibold px-2 py-1 rounded-lg border border-trophy-100 text-trophy-700 hover:bg-trophy-50 transition-colors"
                            >
                              {tc('markCourtesy')}
                            </button>
                          </div>
                        ) : (
                          <Badge tone={pTone as any}>{pLabel}</Badge>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => removeParticipant(p.id)}
                            disabled={removingId === p.id}
                            title={tc('removeParticipant')}
                            className="ml-1 text-ink-300 hover:text-referee-400 transition-colors disabled:opacity-50"
                          >
                            {removingId === p.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    )
                  }

                  if (t.type !== 'pairs') {
                    return participants!.map((p) => renderRow(p))
                  }

                  // Agrupar por pareja
                  const byPlayerId = new Map(participants!.map((p) => [p.playerId, p]))
                  const seen = new Set<string>()
                  const groups: any[][] = []
                  for (const p of participants!) {
                    if (seen.has(p.id)) continue
                    seen.add(p.id)
                    const partner = p.partnerId ? byPlayerId.get(p.partnerId) : undefined
                    if (partner && !seen.has(partner.id)) {
                      seen.add(partner.id)
                      groups.push([p, partner])
                    } else {
                      groups.push([p])
                    }
                  }

                  return groups.map((group, i) => (
                    <div
                      key={group[0].id}
                      className={`rounded-xl border ${group.length === 2 ? 'border-court-100 bg-court-50/30' : 'border-trophy-100 bg-trophy-50/30'} px-2 py-2`}
                    >
                      <div className="flex items-center justify-between px-1 mb-1">
                        <span className="text-[11px] font-bold text-ink-400 uppercase tracking-wide">
                          {tc('pairLabel', { number: i + 1 })}
                        </span>
                        {group.length === 2 ? (
                          <Badge tone="emerald">{tc('pairComplete')}</Badge>
                        ) : (
                          <Badge tone="amber">{tc('pairIncomplete')}</Badge>
                        )}
                      </div>
                      <div className="divide-y divide-ink-100">
                        {group.map((p) => renderRow(p))}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

const ACTIVE_STATUSES = ['draft', 'open', 'in_progress']

export default function TorneosPage() {
  const t = useTranslations('Torneos.page')
  const [tournaments, setTournaments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<any[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [courts, setCourts] = useState<CourtOption[]>([])
  const [clubId, setClubId] = useState('')
  const [clubName, setClubName] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [view, setView] = useState<'active' | 'inactive'>('active')
  const [search, setSearch] = useState('')

  function loadTournaments(cId: string) {
    setLoading(true)
    // limit alto a propósito: esta es la vista de administración de UN club (no el
    // descubrimiento público paginado de la app), así que traemos todos sus torneos
    // de una — antes el límite por defecto (20) cortaba en silencio la pestaña
    // "Activos" cuando el club tenía más de 20 torneos en total (activos + finalizados).
    const url = cId
      ? `${GW}/api/tournaments?clubId=${cId}&limit=500`
      : `${GW}/api/tournaments?limit=500`
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setTournaments(Array.isArray(d.data) ? d.data : [])
        const total = d.pagination?.total
        if (typeof total === 'number' && Array.isArray(d.data) && total > d.data.length) {
          console.warn(
            `Torneos: mostrando ${d.data.length} de ${total} — sube el límite si esto se vuelve visible.`
          )
        }
      })
      .catch(() => setTournaments([]))
      .finally(() => setLoading(false))
  }

  function loadEvents(cId: string) {
    if (!cId) {
      setEvents([])
      setLoadingEvents(false)
      return
    }
    setLoadingEvents(true)
    fetch(`${GW}/api/tournament-events?clubId=${cId}`)
      .then((r) => r.json())
      .then((d) => setEvents(Array.isArray(d.data) ? d.data : []))
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false))
  }

  function loadCourts(cId: string) {
    if (!cId) {
      setCourts([])
      return
    }
    fetch(`${GW}/api/clubs/${cId}`)
      .then((r) => r.json())
      .then((d) => setCourts(Array.isArray(d.data?.courts) ? d.data.courts : []))
      .catch(() => setCourts([]))
  }

  useEffect(() => {
    const stored = localStorage.getItem('racketly_active_club') || ''
    let cId = stored
    let cName = ''
    try {
      const p = JSON.parse(stored)
      if (p?.id) {
        cId = p.id
        cName = p.name ?? ''
      }
    } catch {
      /* plain string */
    }
    setClubId(cId)
    setClubName(cName)
    loadTournaments(cId)
    loadEvents(cId)
    loadCourts(cId)

    function onClubChange(e: Event) {
      const club = (e as CustomEvent).detail
      setClubId(club.id)
      setClubName(club.name ?? '')
      loadTournaments(club.id)
      loadEvents(club.id)
      loadCourts(club.id)
    }
    window.addEventListener('club-changed', onClubChange)
    return () => window.removeEventListener('club-changed', onClubChange)
  }, [])

  function handleStatusChange(id: string, newStatus: string) {
    setTournaments((prev) => prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t)))
  }

  const stats = {
    open: tournaments.filter((t) => t.status === 'open').length,
    in_progress: tournaments.filter((t) => t.status === 'in_progress').length,
    completed: tournaments.filter((t) => t.status === 'completed').length,
    players: tournaments.reduce((s: number, t: any) => s + (t.currentParticipants || 0), 0),
  }

  const activeTournaments = tournaments.filter((t) => ACTIVE_STATUSES.includes(t.status))
  const inactiveTournaments = tournaments.filter((t) => !ACTIVE_STATUSES.includes(t.status))

  function matchesSearch(t: any) {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      t.name.toLowerCase().includes(q) ||
      String(t.category ?? '')
        .toLowerCase()
        .includes(q)
    )
  }

  const visibleTournaments = (view === 'active' ? activeTournaments : inactiveTournaments).filter(
    matchesSearch
  )

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('statOpen')} value={String(stats.open)} icon={Trophy} tone="emerald" />
        <StatCard
          label={t('statInProgress')}
          value={String(stats.in_progress)}
          icon={Trophy}
          tone="amber"
        />
        <StatCard
          label={t('statCompleted')}
          value={String(stats.completed)}
          icon={Trophy}
          tone="gray"
        />
        <StatCard
          label={t('statPlayers')}
          value={String(stats.players)}
          icon={Trophy}
          tone="violet"
        />
      </div>

      <EventsPanel
        clubId={clubId}
        events={events}
        courts={courts}
        loading={loadingEvents}
        onCreated={(ev) => setEvents((prev) => [ev as any, ...prev])}
        onScheduled={() => loadTournaments(clubId)}
        onUpdated={(ev) =>
          setEvents((prev) =>
            prev.map((e) => (e.id === (ev as any).id ? { ...e, ...(ev as any) } : e))
          )
        }
      />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-900">{t('title')}</h2>
          <p className="flex items-center gap-1.5 text-xs text-ink-400 mt-0.5">
            <Building2 className="w-3.5 h-3.5" />
            {clubId ? (
              <>
                {t('activeClub')}{' '}
                <span className="font-semibold text-ink-500">{clubName || clubId}</span>
              </>
            ) : (
              t('noActiveClub')
            )}
          </p>
        </div>
        <Button
          onClick={() => {
            if (!clubId) {
              alert(t('selectClubFirst'))
              return
            }
            setShowModal(true)
          }}
        >
          <Plus className="w-4 h-4" /> {t('createTournament')}
        </Button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('active')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              view === 'active'
                ? 'bg-primary-900 text-white'
                : 'bg-white text-ink-600 border border-ink-200 hover:border-ink-300'
            }`}
          >
            {t('tabActive', { count: activeTournaments.length })}
          </button>
          <button
            onClick={() => setView('inactive')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              view === 'inactive'
                ? 'bg-primary-900 text-white'
                : 'bg-white text-ink-600 border border-ink-200 hover:border-ink-300'
            }`}
          >
            {t('tabInactive', { count: inactiveTournaments.length })}
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="border border-ink-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40 w-64"
          />
        </div>
      </div>

      {loading ? (
        <SkeletonCards count={6} />
      ) : tournaments.length === 0 ? (
        <Card>
          <EmptyState
            icon={Trophy}
            title={t('noTournaments')}
            action={
              <Button size="sm" onClick={() => setShowModal(true)}>
                <Plus className="w-3.5 h-3.5" /> {t('createFirst')}
              </Button>
            }
          />
        </Card>
      ) : visibleTournaments.length === 0 ? (
        <Card>
          <EmptyState
            icon={Trophy}
            title={view === 'active' ? t('noActiveTournaments') : t('noSearchResults')}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleTournaments.map((t) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              events={events}
              courts={courts}
              onStatusChange={handleStatusChange}
              onEventChange={() => loadEvents(clubId)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <CreateTournamentModal
          clubId={clubId}
          events={events}
          onClose={() => setShowModal(false)}
          onCreated={(t) => {
            setTournaments((prev) => [t as any, ...prev])
            setShowModal(false)
            if ((t as any).eventId) loadEvents(clubId)
          }}
        />
      )}
    </div>
  )
}
