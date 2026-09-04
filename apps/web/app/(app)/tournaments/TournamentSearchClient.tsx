'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Trophy, Users, CalendarClock, Loader2, MapPin } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { cn } from '@/lib/utils'

type Tournament = {
  id: string
  name: string
  sport: 'padel' | 'pickleball'
  category: string
  genderCategory: 'masculino' | 'femenino' | 'mixto'
  type: string
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled'
  startDate: string
  maxParticipants: number
  currentParticipants: number
  entryFee: number
  currency: string
  location: string
  club?: { name: string } | null
  _count?: { participants: number }
}

const STATUS_TABS = ['open', 'in_progress', 'completed'] as const

async function fetchTournaments(status: string, sport: string): Promise<Tournament[]> {
  const params = new URLSearchParams({ status, limit: '50' })
  if (sport !== 'all') params.set('sport', sport)
  const res = await fetch(`/api/tournaments?${params.toString()}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to search tournaments')
  return data.data ?? []
}

export function TournamentSearchClient({ userId: _userId }: { userId: string }) {
  const t = useTranslations('TournamentsApp.search')
  const locale = useLocale()
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>('open')
  const [sport, setSport] = useState<'all' | 'padel' | 'pickleball'>('all')

  const STATUS_TAB_LABEL: Record<(typeof STATUS_TABS)[number], string> = {
    open: t('statusOpen'),
    in_progress: t('statusInProgress'),
    completed: t('statusCompleted'),
  }
  const SPORT_TAB_LABEL: Record<'all' | 'padel' | 'pickleball', string> = {
    all: t('sportAll'),
    padel: t('sportPadel'),
    pickleball: t('sportPickleball'),
  }
  const GENDER_LABEL: Record<Tournament['genderCategory'], string> = {
    masculino: t('genderMasculino'),
    femenino: t('genderFemenino'),
    mixto: t('genderMixto'),
  }

  const {
    data: tournaments,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tournaments', { status, sport }],
    queryFn: () => fetchTournaments(status, sport),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">{t('title')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t('subtitle')}</p>
        </div>
        <Link
          href="/tournaments/mine"
          className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3.5 py-2 rounded-xl transition-colors shrink-0"
        >
          <CalendarClock className="w-4 h-4" /> {t('myTournamentsLink')}
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex border border-gray-200 rounded-xl overflow-hidden w-fit">
          {STATUS_TABS.map((v) => (
            <button
              key={v}
              onClick={() => setStatus(v)}
              className={cn(
                'px-4 py-2 text-sm font-semibold transition-colors',
                status === v
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              )}
            >
              {STATUS_TAB_LABEL[v]}
            </button>
          ))}
        </div>
        <div className="flex border border-gray-200 rounded-xl overflow-hidden w-fit">
          {(['all', 'padel', 'pickleball'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setSport(v)}
              className={cn(
                'px-4 py-2 text-sm font-semibold transition-colors',
                sport === v
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              )}
            >
              {SPORT_TAB_LABEL[v]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{t('loadError')}</p>
      ) : !tournaments || tournaments.length === 0 ? (
        <EmptyState icon={Trophy} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map((t) => (
            <Link key={t.id} href={`/tournaments/${t.id}`}>
              <Card className="p-5 h-full hover:border-emerald-200 hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-gray-900 leading-snug">{t.name}</h3>
                  {t.sport === 'padel' ? (
                    <PadelIcon size={16} className="text-gray-300 shrink-0" />
                  ) : (
                    <PickleballIcon size={16} className="text-gray-300 shrink-0" />
                  )}
                </div>
                <p className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                  <MapPin className="w-3 h-3" /> {t.club?.name ?? t.location}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap mt-3">
                  <Badge tone="violet">{t.category}</Badge>
                  <Badge tone="blue">{GENDER_LABEL[t.genderCategory]}</Badge>
                  {t.entryFee > 0 && (
                    <Badge tone="gray">
                      {t.currency} {t.entryFee.toFixed(0)}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {t.currentParticipants}/{t.maxParticipants}
                  </span>
                  <span>
                    {new Date(t.startDate).toLocaleDateString(locale, {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
