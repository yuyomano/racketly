'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Handshake, Loader2, Check, X, CalendarPlus, Pencil } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { useToast } from '@/components/ui/Toast'
import { RequestFormModal } from '../RequestFormModal'
import type { Tournament } from '../shared'

type Application = {
  id: string
  message: string | null
  status: 'pending' | 'accepted' | 'rejected'
  applicant: {
    id: string
    playerProfile: {
      displayName: string
      avatarUrl: string | null
      category: string
      eloPadel: number
    } | null
  }
}

type MatchRequest = {
  id: string
  sport: 'padel' | 'pickleball'
  city: string
  levelMin: string
  levelMax: string
  maxDistanceKm: number
  preferredDate: string | null
  timePreference: string | null
  tournamentId: string | null
  tournament: Tournament | null
  message: string | null
  status: string
  applications: Application[]
}

const STATUS_TONE: Record<string, BadgeTone> = {
  open: 'emerald',
  matched: 'blue',
  expired: 'gray',
  cancelled: 'red',
}

async function fetchMine(): Promise<MatchRequest[]> {
  const res = await fetch('/api/match-requests/mine')
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to load your match requests')
  return data.data ?? []
}

export function MyMatchRequestsClient() {
  const t = useTranslations('FindPartner.mine')
  const toast = useToast()
  const queryClient = useQueryClient()
  const [editRequest, setEditRequest] = useState<MatchRequest | null>(null)

  const {
    data: requests,
    isLoading,
    error,
  } = useQuery({ queryKey: ['match-requests-mine'], queryFn: fetchMine })

  const editMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const res = await fetch(`/api/match-requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('errorEdit'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('editSuccess'))
      setEditRequest(null)
      queryClient.invalidateQueries({ queryKey: ['match-requests-mine'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const respondMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'accepted' | 'rejected' }) => {
      const res = await fetch(`/api/match-requests/applications/${id}/respond`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('errorRespond'))
      return data.data
    },
    onSuccess: (_, { status }) => {
      toast.success(status === 'accepted' ? t('acceptSuccess') : t('rejectSuccess'))
      queryClient.invalidateQueries({ queryKey: ['match-requests-mine'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/find-a-partner"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-700 w-fit"
        >
          <ArrowLeft className="w-4 h-4" /> {t('backLink')}
        </Link>
        <h1 className="text-xl font-black text-ink-900 tracking-tight mt-3">{t('title')}</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{t('errorFetch')}</p>
      ) : !requests || requests.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Link
              href="/find-a-partner"
              className="text-sm font-semibold text-court-700 bg-court-50 hover:bg-court-100 px-4 py-2 rounded-xl transition-colors"
            >
              {t('emptyAction')}
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {r.sport === 'padel' ? (
                    <PadelIcon size={16} className="text-ink-300 shrink-0" />
                  ) : (
                    <PickleballIcon size={16} className="text-ink-300 shrink-0" />
                  )}
                  <p className="font-bold text-ink-900">{r.city}</p>
                  <Badge tone="violet">
                    {r.levelMin === r.levelMax ? r.levelMin : `${r.levelMin}–${r.levelMax}`}
                  </Badge>
                  {r.tournament && <Badge tone="amber">🏆 {r.tournament.name}</Badge>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.status === 'open' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="!px-2.5"
                      onClick={() => setEditRequest(r)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Badge tone={STATUS_TONE[r.status] ?? 'gray'}>{t(`status_${r.status}`)}</Badge>
                </div>
              </div>

              {r.status === 'matched' &&
                (() => {
                  const partner = r.applications.find((a) => a.status === 'accepted')
                  if (!partner) return null
                  const partnerName = partner.applicant.playerProfile?.displayName ?? ''
                  return (
                    <Link
                      href={`/booking?withUserId=${partner.applicant.id}&withName=${encodeURIComponent(partnerName)}`}
                      className="flex items-center gap-1.5 text-sm font-semibold text-court-700 bg-court-50 hover:bg-court-100 px-3.5 py-2 rounded-xl transition-colors w-fit mt-3"
                    >
                      <CalendarPlus className="w-4 h-4" /> {t('bookCourtButton')}
                    </Link>
                  )
                })()}

              {r.applications.length === 0 ? (
                <p className="text-sm text-ink-400 mt-3">{t('noApplications')}</p>
              ) : (
                <div className="mt-4 pt-4 border-t border-ink-100 space-y-2">
                  {r.applications.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 bg-ink-50 rounded-xl px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-800 truncate">
                          {a.applicant.playerProfile?.displayName ?? '—'}
                        </p>
                        {a.message && (
                          <p className="text-xs text-ink-400 mt-0.5 truncate">{a.message}</p>
                        )}
                      </div>
                      {a.status === 'pending' ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="!px-2.5"
                            disabled={respondMutation.isPending}
                            onClick={() => respondMutation.mutate({ id: a.id, status: 'rejected' })}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            className="!px-2.5"
                            disabled={respondMutation.isPending}
                            onClick={() => respondMutation.mutate({ id: a.id, status: 'accepted' })}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Badge tone={a.status === 'accepted' ? 'emerald' : 'gray'}>
                          {t(`applicationStatus_${a.status}`)}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editRequest && (
        <RequestFormModal
          open={!!editRequest}
          onClose={() => setEditRequest(null)}
          onSubmit={(payload) => editMutation.mutate({ id: editRequest.id, payload })}
          isPending={editMutation.isPending}
          title={t('editModalTitle')}
          submitLabel={t('saveButton')}
          initial={{
            sport: editRequest.sport,
            levelMin: editRequest.levelMin,
            levelMax: editRequest.levelMax,
            city: editRequest.city,
            maxDistanceKm: String(editRequest.maxDistanceKm),
            preferredDate: editRequest.preferredDate ?? '',
            timePreference: editRequest.timePreference ?? '',
            tournamentId: editRequest.tournamentId ?? '',
            message: editRequest.message ?? '',
          }}
        />
      )}
    </div>
  )
}
