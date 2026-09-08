'use client'

import { useTranslations, useLocale } from 'next-intl'
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  CreditCard,
  Plus,
  X,
  Loader2,
  Pencil,
  Users,
  Power,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Percent,
  UserPlus,
  Ban,
  Calendar,
  MapPin,
  Banknote,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Card, CardBody } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { SkeletonCards } from '@/components/ui/Skeleton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'

type BadgeTone = 'emerald' | 'amber' | 'gray' | 'red' | 'blue' | 'violet'

const GW = '' // relative — middleware inyecta auth, next.config reescribe al gateway

type Plan = {
  id: string
  clubId: string
  name: string
  description: string | null
  price: number
  currency: string
  sessionsPerDay: number
  priceExtraSession: number
  isActive: boolean
  _count?: { subscribers: number }
}

type Membership = {
  id: string
  userId: string
  userName: string
  userEmail: string | null
  status: string
  startDate: string
  nextBillingDate: string
  cancelAtPeriodEnd: boolean
  isCourtesy: boolean
  courtesyReason: string | null
  plan: { name: string }
}

type MemberAnalytics = {
  membershipId: string
  userId: string
  userName: string
  planId: string
  planName: string
  planPrice: number
  currency: string
  sessionsPerDayAllowed: number
  sessionsThisMonth: number
  valueProvided: number
  ratio: number | null
}

type PlanAnalytics = {
  planId: string
  planName: string
  planPrice: number
  currency: string
  subscribers: number
  totalSessions: number
  totalValueProvided: number
  avgSessionsPerMonth: number
  avgValueProvided: number
  totalRevenue: number
  netForClub: number
  avgRatio: number | null
}

type Analytics = { periodStart: string; members: MemberAnalytics[]; byPlan: PlanAnalytics[] }

type PaymentIssue = {
  bookingId: string
  playerUserId: string
  playerName: string
  amountOwed: number
  paymentStatus: 'pending' | 'failed'
  currency: string
  date: string | null
  startTime: string | null
  courtName: string | null
}

type PlayerIssueGroup = {
  playerUserId: string
  playerName: string
  items: PaymentIssue[]
  totalsByCurrency: { currency: string; amount: number }[]
}

function groupIssuesByPlayer(issues: PaymentIssue[]): PlayerIssueGroup[] {
  const byPlayer = new Map<string, PlayerIssueGroup>()
  for (const issue of issues) {
    let g = byPlayer.get(issue.playerUserId)
    if (!g) {
      g = {
        playerUserId: issue.playerUserId,
        playerName: issue.playerName,
        items: [],
        totalsByCurrency: [],
      }
      byPlayer.set(issue.playerUserId, g)
    }
    g.items.push(issue)
    const t = g.totalsByCurrency.find((t) => t.currency === issue.currency)
    if (t) t.amount += issue.amountOwed
    else g.totalsByCurrency.push({ currency: issue.currency, amount: issue.amountOwed })
  }
  return [...byPlayer.values()].sort((a, b) => b.items.length - a.items.length)
}

function ratioVerdict(
  ratio: number | null,
  t: (key: string) => string
): { label: string; tone: BadgeTone; hint: string } {
  if (ratio === null)
    return {
      label: t('ratioVerdict.noData.label'),
      tone: 'gray',
      hint: t('ratioVerdict.noData.hint'),
    }
  if (ratio >= 1.5)
    return {
      label: t('ratioVerdict.veryBelow.label'),
      tone: 'red',
      hint: t('ratioVerdict.veryBelow.hint'),
    }
  if (ratio >= 1.0)
    return {
      label: t('ratioVerdict.atLimit.label'),
      tone: 'amber',
      hint: t('ratioVerdict.atLimit.hint'),
    }
  if (ratio >= 0.5)
    return {
      label: t('ratioVerdict.balanced.label'),
      tone: 'emerald',
      hint: t('ratioVerdict.balanced.hint'),
    }
  return {
    label: t('ratioVerdict.underused.label'),
    tone: 'blue',
    hint: t('ratioVerdict.underused.hint'),
  }
}

export default function MembresiasPage() {
  const t = useTranslations('Membresias')
  const locale = useLocale()
  const [clubId, setClubId] = useState<string | null>(null)
  const [clubName, setClubName] = useState('')
  const [plans, setPlans] = useState<Plan[]>([])
  const [members, setMembers] = useState<Membership[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [paymentIssues, setPaymentIssues] = useState<PaymentIssue[]>([])
  const [resolvingKey, setResolvingKey] = useState<string | null>(null) // `${bookingId}|${playerUserId}` o `group|${playerUserId}`
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [showAddMember, setShowAddMember] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const loadAll = useCallback(
    async (id: string) => {
      setLoading(true)
      setError('')
      try {
        const [plansRes, membersRes, analyticsRes, issuesRes] = await Promise.all([
          fetch(`${GW}/api/clubs/${id}/membership-plans?all=1`),
          fetch(`${GW}/api/clubs/${id}/memberships`),
          fetch(`${GW}/api/clubs/${id}/membership-analytics`),
          fetch(`${GW}/api/clubs/${id}/membership-payment-issues`),
        ])
        const plansJson = await plansRes.json()
        const membersJson = await membersRes.json()
        const analyticsJson = await analyticsRes.json()
        const issuesJson = await issuesRes.json()
        if (!plansRes.ok) throw new Error(plansJson.error || t('errors.loadPlansFailed'))
        setPlans(plansJson.data ?? [])
        setMembers(membersJson.data ?? [])
        setAnalytics(analyticsRes.ok ? analyticsJson.data : null)
        setPaymentIssues(issuesRes.ok ? (issuesJson.data ?? []) : [])
      } catch (e: any) {
        setError(e.message || t('errors.connectionError'))
      } finally {
        setLoading(false)
      }
    },
    [t]
  )

  function issueKey(issue: PaymentIssue) {
    return `${issue.bookingId}|${issue.playerUserId}`
  }

  const groupedPaymentIssues = useMemo(() => groupIssuesByPlayer(paymentIssues), [paymentIssues])

  async function payOnePaymentIssue(issue: PaymentIssue, paymentMethod: 'cash' | 'card') {
    const res = await fetch(
      `${GW}/api/bookings/${issue.bookingId}/players/${issue.playerUserId}/pay`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod }),
      }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || t('errors.markPaidFailed'))
  }

  async function resolvePaymentIssue(issue: PaymentIssue, paymentMethod: 'cash' | 'card') {
    const key = issueKey(issue)
    setResolvingKey(key)
    try {
      await payOnePaymentIssue(issue, paymentMethod)
      setPaymentIssues((prev) => prev.filter((i) => issueKey(i) !== key))
    } catch (e: any) {
      alert(t('errors.genericPrefix', { message: e.message }))
    } finally {
      setResolvingKey(null)
    }
  }

  async function resolvePaymentIssueGroup(group: PlayerIssueGroup, paymentMethod: 'cash' | 'card') {
    const groupKey = `group|${group.playerUserId}`
    setResolvingKey(groupKey)
    const paidKeys: string[] = []
    let failedCount = 0
    for (const issue of group.items) {
      try {
        await payOnePaymentIssue(issue, paymentMethod)
        paidKeys.push(issueKey(issue))
      } catch {
        failedCount++
      }
    }
    if (paidKeys.length > 0)
      setPaymentIssues((prev) => prev.filter((i) => !paidKeys.includes(issueKey(i))))
    if (failedCount > 0)
      alert(t('paymentIssues.failedToMarkSome', { failed: failedCount, total: group.items.length }))
    else setDetailPlayerId(null)
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
      loadAll(cId)
    } else {
      setLoading(false)
    }

    function onClubChange(e: Event) {
      const club = (e as CustomEvent).detail
      setClubId(club.id)
      setClubName(club.name ?? '')
      loadAll(club.id)
    }
    window.addEventListener('club-changed', onClubChange)
    return () => window.removeEventListener('club-changed', onClubChange)
  }, [loadAll])

  const activeMembers = members.filter((m) => m.status === 'active')
  const monthlyRevenue = activeMembers.reduce((sum, m) => {
    const plan = plans.find((p) => p.name === m.plan.name)
    return sum + (plan?.price ?? 0)
  }, 0)

  async function cancelMembership(m: Membership) {
    if (!clubId) return
    if (
      !confirm(
        t('cancelConfirm', {
          name: m.userName,
          date: new Date(m.nextBillingDate).toLocaleDateString(locale),
        })
      )
    )
      return
    setCancellingId(m.id)
    try {
      const res = await fetch(`${GW}/api/memberships/${m.id}/cancel`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('errors.cancelFailed'))
      setMembers((prev) =>
        prev.map((mm) => (mm.id === m.id ? { ...mm, cancelAtPeriodEnd: true } : mm))
      )
    } catch (e: any) {
      alert(t('errors.genericPrefix', { message: e.message }))
    } finally {
      setCancellingId(null)
    }
  }

  async function togglePlanActive(plan: Plan) {
    if (!clubId) return
    const res = await fetch(`${GW}/api/clubs/${clubId}/membership-plans/${plan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !plan.isActive }),
    })
    const data = await res.json()
    if (res.ok) setPlans(plans.map((p) => (p.id === plan.id ? data.data : p)))
  }

  if (!clubId && !loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <EmptyState
          icon={CreditCard}
          title={t('emptySelectClub.title')}
          description={t('emptySelectClub.description')}
        />
      </div>
    )
  }

  const detailIssueGroup = detailPlayerId
    ? (groupedPaymentIssues.find((g) => g.playerUserId === detailPlayerId) ?? null)
    : null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={CreditCard}
          label={t('stats.activePlans')}
          value={String(plans.filter((p) => p.isActive).length)}
        />
        <StatCard
          icon={Users}
          label={t('stats.activeSubscribers')}
          value={String(activeMembers.length)}
        />
        <StatCard
          icon={CreditCard}
          label={t('stats.monthlyRevenueEstimate')}
          value={formatCurrency(monthlyRevenue, plans[0]?.currency ?? 'COP')}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900">{t('title')}</h1>
          <p className="text-sm text-ink-400">{clubName || t('defaultClubName')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> {t('createPlan')}
        </Button>
      </div>

      {error && (
        <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-4 py-2">{error}</p>
      )}

      {!loading && paymentIssues.length > 0 && (
        <Card className="border-trophy-100 bg-trophy-50/60">
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-trophy-600" />
              <p className="text-sm font-bold text-trophy-700">
                {t('paymentIssues.summary', {
                  count: paymentIssues.length,
                  playerCount: groupedPaymentIssues.length,
                })}
              </p>
            </div>
            <p className="text-xs text-trophy-700">{t('paymentIssues.explanation')}</p>
            <div className="divide-y divide-trophy-100 rounded-xl bg-white/70 border border-trophy-100 overflow-hidden">
              {groupedPaymentIssues.map((group) => {
                const groupKey = `group|${group.playerUserId}`
                return (
                  <div
                    key={group.playerUserId}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <button
                      onClick={() => setDetailPlayerId(group.playerUserId)}
                      className="min-w-0 text-left flex-1 group"
                    >
                      <p className="text-sm font-semibold text-ink-800 wrap-break-word group-hover:underline">
                        {group.playerName}
                      </p>
                      <p className="text-xs text-ink-400 truncate">
                        {t('paymentIssues.pendingCount', { count: group.items.length })}
                      </p>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-ink-700">
                        {group.totalsByCurrency
                          .map((tc) => formatCurrency(tc.amount, tc.currency))
                          .join(' + ')}
                      </span>
                      <button
                        onClick={() => resolvePaymentIssueGroup(group, 'cash')}
                        disabled={resolvingKey === groupKey}
                        title={t('paymentIssues.payAllCashTooltip')}
                        className="text-xs font-semibold text-trophy-600 hover:text-trophy-700 border border-trophy-100 hover:border-trophy-400 bg-trophy-50 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {resolvingKey === groupKey ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          t('paymentIssues.payAllCash')
                        )}
                      </button>
                      <button
                        onClick={() => resolvePaymentIssueGroup(group, 'card')}
                        disabled={resolvingKey === groupKey}
                        title={t('paymentIssues.payAllCardTooltip')}
                        className="text-xs font-semibold text-court-600 hover:text-court-800 border border-court-200 hover:border-court-400 bg-court-50 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {resolvingKey === groupKey ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          t('paymentIssues.payAllCard')
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

      {loading ? (
        <SkeletonCards count={3} />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={t('emptyPlans.title')}
          description={t('emptyPlans.description')}
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> {t('createPlan')}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.isActive ? 'opacity-60' : undefined}>
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-ink-900">{plan.name}</p>
                    {plan.description && (
                      <p className="text-xs text-ink-400 mt-0.5">{plan.description}</p>
                    )}
                  </div>
                  <Badge tone={plan.isActive ? 'emerald' : 'gray'}>
                    {plan.isActive ? t('plan.active') : t('plan.inactive')}
                  </Badge>
                </div>
                <p className="text-2xl font-black text-ink-900">
                  {formatCurrency(plan.price, plan.currency)}
                  <span className="text-sm font-medium text-ink-400">{t('plan.perMonth')}</span>
                </p>
                <div className="flex items-center gap-1.5 text-xs text-ink-500">
                  <Badge tone="violet">
                    {plan.sessionsPerDay} {t('plan.sessionsPerDay', { count: plan.sessionsPerDay })}
                  </Badge>
                  {plan.priceExtraSession > 0 && (
                    <span className="text-ink-400">
                      {t('plan.extraSuffix', {
                        amount: formatCurrency(plan.priceExtraSession, plan.currency),
                      })}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-ink-100">
                  <span className="text-xs text-ink-500 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />{' '}
                    {t('plan.subscribersCount', { count: plan._count?.subscribers ?? 0 })}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingPlan(plan)}
                      title={t('plan.editTooltip')}
                      className="p-1.5 text-ink-400 hover:text-court-600 rounded-lg hover:bg-ink-50"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => togglePlanActive(plan)}
                      title={t('plan.toggleActiveTooltip')}
                      className="p-1.5 text-ink-400 hover:text-referee-500 rounded-lg hover:bg-ink-50"
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {!loading &&
        analytics &&
        analytics.byPlan.length > 0 &&
        (() => {
          const membersWithRatio = analytics.members.filter(
            (m) => m.ratio !== null
          ) as (MemberAnalytics & { ratio: number })[]
          const aboveCount = membersWithRatio.filter((m) => m.ratio > 1).length
          const belowCount = membersWithRatio.filter((m) => m.ratio <= 1).length
          const pctAbove = membersWithRatio.length
            ? Math.round((aboveCount / membersWithRatio.length) * 100)
            : 0
          const pctBelow = membersWithRatio.length
            ? Math.round((belowCount / membersWithRatio.length) * 100)
            : 0
          const totalRevenueAll = analytics.members.reduce((s, m) => s + m.planPrice, 0)
          const totalValueAll = analytics.members.reduce((s, m) => s + m.valueProvided, 0)
          const overallPct = totalValueAll > 0 ? (totalRevenueAll / totalValueAll) * 100 : null
          const overallCurrency = analytics.members[0]?.currency ?? plans[0]?.currency ?? 'COP'

          return (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-ink-700 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-court-600" /> {t('profitability.heading')}
                </h2>
                <p className="text-xs text-ink-400 mt-0.5">{t('profitability.description')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  icon={AlertTriangle}
                  tone="amber"
                  label={t('profitability.aboveLabel')}
                  value={`${pctAbove}%`}
                  sub={t('profitability.aboveSub', {
                    above: aboveCount,
                    total: membersWithRatio.length,
                  })}
                />
                <StatCard
                  icon={TrendingDown}
                  tone="emerald"
                  label={t('profitability.belowLabel')}
                  value={`${pctBelow}%`}
                  sub={t('profitability.belowSub', {
                    below: belowCount,
                    total: membersWithRatio.length,
                  })}
                />
                <StatCard
                  icon={Percent}
                  tone="violet"
                  label={t('profitability.revenueVsValueLabel')}
                  value={overallPct !== null ? `${overallPct.toFixed(0)}%` : '—'}
                  sub={t('profitability.revenueVsValueSub', {
                    revenue: formatCurrency(totalRevenueAll, overallCurrency),
                    value: formatCurrency(totalValueAll, overallCurrency),
                  })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {analytics.byPlan.map((p) => {
                  const v = ratioVerdict(p.avgRatio, t)
                  return (
                    <Card key={p.planId}>
                      <CardBody className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-ink-900 text-sm">{p.planName}</p>
                          <Badge tone={v.tone}>{v.label}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-ink-400">{t('profitability.avgSessionsLabel')}</p>
                            <p className="font-bold text-ink-800">{p.avgSessionsPerMonth}</p>
                          </div>
                          <div>
                            <p className="text-ink-400">{t('profitability.avgValueLabel')}</p>
                            <p className="font-bold text-ink-800">
                              {formatCurrency(p.avgValueProvided, p.currency)}
                            </p>
                          </div>
                          <div>
                            <p className="text-ink-400">{t('profitability.planPriceLabel')}</p>
                            <p className="font-bold text-ink-800">
                              {formatCurrency(p.planPrice, p.currency)}
                            </p>
                          </div>
                          <div>
                            <p className="text-ink-400">{t('profitability.ratioLabel')}</p>
                            <p className="font-bold text-ink-800">
                              {p.avgRatio !== null ? `${(p.avgRatio * 100).toFixed(0)}%` : '—'}
                            </p>
                          </div>
                        </div>
                        <div
                          className={`text-xs rounded-lg px-2.5 py-2 ${p.netForClub < 0 ? 'bg-referee-50 text-referee-700' : 'bg-court-50 text-court-700'}`}
                        >
                          {p.netForClub < 0 ? (
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{' '}
                              {t('profitability.netNegative', {
                                amount: formatCurrency(Math.abs(p.netForClub), p.currency),
                              })}
                            </span>
                          ) : (
                            <span>
                              {t('profitability.netPositive', {
                                amount: formatCurrency(p.netForClub, p.currency),
                              })}
                            </span>
                          )}
                        </div>
                      </CardBody>
                    </Card>
                  )
                })}
              </div>

              <Card>
                <CardBody>
                  <p className="text-sm font-bold text-ink-700 mb-3">
                    {t('profitability.perMemberHeading')}
                  </p>
                  <div className="divide-y divide-ink-100">
                    {[...analytics.members]
                      .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))
                      .map((m) => {
                        const v = ratioVerdict(m.ratio, t)
                        return (
                          <div
                            key={m.membershipId}
                            className="py-2.5 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink-800 wrap-break-word">
                                {m.userName}
                              </p>
                              <p className="text-xs text-ink-400 truncate">
                                {t('profitability.memberSummary', {
                                  plan: m.planName,
                                  sessions: m.sessionsThisMonth,
                                  value: formatCurrency(m.valueProvided, m.currency),
                                  price: formatCurrency(m.planPrice, m.currency),
                                })}
                              </p>
                            </div>
                            <Badge tone={v.tone} className="shrink-0">
                              {v.label}
                            </Badge>
                          </div>
                        )
                      })}
                  </div>
                </CardBody>
              </Card>
            </div>
          )
        })()}

      {!loading && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-ink-700">{t('subscribers.heading')}</p>
              <Button size="sm" variant="secondary" onClick={() => setShowAddMember(true)}>
                <UserPlus className="w-3.5 h-3.5 mr-1.5" /> {t('subscribers.addMember')}
              </Button>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-6">{t('subscribers.empty')}</p>
            ) : (
              <div className="divide-y divide-ink-100">
                {members.map((m) => {
                  const pendingCancel = m.status === 'active' && m.cancelAtPeriodEnd
                  return (
                    <div key={m.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-800 wrap-break-word flex items-center gap-1.5">
                          {m.userName}
                          {m.isCourtesy && (
                            <span
                              title={m.courtesyReason ?? t('subscribers.courtesyDefaultReason')}
                            >
                              <Badge tone="violet">{t('subscribers.courtesyBadge')}</Badge>
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-ink-400 truncate">
                          {m.userEmail} · {m.plan.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-ink-400">
                          {pendingCancel
                            ? t('subscribers.willCancelOn')
                            : t('subscribers.nextChargeOn')}{' '}
                          {new Date(m.nextBillingDate).toLocaleDateString(locale)}
                        </span>
                        <Badge
                          tone={
                            pendingCancel
                              ? 'amber'
                              : m.status === 'active'
                                ? 'emerald'
                                : m.status === 'cancelled'
                                  ? 'gray'
                                  : 'red'
                          }
                        >
                          {pendingCancel
                            ? t('subscribers.statusWillCancel')
                            : m.status === 'active'
                              ? t('subscribers.statusActive')
                              : m.status === 'cancelled'
                                ? t('subscribers.statusCancelled')
                                : m.status}
                        </Badge>
                        {m.status === 'active' && !pendingCancel && (
                          <button
                            onClick={() => cancelMembership(m)}
                            disabled={cancellingId === m.id}
                            title={t('subscribers.cancelTooltip')}
                            className="p-1.5 text-ink-400 hover:text-referee-500 rounded-lg hover:bg-referee-50 disabled:opacity-50"
                          >
                            {cancellingId === m.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Ban className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {showCreate && clubId && (
        <PlanModal
          clubId={clubId}
          onClose={() => setShowCreate(false)}
          onSaved={(p) => {
            setPlans([...plans, p].sort((a, b) => a.price - b.price))
            setShowCreate(false)
          }}
        />
      )}
      {editingPlan && clubId && (
        <PlanModal
          clubId={clubId}
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSaved={(p) => {
            setPlans(plans.map((pl) => (pl.id === p.id ? p : pl)))
            setEditingPlan(null)
          }}
        />
      )}
      {showAddMember && clubId && (
        <AddMemberModal
          clubId={clubId}
          plans={plans.filter((p) => p.isActive)}
          onClose={() => setShowAddMember(false)}
          onSaved={() => {
            setShowAddMember(false)
            loadAll(clubId)
          }}
        />
      )}
      {detailIssueGroup && (
        <PaymentIssueGroupModal
          group={detailIssueGroup}
          resolvingKey={resolvingKey}
          onClose={() => setDetailPlayerId(null)}
          onResolveOne={resolvePaymentIssue}
          onResolveAll={(method) => resolvePaymentIssueGroup(detailIssueGroup, method)}
        />
      )}
    </div>
  )
}

// Alta manual de socio: el jugador siempre debe ser una cuenta ya registrada (se busca
// igual que al agregar un jugador a una reserva o alumno a una clase). El pago es
// opcional — si se omite, la membresía queda activa como cortesía sin registrar cobro.
function AddMemberModal({
  clubId,
  plans,
  onClose,
  onSaved,
}: {
  clubId: string
  plans: Plan[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('Membresias')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; email: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const [planId, setPlanId] = useState(plans[0]?.id ?? '')
  const [payNow, setPayNow] = useState<'none' | 'cash' | 'card'>('none')
  const [courtesyReason, setCourtesyReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`${GW}/api/users/search?q=${encodeURIComponent(query)}`)
        const json = await res.json()
        setResults(json.data ?? [])
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [query])

  const plan = plans.find((p) => p.id === planId)
  const needsCourtesyReason = payNow === 'none' && !!plan && plan.price > 0

  async function handleSave() {
    if (!selected) {
      setError(t('addMemberModal.errors.choosePlayer'))
      return
    }
    if (!planId) {
      setError(t('addMemberModal.errors.choosePlan'))
      return
    }
    if (needsCourtesyReason && !courtesyReason.trim()) {
      setError(t('addMemberModal.errors.courtesyReasonRequired'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${GW}/api/clubs/${clubId}/memberships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selected.id,
          planId,
          paymentMethod: payNow === 'none' ? undefined : payNow,
          courtesyReason: needsCourtesyReason ? courtesyReason.trim() : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('addMemberModal.errors.addFailed'))
        return
      }
      onSaved()
    } catch {
      setError(t('addMemberModal.errors.connectionError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={t('addMemberModal.title')} maxWidth="sm">
      {error && (
        <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-3 py-2 mb-3">{error}</p>
      )}

      {selected ? (
        <div className="flex items-center justify-between bg-court-50 border border-court-200 rounded-xl px-3 py-2.5 mb-3">
          <p className="text-sm font-semibold text-court-800 wrap-break-word">{selected.name}</p>
          <button onClick={() => setSelected(null)} className="text-court-600 hover:text-court-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="mb-3">
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('addMemberModal.playerLabel')}
          </label>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('addMemberModal.searchPlaceholder')}
          />
          {searching && (
            <p className="text-xs text-ink-400 mt-1">{t('addMemberModal.searching')}</p>
          )}
          {results.length > 0 && (
            <div className="mt-1.5 border border-ink-200 rounded-xl divide-y divide-ink-100 max-h-40 overflow-y-auto">
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelected({ id: u.id, name: u.name })
                    setQuery('')
                    setResults([])
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-ink-50"
                >
                  <p className="text-sm font-medium text-ink-800 wrap-break-word">{u.name}</p>
                  <p className="text-xs text-ink-400 wrap-break-word">{u.email}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {plans.length === 0 ? (
        <p className="text-xs text-trophy-600 bg-trophy-50 rounded-xl px-3 py-2 mb-3">
          {t('addMemberModal.noActivePlans')}
        </p>
      ) : (
        <div className="mb-3">
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('addMemberModal.planLabel')}
          </label>
          <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {t('addMemberModal.planOption', {
                  name: p.name,
                  price: formatCurrency(p.price, p.currency),
                })}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="mb-5">
        <label className="block text-sm font-semibold text-ink-700 mb-1.5">
          {t('addMemberModal.paymentLabel')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setPayNow('none')}
            className={`py-2 rounded-xl text-xs font-semibold border ${payNow === 'none' ? 'bg-ink-100 border-ink-400 text-ink-700' : 'border-ink-200 text-ink-400'}`}
          >
            {t('addMemberModal.payNone')}
          </button>
          <button
            type="button"
            onClick={() => setPayNow('cash')}
            className={`py-2 rounded-xl text-xs font-semibold border ${payNow === 'cash' ? 'bg-trophy-50 border-trophy-400 text-trophy-700' : 'border-ink-200 text-ink-400'}`}
          >
            {t('addMemberModal.payCash')}
          </button>
          <button
            type="button"
            onClick={() => setPayNow('card')}
            className={`py-2 rounded-xl text-xs font-semibold border ${payNow === 'card' ? 'bg-court-50 border-court-400 text-court-700' : 'border-ink-200 text-ink-400'}`}
          >
            {t('addMemberModal.payCard')}
          </button>
        </div>
        {payNow !== 'none' && plan && (
          <p className="text-xs text-ink-400 mt-1.5">
            {t('addMemberModal.paymentHint', { amount: formatCurrency(plan.price, plan.currency) })}
          </p>
        )}
        {needsCourtesyReason && (
          <div className="mt-3">
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('addMemberModal.courtesyReasonLabel')}
            </label>
            <Textarea
              value={courtesyReason}
              onChange={(e) => setCourtesyReason(e.target.value)}
              placeholder={t('addMemberModal.courtesyReasonPlaceholder')}
              rows={2}
            />
            <p className="text-xs text-ink-400 mt-1">{t('addMemberModal.courtesyReasonHint')}</p>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
          {t('addMemberModal.cancel')}
        </Button>
        <Button
          onClick={handleSave}
          disabled={
            saving || !selected || !planId || (needsCourtesyReason && !courtesyReason.trim())
          }
          className="flex-1"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('addMemberModal.saving')}
            </span>
          ) : (
            t('addMemberModal.save')
          )}
        </Button>
      </div>
    </Modal>
  )
}

function PaymentIssueGroupModal({
  group,
  resolvingKey,
  onClose,
  onResolveOne,
  onResolveAll,
}: {
  group: PlayerIssueGroup
  resolvingKey: string | null
  onClose: () => void
  onResolveOne: (issue: PaymentIssue, method: 'cash' | 'card') => void
  onResolveAll: (method: 'cash' | 'card') => void
}) {
  const t = useTranslations('Membresias')
  const groupKey = `group|${group.playerUserId}`
  const groupResolving = resolvingKey === groupKey

  return (
    <Modal open onClose={onClose} maxWidth="md">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-ink-900">{group.playerName}</h3>
        <Badge tone="amber">
          {t('paymentIssueGroupModal.pendingBadge', { count: group.items.length })}
        </Badge>
      </div>
      <p className="text-2xl font-black text-ink-900 mb-4">
        {group.totalsByCurrency.map((tc) => formatCurrency(tc.amount, tc.currency)).join(' + ')}
      </p>

      <div className="space-y-3 mb-4">
        {group.items.map((issue) => {
          const key = `${issue.bookingId}|${issue.playerUserId}`
          const itemResolving = resolvingKey === key
          return (
            <div key={key} className="rounded-xl border border-ink-100 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 text-sm text-ink-700">
                  <MapPin className="w-4 h-4 text-ink-400 shrink-0" />
                  <span>{issue.courtName ?? t('paymentIssueGroupModal.courtNameFallback')}</span>
                </div>
                <Badge tone={issue.paymentStatus === 'failed' ? 'red' : 'amber'}>
                  {issue.paymentStatus === 'failed'
                    ? t('paymentIssueGroupModal.statusFailed')
                    : t('paymentIssueGroupModal.statusPending')}
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
          {t('paymentIssueGroupModal.close')}
        </button>
        <button
          onClick={() => onResolveAll('cash')}
          disabled={groupResolving}
          className="flex-1 text-sm font-semibold text-trophy-700 border border-trophy-100 hover:border-trophy-400 bg-trophy-50 rounded-xl px-3 py-2.5 transition-colors disabled:opacity-50"
        >
          {groupResolving ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          ) : (
            t('paymentIssueGroupModal.payAllCash')
          )}
        </button>
        <button
          onClick={() => onResolveAll('card')}
          disabled={groupResolving}
          className="flex-1 text-sm font-semibold text-court-700 border border-court-200 hover:border-court-400 bg-court-50 rounded-xl px-3 py-2.5 transition-colors disabled:opacity-50"
        >
          {groupResolving ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          ) : (
            t('paymentIssueGroupModal.payAllCard')
          )}
        </button>
      </div>
    </Modal>
  )
}

function PlanModal({
  clubId,
  plan,
  onClose,
  onSaved,
}: {
  clubId: string
  plan?: Plan
  onClose: () => void
  onSaved: (p: Plan) => void
}) {
  const t = useTranslations('Membresias')
  const [form, setForm] = useState({
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    price: plan?.price ?? 0,
    currency: plan?.currency ?? 'DOP',
    sessionsPerDay: plan?.sessionsPerDay ?? 1,
    priceExtraSession: plan?.priceExtraSession ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.name.trim()) {
      setError(t('planModal.errors.nameRequired'))
      return
    }
    if (form.price < 0) {
      setError(t('planModal.errors.priceNegative'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const url = plan
        ? `${GW}/api/clubs/${clubId}/membership-plans/${plan.id}`
        : `${GW}/api/clubs/${clubId}/membership-plans`
      const res = await fetch(url, {
        method: plan ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          price: Number(form.price),
          currency: form.currency.trim() || 'DOP',
          sessionsPerDay: Number(form.sessionsPerDay),
          priceExtraSession: Number(form.priceExtraSession),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('planModal.errors.saveFailed'))
        return
      }
      onSaved(data.data)
    } catch {
      setError(t('planModal.errors.connectionError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={plan ? t('planModal.editTitle') : t('planModal.createTitle')}
      maxWidth="sm"
    >
      {error && (
        <p className="text-referee-600 text-sm bg-referee-50 rounded-xl px-3 py-2 mb-3">{error}</p>
      )}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('planModal.nameLabel')}
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('planModal.namePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('planModal.descriptionLabel')}
          </label>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={t('planModal.descriptionPlaceholder')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('planModal.priceLabel')}
            </label>
            <Input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1">
              {t('planModal.currencyLabel')}
            </label>
            <Input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              maxLength={3}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('planModal.sessionsPerDayLabel')}
          </label>
          <Select
            value={form.sessionsPerDay}
            onChange={(e) => setForm({ ...form, sessionsPerDay: Number(e.target.value) })}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {t('planModal.sessionsPerDayOption', { count: n })}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-700 mb-1">
            {t('planModal.extraSessionPriceLabel')}
          </label>
          <Input
            type="number"
            min={0}
            value={form.priceExtraSession}
            onChange={(e) => setForm({ ...form, priceExtraSession: Number(e.target.value) })}
          />
          <p className="text-xs text-ink-400 mt-1">{t('planModal.extraSessionPriceHint')}</p>
        </div>
      </div>
      <div className="flex gap-3 mt-5">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
          {t('planModal.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('planModal.saving')}
            </span>
          ) : (
            t('planModal.save')
          )}
        </Button>
      </div>
    </Modal>
  )
}
