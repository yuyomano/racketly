'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Medal, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { cn } from '@/lib/utils'

type RankedPlayer = {
  userId: string
  displayName: string
  avatarUrl: string | null
  eloPadel: number
  eloPickleball: number
  category: string
  country: string
  city: string
}

async function fetchRankings(sport: 'padel' | 'pickleball'): Promise<RankedPlayer[]> {
  const res = await fetch(`/api/rankings?sport=${sport}&limit=50`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to load rankings')
  return data.data ?? []
}

export function RankingsClient({ userId }: { userId: string }) {
  const t = useTranslations('Rankings')
  const [sport, setSport] = useState<'padel' | 'pickleball'>('padel')

  const {
    data: players,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['rankings', sport],
    queryFn: () => fetchRankings(sport),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>
        <p className="text-sm text-ink-400 mt-0.5">{t('subtitle')}</p>
      </div>

      <div className="flex border border-ink-200 rounded-xl overflow-hidden w-fit">
        {(['padel', 'pickleball'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setSport(v)}
            className={cn(
              'px-4 py-2 text-sm font-semibold transition-colors',
              sport === v ? 'bg-court-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
            )}
          >
            {v === 'padel' ? t('sportPadel') : t('sportPickleball')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{t('loadError')}</p>
      ) : !players || players.length === 0 ? (
        <EmptyState icon={Medal} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <Th className="w-12">#</Th>
                <Th>{t('columnPlayer')}</Th>
                <Th>{t('columnCategory')}</Th>
                <Th>{t('columnLocation')}</Th>
                <Th className="text-right">{t('columnElo')}</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {players.map((p, i) => (
                <TableRow
                  key={p.userId}
                  className={p.userId === userId ? 'bg-court-50 hover:bg-court-50' : undefined}
                >
                  <Td className="font-bold text-ink-400">{i + 1}</Td>
                  <Td className="font-semibold text-ink-900">
                    {p.displayName}
                    {p.userId === userId && (
                      <span className="ml-2 text-xs font-medium text-court-700">{t('youTag')}</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone="violet">{p.category}</Badge>
                  </Td>
                  <Td className="text-ink-500">
                    {p.city}, {p.country}
                  </Td>
                  <Td className="text-right font-bold text-ink-900">
                    {sport === 'padel' ? p.eloPadel : p.eloPickleball}
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
