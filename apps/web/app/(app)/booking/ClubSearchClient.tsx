'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Search, MapPin, CalendarClock, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { cn } from '@/lib/utils'

type Club = {
  id: string
  name: string
  city: string
  country: string
  sports: string[]
  courts: { id: string; sport: string }[]
  recentlyBooked?: boolean
}

async function fetchClubs(search: string, sport: string, userId: string, fetchErrorMessage: string): Promise<Club[]> {
  const params = new URLSearchParams({ userId })
  if (search) params.set('search', search)
  if (sport !== 'all') params.set('sport', sport)
  const res = await fetch(`/api/clubs?${params.toString()}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? fetchErrorMessage)
  return data.data ?? []
}

export function ClubSearchClient({ userId }: { userId: string }) {
  const t = useTranslations('Booking.search')
  const [search, setSearch] = useState('')
  const [sport, setSport]   = useState<'all' | 'padel' | 'pickleball'>('all')

  const { data: clubs, isLoading, error } = useQuery({
    queryKey: ['clubs', { search, sport, userId }],
    queryFn: () => fetchClubs(search, sport, userId, t('fetchError')),
  })

  const sportOptions = [
    ['all', t('sportAll')],
    ['padel', t('sportPadel')],
    ['pickleball', t('sportPickleball')],
  ] as const

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">{t('title')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t('subtitle')}</p>
        </div>
        <Link
          href="/booking/mine"
          className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3.5 py-2 rounded-xl transition-colors shrink-0"
        >
          <CalendarClock className="w-4 h-4" /> {t('myBookings')}
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all"
          />
        </div>
        <div className="flex border border-gray-200 rounded-xl overflow-hidden shrink-0">
          {sportOptions.map(([v, l]) => (
            <button
              key={v} type="button" onClick={() => setSport(v)}
              className={cn(
                'px-4 py-2.5 text-sm font-semibold transition-colors',
                sport === v ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              )}
            >
              {l}
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
      ) : !clubs || clubs.length === 0 ? (
        <EmptyState icon={MapPin} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clubs.map((club) => (
            <Link key={club.id} href={`/booking/${club.id}`}>
              <Card className="p-5 h-full hover:border-emerald-200 hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-gray-900 leading-snug">{club.name}</h3>
                  {club.recentlyBooked && <Badge tone="emerald">{t('recentlyBooked')}</Badge>}
                </div>
                <p className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                  <MapPin className="w-3 h-3" /> {club.city}, {club.country}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  {club.sports.includes('padel') && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-50 rounded-full px-2.5 py-1">
                      <PadelIcon size={13} /> {t('sportPadel')}
                    </span>
                  )}
                  {club.sports.includes('pickleball') && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-50 rounded-full px-2.5 py-1">
                      <PickleballIcon size={13} /> {t('sportPickleball')}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-400 ml-auto">{t('courtsCount', { count: club.courts?.length ?? 0 })}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
