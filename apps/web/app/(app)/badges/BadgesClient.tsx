'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Lock, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

type BadgeItem = {
  id: string
  name: string
  description: string
  iconUrl: string
  xpReward: number
  earned: boolean
  earnedAt: string | null
}

async function fetchBadges(userId: string, fallbackError: string): Promise<BadgeItem[]> {
  const res = await fetch(`/api/gamification/${userId}/badges`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? fallbackError)
  return data.data ?? []
}

export function BadgesClient({ userId }: { userId: string }) {
  const t = useTranslations('Badges')

  const { data: badges, isLoading } = useQuery({
    queryKey: ['badges', userId],
    queryFn: () => fetchBadges(userId, t('loadError')),
  })

  const earnedCount = (badges ?? []).filter((b) => b.earned).length

  return (
    <div className="space-y-6">
      <Link
        href="/profile"
        className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('backLink')}
      </Link>

      <div>
        <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>
        <p className="text-sm text-ink-400 mt-0.5">
          {t('progress', { earned: earnedCount, total: badges?.length ?? 0 })}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(badges ?? []).map((b) => (
            <Card
              key={b.id}
              className={cn(
                'relative p-4 flex flex-col items-center text-center',
                !b.earned && 'opacity-60'
              )}
            >
              {!b.earned && <Lock className="w-3.5 h-3.5 text-ink-300 absolute top-3 right-3" />}
              <span className="text-3xl">{b.iconUrl}</span>
              <p className="font-bold text-sm text-ink-900 mt-2">{b.name}</p>
              <p className="text-xs text-ink-400 mt-1">{b.description}</p>
              <p className="text-[11px] font-semibold text-court-600 mt-2">
                {t('xpReward', { xp: b.xpReward })}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
