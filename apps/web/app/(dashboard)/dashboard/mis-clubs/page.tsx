'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  Trash2,
  Power,
  BarChart3,
  Plus,
  Loader2,
  MapPin,
  Globe,
  Mail,
  Phone,
  Pencil,
  X,
  Check,
  Clock,
  Copy,
} from 'lucide-react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { Modal } from '@/components/ui/Modal'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'

type Club = {
  id: string
  name: string
  description: string | null
  country: string
  city: string
  address: string
  sports: string[]
  amenities: string[]
  isActive: boolean
  currency: string
  cancellationPolicy: string | null
  bookingHorizonDays: number | null
  slotGenerationHour: number | null
  adminRole: string
  contactEmail: string | null
  phone: string | null
  website: string | null
  courts: { id: string }[]
}

const GW = '' // relative — middleware inyecta auth, next.config reescribe al gateway

const AMENITY_IDS = [
  'parking',
  'showers',
  'lockers',
  'cafeteria',
  'pro_shop',
  'equipment',
  'lighting',
  'wifi',
  'ac',
  'disability',
  'kids_area',
  'spectators',
] as const

const AMENITY_KEY: Record<string, string> = {
  parking: 'parking',
  showers: 'showers',
  lockers: 'lockers',
  cafeteria: 'cafeteria',
  pro_shop: 'proShop',
  equipment: 'equipment',
  lighting: 'lighting',
  wifi: 'wifi',
  ac: 'ac',
  disability: 'disability',
  kids_area: 'kidsArea',
  spectators: 'spectators',
}

function EditClubModal({
  club,
  onClose,
  onSaved,
}: {
  club: Club
  onClose: () => void
  onSaved: (updated: Club) => void
}) {
  const t = useTranslations('MisClubs.edit')
  const tAmenities = useTranslations('MisClubs.editAmenities')
  const [form, setForm] = useState({
    name: club.name,
    description: club.description ?? '',
    city: club.city,
    address: club.address,
    sports: [...club.sports],
    amenities: [...(club.amenities ?? [])],
    contactEmail: club.contactEmail ?? '',
    phone: club.phone ?? '',
    website: club.website ?? '',
    currency: club.currency ?? 'USD',
    cancellationPolicy: club.cancellationPolicy ?? 'flexible',
    bookingHorizonDays: club.bookingHorizonDays ?? 30,
    slotGenerationHour: club.slotGenerationHour ?? 6,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleSport(s: string) {
    setForm((f) => ({
      ...f,
      sports: f.sports.includes(s) ? f.sports.filter((x) => x !== s) : [...f.sports, s],
    }))
  }

  function toggleAmenity(id: string) {
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(id)
        ? f.amenities.filter((a) => a !== id)
        : [...f.amenities, id],
    }))
  }

  async function handleSave() {
    if (!form.name.trim() || !form.city.trim() || !form.address.trim()) {
      setError(t('errorRequired'))
      return
    }
    if (form.sports.length === 0) {
      setError(t('errorSport'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${GW}/api/clubs/${club.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          city: form.city.trim(),
          address: form.address.trim(),
          sports: form.sports,
          amenities: form.amenities,
          contactEmail: form.contactEmail.trim() || null,
          phone: form.phone.trim() || null,
          website: form.website.trim() || null,
          currency: form.currency.trim() || 'USD',
          cancellationPolicy: form.cancellationPolicy || null,
          bookingHorizonDays: Number(form.bookingHorizonDays),
          slotGenerationHour: Number(form.slotGenerationHour),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('genericError'))
        return
      }
      onSaved({ ...club, ...data.data })
    } catch {
      setError(t('connectionError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={t('title')} maxWidth="lg">
      <div className="space-y-4">
        {error && (
          <p className="text-xs px-3 py-2 rounded-lg bg-referee-50 text-referee-600">{error}</p>
        )}

        <div>
          <label className="block text-xs font-semibold text-ink-500 mb-1">{t('name')}</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-500 mb-1">
            {t('description')}
          </label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-500 mb-1">{t('city')}</label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 mb-1">{t('address')}</label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
        </div>

        {/* Deportes */}
        <div>
          <label className="block text-xs font-semibold text-ink-500 mb-2">{t('sports')}</label>
          <div className="flex gap-3">
            {(
              [
                { id: 'padel', label: t('sportPadel'), Icon: PadelIcon },
                { id: 'pickleball', label: t('sportPickleball'), Icon: PickleballIcon },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSport(s.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                  form.sports.includes(s.id)
                    ? 'bg-court-50 border-court-400 text-court-700'
                    : 'bg-ink-50 border-ink-200 text-ink-500 hover:border-ink-300'
                }`}
              >
                <s.Icon size={17} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Amenidades */}
        <div>
          <label className="block text-xs font-semibold text-ink-500 mb-2">{t('amenities')}</label>
          <div className="grid grid-cols-2 gap-2">
            {AMENITY_IDS.map((id) => {
              const checked = form.amenities.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleAmenity(id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors text-left ${
                    checked
                      ? 'bg-court-50 border-court-300 text-court-700'
                      : 'border-ink-200 text-ink-500 hover:border-ink-300'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${checked ? 'bg-court-500' : 'bg-ink-100'}`}
                  >
                    {checked && <Check className="w-2.5 h-2.5 text-white" />}
                  </span>
                  {tAmenities(AMENITY_KEY[id])}
                </button>
              )
            })}
          </div>
        </div>

        {/* Política de cancelación + Horizonte */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-500 mb-1">
              {t('cancellationPolicy')}
            </label>
            <Select
              value={form.cancellationPolicy}
              onChange={(e) => setForm({ ...form, cancellationPolicy: e.target.value })}
            >
              <option value="flexible">{t('cancellationFlexible')}</option>
              <option value="moderate">{t('cancellationModerate')}</option>
              <option value="strict">{t('cancellationStrict')}</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 mb-1">
              {t('bookingHorizon')}
            </label>
            <Select
              value={form.bookingHorizonDays}
              onChange={(e) => setForm({ ...form, bookingHorizonDays: Number(e.target.value) })}
            >
              <option value={7}>{t('bookingHorizonDays', { count: 7 })}</option>
              <option value={14}>{t('bookingHorizonDays', { count: 14 })}</option>
              <option value={30}>{t('bookingHorizonDays', { count: 30 })}</option>
              <option value={60}>{t('bookingHorizonDays', { count: 60 })}</option>
              <option value={90}>{t('bookingHorizonDays', { count: 90 })}</option>
            </Select>
          </div>
        </div>

        {/* Hora de generación automática de slots */}
        <div>
          <label className="block text-xs font-semibold text-ink-500 mb-1">
            {t('slotGeneration')}
          </label>
          <Select
            value={form.slotGenerationHour}
            onChange={(e) => setForm({ ...form, slotGenerationHour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </Select>
          <p className="text-[11px] text-ink-400 mt-1">{t('slotGenerationHint')}</p>
        </div>

        {/* Moneda */}
        <div>
          <label className="block text-xs font-semibold text-ink-500 mb-1">{t('currency')}</label>
          <Input
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
            placeholder={t('currencyPlaceholder')}
            maxLength={3}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-500 mb-1">
            {t('contactEmail')}
          </label>
          <Input
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            placeholder={t('contactEmailPlaceholder')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-500 mb-1">{t('phone')}</label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder={t('phonePlaceholder')}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 mb-1">{t('website')}</label>
            <Input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder={t('websitePlaceholder')}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> {t('saving')}
              </>
            ) : (
              t('save')
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal: horario pico ────────────────────────────────────────────────────

type PeakWindow = { startTime: string; endTime: string }
type PeakRule = { id: string; dayOfWeek: number; startTime: string; endTime: string }

// Opciones de hora en intervalos de 30 min, cubriendo el día completo (incluye 24:00 como cierre)
const PEAK_TIME_OPTIONS = [
  ...Array.from({ length: 48 }, (_, i) => {
    const totalMin = i * 30
    return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
  }),
  '24:00',
]

const DAY_KEYS: { dow: number; key: string }[] = [
  { dow: 1, key: 'monday' },
  { dow: 2, key: 'tuesday' },
  { dow: 3, key: 'wednesday' },
  { dow: 4, key: 'thursday' },
  { dow: 5, key: 'friday' },
  { dow: 6, key: 'saturday' },
  { dow: 0, key: 'sunday' },
]

const DEFAULT_PEAK_WINDOWS: PeakWindow[] = [
  { startTime: '00:00', endTime: '10:00' },
  { startTime: '18:00', endTime: '24:00' },
]

function PeakHourTimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-ink-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-court-500"
    >
      {PEAK_TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  )
}

function PeakHoursModal({
  club,
  onClose,
  onSaved,
}: {
  club: Club
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const t = useTranslations('MisClubs.peakHours')
  const [byDay, setByDay] = useState<Record<number, PeakWindow[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${GW}/api/clubs/${club.id}/peak-hours`)
      .then((r) => r.json())
      .then((d) => {
        const rules: PeakRule[] = d.data ?? []
        const grouped: Record<number, PeakWindow[]> = {}
        for (let dow = 0; dow <= 6; dow++) grouped[dow] = []
        if (rules.length === 0) {
          for (let dow = 0; dow <= 6; dow++)
            grouped[dow] = DEFAULT_PEAK_WINDOWS.map((w) => ({ ...w }))
        } else {
          for (const r of rules)
            grouped[r.dayOfWeek].push({ startTime: r.startTime, endTime: r.endTime })
        }
        setByDay(grouped)
      })
      .catch(() => setError(t('loadError')))
      .finally(() => setLoading(false))
  }, [club.id])

  function addWindow(dow: number) {
    setByDay((prev) => ({
      ...prev,
      [dow]: [...(prev[dow] ?? []), { startTime: '18:00', endTime: '22:00' }],
    }))
  }

  function removeWindow(dow: number, idx: number) {
    setByDay((prev) => ({ ...prev, [dow]: prev[dow].filter((_, i) => i !== idx) }))
  }

  function updateWindow(dow: number, idx: number, field: 'startTime' | 'endTime', value: string) {
    setByDay((prev) => ({
      ...prev,
      [dow]: prev[dow].map((w, i) => (i === idx ? { ...w, [field]: value } : w)),
    }))
  }

  function copyToAllDays(sourceDow: number) {
    const source = byDay[sourceDow] ?? []
    setByDay((prev) => {
      const next = { ...prev }
      for (let dow = 0; dow <= 6; dow++) {
        if (dow !== sourceDow) next[dow] = source.map((w) => ({ ...w }))
      }
      return next
    })
  }

  async function handleSave() {
    for (const dow of Object.keys(byDay).map(Number)) {
      for (const w of byDay[dow]) {
        if (w.startTime >= w.endTime) {
          const dayKey = DAY_KEYS.find((d) => d.dow === dow)?.key
          const dayLabel =
            dayKey === 'monday'
              ? t('monday')
              : dayKey === 'tuesday'
                ? t('tuesday')
                : dayKey === 'wednesday'
                  ? t('wednesday')
                  : dayKey === 'thursday'
                    ? t('thursday')
                    : dayKey === 'friday'
                      ? t('friday')
                      : dayKey === 'saturday'
                        ? t('saturday')
                        : dayKey === 'sunday'
                          ? t('sunday')
                          : ''
          setError(t('invalidBlock', { day: dayLabel }))
          return
        }
      }
    }
    setSaving(true)
    setError('')
    try {
      const rules = Object.entries(byDay).flatMap(([dow, windows]) =>
        windows.map((w) => ({ dayOfWeek: Number(dow), startTime: w.startTime, endTime: w.endTime }))
      )
      const res = await fetch(`${GW}/api/clubs/${club.id}/peak-hours`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('genericError'))
        return
      }
      const slotsUpdated = data.slotsUpdated
        ? t('savedWithSlots', { count: data.slotsUpdated })
        : ''
      onSaved(`${t('savedBase')}${slotsUpdated ? ` ${slotsUpdated}` : ''}`)
    } catch {
      setError(t('connectionError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      maxWidth="xl"
      footer={
        <div className="flex gap-3 w-full">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} className="flex-1">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> {t('saving')}
              </>
            ) : (
              t('save')
            )}
          </Button>
        </div>
      }
    >
      <div className="flex items-center justify-between pb-4 mb-1 border-b border-ink-100 -mt-2">
        <div>
          <h2 className="font-black text-ink-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-court-500" /> {t('title')}
          </h2>
          <p className="text-xs text-ink-400 mt-0.5">{t('subtitle', { clubName: club.name })}</p>
        </div>
      </div>

      <div className="space-y-3 max-h-[65vh] overflow-y-auto">
        {error && (
          <p className="text-xs px-3 py-2 rounded-lg bg-referee-50 text-referee-600">{error}</p>
        )}
        {loading ? (
          <div className="text-center py-10 text-sm text-ink-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
          </div>
        ) : (
          DAY_KEYS.map(({ dow, key }) => (
            <div key={dow} className="border border-ink-100 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-ink-700">{t(key as 'monday')}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyToAllDays(dow)}
                    title={t('copyToAllTooltip')}
                    className="flex items-center gap-1 text-[11px] font-semibold text-ink-400 hover:text-court-600"
                  >
                    <Copy className="w-3 h-3" /> {t('copyToAll')}
                  </button>
                  <button
                    type="button"
                    onClick={() => addWindow(dow)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-court-600 hover:text-court-700"
                  >
                    <Plus className="w-3 h-3" /> {t('addBlock')}
                  </button>
                </div>
              </div>
              {(byDay[dow] ?? []).length === 0 ? (
                <p className="text-xs text-ink-400">{t('noSchedule')}</p>
              ) : (
                <div className="space-y-1.5">
                  {byDay[dow].map((w, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <PeakHourTimeSelect
                        value={w.startTime}
                        onChange={(v) => updateWindow(dow, idx, 'startTime', v)}
                      />
                      <span className="text-ink-300 text-xs">–</span>
                      <PeakHourTimeSelect
                        value={w.endTime}
                        onChange={(v) => updateWindow(dow, idx, 'endTime', v)}
                      />
                      <button
                        type="button"
                        onClick={() => removeWindow(dow, idx)}
                        className="text-ink-300 hover:text-referee-400 ml-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}

function ConfirmDialog({
  msg,
  onConfirm,
  onCancel,
}: {
  msg: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useTranslations('MisClubs.confirm')
  return (
    <Modal open onClose={onCancel} maxWidth="sm">
      <p className="text-ink-800 font-semibold mb-5">{msg}</p>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel} className="flex-1">
          {t('cancel')}
        </Button>
        <Button onClick={onConfirm} className="flex-1 bg-referee-600! hover:bg-referee-700!">
          {t('confirm')}
        </Button>
      </div>
    </Modal>
  )
}

function ClubCard({
  club,
  onToggle,
  onDelete,
  onEdit,
}: {
  club: Club
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
  onEdit: (updated: Club) => void
}) {
  const t = useTranslations('MisClubs.card')
  const tConfirm = useTranslations('MisClubs.confirm')
  const tList = useTranslations('MisClubs.list')
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showPeak, setShowPeak] = useState(false)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleToggle() {
    setToggling(true)
    try {
      const res = await fetch(`${GW}/api/clubs/${club.id}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !club.isActive }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error ?? t('toastErrorGeneric'), false)
        return
      }
      onToggle(club.id, !club.isActive)
      showToast(club.isActive ? t('toastDeactivated') : t('toastActivated'), true)
    } catch {
      showToast(t('toastConnectionError'), false)
    } finally {
      setToggling(false)
    }
  }

  async function handleDelete() {
    setConfirmDel(false)
    setDeleting(true)
    try {
      const res = await fetch(`${GW}/api/clubs/${club.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error ?? t('toastDeleteError'), false)
        return
      }
      onDelete(club.id)
    } catch {
      showToast(t('toastConnectionError'), false)
    } finally {
      setDeleting(false)
    }
  }

  function goToStats() {
    localStorage.setItem('racketly_active_club', JSON.stringify(club))
    window.dispatchEvent(new CustomEvent('club-changed', { detail: club }))
  }

  return (
    <>
      {confirmDel && (
        <ConfirmDialog
          msg={tConfirm('deleteMessage', { clubName: club.name })}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDel(false)}
        />
      )}
      {showEdit && (
        <EditClubModal
          club={club}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            onEdit(updated)
            setShowEdit(false)
            showToast(t('toastUpdated'), true)
          }}
        />
      )}
      {showPeak && (
        <PeakHoursModal
          club={club}
          onClose={() => setShowPeak(false)}
          onSaved={(msg) => {
            setShowPeak(false)
            showToast(msg, true)
          }}
        />
      )}

      <Card className={`transition-all ${!club.isActive ? 'opacity-60 ring-1 ring-ink-200' : ''}`}>
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-ink-900 text-lg leading-tight">{club.name}</h3>
                {!club.isActive && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ink-100 text-ink-500 uppercase tracking-wide">
                    {t('inactive')}
                  </span>
                )}
                {club.adminRole === 'owner' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-court-100 text-court-700 uppercase tracking-wide">
                    {t('owner')}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-court-100 text-court-700 uppercase tracking-wide">
                    {t('admin')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-1 text-sm text-ink-500">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {club.city}, {club.country}
                </span>
              </div>
            </div>
            {/* Toggle activo */}
            <button
              onClick={handleToggle}
              disabled={toggling}
              title={club.isActive ? t('deactivateTooltip') : t('activateTooltip')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                club.isActive ? 'bg-court-500' : 'bg-ink-300'
              } disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  club.isActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Descripción */}
          {club.description && (
            <p className="text-sm text-ink-500 mb-3 line-clamp-2">{club.description}</p>
          )}

          {/* Deportes + Pistas */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {club.sports.map((s) => (
              <Badge key={s} tone="gray">
                <span className="inline-flex items-center gap-1">
                  {s === 'padel' ? <PadelIcon size={12} /> : <PickleballIcon size={12} />}
                  {s === 'padel' ? t('sportPadel') : t('sportPickleball')}
                </span>
              </Badge>
            ))}
            <Badge tone="gray">{tList('courts', { count: club.courts.length })}</Badge>
            <Badge tone="gray">{club.currency}</Badge>
          </div>

          {/* Contacto */}
          {(club.contactEmail || club.phone || club.website) && (
            <div className="flex items-center gap-3 text-xs text-ink-400 mb-4">
              {club.contactEmail && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {club.contactEmail}
                </span>
              )}
              {club.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {club.phone}
                </span>
              )}
              {club.website && (
                <span className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {club.website}
                </span>
              )}
            </div>
          )}

          {toast && (
            <div
              className={`text-xs px-3 py-2 rounded-lg mb-3 ${toast.ok ? 'bg-court-50 text-court-700' : 'bg-referee-50 text-referee-700'}`}
            >
              {toast.msg}
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-1">
            <Link
              href="/dashboard/estadisticas"
              onClick={goToStats}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-ink-200 text-xs font-semibold text-ink-600 hover:bg-ink-50 transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" /> {t('viewStats')}
            </Link>
            <button
              onClick={() => setShowEdit(true)}
              title={t('editTooltip')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-ink-200 text-xs font-semibold text-ink-600 hover:bg-ink-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> {t('edit')}
            </button>
            <button
              onClick={() => setShowPeak(true)}
              title={t('peakHoursTooltip')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-ink-200 text-xs font-semibold text-ink-600 hover:bg-ink-50 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" /> {t('peakHours')}
            </button>
            <button
              onClick={() => setConfirmDel(true)}
              disabled={deleting}
              title={t('deleteTooltip')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-referee-100 text-xs font-semibold text-referee-400 hover:bg-referee-50 hover:text-referee-600 transition-colors disabled:opacity-40"
            >
              {deleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </Card>
    </>
  )
}

export default function MisClubsPage() {
  const t = useTranslations('MisClubs.list')
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let userId = ''
    try {
      const cookies = document.cookie.split(';')
      const userCookie = cookies.find((c) => c.trim().startsWith('racketly_user='))
      if (userCookie) {
        const val = decodeURIComponent(userCookie.split('=')[1])
        userId = JSON.parse(val)?.id ?? ''
      }
    } catch {
      /* ignore */
    }

    if (!userId) {
      setLoading(false)
      return
    }

    fetch(`${GW}/api/clubs/admin/${userId}`)
      .then((r) => r.json())
      .then((d) => setClubs(d.data ?? []))
      .catch(() => setClubs([]))
      .finally(() => setLoading(false))
  }, [])

  function handleToggle(id: string, active: boolean) {
    setClubs((prev) => prev.map((c) => (c.id === id ? { ...c, isActive: active } : c)))
  }

  function handleDelete(id: string) {
    setClubs((prev) => prev.filter((c) => c.id !== id))
  }

  function handleEdit(updated: Club) {
    setClubs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  const active = clubs.filter((c) => c.isActive)
  const inactive = clubs.filter((c) => !c.isActive)

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{t('title')}</h1>
          <p className="text-sm text-ink-400 mt-1">
            {t('activeCount', { count: active.length })}
            {inactive.length > 0 && ` · ${t('inactiveSuffix', { count: inactive.length })}`}
          </p>
        </div>
        <Link href="/dashboard/nuevo-club">
          <Button>
            <Plus className="w-4 h-4" /> {t('newClub')}
          </Button>
        </Link>
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : clubs.length === 0 ? (
        <Card>
          <EmptyState
            icon={Power}
            title={t('emptyTitle')}
            action={
              <Link href="/dashboard/nuevo-club">
                <Button size="sm">
                  <Plus className="w-3.5 h-3.5" /> {t('emptyAction')}
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold text-ink-400 uppercase tracking-widest">
                {t('sectionActive')}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {active.map((c) => (
                  <ClubCard
                    key={c.id}
                    club={c}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            </section>
          )}

          {inactive.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold text-ink-400 uppercase tracking-widest">
                {t('sectionInactive')}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {inactive.map((c) => (
                  <ClubCard
                    key={c.id}
                    club={c}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
