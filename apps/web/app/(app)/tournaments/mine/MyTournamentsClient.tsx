'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trophy, Loader2, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'

type MyTournament = {
  id: string
  tournamentId: string
  tournamentName: string
  sport: string
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled'
  clubName: string | null
  location: string
  category: string
  startDate: string
  partnerName: string | null
  paymentStatus: string
  isActive: boolean
}

const STATUS_TONE: Record<MyTournament['status'], BadgeTone> = {
  draft: 'gray',
  open: 'emerald',
  in_progress: 'amber',
  completed: 'gray',
  cancelled: 'red',
}

async function fetchMyTournaments(userId: string, errorMessage: string): Promise<MyTournament[]> {
  const res = await fetch(`/api/tournaments/participants/user/${userId}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.data ?? []
}

export function MyTournamentsClient({ userId }: { userId: string }) {
  const t = useTranslations('TournamentsApp.mine')
  const locale = useLocale()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['tournaments', 'mine', userId],
    queryFn: () => fetchMyTournaments(userId, t('loadError')),
  })

  const STATUS_LABEL: Record<MyTournament['status'], { label: string; tone: BadgeTone }> = {
    draft: { label: t('statusDraft'), tone: STATUS_TONE.draft },
    open: { label: t('statusOpen'), tone: STATUS_TONE.open },
    in_progress: { label: t('statusInProgress'), tone: STATUS_TONE.in_progress },
    completed: { label: t('statusCompleted'), tone: STATUS_TONE.completed },
    cancelled: { label: t('statusCancelled'), tone: STATUS_TONE.cancelled },
  }

  const withdrawMutation = useMutation({
    mutationFn: async (tour: MyTournament) => {
      const res = await fetch(`/api/tournaments/${tour.tournamentId}/participants/${tour.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? t('withdrawError'))
      }
    },
    onSuccess: () => {
      toast.success(t('withdrawSuccess'))
      queryClient.invalidateQueries({ queryKey: ['tournaments', 'mine', userId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <Link
        href="/tournaments"
        className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('backLink')}
      </Link>

      <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : !tournaments || tournaments.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Link
              href="/tournaments"
              className="text-sm font-semibold text-white bg-court-600 hover:bg-court-700 rounded-xl px-5 py-2.5 transition-colors"
            >
              {t('searchButton')}
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {tournaments.map((tour) => {
            const st = STATUS_LABEL[tour.status]
            const canWithdraw = tour.status === 'open' || tour.status === 'draft'
            return (
              <Link key={tour.id} href={`/tournaments/${tour.tournamentId}`}>
                <Card className="p-4 flex items-center justify-between gap-4 hover:border-court-200 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-ink-900 truncate">{tour.tournamentName}</p>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <p className="text-xs text-ink-400 mt-1">
                      {tour.clubName ?? tour.location} · {tour.category} ·{' '}
                      {new Date(tour.startDate).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    {tour.partnerName && (
                      <p className="text-xs text-ink-400 mt-0.5">
                        {t('partnerLabel', { name: tour.partnerName })}
                      </p>
                    )}
                  </div>
                  {canWithdraw && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        withdrawMutation.mutate(tour)
                      }}
                      disabled={withdrawMutation.isPending}
                      className="shrink-0 flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> {t('withdrawButton')}
                    </button>
                  )}
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
