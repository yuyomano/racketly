'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { determineWinner, formatScore } from '@racketly/utils'
import type { SetScore } from '@racketly/shared-types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Player = { userId: string; name: string; isOwner: boolean }

type Match = {
  id: string
  score: SetScore[]
  winningSide: 1 | 2
  reportedById: string
  scoreConfirmed: boolean
  player1Id: string | null
  player1PartnerId: string | null
  player2Id: string | null
  player2PartnerId: string | null
}

async function fetchMatch(bookingId: string): Promise<Match | null> {
  const res = await fetch(`/api/bookings/${bookingId}/match`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to load match')
  return data.data ?? null
}

function nameOf(players: Player[], userId: string | null) {
  return players.find((p) => p.userId === userId)?.name ?? '—'
}

export function MatchScoreModal({
  bookingId,
  players,
  userId,
  t,
  onClose,
}: {
  bookingId: string
  players: Player[]
  userId: string
  t: (key: string, values?: Record<string, string | number>) => string
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: match, isLoading } = useQuery({
    queryKey: ['booking-match', bookingId],
    queryFn: () => fetchMatch(bookingId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['booking-match', bookingId] })
    queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] })
  }

  const reportMutation = useMutation({
    mutationFn: async (payload: { team1: string[]; team2: string[]; sets: SetScore[] }) => {
      const res = await fetch(`/api/bookings/${bookingId}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('matchReportError'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('matchReportedToast'))
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/bookings/${bookingId}/match/confirm`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('matchConfirmError'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('matchConfirmedToast'))
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const disputeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/bookings/${bookingId}/match/dispute`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('matchDisputeError'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('matchDisputedToast'))
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) {
    return (
      <Modal open onClose={onClose} title={t('matchModalTitle')}>
        <div className="flex items-center justify-center py-10 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </Modal>
    )
  }

  if (match) {
    const team1 = [match.player1Id, match.player1PartnerId].filter(Boolean) as string[]
    const team2 = [match.player2Id, match.player2PartnerId].filter(Boolean) as string[]
    const isReporter = match.reportedById === userId
    return (
      <Modal open onClose={onClose} title={t('matchModalTitle')}>
        <div className="space-y-4">
          <div className="bg-ink-50 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink-800">
                {team1.map((id) => nameOf(players, id)).join(' / ')}
              </p>
              <span className="text-xs text-ink-400">vs</span>
              <p className="text-sm font-semibold text-ink-800 text-right">
                {team2.map((id) => nameOf(players, id)).join(' / ')}
              </p>
            </div>
            <p className="text-center font-black text-ink-900 text-lg">{formatScore(match.score)}</p>
            <p className="text-center text-xs text-ink-400">
              {match.winningSide === 1
                ? team1.map((id) => nameOf(players, id)).join(' / ')
                : team2.map((id) => nameOf(players, id)).join(' / ')}{' '}
              🏆
            </p>
          </div>

          {match.scoreConfirmed ? (
            <Badge tone="emerald">{t('matchConfirmedToast')}</Badge>
          ) : isReporter ? (
            <p className="text-sm text-ink-400">{t('matchPendingHint')}</p>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={disputeMutation.isPending || confirmMutation.isPending}
                onClick={() => disputeMutation.mutate()}
              >
                {disputeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t('matchDisputeButton')
                )}
              </Button>
              <Button
                disabled={disputeMutation.isPending || confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
              >
                {confirmMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t('matchConfirmButton')
                )}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    )
  }

  return (
    <ReportForm
      players={players}
      t={t}
      isPending={reportMutation.isPending}
      onSubmit={(payload) => reportMutation.mutate(payload)}
      onClose={onClose}
    />
  )
}

function ReportForm({
  players,
  t,
  isPending,
  onSubmit,
  onClose,
}: {
  players: Player[]
  t: (key: string, values?: Record<string, string | number>) => string
  isPending: boolean
  onSubmit: (payload: { team1: string[]; team2: string[]; sets: SetScore[] }) => void
  onClose: () => void
}) {
  const half = Math.ceil(players.length / 2)
  const [team, setTeam] = useState<Record<string, 1 | 2>>(() =>
    Object.fromEntries(players.map((p, i) => [p.userId, i < half ? 1 : 2]))
  )
  const [sets, setSets] = useState<SetScore[]>([{ player1: 0, player2: 0 }])

  const team1 = players.filter((p) => team[p.userId] === 1).map((p) => p.userId)
  const team2 = players.filter((p) => team[p.userId] === 2).map((p) => p.userId)

  const winner = useMemo(() => determineWinner(sets), [sets])
  const canSubmit =
    team1.length >= 1 &&
    team1.length <= 2 &&
    team2.length >= 1 &&
    team2.length <= 2 &&
    sets.length > 0 &&
    winner !== null

  return (
    <Modal
      open
      onClose={onClose}
      title={t('matchModalTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            disabled={!canSubmit || isPending}
            onClick={() => onSubmit({ team1, team2, sets })}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('matchSubmitButton')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-ink-500 mb-2">{t('matchTeamsLabel')}</p>
          <div className="space-y-1.5">
            {players.map((p) => (
              <div key={p.userId} className="flex items-center justify-between gap-2">
                <span className="text-sm text-ink-700 truncate">{p.name}</span>
                <div className="flex border border-ink-200 rounded-lg overflow-hidden shrink-0">
                  {([1, 2] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => setTeam((prev) => ({ ...prev, [p.userId]: side }))}
                      className={cn(
                        'px-3 py-1 text-xs font-semibold transition-colors',
                        team[p.userId] === side
                          ? 'bg-court-600 text-white'
                          : 'bg-white text-ink-500 hover:bg-ink-50'
                      )}
                    >
                      {side === 1 ? t('matchTeam1') : t('matchTeam2')}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-ink-500 mb-2">{t('matchSetsLabel')}</p>
          <div className="space-y-2">
            {sets.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-ink-400 w-10 shrink-0">{t('matchSetLabel', { number: i + 1 })}</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={s.player1}
                  onChange={(e) =>
                    setSets((prev) =>
                      prev.map((set, idx) =>
                        idx === i ? { ...set, player1: Number(e.target.value) || 0 } : set
                      )
                    )
                  }
                  className="w-16 rounded-lg border border-ink-200 px-2 py-1.5 text-sm text-center"
                />
                <span className="text-ink-300">–</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={s.player2}
                  onChange={(e) =>
                    setSets((prev) =>
                      prev.map((set, idx) =>
                        idx === i ? { ...set, player2: Number(e.target.value) || 0 } : set
                      )
                    )
                  }
                  className="w-16 rounded-lg border border-ink-200 px-2 py-1.5 text-sm text-center"
                />
                {sets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSets((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-ink-300 hover:text-referee-500 ml-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {sets.length < 3 && (
              <button
                type="button"
                onClick={() => setSets((prev) => [...prev, { player1: 0, player2: 0 }])}
                className="flex items-center gap-1 text-xs font-semibold text-court-700 hover:text-court-800"
              >
                <Plus className="w-3.5 h-3.5" /> {t('matchAddSet')}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
