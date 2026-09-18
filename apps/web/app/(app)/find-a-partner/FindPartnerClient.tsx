'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Handshake, Loader2, MapPin, Plus, Star } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { FormField } from '@/components/ui/FormField'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { RequestFormModal } from './RequestFormModal'
import { type Tournament, TIME_PREFERENCES, fetchUpcomingPairsTournaments } from './shared'

type MatchRequest = {
  id: string
  requesterId: string
  sport: 'padel' | 'pickleball'
  levelMin: string
  levelMax: string
  city: string
  maxDistanceKm: number
  preferredDate: string | null
  timePreference: string | null
  message: string | null
  status: string
  tournamentId: string | null
  tournament: Tournament | null
  requester: {
    id: string
    playerProfile: {
      displayName: string
      avatarUrl: string | null
      category: string
      eloPadel: number
    } | null
  }
  _count: { applications: number }
}

function formatTimePreference(t: ReturnType<typeof useTranslations>, value: string) {
  return (TIME_PREFERENCES as readonly string[]).includes(value) ? t(`time_${value}`) : value
}

async function fetchRequests(
  sport: 'all' | 'padel' | 'pickleball',
  tournamentId: string
): Promise<MatchRequest[]> {
  const params = new URLSearchParams()
  if (sport !== 'all') params.set('sport', sport)
  if (tournamentId) params.set('tournamentId', tournamentId)
  const res = await fetch(`/api/match-requests?${params.toString()}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to load match requests')
  return data.data ?? []
}

export function FindPartnerClient({ userId }: { userId: string }) {
  const t = useTranslations('FindPartner.list')
  const locale = useLocale()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [sport, setSport] = useState<'all' | 'padel' | 'pickleball'>('all')
  const [tournamentFilter, setTournamentFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [applyRequest, setApplyRequest] = useState<MatchRequest | null>(null)

  const {
    data: requests,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['match-requests', sport, tournamentFilter],
    queryFn: () => fetchRequests(sport, tournamentFilter),
  })

  const { data: tournaments } = useQuery({
    queryKey: ['tournaments-pairs-open'],
    queryFn: fetchUpcomingPairsTournaments,
  })

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/match-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('errorCreate'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('createSuccess'))
      setCreateOpen(false)
      queryClient.invalidateQueries({ queryKey: ['match-requests'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const applyMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      const res = await fetch(`/api/match-requests/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('errorApply'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('applySuccess'))
      setApplyRequest(null)
      queryClient.invalidateQueries({ queryKey: ['match-requests'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>
          <p className="text-sm text-ink-400 mt-0.5">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/find-a-partner/mine"
            className="text-sm font-semibold text-court-700 bg-court-50 hover:bg-court-100 px-3.5 py-2 rounded-xl transition-colors"
          >
            {t('myRequestsLink')}
          </Link>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> {t('createButton')}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex border border-ink-200 rounded-xl overflow-hidden w-fit">
          {(['all', 'padel', 'pickleball'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setSport(v)}
              className={cn(
                'px-4 py-2 text-sm font-semibold transition-colors',
                sport === v ? 'bg-court-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
              )}
            >
              {v === 'all' ? t('sportAll') : v === 'padel' ? t('sportPadel') : t('sportPickleball')}
            </button>
          ))}
        </div>
        {tournaments && tournaments.length > 0 && (
          <Select
            className="w-auto"
            value={tournamentFilter}
            onChange={(e) => setTournamentFilter(e.target.value)}
          >
            <option value="">{t('filterTournamentAll')}</option>
            {tournaments.map((tour) => (
              <option key={tour.id} value={tour.id}>
                {tour.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{t('loadError')}</p>
      ) : !requests || requests.length === 0 ? (
        <EmptyState icon={Handshake} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {requests.map((r) => {
            const isMine = r.requesterId === userId
            return (
              <Card key={r.id} className="p-5 h-full">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-ink-900 leading-snug">
                    {r.requester.playerProfile?.displayName ?? '—'}
                  </h3>
                  {r.sport === 'padel' ? (
                    <PadelIcon size={16} className="text-ink-300 shrink-0" />
                  ) : (
                    <PickleballIcon size={16} className="text-ink-300 shrink-0" />
                  )}
                </div>
                <p className="flex items-center gap-1 text-xs text-ink-400 mt-1">
                  <MapPin className="w-3 h-3" /> {r.city}
                </p>
                {r.requester.playerProfile && (
                  <p className="flex items-center gap-1 text-xs text-ink-400 mt-1">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />{' '}
                    {r.requester.playerProfile.eloPadel} ELO
                  </p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap mt-3">
                  <Badge tone="violet">
                    {r.levelMin === r.levelMax ? r.levelMin : `${r.levelMin}–${r.levelMax}`}
                  </Badge>
                  {r.preferredDate && (
                    <Badge tone="gray">
                      {new Date(r.preferredDate + 'T00:00:00').toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Badge>
                  )}
                  {r.timePreference && (
                    <Badge tone="gray">{formatTimePreference(t, r.timePreference)}</Badge>
                  )}
                  {r.tournament && <Badge tone="amber">🏆 {r.tournament.name}</Badge>}
                </div>
                {r.message && <p className="text-sm text-ink-500 mt-2 line-clamp-2">{r.message}</p>}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-ink-400">
                    {t('applicationsCount', { count: r._count.applications })}
                  </span>
                  {isMine ? (
                    <Badge tone="blue">{t('yourRequestBadge')}</Badge>
                  ) : (
                    <Button size="sm" onClick={() => setApplyRequest(r)}>
                      {t('applyButton')}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <RequestFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(payload) => createMutation.mutate(payload)}
        isPending={createMutation.isPending}
        title={t('createModalTitle')}
        submitLabel={t('publishButton')}
      />

      <Modal
        open={!!applyRequest}
        onClose={() => setApplyRequest(null)}
        title={t('applyModalTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplyRequest(null)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={applyMutation.isPending}
              onClick={() => {
                const form = document.getElementById('apply-message') as HTMLTextAreaElement | null
                applyMutation.mutate({ id: applyRequest!.id, message: form?.value ?? '' })
              }}
            >
              {applyMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('confirmApply')
              )}
            </Button>
          </>
        }
      >
        {applyRequest && (
          <div className="space-y-4">
            <div className="bg-ink-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-ink-900">
                  {applyRequest.requester.playerProfile?.displayName ?? '—'}
                </p>
                {applyRequest.requester.playerProfile && (
                  <span className="flex items-center gap-1 text-xs text-ink-400">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    {applyRequest.requester.playerProfile.eloPadel} ELO
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge tone="violet">
                  {applyRequest.levelMin === applyRequest.levelMax
                    ? applyRequest.levelMin
                    : `${applyRequest.levelMin}–${applyRequest.levelMax}`}
                </Badge>
                <Badge tone="gray">
                  <MapPin className="w-3 h-3" /> {applyRequest.city} (
                  {t('maxDistanceValue', { km: applyRequest.maxDistanceKm })})
                </Badge>
                {applyRequest.preferredDate && (
                  <Badge tone="gray">
                    {new Date(applyRequest.preferredDate + 'T00:00:00').toLocaleDateString(locale, {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Badge>
                )}
                {applyRequest.timePreference && (
                  <Badge tone="gray">{formatTimePreference(t, applyRequest.timePreference)}</Badge>
                )}
                {applyRequest.tournament && (
                  <Badge tone="amber">🏆 {applyRequest.tournament.name}</Badge>
                )}
              </div>
              {applyRequest.message && (
                <p className="text-sm text-ink-600">{applyRequest.message}</p>
              )}
            </div>
            <FormField label={t('applyMessageLabel')} htmlFor="apply-message">
              <Textarea id="apply-message" rows={3} placeholder={t('applyMessagePlaceholder')} />
            </FormField>
          </div>
        )}
      </Modal>
    </div>
  )
}
