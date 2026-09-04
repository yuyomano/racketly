'use client'

import { Fragment, useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import {
  Wallet,
  Banknote,
  CreditCard,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Phone,
  Mail,
  MapPin,
  Calendar,
  GraduationCap,
  Trophy,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Card, CardBody } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Table, TableHead, TableBody, TableRow, Th, Td, TableSpanRow } from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'

const GW = '' // relative — middleware inyecta auth, next.config reescribe al gateway

type Payment = {
  id: string
  clubId: string
  bookingId: string | null
  playerUserId: string | null
  playerName: string | null
  amount: number
  currency: string
  method: 'cash' | 'card'
  paidAt: string
  createdAt: string
}

type GroupedPayment = {
  key: string
  dateKey: string
  latestPaidAt: string
  playerName: string
  method: 'cash' | 'card'
  currency: string
  total: number
  items: Payment[]
}

type CashReport = {
  from: string
  to: string
  totalCollected: number
  byMethod: { cash: { count: number; total: number }; card: { count: number; total: number } }
  byCurrency: Record<string, number>
  payments: Payment[]
}

type PaymentIssue = {
  type: 'booking' | 'class' | 'tournament'
  bookingId?: string
  classBookingId?: string
  tournamentId?: string
  tournamentParticipantId?: string
  playerUserId: string | null
  playerGuestId?: string | null
  groupKey: string
  isGuest?: boolean
  isMember?: boolean
  playerName: string
  playerEmail: string | null
  playerPhone: string | null
  amountOwed: number
  paymentStatus: 'pending' | 'failed'
  currency: string
  date: string | null
  startTime: string | null
  courtName: string | null
  sport: string | null
  professorName?: string
  tournamentName?: string
}

type PlayerGroup = {
  groupKey: string
  isGuest: boolean
  isMember: boolean
  playerName: string
  playerEmail: string | null
  playerPhone: string | null
  items: PaymentIssue[]
  totalsByCurrency: { currency: string; amount: number }[]
}

function groupIssuesByPlayer(issues: PaymentIssue[]): PlayerGroup[] {
  const byPlayer = new Map<string, PlayerGroup>()
  for (const issue of issues) {
    const key =
      issue.groupKey ??
      issue.playerUserId ??
      `${issue.type}|${issue.bookingId ?? issue.classBookingId}`
    let g = byPlayer.get(key)
    if (!g) {
      g = {
        groupKey: key,
        isGuest: !!issue.isGuest,
        isMember: !!issue.isMember,
        playerName: issue.playerName,
        playerEmail: issue.playerEmail,
        playerPhone: issue.playerPhone,
        items: [],
        totalsByCurrency: [],
      }
      byPlayer.set(key, g)
    }
    g.items.push(issue)
    const t = g.totalsByCurrency.find((t) => t.currency === issue.currency)
    if (t) t.amount += issue.amountOwed
    else g.totalsByCurrency.push({ currency: issue.currency, amount: issue.amountOwed })
  }
  return [...byPlayer.values()].sort((a, b) => b.items.length - a.items.length)
}

// Agrupa los cobros del detalle por día + jugador + método (efectivo/tarjeta), para que varios
// pagos del mismo jugador el mismo día con el mismo método ocupen una sola línea en vez de una
// por cobro — el detalle individual sigue disponible expandiendo la fila.
function groupPayments(payments: Payment[]): GroupedPayment[] {
  const map = new Map<string, GroupedPayment>()
  for (const p of payments) {
    const dateKey = new Date(p.paidAt).toLocaleDateString('en-CA') // YYYY-MM-DD estable, sin depender del locale de UI
    const playerKey = p.playerUserId ?? p.playerName ?? '—'
    const key = `${dateKey}|${playerKey}|${p.method}|${p.currency}`
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        dateKey,
        latestPaidAt: p.paidAt,
        playerName: p.playerName ?? '—',
        method: p.method,
        currency: p.currency,
        total: 0,
        items: [],
      }
      map.set(key, g)
    }
    g.total += p.amount
    g.items.push(p)
    if (new Date(p.paidAt) > new Date(g.latestPaidAt)) g.latestPaidAt = p.paidAt
  }
  for (const g of map.values())
    g.items.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
  return [...map.values()].sort(
    (a, b) => new Date(b.latestPaidAt).getTime() - new Date(a.latestPaidAt).getTime()
  )
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function waLink(phone: string) {
  const digits = phone.replace(/[^\d+]/g, '').replace(/^\+/, '')
  return `https://wa.me/${digits}`
}

export default function CajaPage() {
  const t = useTranslations('Caja')
  const locale = useLocale()
  const [clubId, setClubId] = useState<string | null>(null)
  const [clubName, setClubName] = useState('')
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const [report, setReport] = useState<CashReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [issues, setIssues] = useState<PaymentIssue[]>([])
  const [issuesLoading, setIssuesLoading] = useState(true)
  const [resolvingKey, setResolvingKey] = useState<string | null>(null)
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const groupedPayments = useMemo(() => groupPayments(report?.payments ?? []), [report])

  const load = useCallback(
    async (id: string, f: string, toDate: string) => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`${GW}/api/clubs/${id}/cash-report?from=${f}&to=${toDate}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || t('loadError'))
        setReport(json.data)
      } catch (e: any) {
        setError(e.message || t('connectionError'))
      } finally {
        setLoading(false)
      }
    },
    [t]
  )

  const loadIssues = useCallback(async (id: string) => {
    setIssuesLoading(true)
    try {
      const res = await fetch(`${GW}/api/clubs/${id}/payment-issues`)
      const json = await res.json()
      if (res.ok) setIssues(json.data ?? [])
    } finally {
      setIssuesLoading(false)
    }
  }, [])

  function issueKey(issue: PaymentIssue) {
    if (issue.type === 'booking')
      return `b|${issue.bookingId}|${issue.playerUserId ?? issue.playerGuestId}`
    if (issue.type === 'tournament') return `t|${issue.tournamentParticipantId}`
    return `c|${issue.classBookingId}`
  }

  const groupedIssues = useMemo(() => groupIssuesByPlayer(issues), [issues])

  async function payOneIssue(issue: PaymentIssue, paymentMethod: 'cash' | 'card') {
    const playerId = issue.playerUserId ?? issue.playerGuestId
    const url =
      issue.type === 'booking'
        ? `${GW}/api/bookings/${issue.bookingId}/players/${playerId}/pay`
        : issue.type === 'tournament'
          ? `${GW}/api/tournaments/${issue.tournamentId}/participants/${issue.tournamentParticipantId}/payment`
          : `${GW}/api/classes/bookings/${issue.classBookingId}/pay`
    const body =
      issue.type === 'tournament' ? { paymentStatus: 'paid', paymentMethod } : { paymentMethod }
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || t('markPaidError'))
  }

  async function resolveIssue(issue: PaymentIssue, paymentMethod: 'cash' | 'card') {
    const key = issueKey(issue)
    setResolvingKey(key)
    try {
      await payOneIssue(issue, paymentMethod)
      setIssues((prev) => prev.filter((i) => issueKey(i) !== key))
      if (clubId) load(clubId, from, to)
    } catch (e: any) {
      alert(t('resolveIssueError', { message: e.message }))
    } finally {
      setResolvingKey(null)
    }
  }

  async function resolveGroup(group: PlayerGroup, paymentMethod: 'cash' | 'card') {
    const resolveKey = `group|${group.groupKey}`
    setResolvingKey(resolveKey)
    const failed: string[] = []
    const paidKeys: string[] = []
    for (const issue of group.items) {
      try {
        await payOneIssue(issue, paymentMethod)
        paidKeys.push(issueKey(issue))
      } catch {
        failed.push(issueKey(issue))
      }
    }
    if (paidKeys.length > 0) {
      setIssues((prev) => prev.filter((i) => !paidKeys.includes(issueKey(i))))
      if (clubId) load(clubId, from, to)
    }
    if (failed.length > 0)
      alert(t('resolveGroupError', { failed: failed.length, total: group.items.length }))
    if (failed.length === 0) setDetailPlayerId(null)
    setResolvingKey(null)
  }

  useEffect(() => {
    const stored = localStorage.getItem('racketly_active_club') || ''
    let cId = stored,
      cName = ''
    try {
      const p = JSON.parse(stored)
      if (p?.id) {
        cId = p.id
        cName = p.name ?? ''
      }
    } catch {
      /* plain string */
    }
    if (cId) {
      setClubId(cId)
      setClubName(cName)
      load(cId, from, to)
      loadIssues(cId)
    } else {
      setLoading(false)
      setIssuesLoading(false)
    }

    function onClubChange(e: Event) {
      const club = (e as CustomEvent).detail
      setClubId(club.id)
      setClubName(club.name ?? '')
      load(club.id, from, to)
      loadIssues(club.id)
    }
    window.addEventListener('club-changed', onClubChange)
    return () => window.removeEventListener('club-changed', onClubChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, loadIssues])

  useEffect(() => {
    if (clubId) load(clubId, from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  if (!clubId && !loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <EmptyState
          icon={Wallet}
          title={t('selectClubTitle')}
          description={t('selectClubDescription')}
        />
      </div>
    )
  }

  const currencyEntries = report
    ? Object.entries(report.byCurrency).sort((a, b) => b[1] - a[1])
    : []
  const primaryCurrency = currencyEntries[0]?.[0] ?? 'COP'
  const detailGroup = detailPlayerId
    ? (groupedIssues.find((g) => g.groupKey === detailPlayerId) ?? null)
    : null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900">{t('title')}</h1>
          <p className="text-sm text-ink-400">
            {t('subtitle', { clubName: clubName || t('defaultClubName') })}
          </p>
        </div>
      </div>

      {!issuesLoading && issues.length > 0 && (
        <Card className="border-trophy-100 bg-trophy-50/60">
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-trophy-600" />
              <p className="text-sm font-bold text-trophy-700">
                {t('pendingBanner', {
                  count: issues.length,
                  playerCount: groupedIssues.length,
                  clubName: clubName || t('thisClub'),
                })}
              </p>
            </div>
            <p className="text-xs text-trophy-700">{t('pendingBannerDescription')}</p>
            <div className="divide-y divide-trophy-100 rounded-xl bg-white/70 border border-trophy-100 overflow-hidden">
              {groupedIssues.map((group) => {
                const groupKey = `group|${group.groupKey}`
                return (
                  <div
                    key={group.groupKey}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <button
                      onClick={() => setDetailPlayerId(group.groupKey)}
                      className="min-w-0 text-left flex-1 group"
                    >
                      <p className="text-sm font-semibold text-ink-800 break-words group-hover:underline">
                        {group.playerName}
                        {group.isGuest && (
                          <span className="ml-1.5 text-[10px] font-medium text-trophy-600 align-middle">
                            {t('guestBadge')}
                          </span>
                        )}
                        {!group.isGuest && (
                          <span
                            className={`ml-1.5 text-[10px] font-medium align-middle ${group.isMember ? 'text-court-600' : 'text-ink-400'}`}
                          >
                            {group.isMember ? t('memberBadge') : t('nonMemberBadge')}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink-400 truncate flex items-center gap-2">
                        <span>{t('pendingCount', { count: group.items.length })}</span>
                        {group.items.filter((i) => i.type === 'class').length > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <GraduationCap className="w-3 h-3" />{' '}
                            {group.items.filter((i) => i.type === 'class').length}
                          </span>
                        )}
                        {group.items.filter((i) => i.type === 'booking').length > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Calendar className="w-3 h-3" />{' '}
                            {group.items.filter((i) => i.type === 'booking').length}
                          </span>
                        )}
                        {group.items.filter((i) => i.type === 'tournament').length > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Trophy className="w-3 h-3" />{' '}
                            {group.items.filter((i) => i.type === 'tournament').length}
                          </span>
                        )}
                      </p>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-ink-700">
                        {group.totalsByCurrency
                          .map((t) => formatCurrency(t.amount, t.currency))
                          .join(' + ')}
                      </span>
                      <button
                        onClick={() => resolveGroup(group, 'cash')}
                        disabled={resolvingKey === groupKey}
                        title={t('markAllCashTitle')}
                        className="text-xs font-semibold text-trophy-600 hover:text-trophy-700 border border-trophy-100 hover:border-trophy-400 bg-trophy-50 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {resolvingKey === groupKey ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          t('payAllCash')
                        )}
                      </button>
                      <button
                        onClick={() => resolveGroup(group, 'card')}
                        disabled={resolvingKey === groupKey}
                        title={t('markAllCardTitle')}
                        className="text-xs font-semibold text-court-600 hover:text-court-800 border border-court-200 hover:border-court-400 bg-court-50 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {resolvingKey === groupKey ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          t('payAllCard')
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-500 mb-1">
              {t('fromLabel')}
            </label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl px-4 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-500 mb-1">{t('toLabel')}</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl px-4 py-2"
            />
          </div>
          <button
            onClick={() => {
              setFrom(todayStr())
              setTo(todayStr())
            }}
            className="text-sm font-semibold text-court-600 hover:text-court-800 border border-court-200 hover:border-court-400 bg-court-50 rounded-xl px-4 py-2 transition-colors"
          >
            {t('todayButton')}
          </button>
          <div className="ml-auto flex items-center gap-2">
            {loading && <RefreshCw className="w-4 h-4 text-ink-400 animate-spin" />}
          </div>
        </div>
      </Card>

      {error && (
        <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-4 py-2">{error}</p>
      )}

      <p className="text-xs text-ink-400 -mt-2">
        {t.rich('dateGroupingNote', { strong: (chunks) => <strong>{chunks}</strong> })}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Banknote}
          tone="amber"
          label={t('cashLabel')}
          value={
            loading || !report ? '…' : formatCurrency(report.byMethod.cash.total, primaryCurrency)
          }
          sub={report ? t('chargeCount', { count: report.byMethod.cash.count }) : undefined}
        />
        <StatCard
          icon={CreditCard}
          tone="violet"
          label={t('cardLabel')}
          value={
            loading || !report ? '…' : formatCurrency(report.byMethod.card.total, primaryCurrency)
          }
          sub={report ? t('chargeCount', { count: report.byMethod.card.count }) : undefined}
        />
        <StatCard
          icon={Wallet}
          tone="emerald"
          label={t('totalCollectedLabel')}
          value={loading || !report ? '…' : formatCurrency(report.totalCollected, primaryCurrency)}
          sub={
            currencyEntries.length > 1
              ? currencyEntries
                  .slice(1)
                  .map(([c, a]) => formatCurrency(a, c))
                  .join(' · ')
              : undefined
          }
        />
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100">
          <p className="text-sm font-bold text-ink-900">{t('detailsTitle')}</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <Th className="px-6 py-3">{t('columnDateTime')}</Th>
                <Th className="px-6 py-3">{t('columnPlayer')}</Th>
                <Th className="px-6 py-3">{t('columnMethod')}</Th>
                <Th className="px-6 py-3">{t('columnAmount')}</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <Td key={j} className="px-6 py-4">
                        <Skeleton className="h-4" />
                      </Td>
                    ))}
                  </TableRow>
                ))
              ) : !report || report.payments.length === 0 ? (
                <TableSpanRow colSpan={4}>
                  <EmptyState
                    icon={Wallet}
                    title={t('noChargesTitle')}
                    description={t('noChargesDescription')}
                  />
                </TableSpanRow>
              ) : (
                groupedPayments.map((g) => {
                  const isGrouped = g.items.length > 1
                  const isExpanded = expandedGroups.has(g.key)
                  return (
                    <Fragment key={g.key}>
                      <TableRow
                        className={isGrouped ? 'cursor-pointer' : undefined}
                        onClick={isGrouped ? () => toggleGroup(g.key) : undefined}
                      >
                        <Td className="px-6 py-4 whitespace-nowrap text-sm text-ink-700">
                          {isGrouped
                            ? new Date(g.latestPaidAt).toLocaleDateString(locale, {
                                dateStyle: 'medium',
                              })
                            : new Date(g.latestPaidAt).toLocaleString(locale, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                        </Td>
                        <Td className="px-6 py-4 text-sm text-ink-900">
                          {g.playerName}
                          {isGrouped && (
                            <span className="ml-1.5 text-xs font-semibold text-ink-400">
                              {isExpanded ? '▾' : '▸'}{' '}
                              {t('groupedChargeCount', { count: g.items.length })}
                            </span>
                          )}
                        </Td>
                        <Td className="px-6 py-4">
                          <Badge tone={g.method === 'cash' ? 'amber' : 'violet'}>
                            {g.method === 'cash' ? t('cashBadge') : t('cardBadge')}
                          </Badge>
                        </Td>
                        <Td className="px-6 py-4 text-sm font-bold text-ink-900">
                          {formatCurrency(g.total, g.currency)}
                        </Td>
                      </TableRow>
                      {isGrouped &&
                        isExpanded &&
                        g.items.map((p) => (
                          <TableRow key={p.id} className="bg-ink-50/50">
                            <Td className="px-6 py-2 pl-10 whitespace-nowrap text-xs text-ink-500">
                              {new Date(p.paidAt).toLocaleString(locale, { timeStyle: 'short' })}
                            </Td>
                            <Td className="px-6 py-2 text-xs text-ink-500" colSpan={2}>
                              —
                            </Td>
                            <Td className="px-6 py-2 text-xs font-semibold text-ink-600">
                              {formatCurrency(p.amount, p.currency)}
                            </Td>
                          </TableRow>
                        ))}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {detailGroup && (
        <PlayerGroupDetailModal
          group={detailGroup}
          resolvingKey={resolvingKey}
          onClose={() => setDetailPlayerId(null)}
          onResolveOne={resolveIssue}
          onResolveAll={(method) => resolveGroup(detailGroup, method)}
        />
      )}
    </div>
  )
}

function PlayerGroupDetailModal({
  group,
  resolvingKey,
  onClose,
  onResolveOne,
  onResolveAll,
}: {
  group: PlayerGroup
  resolvingKey: string | null
  onClose: () => void
  onResolveOne: (issue: PaymentIssue, method: 'cash' | 'card') => void
  onResolveAll: (method: 'cash' | 'card') => void
}) {
  const t = useTranslations('Caja')
  const groupKey = `group|${group.groupKey}`
  const groupResolving = resolvingKey === groupKey

  return (
    <Modal open onClose={onClose} maxWidth="md">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-ink-900">
          {group.playerName}
          {group.isGuest && (
            <span className="ml-1.5 text-xs font-medium text-trophy-600 align-middle">
              {t('guestBadge')}
            </span>
          )}
          {!group.isGuest && (
            <span
              className={`ml-1.5 text-xs font-medium align-middle ${group.isMember ? 'text-court-600' : 'text-ink-400'}`}
            >
              {group.isMember ? t('memberBadge') : t('nonMemberBadge')}
            </span>
          )}
        </h3>
        <Badge tone="amber">{t('pendingCount', { count: group.items.length })}</Badge>
      </div>
      <p className="text-2xl font-black text-ink-900 mb-4">
        {group.totalsByCurrency.map((t) => formatCurrency(t.amount, t.currency)).join(' + ')}
      </p>

      <div className="border-t border-ink-100 pt-4 mb-4">
        <p className="text-xs font-semibold text-ink-500 mb-2">{t('contactPlayer')}</p>
        {!group.playerPhone && !group.playerEmail && (
          <p className="text-xs text-ink-400">{t('noContactInfo')}</p>
        )}
        <div className="flex flex-col gap-2">
          {group.playerPhone && (
            <a
              href={waLink(group.playerPhone)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-semibold text-court-700 hover:text-court-900 border border-court-200 hover:border-court-400 bg-court-50 rounded-xl px-3 py-2 transition-colors"
            >
              <Phone className="w-4 h-4" /> {t('whatsapp', { phone: group.playerPhone })}
            </a>
          )}
          {group.playerEmail && (
            <a
              href={`mailto:${group.playerEmail}`}
              className="flex items-center gap-2 text-sm font-semibold text-ink-700 hover:text-ink-900 border border-ink-200 hover:border-ink-400 bg-ink-50 rounded-xl px-3 py-2 transition-colors"
            >
              <Mail className="w-4 h-4" /> {group.playerEmail}
            </a>
          )}
        </div>
      </div>

      <div className="border-t border-ink-100 pt-4 mb-4 space-y-3">
        <p className="text-xs font-semibold text-ink-500">{t('detailLabel')}</p>
        {group.items.map((issue) => {
          const key =
            issue.type === 'booking'
              ? `b|${issue.bookingId}|${issue.playerUserId ?? issue.playerGuestId}`
              : issue.type === 'tournament'
                ? `t|${issue.tournamentParticipantId}`
                : `c|${issue.classBookingId}`
          const itemResolving = resolvingKey === key
          return (
            <div key={key} className="rounded-xl border border-ink-100 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 text-sm text-ink-700">
                  {issue.type === 'class' ? (
                    <GraduationCap className="w-4 h-4 text-ink-400 shrink-0" />
                  ) : issue.type === 'tournament' ? (
                    <Trophy className="w-4 h-4 text-ink-400 shrink-0" />
                  ) : (
                    <MapPin className="w-4 h-4 text-ink-400 shrink-0" />
                  )}
                  <span>
                    {issue.type === 'class'
                      ? t('classWith', {
                          professorName: issue.professorName ?? t('defaultProfessor'),
                        })
                      : issue.type === 'tournament'
                        ? t('tournamentEntry', { tournamentName: issue.tournamentName ?? '' })
                        : t('courtBooking')}
                    {issue.courtName && ` · ${issue.courtName}`}
                  </span>
                </div>
                <Badge tone={issue.paymentStatus === 'failed' ? 'red' : 'amber'}>
                  {issue.paymentStatus === 'failed' ? t('failedBadge') : t('pendingBadge')}
                </Badge>
              </div>
              {issue.date && (
                <div className="flex items-center gap-2 text-xs text-ink-400 mb-2">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {issue.date}
                    {issue.startTime && ` · ${issue.startTime}`}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink-800">
                  {formatCurrency(issue.amountOwed, issue.currency)}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onResolveOne(issue, 'cash')}
                    disabled={itemResolving || groupResolving}
                    className="text-xs font-semibold text-trophy-600 hover:text-trophy-700 border border-trophy-100 hover:border-trophy-400 bg-trophy-50 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
                  >
                    {itemResolving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Banknote className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => onResolveOne(issue, 'card')}
                    disabled={itemResolving || groupResolving}
                    className="text-xs font-semibold text-court-600 hover:text-court-800 border border-court-200 hover:border-court-400 bg-court-50 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
                  >
                    {itemResolving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CreditCard className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 text-sm font-semibold text-ink-600 border border-ink-200 hover:border-ink-400 rounded-xl px-3 py-2.5 transition-colors"
        >
          {t('close')}
        </button>
        <button
          onClick={() => onResolveAll('cash')}
          disabled={groupResolving}
          className="flex-1 text-sm font-semibold text-trophy-700 border border-trophy-100 hover:border-trophy-400 bg-trophy-50 rounded-xl px-3 py-2.5 transition-colors disabled:opacity-50"
        >
          {groupResolving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('payAllCash')}
        </button>
        <button
          onClick={() => onResolveAll('card')}
          disabled={groupResolving}
          className="flex-1 text-sm font-semibold text-court-700 border border-court-200 hover:border-court-400 bg-court-50 rounded-xl px-3 py-2.5 transition-colors disabled:opacity-50"
        >
          {groupResolving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('payAllCard')}
        </button>
      </div>
    </Modal>
  )
}
