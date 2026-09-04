'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  CalendarCheck,
  Wallet,
  Gauge,
  Users,
  Medal,
  ArrowUpRight,
  RefreshCw,
  Pencil,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { SkeletonStatCards } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, toUSD, pctTrend } from '@/lib/utils'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { bookingStatusMeta, bookingStatusLabel } from '@/lib/booking-status'

// ─── Mini bar chart ─────────────────────────────────────────────────────────

function MiniBar({ data, label }: { data: number[]; label: string }) {
  const max = Math.max(...data, 1)
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const CHART_HEIGHT = 80 // px, debe coincidir con h-20 del contenedor de barras
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-4">{label}</p>
      {/* Fila de barras con altura fija: la barra más alta nunca puede exceder este
          contenedor (a diferencia de antes, cuando barra + etiqueta del día compartían
          el mismo h-24 con items-end, y al tocar el máximo se desbordaban hacia arriba,
          encima del título). Las etiquetas de los días van en su propia fila debajo. */}
      <div className="flex items-end gap-2 h-20">
        {data.map((v, i) => (
          <div key={i} className="flex-1 group">
            <div
              className="w-full rounded-t-md bg-emerald-500/80 group-hover:bg-emerald-500 transition-colors"
              style={{ height: Math.max((v / max) * CHART_HEIGHT, 4) }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1.5">
        {data.map((_, i) => (
          <span key={i} className="flex-1 text-center text-[10px] font-medium text-gray-400">
            {days[i % 7]}
          </span>
        ))}
      </div>
    </div>
  )
}

function OccupancyBar({ name, pct, sport }: { name: string; pct: number; sport: string }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-start gap-1.5 min-w-0">
          <span className="mt-px shrink-0">
            {sport === 'padel' ? <PadelIcon size={12} /> : <PickleballIcon size={12} />}
          </span>
          <span className="text-xs font-medium text-gray-700 leading-snug">{name}</span>
        </div>
        <span className="text-xs font-bold text-gray-900 shrink-0">{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function DashboardPage() {
  const t = useTranslations('Overview')
  const [clubId, setClubId] = useState<string | null>(null)
  const [stats, setStats] = useState<any | null>(null)
  const [classesToday, setClassesToday] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(
    async (cId: string) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/clubs/${cId}/stats?period=7`)
        if (!res.ok) throw new Error(t('errorCargando'))
        const json = await res.json()
        setStats(json.data)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    },
    [t]
  )

  // Clases programadas para hoy — se muestran junto a las reservas de cancha en
  // "Reservas de hoy" para que el admin vea de un vistazo toda la agenda del día.
  const fetchClassesToday = useCallback(async (cId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch(`/api/classes/${cId}?date=${today}`)
      if (!res.ok) return
      const json = await res.json()
      setClassesToday((json.data ?? []).filter((s: any) => s.status !== 'cancelled'))
    } catch {
      /* silencioso */
    }
  }, [])

  // Leer club activo de localStorage y escuchar cambios
  useEffect(() => {
    const stored = localStorage.getItem('racketly_active_club')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed?.id) {
          setClubId(parsed.id)
          fetchStats(parsed.id)
          fetchClassesToday(parsed.id)
        }
      } catch {
        /* ignore */
      }
    } else {
      setLoading(false)
    }

    function onClubChanged(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail?.id) {
        setClubId(detail.id)
        fetchStats(detail.id)
        fetchClassesToday(detail.id)
      }
    }
    window.addEventListener('club-changed', onClubChanged)
    return () => window.removeEventListener('club-changed', onClubChanged)
  }, [fetchStats, fetchClassesToday])

  const currency = stats?.currency ?? 'USD'
  const byDay = stats?.byDay ?? []
  const bookingsWeek = byDay.map((d: any) => d.bookings)
  const revenueWeek = byDay.map((d: any) => d.revenue / 1000)

  const confirmedToday =
    (stats?.todayBookings?.filter((b: any) => b.status === 'confirmed').length ?? 0) +
    (stats?.confirmedClassesToday ?? 0)
  const totalSlotsToday =
    stats?.courtOccupancy?.reduce((s: number, c: any) => s + c.slotsToday, 0) ?? 0

  const avgOccupancyToday =
    stats?.courtOccupancy?.length > 0
      ? Math.round(
          stats.courtOccupancy.reduce((s: number, c: any) => s + c.pct, 0) /
            stats.courtOccupancy.length
        )
      : 0

  const trendReservasHoy = stats ? pctTrend(confirmedToday, stats.confirmedYesterday) : undefined
  const trendIngresos = stats
    ? pctTrend(stats.totalRevenue, stats.previousPeriod?.totalRevenue ?? 0)
    : undefined
  const trendOcupacion = stats
    ? pctTrend(avgOccupancyToday, stats.avgOccupancyYesterday)
    : undefined
  const trendReservasTotal = stats
    ? pctTrend(stats.totalBookings, stats.previousPeriod?.totalBookings ?? 0)
    : undefined

  // Lista unificada de la agenda de hoy: reservas de cancha + clases, ordenadas por hora.
  const todayAgenda = [
    ...(stats?.todayBookings ?? []).map((b: any) => ({
      type: 'booking' as const,
      time: b.slot?.startTime ?? '',
      data: b,
    })),
    ...classesToday.map((s: any) => ({ type: 'class' as const, time: s.startTime, data: s })),
  ].sort((a, b) => a.time.localeCompare(b.time))

  return (
    <div className="space-y-6 max-w-7xl">
      {/* KPIs */}
      {loading ? (
        <SkeletonStatCards count={4} />
      ) : error ? (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl px-5 py-4 flex items-center gap-3">
          <RefreshCw className="w-4 h-4 shrink-0" />
          {error} — {!clubId ? t('errorSelecciona') : t('errorVerifica')}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t('statReservasHoy')}
            value={String(confirmedToday)}
            sub={t('statSubSlots', { count: totalSlotsToday })}
            icon={CalendarCheck}
            tone="emerald"
            trend={trendReservasHoy?.trend}
            trendUp={trendReservasHoy?.trendUp}
          />
          <StatCard
            label={t('statIngresos', { currency })}
            value={formatCurrency(stats.totalRevenue, currency)}
            sub={t('statSubReservasConfirmadas', { count: stats.confirmedBookings })}
            icon={Wallet}
            tone="violet"
            trend={trendIngresos?.trend}
            trendUp={trendIngresos?.trendUp}
          />
          <StatCard
            label={t('statOcupacionMedia')}
            value={stats.courtOccupancy.length > 0 ? `${avgOccupancyToday}%` : '—'}
            sub={t('statSubPistasActivas', { count: stats.courtOccupancy.length })}
            icon={Gauge}
            tone="amber"
            trend={trendOcupacion?.trend}
            trendUp={trendOcupacion?.trendUp}
          />
          <StatCard
            label={t('statReservasTotales')}
            value={String(stats.totalBookings)}
            sub={t('statSubCanceladasPendientes', {
              cancelled: stats.cancelledBookings,
              pending: stats.pendingBookings,
            })}
            icon={Users}
            tone="gray"
            trend={trendReservasTotal?.trend}
            trendUp={trendReservasTotal?.trendUp}
          />
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-100 text-gray-500 text-sm rounded-2xl px-5 py-8 text-center">
          {t('selectClubEmpty')}
        </div>
      )}

      {/* Gráficos */}
      {stats && bookingsWeek.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-6">
            <MiniBar data={bookingsWeek} label={t('chartReservasConfirmadas')} />
          </Card>
          <Card className="p-6">
            <MiniBar data={revenueWeek} label={t('chartIngresos', { currency })} />
          </Card>
        </div>
      )}

      {/* Ocupación + reservas de hoy */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('ocupacionPorPistaHoy')}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {stats.courtOccupancy.length > 0 ? (
                stats.courtOccupancy.map((c: any) => (
                  <OccupancyBar key={c.id} name={c.name} pct={c.pct} sport={c.sport} />
                ))
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">{t('noPistasHoy')}</p>
              )}
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex items-center justify-between">
              <CardTitle>{t('reservasDeHoy')}</CardTitle>
              <a
                href="/dashboard/reservas"
                className="text-xs text-emerald-600 font-semibold hover:underline flex items-center gap-1"
              >
                {t('verTodas')} <ArrowUpRight className="w-3 h-3" />
              </a>
            </CardHeader>
            <CardBody className="space-y-2">
              {todayAgenda.length > 0 ? (
                todayAgenda.map((item) => {
                  if (item.type === 'class') {
                    const s = item.data
                    const activeStudents = (s.bookings ?? []).filter(
                      (bk: any) => bk.status === 'active'
                    )
                    const studentNames =
                      activeStudents.map((bk: any) => bk.studentName).join(', ') ||
                      t('sinAlumnosAun')
                    return (
                      <div
                        key={`class-${s.id}`}
                        className="flex items-start gap-4 p-3 rounded-xl bg-violet-50 hover:bg-violet-100 transition-colors"
                      >
                        <span className="text-sm font-mono font-bold text-violet-700 w-12 shrink-0 mt-0.5">
                          {s.startTime}
                        </span>
                        <span className="mt-0.5 shrink-0">🎓</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 break-words">
                            {t('claseCon', { name: s.professor?.name ?? '' })}
                            {s.court ? ` · ${s.court.name}` : ''}
                          </p>
                          <p className="text-xs text-gray-500 break-words">{studentNames}</p>
                        </div>
                        <Badge tone="violet" className="shrink-0 mt-0.5">
                          {activeStudents.length}/{s.maxStudents}
                        </Badge>
                        <a
                          href={`/dashboard/reservas?editClass=${s.id}`}
                          title={t('editarClase')}
                          className="shrink-0 p-1.5 text-gray-400 hover:text-violet-600 rounded-lg hover:bg-white transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )
                  }
                  const b = item.data
                  const names =
                    Array.isArray(b.players) && b.players.length > 0
                      ? b.players.map((p: any) => p.name).join(', ')
                      : b.userId
                  const meta = bookingStatusMeta(b.status)
                  return (
                    <div
                      key={b.id}
                      className="flex items-start gap-4 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-sm font-mono font-bold text-gray-700 w-12 shrink-0 mt-0.5">
                        {b.slot?.startTime ?? '—'}
                      </span>
                      <span className="mt-0.5 shrink-0">
                        {b.slot?.court?.sport === 'padel' ? (
                          <PadelIcon size={16} />
                        ) : (
                          <PickleballIcon size={16} />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 break-words">
                          {b.slot?.court?.name}
                        </p>
                        <p className="text-xs text-gray-500 break-words">{names}</p>
                      </div>
                      <Badge tone={meta.tone} className="shrink-0 mt-0.5">
                        {bookingStatusLabel(t, b.status)}
                      </Badge>
                      {b.status !== 'cancelled' && (
                        <a
                          href={`/dashboard/reservas?edit=${b.id}`}
                          title={t('editarReserva')}
                          className="shrink-0 p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-white transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">{t('noReservasHoy')}</p>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Top jugadores — sin cambios, sigue siendo la tabla de rankings */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Medal className="w-4 h-4 text-amber-500" /> {t('resumenPeriodo')}
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-2xl font-black text-emerald-600">{stats.confirmedBookings}</p>
                <p className="text-xs text-gray-500 mt-1">{t('reservasConfirmadas')}</p>
              </div>
              <div>
                <p className="text-2xl font-black text-violet-600">
                  {formatCurrency(stats.totalRevenue, currency)}
                </p>
                {currency !== 'USD' && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    ≈ {formatCurrency(toUSD(stats.totalRevenue, currency), 'USD')} USD
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">{t('ingresosGenerados')}</p>
              </div>
              <div>
                <p className="text-2xl font-black text-amber-600">{stats.cancelledBookings}</p>
                <p className="text-xs text-gray-500 mt-1">{t('reservasCanceladas')}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
