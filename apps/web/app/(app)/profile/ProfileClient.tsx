'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import {
  Pencil,
  Loader2,
  AlertCircle,
  Trophy,
  Zap,
  MapPin,
  Camera,
  CalendarDays,
  Handshake,
  Ribbon,
  Wallet,
  ChevronRight,
  Settings,
  Bell,
  BarChart3,
} from 'lucide-react'
import { eloToCategory, xpForNextLevel } from '@racketly/utils'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'

const COUNTRY_CODES = ['DO', 'CO', 'MX', 'ES', 'AR', 'US'] as const

type PlayerProfile = {
  userId: string
  displayName: string
  bio: string | null
  sport: string
  country: string
  city: string
  avatarUrl: string | null
  preferredSide: 'derecha' | 'reves' | null
  gender: 'masculino' | 'femenino' | 'prefiero_no_decir' | null
  instagramHandle: string | null
  whatsapp: string | null
  plusCode: string | null
  eloPadel: number
  eloPickleball: number
  category: string
  xpPoints: number
  level: number
}
type ProfileStats = {
  profile: PlayerProfile
  category: string
  stats: { totalMatches: number; wins: number; losses: number; winRate: number }
}

async function fetchStats(userId: string, fallbackError: string): Promise<ProfileStats> {
  const res = await fetch(`/api/profile/${userId}/stats`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? fallbackError)
  return data.data
}

type MeData = { phone: string; birthDate: string; subscriptionTier: string }

async function fetchMe(): Promise<MeData> {
  const res = await fetch('/api/auth/me')
  const data = await res.json()
  if (!res.ok) return { phone: '', birthDate: '', subscriptionTier: 'free' }
  return {
    phone: data.data?.phone ?? '',
    birthDate: data.data?.birthDate ?? '',
    subscriptionTier: data.data?.subscriptionTier ?? 'free',
  }
}

const QUICK_LINKS: { href: string; key: string; icon: typeof CalendarDays }[] = [
  { href: '/booking/mine', key: 'myBookings', icon: CalendarDays },
  { href: '/memberships/mine', key: 'myMemberships', icon: Wallet },
  { href: '/tournaments/mine', key: 'myTournaments', icon: Trophy },
  { href: '/find-a-partner/mine', key: 'findPartner', icon: Handshake },
  { href: '/badges', key: 'badges', icon: Ribbon },
  { href: '/profile/stats', key: 'detailedStats', icon: BarChart3 },
  { href: '/profile/notifications', key: 'notifications', icon: Bell },
  { href: '/profile/settings', key: 'settings', icon: Settings },
]

export function ProfileClient({
  userId,
  email,
  initial,
}: {
  userId: string
  email: string
  initial: ProfileStats | null
}) {
  const t = useTranslations('Profile')
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data } = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchStats(userId, t('errors.loadFailed')),
    initialData: initial ?? undefined,
  })

  const { data: me } = useQuery({
    queryKey: ['profile', userId, 'me'],
    queryFn: fetchMe,
  })

  const [form, setForm] = useState(() => ({
    displayName: data?.profile.displayName ?? '',
    bio: data?.profile.bio ?? '',
    city: data?.profile.city ?? '',
    country: data?.profile.country || 'DO',
    sport: (data?.profile.sport ?? 'padel') as 'padel' | 'pickleball' | 'both',
    preferredSide: data?.profile.preferredSide ?? '',
    gender: data?.profile.gender ?? '',
    instagramHandle: data?.profile.instagramHandle ?? '',
    whatsapp: data?.profile.whatsapp ?? '',
    plusCode: data?.profile.plusCode ?? '',
    phone: me?.phone ?? '',
    birthDate: me?.birthDate ?? '',
  }))

  function startEdit() {
    if (data)
      setForm({
        displayName: data.profile.displayName,
        bio: data.profile.bio ?? '',
        city: data.profile.city,
        country: data.profile.country || 'DO',
        sport: data.profile.sport as any,
        preferredSide: data.profile.preferredSide ?? '',
        gender: data.profile.gender ?? '',
        instagramHandle: data.profile.instagramHandle ?? '',
        whatsapp: data.profile.whatsapp ?? '',
        plusCode: data.profile.plusCode ?? '',
        phone: me?.phone ?? '',
        birthDate: me?.birthDate ?? '',
      })
    setEditing(true)
  }

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: formData })
      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error ?? t('errors.saveFailed'))
      return resData.data
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => {
      toast.success(t('toast.updated'))
      queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { phone: phoneValue, birthDate: birthDateValue, ...profileForm } = form
      const [profileRes, meRes] = await Promise.all([
        fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...profileForm,
            preferredSide: form.preferredSide || null,
            gender: form.gender || null,
            instagramHandle: form.instagramHandle || null,
            whatsapp: form.whatsapp || null,
            plusCode: form.plusCode || null,
          }),
        }),
        fetch('/api/auth/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phoneValue || null, birthDate: birthDateValue || null }),
        }),
      ])
      const profileData = await profileRes.json()
      const meData = await meRes.json()
      if (!profileRes.ok) throw new Error(profileData.error ?? t('errors.saveFailed'))
      if (!meRes.ok) throw new Error(meData.error ?? t('errors.saveFailed'))
      return profileData.data
    },
    onError: (e: Error) => setError(e.message),
    onSuccess: () => {
      setError('')
      setEditing(false)
      toast.success(t('toast.updated'))
      queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })

  if (!data) {
    return (
      <div className="flex items-center justify-center py-16 text-ink-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  const { profile, stats } = data
  const category = eloToCategory(profile.eloPadel)
  const xp = xpForNextLevel(profile.xpPoints)

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Card className={editing ? 'p-6' : 'p-6 bg-court-900 border-court-900'}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 shrink-0">
              {profile.avatarUrl ? (
                <Image
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  fill
                  className="rounded-2xl object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-court-500 flex items-center justify-center text-2xl font-black text-white">
                  {profile.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              {profile.userId === userId && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarMutation.isPending}
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-ink-900 text-white flex items-center justify-center shadow"
                  title={t('form.changePhoto')}
                >
                  {avatarMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Camera className="w-3 h-3" />
                  )}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) avatarMutation.mutate(file)
                  e.target.value = ''
                }}
              />
            </div>
            <div>
              <h1
                className={`text-xl font-black tracking-tight ${editing ? 'text-ink-900' : 'text-white'}`}
              >
                {profile.displayName}
              </h1>
              <p
                className={`flex items-center gap-1 text-sm mt-0.5 ${editing ? 'text-ink-400' : 'text-court-200'}`}
              >
                <MapPin className="w-3.5 h-3.5" /> {profile.city}, {profile.country}
              </p>
              <p className={`text-xs mt-0.5 ${editing ? 'text-ink-400' : 'text-court-300'}`}>
                {email}
              </p>
            </div>
          </div>
          {!editing && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> {t('editButton')}
              </button>
              <Link
                href="/profile/settings"
                className="flex items-center justify-center w-9 h-9 text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                title={t('quickLinks.settings')}
              >
                <Settings className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>

        {profile.bio && !editing && <p className="text-sm text-court-100 mt-4">{profile.bio}</p>}

        {!editing && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-white/10 rounded-xl px-3 py-3 text-center">
              <p className="text-xl font-black text-white">{profile.eloPadel}</p>
              <p className="text-[11px] text-court-200 mt-0.5">{t('stats.eloPadel')}</p>
            </div>
            <div className="bg-court-500 rounded-xl px-3 py-3 text-center">
              <p className="text-xl font-black text-white">{category}</p>
              <p className="text-[11px] text-court-50 mt-0.5">{t('stats.category')}</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-3 text-center">
              <p className="text-xl font-black text-white">{profile.eloPickleball}</p>
              <p className="text-[11px] text-court-200 mt-0.5">{t('stats.eloPickleball')}</p>
            </div>
          </div>
        )}

        {!editing && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-court-100 mt-3">
            <BarChart3 className="w-3.5 h-3.5" />
            {t('matches.summary', {
              played: stats.totalMatches,
              winRate: stats.winRate,
            })}
          </p>
        )}

        <div className="flex items-center gap-1.5 flex-wrap mt-4">
          {editing && <Badge tone="violet">{t('categoryBadge', { category })}</Badge>}
          {(profile.sport === 'padel' || profile.sport === 'both') && (
            <span
              className={`flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 ${editing ? 'text-ink-500 bg-ink-50' : 'text-white bg-white/10'}`}
            >
              <PadelIcon size={13} /> {t('sports.padel')}
            </span>
          )}
          {(profile.sport === 'pickleball' || profile.sport === 'both') && (
            <span
              className={`flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 ${editing ? 'text-ink-500 bg-ink-50' : 'text-white bg-white/10'}`}
            >
              <PickleballIcon size={13} /> {t('sports.pickleball')}
            </span>
          )}
        </div>

        {editing && (
          <div className="mt-5 pt-5 border-t border-ink-100 space-y-4">
            {error && (
              <p className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </p>
            )}
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                {t('form.nameLabel')}
              </label>
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="w-full border border-ink-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                {t('form.bioLabel')}
              </label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={2}
                maxLength={300}
                className="w-full border border-ink-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-court-500/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                  {t('form.countryLabel')}
                </label>
                <select
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full border border-ink-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40"
                >
                  {COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {t(`countries.${code}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                  {t('form.cityLabel')}
                </label>
                <input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full border border-ink-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                {t('form.sportLabel')}
              </label>
              <div className="flex border border-ink-200 rounded-xl overflow-hidden">
                {(['padel', 'pickleball', 'both'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm({ ...form, sport: v })}
                    className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${form.sport === v ? 'bg-court-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'}`}
                  >
                    {t(`sports.${v}`)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                {t('form.preferredSideLabel')}
              </label>
              <div className="flex border border-ink-200 rounded-xl overflow-hidden">
                {(['', 'derecha', 'reves'] as const).map((v) => (
                  <button
                    key={v || 'none'}
                    type="button"
                    onClick={() => setForm({ ...form, preferredSide: v })}
                    className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${form.preferredSide === v ? 'bg-court-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'}`}
                  >
                    {v ? t(`preferredSide.${v}`) : t('preferredSide.none')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                {t('form.genderLabel')}
              </label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value as any })}
                className="w-full border border-ink-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40"
              >
                <option value="">{t('gender.none')}</option>
                <option value="masculino">{t('gender.masculino')}</option>
                <option value="femenino">{t('gender.femenino')}</option>
                <option value="prefiero_no_decir">{t('gender.prefiero_no_decir')}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                  {t('form.phoneLabel')}
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 809 555 0000"
                  className="w-full border border-ink-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                  {t('form.whatsappLabel')}
                </label>
                <input
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  placeholder="+1 809 555 0000"
                  className="w-full border border-ink-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                {t('form.birthDateLabel')}
              </label>
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                className="w-full border border-ink-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                {t('form.instagramLabel')}
              </label>
              <input
                value={form.instagramHandle}
                onChange={(e) => setForm({ ...form, instagramHandle: e.target.value })}
                placeholder="@usuario"
                className="w-full border border-ink-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                {t('form.plusCodeLabel')}
              </label>
              <input
                value={form.plusCode}
                onChange={(e) => setForm({ ...form, plusCode: e.target.value })}
                placeholder="796RWF8Q+WF"
                className="w-full border border-ink-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(false)
                  setError('')
                }}
                className="flex-1"
              >
                {t('form.cancel')}
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex-1"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t('form.save')
                )}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
          <Zap className="w-3.5 h-3.5" /> {t('stats.level', { level: profile.level })}
        </p>
        <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
          <div className="h-full bg-court-500" style={{ width: `${xp.percent}%` }} />
        </div>
        <p className="text-xs text-ink-400 mt-1.5">
          {t('stats.xpProgress', { current: profile.xpPoints, total: xp.next })}
        </p>
      </Card>

      <Card className="overflow-hidden">
        {QUICK_LINKS.map(({ href, key, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-5 py-4 border-b border-ink-100 last:border-0 hover:bg-ink-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-court-50 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-court-600" />
            </div>
            <span className="flex-1 text-sm font-semibold text-ink-800">
              {t(`quickLinks.${key}`)}
            </span>
            <ChevronRight className="w-4 h-4 text-ink-300" />
          </Link>
        ))}
      </Card>
    </div>
  )
}
