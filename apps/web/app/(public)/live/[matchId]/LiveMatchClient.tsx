'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import { ChevronLeft, Loader2, QrCode, Copy, Radio, Undo2, Flag } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { MATCH_FORMAT_LABELS, gamePointLabel, type MatchFormat, type DeuceRule } from '@racketly/utils'

const GW = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000'

type ApiPlayer = { displayName: string; avatarUrl: string | null } | null

type SetScore = { player1: number; player2: number }

type ApiMatch = {
  id: string
  tournamentId: string | null
  status: 'scheduled' | 'in_progress' | 'completed' | 'walkover' | 'cancelled'
  score: SetScore[]
  winnerId: string | null
  deuceRule: DeuceRule
  initialServer: number
  format: MatchFormat
  player1Id: string | null
  player1PartnerId: string | null
  player2Id: string | null
  player2PartnerId: string | null
  refereeId: string | null
  player1: ApiPlayer
  player1Partner: ApiPlayer
  player2: ApiPlayer
  player2Partner: ApiPlayer
  tournament: { name: string; sport: string } | null
}

type LiveState = {
  completedSets: SetScore[]
  games: { player1: number; player2: number }
  points: { player1: number; player2: number }
  inTiebreak: boolean
  inSuperTiebreak: boolean
  server: 1 | 2
  matchWinner: 1 | 2 | null
  deuceRule: DeuceRule
  format: MatchFormat
}

type EloChanges = Record<string, { before: number; after: number; delta: number }>

async function fetchMatch(matchId: string, errorMessage: string): Promise<ApiMatch> {
  const res = await fetch(`/api/matches/${matchId}`, { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.data
}

function teamName(player: ApiPlayer, partner: ApiPlayer, fallback: string) {
  if (!player) return fallback
  return partner ? `${player.displayName} / ${partner.displayName}` : player.displayName
}

export function LiveMatchClient({ matchId, viewerId }: { matchId: string; viewerId: string | null }) {
  const t = useTranslations('Live.match')
  const td = useTranslations('Live.deuceRule')
  const toast = useToast()
  const socketRef = useRef<Socket | null>(null)

  const [connected, setConnected] = useState(false)
  const [live, setLive] = useState<LiveState | null>(null)
  const [eloChanges, setEloChanges] = useState<EloChanges | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [started, setStarted] = useState(false)
  const [pendingDeuceRule, setPendingDeuceRule] = useState<DeuceRule>('advantage')
  const [pendingServer, setPendingServer] = useState<1 | 2>(1)

  const {
    data: match,
    isLoading,
    isError,
  } = useQuery({ queryKey: ['live-match', matchId], queryFn: () => fetchMatch(matchId, t('loadError')) })

  const isController = useMemo(() => {
    if (!match || !viewerId) return false
    return [match.player1Id, match.player1PartnerId, match.player2Id, match.refereeId, match.player2PartnerId].includes(
      viewerId
    )
  }, [match, viewerId])

  useEffect(() => {
    if (match) {
      setPendingDeuceRule(match.deuceRule)
      setPendingServer(match.initialServer === 2 ? 2 : 1)
    }
  }, [match])

  useEffect(() => {
    const socket = io(`${GW}/live`, { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('match:join', matchId)
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('live:state', (state: LiveState & { matchId: string }) => setLive(state))
    socket.on(
      'match:finished',
      ({ eloChanges: changes }: { eloChanges: EloChanges | null }) => {
        if (changes) setEloChanges(changes)
      }
    )
    socket.on('error', ({ message }: { message: string }) => toast.error(message))

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [matchId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showQr || typeof window === 'undefined') return
    import('qrcode').then((QRCode) => {
      QRCode.toDataURL(window.location.href).then(setQrDataUrl)
    })
  }, [showQr])

  function addPoint(side: 1 | 2) {
    socketRef.current?.emit('point:add', { matchId, side })
  }

  function undoPoint() {
    socketRef.current?.emit('point:undo', { matchId })
  }

  async function startMatch() {
    try {
      const res = await fetch(`/api/matches/${matchId}/live-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deuceRule: pendingDeuceRule, initialServer: pendingServer }),
      })
      if (!res.ok) throw new Error(t('configError'))
      setStarted(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('configError'))
    }
  }

  function finishMatch() {
    if (!live || !window.confirm(t('finishConfirm'))) return
    socketRef.current?.emit('match:finish', { matchId, sets: live.completedSets })
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    toast.success(t('shareLinkCopied'))
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ink-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-white" />
      </div>
    )
  }

  if (isError || !match) {
    return (
      <div className="min-h-screen bg-ink-900 flex flex-col items-center justify-center gap-3 text-white p-6">
        <p>{t('notFound')}</p>
        <Link href="/live" className="text-court-300 text-sm underline">
          {t('backToEntry')}
        </Link>
      </div>
    )
  }

  const team1 = teamName(match.player1, match.player1Partner, 'Jugador 1')
  const team2 = teamName(match.player2, match.player2Partner, 'Jugador 2')
  const deuceRule = live?.deuceRule ?? match.deuceRule
  const format = live?.format ?? match.format
  const isFinished = match.status === 'completed' || match.status === 'walkover' || !!live?.matchWinner
  const showConfigPanel = isController && match.status === 'scheduled' && !started && !isFinished

  const completedSets = live?.completedSets ?? match.score ?? []
  const points = live?.points ?? { player1: 0, player2: 0 }
  const games = live?.games ?? { player1: 0, player2: 0 }
  const server = live?.server ?? (match.initialServer === 2 ? 2 : 1)
  const inTiebreak = live?.inTiebreak ?? false
  const inSuperTiebreak = live?.inSuperTiebreak ?? false

  return (
    <div className="min-h-screen bg-ink-900 text-white">
      <div className="flex items-center justify-between px-4 pt-6 pb-3">
        <Link href="/live" className="flex items-center gap-1 text-sm text-ink-400">
          <ChevronLeft className="w-4 h-4" /> {t('backToEntry')}
        </Link>
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', connected ? 'bg-court-500' : 'bg-ink-500')} />
          <span className="text-xs text-ink-400">{connected ? t('liveTag') : t('reconnecting')}</span>
        </div>
      </div>

      <div className="px-4 space-y-4 pb-24">
        {match.tournament && (
          <p className="text-center text-xs text-ink-400">{match.tournament.name}</p>
        )}

        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Badge tone="blue">{MATCH_FORMAT_LABELS[format]}</Badge>
          <Badge tone="violet">{td(deuceRule)}</Badge>
        </div>

        <Card className="bg-ink-800 border-ink-700 p-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamLabel name={team1} serving={server === 1 && !isFinished} />
            <span className="text-ink-500 text-xs font-bold">{t('vs')}</span>
            <TeamLabel name={team2} serving={server === 2 && !isFinished} align="right" />
          </div>

          <div className="mt-5 flex items-center justify-center gap-6">
            {completedSets.map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl font-black">
                  {s.player1}-{s.player2}
                </p>
              </div>
            ))}
            {!isFinished && (
              <div className="text-center border-l border-ink-600 pl-6">
                <p className="text-xs text-ink-400 mb-1">
                  {inSuperTiebreak
                    ? t('superTiebreakLabel')
                    : inTiebreak
                      ? t('tiebreakLabel')
                      : t('gameLabel')}
                </p>
                <p className="text-3xl font-black text-court-300">
                  {inTiebreak || inSuperTiebreak
                    ? `${points.player1}-${points.player2}`
                    : `${gamePointLabel(points, 1, deuceRule)}-${gamePointLabel(points, 2, deuceRule)}`}
                </p>
                {!inSuperTiebreak && (
                  <p className="text-xs text-ink-500 mt-1">
                    {games.player1}-{games.player2}
                  </p>
                )}
              </div>
            )}
          </div>

          {isFinished && (
            <p className="text-center text-sm text-court-300 font-bold mt-3">{t('matchFinished')}</p>
          )}
        </Card>

        {eloChanges && (
          <Card className="bg-white text-ink-900 p-4">
            <p className="text-sm font-bold mb-2">{t('eloChangesTitle')}</p>
            {Object.entries(eloChanges).map(([playerId, change]) => (
              <div key={playerId} className="flex items-center justify-between text-sm py-1">
                <span className="text-ink-500">{playerId.slice(0, 8)}…</span>
                <span>
                  {change.before} → {change.after}{' '}
                  <span className={change.delta > 0 ? 'text-court-600' : 'text-red-600'}>
                    ({change.delta > 0 ? '+' : ''}
                    {change.delta})
                  </span>
                </span>
              </div>
            ))}
          </Card>
        )}

        {showConfigPanel && (
          <Card className="bg-ink-800 border-ink-700 p-4 space-y-3">
            <p className="text-sm font-bold">{t('startConfigTitle')}</p>
            <p className="text-xs text-ink-400">{t('startConfigHint')}</p>
            <div>
              <label className="text-xs text-ink-400 block mb-1">{t('deuceRuleLabel')}</label>
              <select
                value={pendingDeuceRule}
                onChange={(e) => setPendingDeuceRule(e.target.value as DeuceRule)}
                className="w-full bg-ink-700 rounded-lg px-3 py-2 text-sm"
              >
                {(['advantage', 'golden_point', 'star_point'] as DeuceRule[]).map((r) => (
                  <option key={r} value={r}>
                    {td(r)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-400 block mb-1">{t('initialServerLabel')}</label>
              <select
                value={pendingServer}
                onChange={(e) => setPendingServer(Number(e.target.value) as 1 | 2)}
                className="w-full bg-ink-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value={1}>{team1}</option>
                <option value={2}>{team2}</option>
              </select>
            </div>
            <button
              onClick={startMatch}
              className="w-full bg-court-600 hover:bg-court-700 rounded-lg py-2.5 text-sm font-semibold"
            >
              {t('startButton')}
            </button>
          </Card>
        )}

        {isController && (started || match.status !== 'scheduled') && !isFinished && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => addPoint(1)}
                className="bg-court-600 hover:bg-court-700 rounded-xl py-4 font-bold"
              >
                {team1} {t('pointButton')}
              </button>
              <button
                onClick={() => addPoint(2)}
                className="bg-court-600 hover:bg-court-700 rounded-xl py-4 font-bold"
              >
                {team2} {t('pointButton')}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={undoPoint}
                className="flex items-center justify-center gap-1.5 border border-ink-600 rounded-xl py-2.5 text-sm text-ink-300"
              >
                <Undo2 className="w-3.5 h-3.5" /> {t('undoButton')}
              </button>
              <button
                onClick={finishMatch}
                className="flex items-center justify-center gap-1.5 bg-referee-600 hover:bg-referee-700 rounded-xl py-2.5 text-sm font-semibold"
              >
                <Flag className="w-3.5 h-3.5" /> {t('finishButton')}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setShowQr((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-ink-400"
          >
            <QrCode className="w-4 h-4" /> {showQr ? t('hideQrButton') : t('showQrButton')}
          </button>
          <button onClick={copyLink} className="flex items-center gap-1.5 text-xs text-ink-400">
            <Copy className="w-4 h-4" /> {t('copyLinkButton')}
          </button>
        </div>

        {showQr && qrDataUrl && (
          <div className="flex flex-col items-center gap-2 pt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR" className="w-40 h-40 rounded-lg" />
            <p className="text-xs text-ink-400">{t('qrHint')}</p>
          </div>
        )}

        {!connected && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-ink-500">
            <Radio className="w-3.5 h-3.5" /> {t('connecting')}
          </p>
        )}
      </div>
    </div>
  )
}

function TeamLabel({ name, serving, align }: { name: string; serving: boolean; align?: 'right' }) {
  return (
    <div className={cn('flex items-center gap-1.5', align === 'right' && 'flex-row-reverse text-right')}>
      {serving && <span className="w-2 h-2 rounded-full bg-trophy-400 shrink-0" />}
      <span className="font-bold text-sm truncate">{name}</span>
    </div>
  )
}
