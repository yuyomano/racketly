'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import { ChevronLeft, Loader2, MapPin, Calendar, Radio, Trophy, Users } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { MATCH_FORMAT_LABELS, KNOCKOUT_STAGE_KEYS, KNOCKOUT_STAGE_LABELS, type MatchFormat, type MatchFormatOverrides } from '@racketly/utils'

const GW = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000'

type ApiPlayer = { displayName: string; avatarUrl: string | null } | null

type SetScore = { player1: number; player2: number; tiebreak?: { player1: number; player2: number } }

type ApiMatch = {
  id: string
  round: number | null
  stage: 'group' | 'knockout'
  groupNumber: number | null
  status: 'scheduled' | 'in_progress' | 'completed' | 'walkover' | 'cancelled'
  isLive: boolean
  scheduledAt: string | null
  courtId: string | null
  courtName: string | null
  score: SetScore[]
  winnerId: string | null
  player1Id: string | null
  player2Id: string | null
  player1: ApiPlayer
  player2: ApiPlayer
  player1PartnerName?: string | null
  player2PartnerName?: string | null
}

type GroupStanding = {
  playerId: string
  points: number
  played: number
  won: number
  lost: number
  setsWon: number
  setsLost: number
  gamesWon: number
  gamesLost: number
  displayName: string
  partnerName: string | null
}

type GroupData = {
  groupNumber: number
  entrants: { playerId: string; partnerId: string | null; displayName: string; partnerName: string | null }[]
  matches: ApiMatch[]
  standings: GroupStanding[]
  isComplete: boolean
}

type Participant = {
  playerId: string
  partnerId: string | null
  paymentStatus: string
  confirmed: boolean
  player?: { displayName: string; avatarUrl: string | null; category: string } | null
}

type TournamentDetail = {
  id: string
  name: string
  description: string | null
  sport: string
  format: 'round_robin' | 'elimination' | 'groups_bracket' | 'swiss'
  type: string
  category: string
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled'
  location: string
  startDate: string
  endDate: string
  entryFee: number
  currency: string
  prizeInfo: string | null
  matchFormat: MatchFormat
  matchFormatOverrides: MatchFormatOverrides | null
  participants: Participant[]
  matches: ApiMatch[]
  _count: { participants: number }
  club?: { name: string; address: string; city: string } | null
}

function pairName(m: ApiMatch, side: 'player1' | 'player2'): string {
  const player = m[side]
  const partnerName = side === 'player1' ? m.player1PartnerName : m.player2PartnerName
  if (!player) return 'BYE'
  return partnerName ? `${player.displayName} / ${partnerName}` : player.displayName
}

function formatScore(score: SetScore[]): string {
  if (!score?.length) return ''
  return score.map((s) => `${s.player1}-${s.player2}`).join(', ')
}

function formatMatchDateTime(scheduledAt: string): string {
  return new Date(scheduledAt).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function roundLabel(round: number, maxRound: number): string {
  const fromEnd = maxRound - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinal'
  if (fromEnd === 2) return 'Cuartos'
  if (fromEnd === 3) return 'Octavos'
  return `Ronda ${round}`
}

const TABS = [
  { key: 'info', label: 'Info' },
  { key: 'groups', label: 'Grupos' },
  { key: 'bracket', label: 'Cuadro' },
  { key: 'players', label: 'Jugadores' },
] as const

export function PublicTournamentClient({ clubId, tournamentId }: { clubId: string; tournamentId: string }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'info' | 'groups' | 'bracket' | 'players'>('info')
  const socketRef = useRef<Socket | null>(null)
  const joinedRef = useRef<Set<string>>(new Set())

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['public-tournament', tournamentId],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}`, { cache: 'no-store' })
      const json = await res.json()
      return json.data as TournamentDetail
    },
    refetchInterval: 20_000,
  })

  const isGroupsFormat = tournament?.format === 'groups_bracket'
  const hasStarted = tournament?.status === 'in_progress' || tournament?.status === 'completed'
  const isLive = tournament?.status === 'in_progress'

  const { data: groups } = useQuery({
    queryKey: ['public-tournament-groups', tournamentId],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/groups`, { cache: 'no-store' })
      const json = await res.json()
      return (json.data ?? []) as GroupData[]
    },
    enabled: !!isGroupsFormat && hasStarted && tab === 'groups',
    refetchInterval: isLive ? 20_000 : false,
  })

  const { data: bracket } = useQuery({
    queryKey: ['public-tournament-bracket', tournamentId],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/bracket`, { cache: 'no-store' })
      const json = await res.json()
      return (json.data ?? {}) as Record<string, ApiMatch[]>
    },
    enabled: hasStarted && tab === 'bracket',
    refetchInterval: isLive ? 20_000 : false,
  })

  // Socket en vivo: conecta solo si el torneo está en curso, y une las salas de
  // los partidos visibles para invalidar (refrescar) al recibir marcador/finalización.
  useEffect(() => {
    if (!isLive) return
    const socket = io(`${GW}/live`, { transports: ['websocket'] })
    socketRef.current = socket

    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['public-tournament', tournamentId] })
      qc.invalidateQueries({ queryKey: ['public-tournament-groups', tournamentId] })
      qc.invalidateQueries({ queryKey: ['public-tournament-bracket', tournamentId] })
    }
    socket.on('score:updated', refresh)
    socket.on('match:finished', refresh)

    return () => {
      socket.disconnect()
      socketRef.current = null
      joinedRef.current.clear()
    }
  }, [isLive, tournamentId, qc])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return
    const ids = [
      ...(tournament?.matches ?? []),
      ...(groups?.flatMap((g) => g.matches) ?? []),
      ...Object.values(bracket ?? {}).flat(),
    ].map((m) => m.id)
    for (const id of ids) {
      if (!joinedRef.current.has(id)) {
        socket.emit('match:join', id)
        joinedRef.current.add(id)
      }
    }
  }, [tournament, groups, bracket])

  if (isLoading || !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    )
  }

  const maxRound = Math.max(0, ...Object.keys(bracket ?? {}).map(Number))
  const pairs = tournament.participants.filter((p) => !p.partnerId || p.playerId < p.partnerId)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-emerald-800 text-white px-5 pt-10 pb-6">
        <Link href={`/torneos/${clubId}`} className="inline-flex items-center gap-1 text-emerald-200 text-sm mb-3 hover:text-white">
          <ChevronLeft className="w-4 h-4" /> {tournament.club?.name ?? 'Torneos del club'}
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <Badge tone={tournament.sport === 'padel' ? 'emerald' : 'amber'}>{tournament.sport}</Badge>
          <Badge tone="violet">{tournament.category}</Badge>
          {isLive && (
            <Badge tone="red" dot>
              <Radio className="w-3 h-3" /> En vivo
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-black tracking-tight">{tournament.name}</h1>
        <p className="text-emerald-200 text-sm mt-1 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> {tournament.location}
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-5 -mt-3">
        <Card className="p-1.5 flex gap-1 overflow-x-auto">
          {TABS.filter((t) => t.key !== 'groups' || isGroupsFormat).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 whitespace-nowrap text-sm font-semibold py-2.5 px-3 rounded-xl transition-colors ${
                tab === t.key ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </Card>

        <div className="py-5 space-y-4">
          {tab === 'info' && (
            <Card>
              <CardBody className="space-y-3 text-sm">
                {tournament.description && <p className="text-gray-600">{tournament.description}</p>}
                <InfoRow icon={Calendar} label="Fecha" value={new Date(tournament.startDate).toLocaleDateString('es-CO')} />
                <InfoRow icon={Trophy} label="Modalidad" value={MATCH_FORMAT_LABELS[tournament.matchFormat] ?? tournament.matchFormat} />
                {tournament.matchFormatOverrides && Object.keys(tournament.matchFormatOverrides).length > 0 && (
                  <div className="pl-6 space-y-1">
                    {KNOCKOUT_STAGE_KEYS.filter((k) => tournament.matchFormatOverrides?.[k]).map((k) => (
                      <p key={k} className="text-xs text-gray-500">
                        {KNOCKOUT_STAGE_LABELS[k]}: <span className="font-semibold text-gray-700">{MATCH_FORMAT_LABELS[tournament.matchFormatOverrides![k]!]}</span>
                      </p>
                    ))}
                  </div>
                )}
                <InfoRow icon={Users} label="Inscritos" value={`${tournament._count.participants} jugadores`} />
                {tournament.prizeInfo && <InfoRow icon={Trophy} label="Premios" value={tournament.prizeInfo} />}
                {tournament.entryFee > 0 && (
                  <InfoRow icon={Trophy} label="Inscripción" value={`${tournament.entryFee} ${tournament.currency}`} />
                )}
              </CardBody>
            </Card>
          )}

          {tab === 'groups' && (
            !hasStarted ? (
              <EmptyState icon={Users} title="El torneo aún no ha comenzado" description="Los grupos se publicarán cuando arranque." />
            ) : !groups || groups.length === 0 ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-emerald-500 animate-spin" /></div>
            ) : (
              groups.map((g) => <GroupCard key={g.groupNumber} group={g} />)
            )
          )}

          {tab === 'bracket' && (
            !hasStarted ? (
              <EmptyState icon={Trophy} title="El cuadro aún no está disponible" description="Se generará cuando el torneo pase a fase eliminatoria." />
            ) : !bracket || Object.keys(bracket).length === 0 ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-emerald-500 animate-spin" /></div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {Object.entries(bracket).sort(([a], [b]) => Number(a) - Number(b)).map(([round, matches]) => (
                  <div key={round} className="flex-shrink-0 w-64 space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide px-1">
                      {roundLabel(Number(round), maxRound)}
                    </p>
                    {matches.map((m) => <MatchCard key={m.id} match={m} />)}
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'players' && (
            <Card>
              <CardBody className="divide-y divide-gray-100">
                {pairs.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Sin inscritos todavía</p>
                ) : (
                  pairs.map((p) => (
                    <div key={p.playerId} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {p.player?.displayName}
                          {p.partnerId && ' / '}
                          {p.partnerId && tournament.participants.find((pp) => pp.playerId === p.partnerId)?.player?.displayName}
                        </p>
                        <p className="text-xs text-gray-400">{p.player?.category}</p>
                      </div>
                      {!p.confirmed && <Badge tone="amber">Pendiente pareja</Badge>}
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="w-4 h-4 text-emerald-600 shrink-0" />
      <span className="text-gray-400">{label}:</span>
      <span className="font-semibold text-gray-800">{value}</span>
    </div>
  )
}

function MatchCard({ match }: { match: ApiMatch }) {
  const done = match.status === 'completed' || match.status === 'walkover'
  const live = match.status === 'in_progress'
  return (
    <Card className={live ? 'ring-1 ring-red-300' : undefined}>
      <CardBody className="p-3 space-y-1.5">
        {live && (
          <Badge tone="red" dot className="mb-1">
            <Radio className="w-3 h-3" /> En vivo
          </Badge>
        )}
        <p className={`text-sm ${match.winnerId === match.player1Id ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
          {pairName(match, 'player1')}
        </p>
        <p className={`text-sm ${match.winnerId === match.player2Id ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
          {pairName(match, 'player2')}
        </p>
        {done && match.score?.length > 0 && (
          <p className="text-xs text-emerald-700 font-semibold pt-1">{formatScore(match.score)}</p>
        )}
        {(match.courtName || match.scheduledAt) && (
          <p className="text-[11px] text-gray-400 pt-1">
            {match.courtName && `📍 ${match.courtName}`}
            {match.courtName && match.scheduledAt && ' · '}
            {match.scheduledAt && `🕐 ${formatMatchDateTime(match.scheduledAt)}`}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

function GroupCard({ group }: { group: GroupData }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <p className="text-sm font-bold text-gray-900">Grupo {group.groupNumber}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="pb-1.5 font-semibold">Pareja</th>
                <th className="pb-1.5 font-semibold text-center">Pts</th>
                <th className="pb-1.5 font-semibold text-center">PJ</th>
                <th className="pb-1.5 font-semibold text-center">Sets</th>
              </tr>
            </thead>
            <tbody>
              {group.standings.map((s, i) => (
                <tr key={s.playerId} className="border-t border-gray-100">
                  <td className="py-1.5">
                    <span className={i < 2 ? 'font-semibold text-emerald-700' : 'text-gray-700'}>
                      {i + 1}. {s.displayName}{s.partnerName ? ` / ${s.partnerName}` : ''}
                    </span>
                  </td>
                  <td className="py-1.5 text-center font-semibold">{s.points}</td>
                  <td className="py-1.5 text-center text-gray-500">{s.played}</td>
                  <td className="py-1.5 text-center text-gray-500">{s.setsWon}-{s.setsLost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-gray-100">
          {group.matches.map((m) => (
            <div key={m.id} className="flex items-start justify-between text-xs py-1 gap-2">
              <div className="min-w-0">
                <p className="text-gray-600 leading-snug break-words">
                  {pairName(m, 'player1')} vs {pairName(m, 'player2')}
                </p>
                {(m.courtName || m.scheduledAt) && (
                  <p className="text-[10px] text-gray-400 truncate">
                    {m.courtName && `📍 ${m.courtName}`}
                    {m.courtName && m.scheduledAt && ' · '}
                    {m.scheduledAt && `🕐 ${formatMatchDateTime(m.scheduledAt)}`}
                  </p>
                )}
              </div>
              {m.status === 'in_progress' ? (
                <Badge tone="red" dot>Vivo</Badge>
              ) : m.score?.length > 0 ? (
                <span className="text-emerald-700 font-semibold shrink-0">{formatScore(m.score)}</span>
              ) : (
                <span className="text-gray-400 shrink-0">Pendiente</span>
              )}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}
