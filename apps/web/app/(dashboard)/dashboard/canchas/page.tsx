'use client'

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import {
  CircleDot,
  Lightbulb,
  Settings,
  X,
  Plus,
  Zap,
  RefreshCw,
  Loader2,
  Clock,
  Wrench,
  Trash2,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { Modal } from '@/components/ui/Modal'
import { SkeletonCards } from '@/components/ui/Skeleton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

type Court = {
  id: string
  name: string
  sport: 'padel' | 'pickleball'
  surface: string
  isIndoor: boolean
  hasLighting: boolean
  basePrice: number
  peakPrice: number
  currency: string
  isActive: boolean
  capacity: number
  openTimeWeekday: string
  closeTimeWeekday: string
  openTimeWeekend: string
  closeTimeWeekend: string
  slotDuration: number
}

type ClubConfig = {
  bookingHorizonDays: number
  currency: string
  slotGenerationHour: number
  timezone: string
  paymentWarningMinutesBefore: number
  rosterWarningHoursBefore: number
}

type MaintenanceBlock = {
  id: string
  courtId: string
  startAt: string
  endAt: string
  description: string
}

// Zonas horarias más comunes para clubes de pádel/pickleball en LatAm + España/EEUU —
// no es la lista completa de IANA (esa tiene ~400), solo las relevantes para el mercado
// actual. El campo igual acepta cualquier IANA válido si se necesita otra.
const TIMEZONE_OPTIONS = [
  { value: 'America/Santo_Domingo', label: 'Santo Domingo (UTC-4)' },
  { value: 'America/New_York', label: 'Nueva York (UTC-5/-4)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (UTC-6)' },
  { value: 'America/Bogota', label: 'Bogotá (UTC-5)' },
  { value: 'America/Lima', label: 'Lima (UTC-5)' },
  { value: 'America/Santiago', label: 'Santiago de Chile (UTC-4/-3)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (UTC-3)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (UTC-3)' },
  { value: 'Europe/Madrid', label: 'Madrid (UTC+1/+2)' },
  { value: 'UTC', label: 'UTC' },
]

const GW = '' // relative — middleware inyecta auth, next.config reescribe al gateway

// Opciones de hora en intervalos de 30 minutos (06:00 → 23:30)
const TIME_OPTIONS = Array.from({ length: 36 }, (_, i) => {
  const totalMin = 6 * 60 + i * 30
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
})

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function fmtMin(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function previewSlots(openTime: string, closeTime: string, durationMin: number) {
  const open = toMin(openTime)
  const close = toMin(closeTime)
  const slots: { start: string; isPeak: boolean }[] = []
  for (let m = open; m + durationMin <= close; m += durationMin) {
    slots.push({ start: fmtMin(m), isPeak: m < 600 || m >= 1080 })
  }
  return slots
}

// ─── Modal: Configurar pista ───────────────────────────────────────────────────

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </Select>
  )
}

function CourtSettingsModal({
  court,
  onClose,
  onSaved,
}: {
  court: Court
  onClose: () => void
  onSaved: (c: Court) => void
}) {
  const t = useTranslations('Canchas')
  const [form, setForm] = useState({
    openTimeWeekday: court.openTimeWeekday || '07:00',
    closeTimeWeekday: court.closeTimeWeekday || '23:00',
    openTimeWeekend: court.openTimeWeekend || '07:00',
    closeTimeWeekend: court.closeTimeWeekend || '23:00',
    slotDuration: court.slotDuration || 60,
    basePrice: court.basePrice ?? 0,
    peakPrice: court.peakPrice ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [previewDay, setPreviewDay] = useState<'weekday' | 'weekend'>('weekday')

  const previewOpen = previewDay === 'weekday' ? form.openTimeWeekday : form.openTimeWeekend
  const previewClose = previewDay === 'weekday' ? form.closeTimeWeekday : form.closeTimeWeekend
  const preview = previewSlots(previewOpen, previewClose, Number(form.slotDuration))

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleSave(andGenerate = false) {
    if (andGenerate) {
      setGenerating(true)
    } else {
      setSaving(true)
    }
    try {
      const res = await fetch(`${GW}/api/courts/${court.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          slotDuration: Number(form.slotDuration),
          generateSlots: andGenerate,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error ?? t('settingsErrorSaveToast'), false)
        return
      }
      onSaved(data.data)
      showToast(
        andGenerate
          ? t('settingsSavedGeneratedToast', { count: data.slotsGenerated ?? 0 })
          : t('settingsSavedToast'),
        true
      )
    } catch {
      showToast(t('settingsErrorConnectionToast'), false)
    } finally {
      setSaving(false)
      setGenerating(false)
    }
  }

  return (
    <Modal open onClose={onClose} maxWidth="lg">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-ink-900">{t('settingsModalTitle')}</h2>
          <p className="text-sm text-ink-400 mt-0.5">{court.name}</p>
        </div>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {toast && (
        <div
          className={`text-sm px-4 py-2.5 rounded-xl mb-4 ${toast.ok ? 'bg-court-50 text-court-700' : 'bg-referee-50 text-referee-700'}`}
        >
          {toast.msg}
        </div>
      )}

      <div className="space-y-5">
        {/* Duración del slot */}
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-2">
            {t('slotDurationLabel')}
          </label>
          <div className="flex gap-3">
            {[60, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setForm({ ...form, slotDuration: d })}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                  form.slotDuration === d
                    ? 'border-court-500 bg-court-50 text-court-700'
                    : 'border-ink-200 text-ink-500 hover:border-ink-300'
                }`}
              >
                {d === 60 ? t('duration1h') : t('duration90m')}
              </button>
            ))}
          </div>
        </div>

        {/* Horarios Lunes–Viernes */}
        <div className="bg-ink-50 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-ink-600 uppercase tracking-wide">
            {t('weekdaySectionLabel')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-500 mb-1">
                {t('openingLabel')}
              </label>
              <TimeSelect
                value={form.openTimeWeekday}
                onChange={(v) => setForm({ ...form, openTimeWeekday: v })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-500 mb-1">
                {t('closingLabel')}
              </label>
              <TimeSelect
                value={form.closeTimeWeekday}
                onChange={(v) => setForm({ ...form, closeTimeWeekday: v })}
              />
            </div>
          </div>
          <p className="text-[10px] text-ink-400">
            {t('slotsPerDay', {
              count: previewSlots(form.openTimeWeekday, form.closeTimeWeekday, form.slotDuration)
                .length,
            })}
          </p>
        </div>

        {/* Horarios Sábado–Domingo */}
        <div className="bg-court-50 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-court-600 uppercase tracking-wide">
            {t('weekendSectionLabel')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-court-500 mb-1">
                {t('openingLabel')}
              </label>
              <TimeSelect
                value={form.openTimeWeekend}
                onChange={(v) => setForm({ ...form, openTimeWeekend: v })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-court-500 mb-1">
                {t('closingLabel')}
              </label>
              <TimeSelect
                value={form.closeTimeWeekend}
                onChange={(v) => setForm({ ...form, closeTimeWeekend: v })}
              />
            </div>
          </div>
          <p className="text-[10px] text-court-400">
            {t('slotsPerDay', {
              count: previewSlots(form.openTimeWeekend, form.closeTimeWeekend, form.slotDuration)
                .length,
            })}
          </p>
        </div>

        {/* Precios */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('offPeakPriceLabel')}{' '}
              <span className="font-normal text-ink-400">({court.currency})</span>
            </label>
            <Input
              type="number"
              min={0}
              value={form.basePrice}
              onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('peakPriceLabel')}{' '}
              <span className="font-normal text-ink-400">({court.currency})</span>
            </label>
            <Input
              type="number"
              min={0}
              value={form.peakPrice}
              onChange={(e) => setForm({ ...form, peakPrice: Number(e.target.value) })}
            />
          </div>
        </div>

        {/* Vista previa */}
        {preview.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">
                {t('previewLabel')}
              </p>
              <div className="flex rounded-lg overflow-hidden border border-ink-200 text-[10px]">
                {(['weekday', 'weekend'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPreviewDay(d)}
                    className={`px-2 py-0.5 font-semibold transition-colors ${
                      previewDay === d ? 'bg-ink-800 text-white' : 'text-ink-400 hover:bg-ink-50'
                    }`}
                  >
                    {d === 'weekday' ? t('previewWeekdayTab') : t('previewWeekendTab')}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-ink-400">
                {t('slotsPerDay', { count: preview.length })}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {preview.map((s) => (
                <span
                  key={s.start}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    s.isPeak ? 'bg-trophy-100 text-trophy-700' : 'bg-court-100 text-court-700'
                  }`}
                >
                  {s.start}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-ink-400 mt-1">{t('peakLegend')}</p>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-6">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
          {t('cancel')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleSave(false)}
          disabled={saving || generating}
          className="flex-1"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {t('save')}
        </Button>
        <Button
          type="button"
          onClick={() => handleSave(true)}
          disabled={saving || generating}
          className="flex-1"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {t('saveAndGenerate')}
        </Button>
      </div>
    </Modal>
  )
}

// ─── Modal: Añadir pista ───────────────────────────────────────────────────────

function AddCourtModal({
  clubId,
  clubCurrency,
  onClose,
  onCreated,
}: {
  clubId: string
  clubCurrency: string
  onClose: () => void
  onCreated: (c: Court) => void
}) {
  const t = useTranslations('Canchas')
  const [form, setForm] = useState({
    name: '',
    sport: 'padel',
    surface: 'cristal',
    isIndoor: false,
    hasLighting: true,
    capacity: 4,
    basePrice: 0,
    peakPrice: 0,
    currency: clubCurrency,
    openTimeWeekday: '07:00',
    closeTimeWeekday: '23:00',
    openTimeWeekend: '07:00',
    closeTimeWeekend: '23:00',
    slotDuration: 60,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError(t('addNameRequiredError'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${GW}/api/clubs/${clubId}/courts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('addErrorCreate'))
        return
      }
      onCreated(data.data)
    } catch {
      setError(t('addErrorConnection'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={t('addModalTitle')} maxWidth="lg">
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('sportLabel')}
            </label>
            <Select
              value={form.sport}
              onChange={(e) => setForm({ ...form, sport: e.target.value })}
            >
              <option value="padel">{t('sportPadelOption')}</option>
              <option value="pickleball">{t('sportPickleballOption')}</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('surfaceLabel')}
            </label>
            <Select
              value={form.surface}
              onChange={(e) => setForm({ ...form, surface: e.target.value })}
            >
              <option value="cristal">{t('surfaceGlassOption')}</option>
              <option value="sintética">{t('surfaceSyntheticOption')}</option>
              <option value="dura">{t('surfaceHardOption')}</option>
              <option value="hierba">{t('surfaceGrassOption')}</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('capacityLabel')}
            </label>
            <Input
              type="number"
              min={2}
              max={8}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('currencyLabel')}
            </label>
            <Select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              <option value="COP">COP</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
              <option value="DOP">DOP</option>
              <option value="JPY">JPY</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('priceOffPeakLabel')}
            </label>
            <Input
              type="number"
              min={0}
              value={form.basePrice}
              onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('pricePeakLabel')}
            </label>
            <Input
              type="number"
              min={0}
              value={form.peakPrice}
              onChange={(e) => setForm({ ...form, peakPrice: Number(e.target.value) })}
            />
          </div>
        </div>

        {/* Duración */}
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-2">
            {t('slotDurationLabel')}
          </label>
          <div className="flex gap-3">
            {[60, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setForm({ ...form, slotDuration: d })}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                  form.slotDuration === d
                    ? 'border-court-500 bg-court-50 text-court-700'
                    : 'border-ink-200 text-ink-500 hover:border-ink-300'
                }`}
              >
                {d === 60 ? t('duration1h') : t('duration90m')}
              </button>
            ))}
          </div>
        </div>

        {/* Horario L-V */}
        <div className="bg-ink-50 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold text-ink-600 uppercase tracking-wide">
            {t('weekdaySectionLabel')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-500 mb-1">
                {t('openingLabel')}
              </label>
              <TimeSelect
                value={form.openTimeWeekday}
                onChange={(v) => setForm({ ...form, openTimeWeekday: v })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-500 mb-1">
                {t('closingLabel')}
              </label>
              <TimeSelect
                value={form.closeTimeWeekday}
                onChange={(v) => setForm({ ...form, closeTimeWeekday: v })}
              />
            </div>
          </div>
          <p className="text-[10px] text-ink-400">
            {t('slotsPerDay', {
              count: previewSlots(form.openTimeWeekday, form.closeTimeWeekday, form.slotDuration)
                .length,
            })}
          </p>
        </div>

        {/* Horario S-D */}
        <div className="bg-court-50 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold text-court-600 uppercase tracking-wide">
            {t('weekendSectionLabel')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-court-500 mb-1">
                {t('openingLabel')}
              </label>
              <TimeSelect
                value={form.openTimeWeekend}
                onChange={(v) => setForm({ ...form, openTimeWeekend: v })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-court-500 mb-1">
                {t('closingLabel')}
              </label>
              <TimeSelect
                value={form.closeTimeWeekend}
                onChange={(v) => setForm({ ...form, closeTimeWeekend: v })}
              />
            </div>
          </div>
          <p className="text-[10px] text-court-400">
            {t('slotsPerDay', {
              count: previewSlots(form.openTimeWeekend, form.closeTimeWeekend, form.slotDuration)
                .length,
            })}
          </p>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isIndoor}
              onChange={(e) => setForm({ ...form, isIndoor: e.target.checked })}
              className="w-4 h-4 accent-court-600"
            />
            <span className="text-sm font-medium text-ink-700">{t('indoorLabel')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.hasLighting}
              onChange={(e) => setForm({ ...form, hasLighting: e.target.checked })}
              className="w-4 h-4 accent-court-600"
            />
            <span className="text-sm font-medium text-ink-700">{t('lightingLabel')}</span>
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? t('creatingButton') : t('createCourtButton')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Modal: Bloqueo por mantenimiento ──────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function MaintenanceModal({ court, onClose }: { court: Court; onClose: () => void }) {
  const t = useTranslations('Canchas')
  const locale = useLocale()
  const [blocks, setBlocks] = useState<MaintenanceBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    startDate: todayStr(),
    startTime: '08:00',
    endDate: todayStr(),
    endTime: '10:00',
    description: '',
  })
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function loadBlocks() {
    setLoading(true)
    fetch(`${GW}/api/courts/${court.id}/maintenance`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setBlocks(d.data ?? []))
      .catch(() => setBlocks([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadBlocks()
  }, [court.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.description.trim()) {
      setError(t('maintenanceDescRequiredError'))
      return
    }

    // Se manda como wall-clock literal en UTC (sufijo Z explícito), NO como hora local del
    // navegador — igual que TimeSlot.date/startTime, que no llevan conversión de timezone.
    // Si se usara `new Date(...)` sin Z, el navegador lo interpretaría en su propia zona
    // horaria local y el bloqueo quedaría desalineado con los TimeSlot reales de la pista.
    const startAtIso = `${form.startDate}T${form.startTime}:00.000Z`
    const endAtIso = `${form.endDate}T${form.endTime}:00.000Z`
    if (new Date(endAtIso) <= new Date(startAtIso)) {
      setError(t('maintenanceEndBeforeStartError'))
      return
    }

    setCreating(true)
    try {
      const res = await fetch(`${GW}/api/courts/${court.id}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startAt: startAtIso,
          endAt: endAtIso,
          description: form.description.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('maintenanceCreateError'))
        return
      }
      setBlocks((prev) => [...prev, data.data].sort((a, b) => a.startAt.localeCompare(b.startAt)))
      setForm((f) => ({ ...f, description: '' }))
      showToast(t('maintenanceCreatedToast'), true)
    } catch {
      setError(t('maintenanceConnectionError'))
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(blockId: string) {
    setDeletingId(blockId)
    try {
      const res = await fetch(`${GW}/api/courts/${court.id}/maintenance/${blockId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        showToast(t('maintenanceDeleteError'), false)
        return
      }
      setBlocks((prev) => prev.filter((b) => b.id !== blockId))
      showToast(t('maintenanceDeletedToast'), true)
    } catch {
      showToast(t('maintenanceConnectionError'), false)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Modal open onClose={onClose} maxWidth="lg">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-ink-900">{t('maintenanceModalTitle')}</h2>
          <p className="text-sm text-ink-400 mt-0.5">{court.name}</p>
        </div>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {toast && (
        <div
          className={`text-sm px-4 py-2.5 rounded-xl mb-4 ${toast.ok ? 'bg-court-50 text-court-700' : 'bg-referee-50 text-referee-700'}`}
        >
          {toast.msg}
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-4 bg-ink-50 rounded-2xl p-4">
        {error && (
          <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-4 py-2">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-500 mb-1">
              {t('maintenanceStartDateLabel')}
            </label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 mb-1">
              {t('maintenanceStartTimeLabel')}
            </label>
            <TimeSelect
              value={form.startTime}
              onChange={(v) => setForm({ ...form, startTime: v })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 mb-1">
              {t('maintenanceEndDateLabel')}
            </label>
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 mb-1">
              {t('maintenanceEndTimeLabel')}
            </label>
            <TimeSelect value={form.endTime} onChange={(v) => setForm({ ...form, endTime: v })} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-500 mb-1">
            {t('maintenanceDescLabel')}
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={t('maintenanceDescPlaceholder')}
            rows={2}
            className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/30 focus:border-court-500"
          />
        </div>

        <Button type="submit" disabled={creating} className="w-full">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
          {t('maintenanceCreateButton')}
        </Button>
      </form>

      <div className="mt-5">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-2">
          {t('maintenanceUpcomingTitle')}
        </p>
        {loading ? (
          <p className="text-sm text-ink-400">{t('maintenanceLoading')}</p>
        ) : blocks.length === 0 ? (
          <p className="text-sm text-ink-400">{t('maintenanceEmpty')}</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {blocks.map((b) => (
              <div
                key={b.id}
                className="flex items-start justify-between gap-3 bg-white border border-ink-100 rounded-xl px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-800">
                    {new Date(b.startAt).toLocaleString(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'UTC',
                    })}
                    {' → '}
                    {new Date(b.endAt).toLocaleString(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'UTC',
                    })}
                  </p>
                  <p className="text-xs text-ink-500 mt-0.5 break-words">{b.description}</p>
                </div>
                <button
                  onClick={() => handleDelete(b.id)}
                  disabled={deletingId === b.id}
                  className="p-1.5 rounded-lg text-ink-400 hover:text-referee-600 hover:bg-referee-50 transition-colors shrink-0"
                  title={t('maintenanceDeleteTooltip')}
                >
                  {deletingId === b.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── CourtCard ────────────────────────────────────────────────────────────────

function CourtCard({
  court,
  onToggle,
  onSettings,
  onMaintenance,
}: {
  court: Court
  onToggle: (id: string) => void
  onSettings: (court: Court) => void
  onMaintenance: (court: Court) => void
}) {
  const t = useTranslations('Canchas')
  const slotsWD = previewSlots(
    court.openTimeWeekday || '07:00',
    court.closeTimeWeekday || '23:00',
    court.slotDuration || 60
  )
  const slotsWE = previewSlots(
    court.openTimeWeekend || '07:00',
    court.closeTimeWeekend || '23:00',
    court.slotDuration || 60
  )

  return (
    <Card className={`transition-all ${!court.isActive ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="p-5 flex items-start justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${court.sport === 'padel' ? 'bg-court-50 text-court-600' : 'bg-trophy-50 text-trophy-600'}`}
          >
            {court.sport === 'padel' ? <PadelIcon size={22} /> : <PickleballIcon size={22} />}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-ink-900 truncate">{court.name}</h3>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <Badge tone="gray">{court.surface}</Badge>
              {court.isIndoor && <Badge tone="blue">{t('cardIndoorBadge')}</Badge>}
              {court.hasLighting && (
                <Badge tone="amber">
                  <Lightbulb className="w-3 h-3" /> {t('cardLightedBadge')}
                </Badge>
              )}
              <Badge tone="gray">{t('cardPlayersBadge', { count: court.capacity })}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button
            onClick={() => onMaintenance(court)}
            className="p-1.5 rounded-lg text-ink-400 hover:text-trophy-600 hover:bg-trophy-50 transition-colors"
            title={t('cardMaintenanceTooltip')}
          >
            <Wrench className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSettings(court)}
            className="p-1.5 rounded-lg text-ink-400 hover:text-court-600 hover:bg-court-50 transition-colors"
            title={t('cardSettingsTooltip')}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => onToggle(court.id)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              court.isActive ? 'bg-court-500' : 'bg-ink-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                court.isActive ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Precios */}
      <div className="px-5 py-3 flex gap-4 text-sm border-t border-ink-50">
        <div>
          <p className="text-xs text-ink-400">{t('cardOffPeak')}</p>
          <p className="font-bold text-ink-900">
            {court.currency} {(court.basePrice ?? 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-400">{t('cardPeak')}</p>
          <p className="font-bold text-trophy-600">
            {court.currency} {(court.peakPrice ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Horarios L-V / S-D */}
      <div className="px-5 pb-4 border-t border-ink-50 pt-3 space-y-2">
        <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">
          {t('cardPerSlot', {
            duration: court.slotDuration === 90 ? t('duration90m') : t('duration1h'),
          })}
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[10px] text-ink-400 mb-1">
              {t('cardWeekdaySlots', { count: slotsWD.length })}
            </p>
            <p className="text-ink-600 font-mono">
              {court.openTimeWeekday || '07:00'} – {court.closeTimeWeekday || '23:00'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-court-400 mb-1">
              {t('cardWeekendSlots', { count: slotsWE.length })}
            </p>
            <p className="text-court-600 font-mono">
              {court.openTimeWeekend || '07:00'} – {court.closeTimeWeekend || '23:00'}
            </p>
          </div>
        </div>
        {/* Chips de horarios (L-V) */}
        <div className="flex flex-wrap gap-1 max-h-12 overflow-hidden">
          {slotsWD.map((s) => (
            <span
              key={s.start}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                s.isPeak ? 'bg-trophy-100 text-trophy-700' : 'bg-court-100 text-court-700'
              }`}
            >
              {s.start}
            </span>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ─── Club config card ─────────────────────────────────────────────────────────

function ClubConfigCard({
  clubId,
  config,
  onSaved,
}: {
  clubId: string
  config: ClubConfig
  onSaved: (c: ClubConfig) => void
}) {
  const t = useTranslations('Canchas')
  const [days, setDays] = useState(config.bookingHorizonDays)
  const [genHour, setGenHour] = useState(config.slotGenerationHour)
  const [tz, setTz] = useState(config.timezone)
  const [payWarnMin, setPayWarnMin] = useState(config.paymentWarningMinutesBefore)
  const [rosterWarnH, setRosterWarnH] = useState(config.rosterWarningHoursBefore)
  const [saving, setSaving] = useState(false)
  const [savingHour, setSavingHour] = useState(false)
  const [savingTz, setSavingTz] = useState(false)
  const [savingPayWarn, setSavingPayWarn] = useState(false)
  const [savingRosterWarn, setSavingRosterWarn] = useState(false)
  const [genning, setGenning] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function saveHorizon() {
    setSaving(true)
    try {
      const r = await fetch(`${GW}/api/clubs/${clubId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingHorizonDays: days }),
      })
      const d = await r.json()
      if (!r.ok) {
        showToast(d.error ?? t('configErrorSaveToast'), false)
        return
      }
      onSaved({ ...config, bookingHorizonDays: days })
      showToast(t('configSavedToast'), true)
    } catch {
      showToast(t('configErrorConnectionToast'), false)
    } finally {
      setSaving(false)
    }
  }

  async function saveGenHour() {
    setSavingHour(true)
    try {
      const r = await fetch(`${GW}/api/clubs/${clubId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotGenerationHour: genHour }),
      })
      const d = await r.json()
      if (!r.ok) {
        showToast(d.error ?? t('configErrorSaveToast'), false)
        return
      }
      onSaved({ ...config, slotGenerationHour: genHour })
      showToast(t('configSavedToast'), true)
    } catch {
      showToast(t('configErrorConnectionToast'), false)
    } finally {
      setSavingHour(false)
    }
  }

  async function saveTz() {
    setSavingTz(true)
    try {
      const r = await fetch(`${GW}/api/clubs/${clubId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz }),
      })
      const d = await r.json()
      if (!r.ok) {
        showToast(d.error ?? t('configErrorSaveToast'), false)
        return
      }
      onSaved({ ...config, timezone: tz })
      showToast(t('configSavedToast'), true)
    } catch {
      showToast(t('configErrorConnectionToast'), false)
    } finally {
      setSavingTz(false)
    }
  }

  async function savePayWarn() {
    setSavingPayWarn(true)
    try {
      const r = await fetch(`${GW}/api/clubs/${clubId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentWarningMinutesBefore: payWarnMin }),
      })
      const d = await r.json()
      if (!r.ok) {
        showToast(d.error ?? t('configErrorSaveToast'), false)
        return
      }
      onSaved({ ...config, paymentWarningMinutesBefore: payWarnMin })
      showToast(t('configSavedToast'), true)
    } catch {
      showToast(t('configErrorConnectionToast'), false)
    } finally {
      setSavingPayWarn(false)
    }
  }

  async function saveRosterWarn() {
    setSavingRosterWarn(true)
    try {
      const r = await fetch(`${GW}/api/clubs/${clubId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rosterWarningHoursBefore: rosterWarnH }),
      })
      const d = await r.json()
      if (!r.ok) {
        showToast(d.error ?? t('configErrorSaveToast'), false)
        return
      }
      onSaved({ ...config, rosterWarningHoursBefore: rosterWarnH })
      showToast(t('configSavedToast'), true)
    } catch {
      showToast(t('configErrorConnectionToast'), false)
    } finally {
      setSavingRosterWarn(false)
    }
  }

  async function generateAll() {
    setGenning(true)
    try {
      const r = await fetch(`${GW}/api/clubs/${clubId}/generate-slots`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) {
        showToast(d.error ?? t('configErrorGenerateToast'), false)
        return
      }
      showToast(
        t('slotsGeneratedToast', { slots: d.data.slotsCreated, courts: d.data.courtsProcessed }),
        true
      )
    } catch {
      showToast(t('configErrorConnectionToast'), false)
    } finally {
      setGenning(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-ink-800 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-court-600" /> {t('horizonTitle')}
          </h3>
          <p className="text-xs text-ink-400 mt-0.5">{t('horizonDesc')}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {toast && (
            <span
              className={`text-xs px-3 py-1 rounded-lg ${toast.ok ? 'bg-court-50 text-court-700' : 'bg-referee-50 text-referee-700'}`}
            >
              {toast.msg}
            </span>
          )}
          <div className="flex items-center gap-2">
            <Select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-auto"
            >
              {[1, 3, 7, 14, 21, 30, 60].map((d) => (
                <option key={d} value={d}>
                  {t('daysOption', { count: d })}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="secondary"
              onClick={saveHorizon}
              disabled={saving || days === config.bookingHorizonDays}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('save')}
            </Button>
          </div>
          <Button size="sm" onClick={generateAll} disabled={genning}>
            {genning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {genning ? t('generating') : t('generateAll')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-4 pt-4 border-t border-ink-100">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-ink-800 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-court-600" /> {t('autoGenTitle')}
          </h3>
          <p className="text-xs text-ink-400 mt-0.5">{t('autoGenDesc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={genHour}
            onChange={(e) => setGenHour(Number(e.target.value))}
            className="w-auto"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            onClick={saveGenHour}
            disabled={savingHour || genHour === config.slotGenerationHour}
          >
            {savingHour ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('save')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-4 pt-4 border-t border-ink-100">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-ink-800 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-court-600" /> {t('timezoneTitle')}
          </h3>
          <p className="text-xs text-ink-400 mt-0.5">{t('timezoneDesc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={tz} onChange={(e) => setTz(e.target.value)} className="w-auto">
            {!TIMEZONE_OPTIONS.some((o) => o.value === tz) && <option value={tz}>{tz}</option>}
            {TIMEZONE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            onClick={saveTz}
            disabled={savingTz || tz === config.timezone}
          >
            {savingTz ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('save')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-4 pt-4 border-t border-ink-100">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-ink-800 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-court-600" /> {t('paymentWarningTitle')}
          </h3>
          <p className="text-xs text-ink-400 mt-0.5">{t('paymentWarningDesc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={payWarnMin}
            onChange={(e) => setPayWarnMin(Number(e.target.value))}
            className="w-auto"
          >
            {[1, 2, 3, 5, 7, 10, 14].map((m) => (
              <option key={m} value={m}>
                {t('minutesOption', { count: m })}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            onClick={savePayWarn}
            disabled={savingPayWarn || payWarnMin === config.paymentWarningMinutesBefore}
          >
            {savingPayWarn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('save')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-4 pt-4 border-t border-ink-100">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-ink-800 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-court-600" /> {t('rosterWarningTitle')}
          </h3>
          <p className="text-xs text-ink-400 mt-0.5">{t('rosterWarningDesc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={rosterWarnH}
            onChange={(e) => setRosterWarnH(Number(e.target.value))}
            className="w-auto"
          >
            {[1, 2, 3, 4, 6, 8, 12, 18, 23].map((h) => (
              <option key={h} value={h}>
                {t('hoursOption', { count: h })}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            onClick={saveRosterWarn}
            disabled={savingRosterWarn || rosterWarnH === config.rosterWarningHoursBefore}
          >
            {savingRosterWarn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('save')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CanchasPage() {
  const t = useTranslations('Canchas')
  const [courts, setCourts] = useState<Court[]>([])
  const [clubConfig, setClubConfig] = useState<ClubConfig>({
    bookingHorizonDays: 14,
    currency: 'COP',
    slotGenerationHour: 6,
    timezone: 'UTC',
    paymentWarningMinutesBefore: 5,
    rosterWarningHoursBefore: 6,
  })
  const [loading, setLoading] = useState(true)
  const [clubId, setClubId] = useState<string>('')
  const [sportFilter, setSportFilter] = useState<'all' | 'padel' | 'pickleball'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editCourt, setEditCourt] = useState<Court | null>(null)
  const [maintCourt, setMaintCourt] = useState<Court | null>(null)

  function loadCourts(cId: string) {
    if (!cId) return
    setLoading(true)
    fetch(`${GW}/api/clubs/${cId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setCourts(d.data?.courts ?? [])
        if (d.data) {
          setClubConfig({
            bookingHorizonDays: d.data.bookingHorizonDays ?? 14,
            currency: d.data.currency ?? 'COP',
            slotGenerationHour: d.data.slotGenerationHour ?? 6,
            timezone: d.data.timezone ?? 'UTC',
            paymentWarningMinutesBefore: d.data.paymentWarningMinutesBefore ?? 5,
            rosterWarningHoursBefore: d.data.rosterWarningHoursBefore ?? 6,
          })
        }
      })
      .catch(() => setCourts([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const stored = localStorage.getItem('racketly_active_club') || ''
    let cId = stored
    try {
      const p = JSON.parse(stored)
      if (p?.id) cId = p.id
    } catch {
      /* plain string */
    }
    setClubId(cId)
    loadCourts(cId)

    function onClubChange(e: Event) {
      const club = (e as CustomEvent).detail
      setClubId(club.id)
      loadCourts(club.id)
    }
    window.addEventListener('club-changed', onClubChange)
    return () => window.removeEventListener('club-changed', onClubChange)
  }, [])

  function toggleCourt(id: string) {
    const court = courts.find((c) => c.id === id)
    if (!court) return
    const newActive = !court.isActive
    fetch(`${GW}/api/courts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: newActive }),
    }).catch(() => {
      /* fire & forget */
    })
    setCourts((prev) => prev.map((c) => (c.id === id ? { ...c, isActive: newActive } : c)))
  }

  const filtered = courts
    .filter((c) => sportFilter === 'all' || c.sport === sportFilter)
    .sort((a, b) => a.name.localeCompare(b.name))
  const active = courts.filter((c) => c.isActive).length

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Config del club */}
      {clubId && (
        <ClubConfigCard
          key={`${clubId}:${clubConfig.bookingHorizonDays}:${clubConfig.slotGenerationHour}:${clubConfig.timezone}:${clubConfig.paymentWarningMinutesBefore}:${clubConfig.rosterWarningHoursBefore}`}
          clubId={clubId}
          config={clubConfig}
          onSaved={setClubConfig}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-5 text-center">
          <p className="text-3xl font-black text-ink-900">{courts.length}</p>
          <p className="text-sm text-ink-500 mt-1">{t('statTotalCourts')}</p>
        </Card>
        <Card className="p-5 text-center">
          <p className="text-3xl font-black text-court-600">{active}</p>
          <p className="text-sm text-ink-500 mt-1">{t('statActiveCourts')}</p>
        </Card>
        <Card className="p-5 text-center">
          <p className="text-3xl font-black text-ink-400">{courts.length - active}</p>
          <p className="text-sm text-ink-500 mt-1">{t('statInactiveCourts')}</p>
        </Card>
      </div>

      {/* Filtros + Acción */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {(['all', 'padel', 'pickleball'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSportFilter(s)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                sportFilter === s
                  ? 'bg-primary-900 text-white'
                  : 'bg-white text-ink-600 border border-ink-200 hover:border-ink-300'
              }`}
            >
              {s === 'all' ? (
                t('filterAll')
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  {s === 'padel' ? <PadelIcon size={14} /> : <PickleballIcon size={14} />}
                  {s === 'padel' ? t('filterPadel') : t('filterPickleball')}
                </span>
              )}
            </button>
          ))}
        </div>
        <Button
          onClick={() => {
            if (!clubId) {
              alert(t('selectClubAlert'))
              return
            }
            setShowAdd(true)
          }}
        >
          <Plus className="w-4 h-4" /> {t('addCourt')}
        </Button>
      </div>

      {/* Grid */}
      {loading ? (
        <SkeletonCards count={6} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={CircleDot}
            title={t('emptyTitle')}
            action={
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="w-3.5 h-3.5" /> {t('addFirstCourt')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((court) => (
            <CourtCard
              key={court.id}
              court={court}
              onToggle={toggleCourt}
              onSettings={setEditCourt}
              onMaintenance={setMaintCourt}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddCourtModal
          clubId={clubId}
          clubCurrency={clubConfig.currency}
          onClose={() => setShowAdd(false)}
          onCreated={(court) => {
            setCourts((prev) => [...prev, court])
            setShowAdd(false)
          }}
        />
      )}

      {editCourt && (
        <CourtSettingsModal
          court={editCourt}
          onClose={() => setEditCourt(null)}
          onSaved={(updated) => {
            setCourts((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)))
            setEditCourt(null)
          }}
        />
      )}

      {maintCourt && <MaintenanceModal court={maintCourt} onClose={() => setMaintCourt(null)} />}
    </div>
  )
}
