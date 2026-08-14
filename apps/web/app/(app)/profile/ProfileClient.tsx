'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Loader2, AlertCircle, Trophy, Target, Zap, MapPin } from 'lucide-react'
import { eloToCategory, xpForNextLevel } from '@racketly/utils'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { useToast } from '@/components/ui/Toast'

const COUNTRY_CODES = ['DO', 'CO', 'MX', 'ES', 'AR', 'US'] as const

type PlayerProfile = {
  userId: string; displayName: string; bio: string | null; sport: string
  country: string; city: string; eloPadel: number; eloPickleball: number
  category: string; xpPoints: number; level: number
}
type ProfileStats = {
  profile: PlayerProfile; category: string
  stats: { totalMatches: number; wins: number; losses: number; winRate: number }
}

async function fetchStats(userId: string, fallbackError: string): Promise<ProfileStats> {
  const res = await fetch(`/api/profile/${userId}/stats`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? fallbackError)
  return data.data
}

export function ProfileClient({ userId, email, initial }: { userId: string; email: string; initial: ProfileStats | null }) {
  const t = useTranslations('Profile')
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const { data } = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchStats(userId, t('errors.loadFailed')),
    initialData: initial ?? undefined,
  })

  const [form, setForm] = useState(() => ({
    displayName: data?.profile.displayName ?? '',
    bio: data?.profile.bio ?? '',
    city: data?.profile.city ?? '',
    country: data?.profile.country ?? 'DO',
    sport: (data?.profile.sport ?? 'padel') as 'padel' | 'pickleball' | 'both',
  }))

  function startEdit() {
    if (data) setForm({ displayName: data.profile.displayName, bio: data.profile.bio ?? '', city: data.profile.city, country: data.profile.country, sport: data.profile.sport as any })
    setEditing(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error ?? t('errors.saveFailed'))
      return resData.data
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
      <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
    )
  }

  const { profile, stats } = data
  const category = eloToCategory(profile.eloPadel)
  const xp = xpForNextLevel(profile.xpPoints)

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center text-2xl font-black text-white shrink-0">
              {profile.displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight">{profile.displayName}</h1>
              <p className="flex items-center gap-1 text-sm text-gray-400 mt-0.5">
                <MapPin className="w-3.5 h-3.5" /> {profile.city}, {profile.country}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{email}</p>
            </div>
          </div>
          {!editing && (
            <button onClick={startEdit} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors shrink-0">
              <Pencil className="w-3.5 h-3.5" /> {t('editButton')}
            </button>
          )}
        </div>

        {profile.bio && !editing && <p className="text-sm text-gray-500 mt-4">{profile.bio}</p>}

        <div className="flex items-center gap-1.5 flex-wrap mt-4">
          <Badge tone="violet">{t('categoryBadge', { category })}</Badge>
          {(profile.sport === 'padel' || profile.sport === 'both') && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-50 rounded-full px-2.5 py-1"><PadelIcon size={13} /> {t('sports.padel')}</span>
          )}
          {(profile.sport === 'pickleball' || profile.sport === 'both') && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-50 rounded-full px-2.5 py-1"><PickleballIcon size={13} /> {t('sports.pickleball')}</span>
          )}
        </div>

        {editing && (
          <div className="mt-5 pt-5 border-t border-gray-100 space-y-4">
            {error && (
              <p className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </p>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('form.nameLabel')}</label>
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('form.bioLabel')}</label>
              <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={2} maxLength={300}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('form.countryLabel')}</label>
                <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                  {COUNTRY_CODES.map((code) => <option key={code} value={code}>{t(`countries.${code}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('form.cityLabel')}</label>
                <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('form.sportLabel')}</label>
              <div className="flex border border-gray-200 rounded-xl overflow-hidden">
                {(['padel', 'pickleball', 'both'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setForm({ ...form, sport: v })}
                    className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${form.sport === v ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    {t(`sports.${v}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => { setEditing(false); setError('') }} className="flex-1">{t('form.cancel')}</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('form.save')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide"><Trophy className="w-3.5 h-3.5" /> {t('stats.eloPadel')}</p>
          <p className="text-2xl font-black text-gray-900 mt-1.5">{profile.eloPadel}</p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide"><Trophy className="w-3.5 h-3.5" /> {t('stats.eloPickleball')}</p>
          <p className="text-2xl font-black text-gray-900 mt-1.5">{profile.eloPickleball}</p>
        </Card>
      </div>

      <Card className="p-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2"><Zap className="w-3.5 h-3.5" /> {t('stats.level', { level: profile.level })}</p>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: `${xp.percent}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">{t('stats.xpProgress', { current: profile.xpPoints, total: xp.next })}</p>
      </Card>

      <Card className="p-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3"><Target className="w-3.5 h-3.5" /> {t('matches.title')}</p>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-xl font-black text-gray-900">{stats.totalMatches}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{t('matches.played')}</p>
          </div>
          <div>
            <p className="text-xl font-black text-emerald-600">{stats.wins}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{t('matches.won')}</p>
          </div>
          <div>
            <p className="text-xl font-black text-red-500">{stats.losses}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{t('matches.lost')}</p>
          </div>
          <div>
            <p className="text-xl font-black text-gray-900">{stats.winRate}%</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{t('matches.winRate')}</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
