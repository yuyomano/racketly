'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Wallet, MapPin, Loader2, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'

type Membership = {
  id: string
  status: 'active' | 'cancelled' | 'expired'
  cancelAtPeriodEnd: boolean
  nextBillingDate: string
  plan: { name: string; price: number; currency: string }
  club: { id: string; name: string; city: string }
}

async function fetchMyMemberships(userId: string, fallbackError: string): Promise<Membership[]> {
  const res = await fetch(`/api/memberships/user/${userId}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? fallbackError)
  return data.data ?? []
}

export function MyMembershipsClient({ userId }: { userId: string }) {
  const t = useTranslations('MyMemberships')
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: memberships, isLoading } = useQuery({
    queryKey: ['memberships', 'mine', userId],
    queryFn: () => fetchMyMemberships(userId, t('loadError')),
  })

  const STATUS_LABEL: Record<Membership['status'], { label: string; tone: BadgeTone }> = {
    active: { label: t('statusActive'), tone: 'emerald' },
    cancelled: { label: t('statusCancelled'), tone: 'red' },
    expired: { label: t('statusExpired'), tone: 'gray' },
  }

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/memberships/${id}/cancel`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('cancelError'))
      return data
    },
    onSuccess: (data) => {
      toast.success(data.message ?? t('cancelledToast'))
      queryClient.invalidateQueries({ queryKey: ['memberships', 'mine', userId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function confirmCancel(m: Membership) {
    if (window.confirm(t('cancelConfirm', { club: m.club.name }))) cancelMutation.mutate(m.id)
  }

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
      ) : !memberships || memberships.length === 0 ? (
        <EmptyState icon={Wallet} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <div className="space-y-3">
          {memberships.map((m) => {
            const st = STATUS_LABEL[m.status]
            const canCancel = m.status === 'active' && !m.cancelAtPeriodEnd
            return (
              <Card key={m.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-ink-900 truncate">{m.club.name}</p>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {m.cancelAtPeriodEnd && <Badge tone="amber">{t('pendingCancelBadge')}</Badge>}
                  </div>
                  <p className="flex items-center gap-1 text-xs text-ink-400 mt-1">
                    <MapPin className="w-3 h-3" /> {m.club.city}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {m.plan.name} · {m.plan.price} {m.plan.currency}/{t('perMonth')}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {t('nextBilling', { date: m.nextBillingDate.slice(0, 10) })}
                  </p>
                </div>
                {canCancel && (
                  <button
                    onClick={() => confirmCancel(m)}
                    disabled={cancelMutation.isPending}
                    className="shrink-0 flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> {t('cancelButton')}
                  </button>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
