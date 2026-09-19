'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { eloToCategory } from '@racketly/utils'

type EloHistoryItem = {
  id: string
  sport: 'padel' | 'pickleball' | 'both'
  eloBefore: number
  eloAfter: number
  delta: number
  createdAt: string
}

type Stats = { totalMatches: number; wins: number; losses: number; winRate: number }

async function fetchEloHistory(userId: string): Promise<EloHistoryItem[]> {
  const res = await fetch(`/api/rankings/elo-history/${userId}`)
  const data = await res.json()
  if (!res.ok) return []
  return (data.data ?? []).slice().reverse()
}

async function fetchStats(userId: string): Promise<Stats> {
  const res = await fetch(`/api/profile/${userId}/stats`)
  const data = await res.json()
  if (!res.ok) return { totalMatches: 0, wins: 0, losses: 0, winRate: 0 }
  return data.data.stats
}

export function DetailedStatsClient({ userId }: { userId: string }) {
  const t = useTranslations('ProfileStats')

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ['eloHistory', userId],
    queryFn: () => fetchEloHistory(userId),
  })

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['profileStats', userId],
    queryFn: () => fetchStats(userId),
  })

  const isLoading = loadingHistory || loadingStats
  const padelHistory = (history ?? []).filter((h) => h.sport === 'padel' || h.sport === 'both')
  const pickleHistory = (history ?? []).filter((h) => h.sport === 'pickleball')

  return (
    <div className="space-y-6">
      <Link
        href="/profile"
        className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('backLink')}
      </Link>

      <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <>
          <Card className="p-6">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">
              {t('performance')}
            </p>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-xl font-black text-ink-900">{stats?.totalMatches ?? 0}</p>
                <p className="text-[11px] text-ink-400 mt-0.5">{t('played')}</p>
              </div>
              <div>
                <p className="text-xl font-black text-court-600">{stats?.wins ?? 0}</p>
                <p className="text-[11px] text-ink-400 mt-0.5">{t('won')}</p>
              </div>
              <div>
                <p className="text-xl font-black text-red-500">{stats?.losses ?? 0}</p>
                <p className="text-[11px] text-ink-400 mt-0.5">{t('lost')}</p>
              </div>
              <div>
                <p className="text-xl font-black text-ink-900">{stats?.winRate ?? 0}%</p>
                <p className="text-[11px] text-ink-400 mt-0.5">{t('winRate')}</p>
              </div>
            </div>
          </Card>

          <EloTrendCard
            title={t('eloTrendPadel')}
            history={padelHistory}
            emptyText={t('noMatches')}
          />
          <EloTrendCard
            title={t('eloTrendPickleball')}
            history={pickleHistory}
            emptyText={t('noMatches')}
          />
        </>
      )}
    </div>
  )
}

function EloTrendCard({
  title,
  history,
  emptyText,
}: {
  title: string
  history: EloHistoryItem[]
  emptyText: string
}) {
  if (history.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm font-bold text-ink-900 mb-2">{title}</p>
        <p className="text-sm text-ink-400">{emptyText}</p>
      </Card>
    )
  }

  const values = history.map((h) => h.eloAfter)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const latest = history[history.length - 1]
  const category = eloToCategory(latest.eloAfter)

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-ink-900">{title}</p>
        <span className="text-xs font-bold text-court-700 bg-court-50 rounded-full px-2.5 py-1">
          {category}
        </span>
      </div>
      <div className="flex items-end gap-1 h-24">
        {history.map((h) => {
          const heightPct = 12 + ((h.eloAfter - min) / range) * 88
          return (
            <div key={h.id} className="flex-1 h-full flex items-end">
              <div
                className={`w-full rounded ${h.delta >= 0 ? 'bg-court-500' : 'bg-red-500'}`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[11px] text-ink-400 mt-2">
        <span>{min}</span>
        <span>{latest.eloAfter}</span>
        <span>{max}</span>
      </div>
    </Card>
  )
}
