'use client'

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { formatCurrency, pctTrend } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Wallet, Gauge, CalendarDays, XCircle, Building2 } from 'lucide-react'
import { SkeletonStatCards } from '@/components/ui/Skeleton'
import { ExchangeRatePanel } from './ExchangeRatePanel'

const GW = '' // relative — middleware inyecta auth, next.config reescribe al gateway

// ─── Helpers ────────────────────────────────────────────────────────────────

function getUserId(): string {
  try {
    const match = document.cookie.split(';').find((c) => c.trim().startsWith('racketly_user='))
    if (!match) return ''
    return JSON.parse(decodeURIComponent(match.split('=')[1]))?.id ?? ''
  } catch {
    return ''
  }
}

function mergeByDay(arrays: { date: string; bookings: number; revenue: number }[][]) {
  const merged: Record<string, { date: string; bookings: number; revenue: number }> = {}
  for (const arr of arrays) {
    for (const e of arr) {
      if (!merged[e.date]) merged[e.date] = { date: e.date, bookings: 0, revenue: 0 }
      merged[e.date].bookings += e.bookings
      merged[e.date].revenue += e.revenue
    }
  }
  return Object.values(merged).sort((a, b) => a.date.localeCompare(b.date))
}

function bucketize(
  byDay: { date: string; bookings: number; revenue: number }[],
  maxPoints: number,
  locale: string
): { label: string; bookings: number; revenue: number }[] {
  if (byDay.length === 0) return []
  if (byDay.length <= maxPoints) {
    return byDay.map((d) => ({
      label: new Date(d.date + 'T12:00:00').toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      }),
      bookings: d.bookings,
      revenue: d.revenue,
    }))
  }
  const size = Math.ceil(byDay.length / maxPoints)
  const result = []
  for (let i = 0; i < byDay.length; i += size) {
    const bucket = byDay.slice(i, i + size)
    result.push({
      label: new Date(bucket[0].date + 'T12:00:00').toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      }),
      bookings: bucket.reduce((s, d) => s + d.bookings, 0),
      revenue: bucket.reduce((s, d) => s + d.revenue, 0),
    })
  }
  return result
}

// ─── Chart components ────────────────────────────────────────────────────────

function HBarChart({
  data,
  label,
  unit = '',
}: {
  data: { label: string; value: number; max: number; color: string }[]
  label: string
  unit?: string
}) {
  return (
    <Card className="p-6">
      <h3 className="text-sm font-bold text-ink-700 mb-5">{label}</h3>
      <div className="space-y-3">
        {data.map((d) => (
          <div key={d.label}>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-ink-600 font-medium truncate pr-2">{d.label}</span>
              <span className="text-ink-900 font-bold shrink-0">
                {unit}
                {d.value.toLocaleString()}
              </span>
            </div>
            <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${d.color}`}
                style={{ width: `${Math.min((d.value / d.max) * 100, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function LineChart({
  data,
  label,
  color = 'emerald',
  valueFormatter = (v: number) => String(v),
}: {
  data: { label: string; value: number }[]
  label: string
  color?: string
  valueFormatter?: (v: number) => string
}) {
  const t = useTranslations('Estadisticas')

  if (data.length < 2) {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-bold text-ink-700 mb-5">{label}</h3>
        <div className="h-36 flex items-center justify-center text-sm text-ink-400">
          {t('noDataChart')}
        </div>
      </Card>
    )
  }
  const max = Math.max(...data.map((d) => d.value))
  const min = Math.min(...data.map((d) => d.value))
  const range = max - min || 1
  const W = 100 / (data.length - 1)
  const stroke = color === 'emerald' ? '#1B6B63' /* court-600 */ : '#A87D22' /* trophy-600 */

  const points = data.map((d, i) => ({
    x: i * W,
    y: 100 - ((d.value - min) / range) * 80 - 10,
  }))
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')

  // Only show a subset of x-axis labels to avoid clutter
  const tickEvery = data.length <= 9 ? 1 : data.length <= 18 ? 2 : Math.ceil(data.length / 9)

  return (
    <Card className="p-6">
      <h3 className="text-sm font-bold text-ink-700 mb-5">{label}</h3>
      <div className="flex justify-between text-[10px] text-ink-500 mb-1 font-medium">
        <span>{valueFormatter(max)}</span>
        <span>{valueFormatter(min)}</span>
      </div>
      <div className="relative h-36">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          <polyline
            points={polyline}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="1.5"
              fill={stroke}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <div className="flex justify-between text-[10px] text-ink-400 mt-2 overflow-hidden">
        {data.map((d, i) => (
          <span key={i} className={i % tickEvery !== 0 ? 'opacity-0' : ''}>
            {d.label}
          </span>
        ))}
      </div>
    </Card>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

type StatsData = {
  currency: string
  period: number
  confirmedBookings: number
  totalRevenue: number
  cancelledBookings: number
  pendingBookings: number
  totalBookings: number
  byDay: { date: string; bookings: number; revenue: number }[]
  courtOccupancy: {
    id: string
    name: string
    sport: string
    pct: number
    slotsToday: number
    bookedToday: number
  }[]
  avgOccupancyToday: number
  avgOccupancyYesterday: number
  previousPeriod: {
    totalBookings: number
    confirmedBookings: number
    cancelledBookings: number
    pendingBookings: number
    totalRevenue: number
  }
}

const PERIOD_VALUES = [7, 30, 90]

export default function EstadisticasPage() {
  const t = useTranslations('Estadisticas')
  const locale = useLocale()
  const [scope, setScope] = useState<'club' | 'all'>('club')
  const [period, setPeriod] = useState(30)
  const [activeClub, setActiveClub] = useState<{
    id: string
    name: string
    currency: string
  } | null>(null)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [allClubs, setAllClubs] = useState<any[]>([])

  // Read active club from localStorage + listen to changes
  useEffect(() => {
    function readClub() {
      try {
        const stored = localStorage.getItem('racketly_active_club')
        if (!stored) return
        const club = JSON.parse(stored)
        if (club?.id)
          setActiveClub({ id: club.id, name: club.name, currency: club.currency || 'USD' })
      } catch {
        /* ignore */
      }
    }
    readClub()

    function onClubChange(e: Event) {
      const club = (e as CustomEvent).detail
      if (club?.id)
        setActiveClub({ id: club.id, name: club.name, currency: club.currency || 'USD' })
    }
    window.addEventListener('club-changed', onClubChange)
    return () => window.removeEventListener('club-changed', onClubChange)
  }, [])

  // Fetch stats when club / scope / period changes
  useEffect(() => {
    setLoading(true)
    setStats(null)

    if (scope === 'club') {
      if (!activeClub) {
        setLoading(false)
        return
      }
      fetch(`${GW}/api/clubs/${activeClub.id}/stats?period=${period}`)
        .then((r) => r.json())
        .then((d) => setStats(d.data ?? null))
        .catch(() => setStats(null))
        .finally(() => setLoading(false))
      return
    }

    // Scope = all clubs
    const userId = getUserId()
    if (!userId) {
      setLoading(false)
      return
    }

    fetch(`${GW}/api/clubs/admin/${userId}`)
      .then((r) => r.json())
      .then(async (d) => {
        const clubs = d.data ?? []
        setAllClubs(clubs)
        if (clubs.length === 0) {
          setStats(null)
          setLoading(false)
          return
        }

        const allResults = await Promise.all(
          clubs.map((c: any) =>
            fetch(`${GW}/api/clubs/${c.id}/stats?period=${period}`)
              .then((r) => r.json())
              .then((d) => d.data as StatsData | null)
              .catch(() => null)
          )
        )
        const valid = allResults.filter(Boolean) as StatsData[]
        if (valid.length === 0) {
          setStats(null)
          setLoading(false)
          return
        }

        const avg = (arr: number[]) =>
          arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0

        const agg: StatsData = {
          currency: valid[0].currency,
          period,
          confirmedBookings: valid.reduce((s, v) => s + v.confirmedBookings, 0),
          totalRevenue: valid.reduce((s, v) => s + v.totalRevenue, 0),
          cancelledBookings: valid.reduce((s, v) => s + v.cancelledBookings, 0),
          pendingBookings: valid.reduce((s, v) => s + v.pendingBookings, 0),
          totalBookings: valid.reduce((s, v) => s + v.totalBookings, 0),
          byDay: mergeByDay(valid.map((v) => v.byDay)),
          courtOccupancy: valid.flatMap((v) => v.courtOccupancy),
          avgOccupancyToday: avg(valid.map((v) => v.avgOccupancyToday)),
          avgOccupancyYesterday: avg(valid.map((v) => v.avgOccupancyYesterday)),
          previousPeriod: {
            totalBookings: valid.reduce((s, v) => s + v.previousPeriod.totalBookings, 0),
            confirmedBookings: valid.reduce((s, v) => s + v.previousPeriod.confirmedBookings, 0),
            cancelledBookings: valid.reduce((s, v) => s + v.previousPeriod.cancelledBookings, 0),
            pendingBookings: valid.reduce((s, v) => s + v.previousPeriod.pendingBookings, 0),
            totalRevenue: valid.reduce((s, v) => s + v.previousPeriod.totalRevenue, 0),
          },
        }
        setStats(agg)
        setLoading(false)
      })
      .catch(() => {
        setStats(null)
        setLoading(false)
      })
  }, [activeClub, scope, period])

  // Derived chart data
  const bucketed = stats ? bucketize(stats.byDay, 12, locale) : []
  const bookingsChart = bucketed.map((b) => ({ label: b.label, value: b.bookings }))
  const revenueChart = bucketed.map((b) => ({ label: b.label, value: b.revenue }))

  const maxOcc = Math.max(...(stats?.courtOccupancy.map((c) => c.pct) ?? [1]), 1)
  const courtData = (stats?.courtOccupancy ?? []).map((c) => ({
    label: `${c.sport === 'padel' ? t('sportPadel') : t('sportPickleball')} — ${c.name}`,
    value: c.pct,
    max: maxOcc,
    color: c.pct >= 80 ? 'bg-court-500' : c.pct >= 50 ? 'bg-trophy-400' : 'bg-ink-300',
  }))

  const trendIngresos = stats
    ? pctTrend(stats.totalRevenue, stats.previousPeriod.totalRevenue)
    : undefined
  const trendConfirmadas = stats
    ? pctTrend(stats.confirmedBookings, stats.previousPeriod.confirmedBookings)
    : undefined
  const trendOcupacion = stats
    ? pctTrend(stats.avgOccupancyToday, stats.avgOccupancyYesterday)
    : undefined
  const trendCanceladas = stats
    ? pctTrend(stats.cancelledBookings, stats.previousPeriod.cancelledBookings)
    : undefined

  const currency = stats?.currency || activeClub?.currency || 'USD'
  const scopeLabel =
    scope === 'club'
      ? (activeClub?.name ?? t('activeClubFallback'))
      : t('allClubsScope', { count: allClubs.length })

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header con scope toggle y período */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{t('title')}</h1>
          <p className="text-sm text-ink-400 mt-0.5 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            {scopeLabel}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Scope toggle */}
          <div className="flex bg-ink-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => setScope('club')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${scope === 'club' ? 'bg-white shadow text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}
            >
              {t('scopeThisClub')}
            </button>
            <button
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${scope === 'all' ? 'bg-white shadow text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}
            >
              {t('scopeAllClubs')}
            </button>
          </div>

          {/* Period selector */}
          <div className="flex bg-ink-100 rounded-xl p-1 gap-1">
            {PERIOD_VALUES.map((value) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === value ? 'bg-white shadow text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}
              >
                {t('periodDays', { value })}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonStatCards count={5} />
      ) : !stats ? (
        <Card className="py-20 text-center text-ink-400 text-sm">
          {scope === 'club' && !activeClub ? t('emptyStateNoActiveClub') : t('emptyStateNoData')}
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t('kpiIngresos')}
              value={formatCurrency(stats.totalRevenue, currency)}
              sub={t('kpiIngresosSub', { period })}
              icon={Wallet}
              tone="violet"
              trend={trendIngresos?.trend}
              trendUp={trendIngresos?.trendUp}
            />
            <StatCard
              label={t('kpiConfirmadas')}
              value={String(stats.confirmedBookings)}
              sub={t('kpiConfirmadasSub', { total: stats.totalBookings })}
              icon={CalendarDays}
              tone="emerald"
              trend={trendConfirmadas?.trend}
              trendUp={trendConfirmadas?.trendUp}
            />
            <StatCard
              label={t('kpiOcupacion')}
              value={stats.courtOccupancy.length > 0 ? `${stats.avgOccupancyToday}%` : '—'}
              sub={t('kpiOcupacionSub', { count: stats.courtOccupancy.length })}
              icon={Gauge}
              tone="amber"
              trend={trendOcupacion?.trend}
              trendUp={trendOcupacion?.trendUp}
            />
            <StatCard
              label={t('kpiCanceladas')}
              value={String(stats.cancelledBookings)}
              sub={t('kpiCanceladasSub', { count: stats.pendingBookings })}
              icon={XCircle}
              tone="gray"
              trend={trendCanceladas?.trend}
              trendUp={trendCanceladas ? !trendCanceladas.trendUp : undefined}
            />
          </div>

          {/* Series temporales */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LineChart
              data={bookingsChart}
              label={t('chartBookingsTitle', { period })}
              color="emerald"
            />
            <LineChart
              data={revenueChart}
              label={t('chartRevenueTitle', { currency, period })}
              color="amber"
              valueFormatter={(v) => formatCurrency(v, currency)}
            />
          </div>

          {/* Ocupación por pista */}
          {courtData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <HBarChart
                label={t('chartOccupancyTitle')}
                unit=""
                data={courtData.map((c) => ({ ...c, max: 100 }))}
              />
              <HBarChart
                label={t('chartSlotsTitle')}
                data={(stats?.courtOccupancy ?? []).map((c) => ({
                  label: c.name,
                  value: c.bookedToday,
                  max: Math.max(c.slotsToday, 1),
                  color:
                    c.pct >= 80 ? 'bg-court-500' : c.pct >= 50 ? 'bg-trophy-400' : 'bg-ink-300',
                }))}
              />
            </div>
          )}

          {/* Tasas de cambio */}
          <ExchangeRatePanel />
        </>
      )}
    </div>
  )
}
