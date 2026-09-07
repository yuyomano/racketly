'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Phone, Globe, Mail, Camera, ChevronRight, Loader2, LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'

// ─── Datos de países ──────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', currency: 'COP' },
  { code: 'MX', name: 'México', flag: '🇲🇽', currency: 'MXN' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', currency: 'ARS' },
  { code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱', currency: 'CLP' },
  { code: 'PE', name: 'Perú', flag: '🇵🇪', currency: 'PEN' },
  { code: 'DO', name: 'República Dominicana', flag: '🇩🇴', currency: 'DOP' },
  { code: 'CR', name: 'Costa Rica', flag: '🇨🇷', currency: 'CRC' },
  { code: 'GT', name: 'Guatemala', flag: '🇬🇹', currency: 'GTQ' },
  { code: 'UY', name: 'Uruguay', flag: '🇺🇾', currency: 'UYU' },
  { code: 'PY', name: 'Paraguay', flag: '🇵🇾', currency: 'PYG' },
  { code: 'PA', name: 'Panamá', flag: '🇵🇦', currency: 'USD' },
  { code: 'EC', name: 'Ecuador', flag: '🇪🇨', currency: 'USD' },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸', currency: 'USD' },
  { code: 'CA', name: 'Canadá', flag: '🇨🇦', currency: 'CAD' },
  { code: 'ES', name: 'España', flag: '🇪🇸', currency: 'EUR' },
  { code: 'FR', name: 'Francia', flag: '🇫🇷', currency: 'EUR' },
  { code: 'DE', name: 'Alemania', flag: '🇩🇪', currency: 'EUR' },
  { code: 'IT', name: 'Italia', flag: '🇮🇹', currency: 'EUR' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', currency: 'EUR' },
  { code: 'GB', name: 'Reino Unido', flag: '🇬🇧', currency: 'GBP' },
  { code: 'NL', name: 'Países Bajos', flag: '🇳🇱', currency: 'EUR' },
  { code: 'BE', name: 'Bélgica', flag: '🇧🇪', currency: 'EUR' },
  { code: 'SE', name: 'Suecia', flag: '🇸🇪', currency: 'SEK' },
  { code: 'NO', name: 'Noruega', flag: '🇳🇴', currency: 'NOK' },
  { code: 'CH', name: 'Suiza', flag: '🇨🇭', currency: 'CHF' },
  { code: 'JP', name: 'Japón', flag: '🇯🇵', currency: 'JPY' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', currency: 'AUD' },
  { code: 'AE', name: 'Emiratos Árabes', flag: '🇦🇪', currency: 'AED' },
  { code: 'SA', name: 'Arabia Saudita', flag: '🇸🇦', currency: 'SAR' },
] as const

type CountryCode = (typeof COUNTRIES)[number]['code']

const AMENITIES = [
  { id: 'parking', key: 'parking', icon: '🅿️' },
  { id: 'showers', key: 'showers', icon: '🚿' },
  { id: 'lockers', key: 'lockers', icon: '👕' },
  { id: 'cafe', key: 'cafe', icon: '☕' },
  { id: 'pro_shop', key: 'proShop', icon: '🛒' },
  { id: 'rental', key: 'rental', icon: '🎾' },
  { id: 'lighting', key: 'lighting', icon: '💡' },
  { id: 'wifi', key: 'wifi', icon: '📡' },
  { id: 'warm_up', key: 'warmUp', icon: '🏋️' },
  { id: 'kids', key: 'kids', icon: '🧒' },
  { id: 'accessible', key: 'accessible', icon: '♿' },
  { id: 'physio', key: 'physio', icon: '🩺' },
] as const

// ─── Componente de sección ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="text-base font-bold text-ink-800 mb-5 pb-3 border-b border-ink-100">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </Card>
  )
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-ink-700 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-400 mt-1">{hint}</p>}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function NuevoClubPage() {
  const router = useRouter()
  const t = useTranslations('MisClubs.nuevoClub')

  const [form, setForm] = useState({
    name: '',
    description: '',
    country: 'CO' as CountryCode,
    city: '',
    address: '',
    latitude: '',
    longitude: '',
    sports: ['padel'] as string[],
    amenities: [] as string[],
    contactEmail: '',
    phone: '',
    website: '',
    photos: ['', '', ''],
    currency: 'COP',
    cancellationPolicy: 'flexible',
    bookingHorizonDays: 14,
    slotGenerationHour: 6,
  })

  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setCountry(code: CountryCode) {
    const c = COUNTRIES.find((c) => c.code === code)
    setForm((f) => ({ ...f, country: code, currency: c?.currency ?? 'USD' }))
  }

  function toggleSport(sport: string) {
    setForm((f) => ({
      ...f,
      sports: f.sports.includes(sport) ? f.sports.filter((s) => s !== sport) : [...f.sports, sport],
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

  function setPhoto(i: number, val: string) {
    setForm((f) => {
      const p = [...f.photos]
      p[i] = val
      return { ...f, photos: p }
    })
  }

  function useMyLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }))
        setLocating(false)
      },
      () => setLocating(false)
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError(t('errorName'))
      return
    }
    if (!form.city.trim()) {
      setError(t('errorCity'))
      return
    }
    if (!form.address.trim()) {
      setError(t('errorAddress'))
      return
    }
    if (form.sports.length === 0) {
      setError(t('errorSport'))
      return
    }

    setSaving(true)
    setError('')
    try {
      const body = {
        ...form,
        photos: form.photos.filter(Boolean),
        latitude: form.latitude ? Number(form.latitude) : 0,
        longitude: form.longitude ? Number(form.longitude) : 0,
        bookingHorizonDays: Number(form.bookingHorizonDays),
        slotGenerationHour: Number(form.slotGenerationHour),
      }
      const res = await fetch('/api/clubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('errorGeneric'))
        return
      }

      // Guardar el nuevo club como activo y redirigir
      localStorage.setItem('racketly_active_club', JSON.stringify(data.data))
      window.dispatchEvent(new CustomEvent('club-changed', { detail: data.data }))
      router.push('/dashboard/canchas')
      router.refresh()
    } catch {
      setError(t('errorConnection'))
    } finally {
      setSaving(false)
    }
  }

  const selectedCountry = COUNTRIES.find((c) => c.code === form.country)

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-black text-ink-900">{t('title')}</h1>
        <p className="text-sm text-ink-400 mt-1">{t('subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Información básica ── */}
        <Section title={t('sectionBasicInfo')}>
          <Field label={t('name')} required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('namePlaceholder')}
            />
          </Field>
          <Field label={t('description')} hint={t('descriptionHint')}>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t('descriptionPlaceholder')}
              rows={3}
            />
          </Field>
        </Section>

        {/* ── Ubicación ── */}
        <Section title={t('sectionLocation')}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('country')} required>
              <Select
                value={form.country}
                onChange={(e) => setCountry(e.target.value as CountryCode)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {t(`countries.${c.code}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('city')} required>
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder={t('cityPlaceholder')}
              />
            </Field>
          </div>
          <Field label={t('address')} required>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder={t('addressPlaceholder')}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('latitude')} hint={t('latitudeHint')}>
              <Input
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                placeholder={t('latitudePlaceholder')}
              />
            </Field>
            <Field label={t('longitude')}>
              <Input
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                placeholder={t('longitudePlaceholder')}
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="flex items-center gap-2 text-xs font-semibold text-court-600 hover:text-court-800 transition-colors disabled:opacity-50"
          >
            {locating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LocateFixed className="w-3.5 h-3.5" />
            )}
            {locating ? t('locating') : t('useMyLocation')}
          </button>
        </Section>

        {/* ── Deportes ── */}
        <Section title={t('sectionSportsConfig')}>
          <Field label={t('sports')} required>
            <div className="flex gap-3">
              {(
                [
                  { value: 'padel', label: t('sportPadel'), Icon: PadelIcon },
                  { value: 'pickleball', label: t('sportPickleball'), Icon: PickleballIcon },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleSport(value)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                    form.sports.includes(value)
                      ? 'border-court-500 bg-court-50 text-court-700'
                      : 'border-ink-200 text-ink-400 hover:border-ink-300'
                  }`}
                >
                  <Icon size={17} />
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('cancellationPolicy')}>
              <Select
                value={form.cancellationPolicy}
                onChange={(e) => setForm({ ...form, cancellationPolicy: e.target.value })}
              >
                <option value="flexible">{t('cancellationFlexible')}</option>
                <option value="moderate">{t('cancellationModerate')}</option>
                <option value="strict">{t('cancellationStrict')}</option>
              </Select>
            </Field>
            <Field label={t('bookingHorizon')} hint={t('bookingHorizonHint')}>
              <Select
                value={form.bookingHorizonDays}
                onChange={(e) => setForm({ ...form, bookingHorizonDays: Number(e.target.value) })}
              >
                {[1, 3, 7, 14, 21, 30, 60].map((d) => (
                  <option key={d} value={d}>
                    {t('bookingHorizonDays', { count: d })}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label={t('slotGeneration')} hint={t('slotGenerationHint')}>
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
          </Field>

          <Field label={t('currency')}>
            <div className="flex items-center gap-2">
              <Input
                value={form.currency}
                onChange={(e) =>
                  setForm({ ...form, currency: e.target.value.toUpperCase().slice(0, 3) })
                }
                maxLength={3}
                placeholder={t('currencyPlaceholder')}
                className="uppercase font-mono"
              />
              {selectedCountry && (
                <span className="text-xs text-ink-400 whitespace-nowrap">
                  {t('currencyAuto', {
                    flag: selectedCountry.flag,
                    currency: selectedCountry.currency,
                  })}
                </span>
              )}
            </div>
          </Field>
        </Section>

        {/* ── Amenidades ── */}
        <Section title={t('sectionAmenities')}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {AMENITIES.map(({ id, key, icon }) => {
              const active = form.amenities.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleAmenity(id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border-2 transition-all text-left ${
                    active
                      ? 'border-court-500 bg-court-50 text-court-700 font-semibold'
                      : 'border-ink-100 text-ink-500 hover:border-ink-200'
                  }`}
                >
                  <span className="text-base shrink-0">{icon}</span>
                  <span className="text-xs leading-tight">{t(`amenities.${key}`)}</span>
                </button>
              )
            })}
          </div>
        </Section>

        {/* ── Fotos ── */}
        <Section title={t('sectionPhotos')}>
          <p className="text-xs text-ink-400 -mt-2">{t('photosHint')}</p>
          {form.photos.map((url, i) => (
            <Field
              key={i}
              label={`${t('photoLabel', { index: i + 1 })}${i === 0 ? t('photoCover') : ''}`}
            >
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Camera className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" />
                  <Input
                    type="url"
                    value={url}
                    onChange={(e) => setPhoto(i, e.target.value)}
                    placeholder={t('photoPlaceholder')}
                    className="pl-9"
                  />
                </div>
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover border border-ink-200 shrink-0"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}
              </div>
            </Field>
          ))}
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, photos: [...f.photos, ''] }))}
            className="text-xs text-court-600 font-semibold hover:text-court-800 transition-colors"
          >
            {t('addPhoto')}
          </button>
        </Section>

        {/* ── Contacto ── */}
        <Section title={t('sectionContact')}>
          <div className="grid grid-cols-1 gap-4">
            <Field label={t('contactEmail')}>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" />
                <Input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  placeholder={t('contactEmailPlaceholder')}
                  className="pl-9"
                />
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('phone')}>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" />
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder={t('phonePlaceholder')}
                    className="pl-9"
                  />
                </div>
              </Field>
              <Field label={t('website')}>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" />
                  <Input
                    type="url"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder={t('websitePlaceholder')}
                    className="pl-9"
                  />
                </div>
              </Field>
            </div>
          </div>
        </Section>

        {/* ── Error y submit ── */}
        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            className="flex-1"
          >
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> {t('submitting')}
              </>
            ) : (
              <>
                <ChevronRight className="w-4 h-4" /> {t('submit')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
