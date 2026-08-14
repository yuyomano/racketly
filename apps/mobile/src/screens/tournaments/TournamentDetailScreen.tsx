import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tournamentsApi, usersApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { BackButton } from '../../components/ui/BackButton'
import { SportIcon } from '../../components/ui/SportIcons'
import { MATCH_FORMAT_LABELS, KNOCKOUT_STAGE_KEYS, KNOCKOUT_STAGE_LABELS, type MatchFormatOverrides } from '@racketly/utils'
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  draft:       { label: 'Próximamente',      bg: '#dbeafe', color: '#1e40af' },
  open:        { label: 'Inscripción abierta', bg: '#d1fae5', color: '#065f46' },
  in_progress: { label: 'En curso',          bg: '#fef3c7', color: '#92400e' },
  completed:   { label: 'Finalizado',        bg: '#f3f4f6', color: '#6b7280' },
  cancelled:   { label: 'Cancelado',         bg: '#fee2e2', color: '#991b1b' },
}
const CATEGORY_LABELS: Record<string, string> = {
  C4: '4ª categoría', C3: '3ª categoría', C2: '2ª categoría',
  C1: '1ª categoría', B: 'B', A: 'A', S: 'Superserie',
}
const GENDER_LABELS: Record<string, string> = {
  masculino: 'Masculino', femenino: 'Femenino', mixto: 'Mixto',
}

type ApiMatch = {
  id: string
  round: number | null
  status: string
  isLive: boolean
  winnerId: string | null
  player1Id: string | null
  player2Id: string | null
  score: { player1: number; player2: number }[]
  player1: { displayName: string; avatarUrl: string | null } | null
  player2: { displayName: string; avatarUrl: string | null } | null
  player1PartnerName?: string | null
  player2PartnerName?: string | null
  scheduledAt?: string | null
  courtName?: string | null
}

type GroupStanding = {
  playerId: string
  played: number; won: number; lost: number
  setsWon: number; setsLost: number
  gamesWon: number; gamesLost: number
  points: number
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

function pairName(m: ApiMatch, side: 1 | 2): string {
  const player = side === 1 ? m.player1 : m.player2
  const partner = side === 1 ? m.player1PartnerName : m.player2PartnerName
  if (!player) return 'BYE'
  return partner ? `${player.displayName} / ${partner}` : player.displayName
}

function formatScore(score: { player1: number; player2: number }[]): string {
  if (!score || score.length === 0) return ''
  return score.map((s) => `${s.player1}-${s.player2}`).join('  ')
}

function formatMatchDateTime(scheduledAt: string): string {
  return new Date(scheduledAt).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function roundLabel(round: number, maxRound: number): string {
  const fromEnd = maxRound - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinal'
  if (fromEnd === 2) return 'Cuartos'
  if (fromEnd === 3) return 'Octavos'
  return `Ronda ${round}`
}

function BracketMatchCard({ match, onPress }: { match: ApiMatch; onPress: () => void }) {
  const p1Win = !!match.winnerId && match.winnerId === match.player1Id
  const p2Win = !!match.winnerId && match.winnerId === match.player2Id
  const isLive = match.isLive || match.status === 'in_progress'
  const tappable = !!match.player1Id && !!match.player2Id
  const scoreStr = formatScore(match.score)

  return (
    <TouchableOpacity style={bracket.match} onPress={onPress} disabled={!tappable} activeOpacity={tappable ? 0.7 : 1}>
      {(match.courtName || match.scheduledAt) && (
        <Text style={bracket.courtTime} numberOfLines={1}>
          {match.courtName ? `📍 ${match.courtName}` : ''}{match.courtName && match.scheduledAt ? '  ·  ' : ''}
          {match.scheduledAt ? `🕐 ${formatMatchDateTime(match.scheduledAt)}` : ''}
        </Text>
      )}
      <View style={[bracket.player, p1Win && bracket.winner, !match.player1Id && bracket.bye]}>
        <Text style={[bracket.playerName, p1Win && bracket.winnerText]}>
          {pairName(match, 1)}
        </Text>
      </View>
      <View style={bracket.divider} />
      <View style={[bracket.player, p2Win && bracket.winner, !match.player2Id && bracket.bye]}>
        <Text style={[bracket.playerName, p2Win && bracket.winnerText]}>
          {pairName(match, 2)}
        </Text>
      </View>
      {!!scoreStr && <Text style={bracket.score}>{scoreStr}</Text>}
      {isLive && <View style={bracket.liveDot} />}
    </TouchableOpacity>
  )
}

function BracketRound({ round, maxRound, matches, onOpenMatch }: {
  round: number; maxRound: number; matches: ApiMatch[]; onOpenMatch: (m: ApiMatch) => void
}) {
  return (
    <View style={bracket.round}>
      <Text style={bracket.roundLabel}>{roundLabel(round, maxRound)}</Text>
      {matches.map((m) => <BracketMatchCard key={m.id} match={m} onPress={() => onOpenMatch(m)} />)}
    </View>
  )
}

function GroupCard({ group, onOpenMatch }: { group: GroupData; onOpenMatch: (m: ApiMatch) => void }) {
  return (
    <View style={groupStyles.card}>
      <View style={groupStyles.header}>
        <Text style={groupStyles.title}>Grupo {group.groupNumber}</Text>
        {group.isComplete && <Text style={groupStyles.doneTag}>✅ Cerrado</Text>}
      </View>

      {/* Standings */}
      <View style={groupStyles.table}>
        <View style={groupStyles.tableHeaderRow}>
          <Text style={[groupStyles.tableCell, groupStyles.tableCellName, groupStyles.tableHeaderText]}>Pareja</Text>
          <Text style={[groupStyles.tableCell, groupStyles.tableHeaderText]}>Pts</Text>
          <Text style={[groupStyles.tableCell, groupStyles.tableHeaderText]}>PJ</Text>
          <Text style={[groupStyles.tableCell, groupStyles.tableHeaderText]}>Sets</Text>
        </View>
        {group.standings.map((s, i) => (
          <View key={s.playerId} style={groupStyles.tableRow}>
            <Text style={[groupStyles.tableCell, groupStyles.tableCellName]} numberOfLines={1}>
              {i + 1}. {s.displayName}{s.partnerName ? ` / ${s.partnerName}` : ''}
            </Text>
            <Text style={groupStyles.tableCell}>{s.points}</Text>
            <Text style={groupStyles.tableCell}>{s.played}</Text>
            <Text style={groupStyles.tableCell}>{s.setsWon}-{s.setsLost}</Text>
          </View>
        ))}
      </View>

      {/* Matches */}
      <View style={{ marginTop: 10, gap: 6 }}>
        {group.matches.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={groupStyles.matchRow}
            onPress={() => onOpenMatch(m)}
            disabled={!(m.player1Id && m.player2Id)}
          >
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={groupStyles.matchNames}>{pairName(m, 1)} vs {pairName(m, 2)}</Text>
              {(m.courtName || m.scheduledAt) && (
                <Text style={groupStyles.matchCourtTime} numberOfLines={1}>
                  {m.courtName ? `📍 ${m.courtName}` : ''}{m.courtName && m.scheduledAt ? '  ·  ' : ''}
                  {m.scheduledAt ? `🕐 ${formatMatchDateTime(m.scheduledAt)}` : ''}
                </Text>
              )}
            </View>
            <Text style={groupStyles.matchScore}>
              {m.status === 'completed' || m.status === 'walkover' ? formatScore(m.score) : (m.isLive ? '🔴 EN VIVO' : '—')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

export function TournamentDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { tournament: initial } = route.params as { tournament: any }
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'info' | 'groups' | 'bracket' | 'players'>('info')

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', initial.id],
    queryFn: () => tournamentsApi.getById(initial.id),
    select: (r) => r.data.data ?? r.data,
    initialData: { data: { data: initial } } as any,
  })

  const t = tournament ?? initial
  const isGroupsFormat = t.format === 'groups_bracket'
  const hasStarted = t.status === 'in_progress' || t.status === 'completed'
  const isOrganizer = !!user && user.id === t.organizerId

  const { data: bracketData, isLoading: loadingBracket } = useQuery({
    queryKey: ['tournament-bracket', t.id],
    queryFn: () => tournamentsApi.getBracket(t.id),
    select: (r) => r.data.data as Record<string, ApiMatch[]>,
    enabled: hasStarted && tab === 'bracket',
  })

  const { data: groupsData, isLoading: loadingGroups } = useQuery({
    queryKey: ['tournament-groups', t.id],
    queryFn: () => tournamentsApi.getGroups(t.id),
    select: (r) => r.data.data as GroupData[],
    enabled: hasStarted && isGroupsFormat && tab === 'groups',
  })

  const [showPartnerPicker, setShowPartnerPicker] = useState(false)
  const [partnerQuery, setPartnerQuery] = useState('')
  const [partnerResults, setPartnerResults] = useState<{ id: string; name: string; email: string }[]>([])
  const [searchingPartner, setSearchingPartner] = useState(false)

  const myParticipant = (t.participants ?? []).find((p: any) => p.playerId === user?.id)
  const requiresPair = t.type === 'pairs'

  const registerMutation = useMutation({
    mutationFn: (partnerId?: string) =>
      tournamentsApi.register(t.id, { playerId: user!.id, partnerId, paymentStatus: 'pending' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament', t.id] })
      setShowPartnerPicker(false)
      Alert.alert('✅ ¡Inscrito!', requiresPair
        ? 'Te has registrado. Si no elegiste pareja, tu inscripción quedará pendiente hasta completarla.'
        : 'Te has registrado en el torneo.')
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo inscribir'),
  })

  const withdrawMutation = useMutation({
    mutationFn: () => tournamentsApi.withdraw(t.id, myParticipant!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament', t.id] })
      Alert.alert('Listo', 'Te has retirado del torneo.')
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo retirar la inscripción'),
  })

  async function searchPartner(q: string) {
    setPartnerQuery(q)
    if (q.trim().length < 2) { setPartnerResults([]); return }
    setSearchingPartner(true)
    try {
      const r = await usersApi.search(q, user?.id)
      setPartnerResults(r.data?.data ?? [])
    } finally { setSearchingPartner(false) }
  }

  function confirmWithdraw() {
    Alert.alert('Retirar inscripción', '¿Seguro que quieres retirarte del torneo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Retirarme', style: 'destructive', onPress: () => withdrawMutation.mutate() },
    ])
  }

  function openMatch(m: ApiMatch) {
    if (!m.player1Id || !m.player2Id) return
    if (m.status === 'completed' || m.status === 'walkover') {
      Alert.alert(
        `${pairName(m, 1)} vs ${pairName(m, 2)}`,
        formatScore(m.score) || 'Partido finalizado'
      )
      return
    }
    navigation.navigate('LiveScoring', { matchId: m.id, isReferee: isOrganizer })
  }

  const status = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.draft
  const bracketRounds = bracketData ? Object.keys(bracketData).map(Number).sort((a, b) => a - b) : []
  const maxRound = bracketRounds.length ? Math.max(...bracketRounds) : 0

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'info', label: '📋 Info' },
    ...(isGroupsFormat ? [{ key: 'groups' as const, label: '🎯 Grupos' }] : []),
    { key: 'bracket', label: '🏆 Cuadro' },
    { key: 'players', label: '👥 Jugadores' },
  ]

  const canRegister = t.status === 'open' && user && !myParticipant
  const spotsLeft = (t.maxParticipants ?? 32) - (t.reservedSlots ?? 0) - (t.currentParticipants ?? 0)

  // Nombre del compañero de cada participante, para la pestaña de jugadores
  const nameByPlayerId = new Map<string, string>((t.participants ?? []).map((p: any) => [p.playerId, p.player?.displayName ?? 'Jugador']))
  const playerPairs = (t.participants ?? []).filter((p: any) => !p.partnerId || p.playerId < p.partnerId)

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.backBtn}><BackButton onPress={() => navigation.goBack()} /></View>
        <View style={styles.heroContent}>
          <View style={styles.sportEmoji}><SportIcon sport={t.sport} size={30} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle} numberOfLines={2}>{t.name}</Text>
            <Text style={styles.heroClub}>{t.club?.name ?? 'Club'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabs.map((tb) => (
          <TouchableOpacity
            key={tb.key}
            style={[styles.tab, tab === tb.key && styles.tabActive]}
            onPress={() => setTab(tb.key)}
          >
            <Text style={[styles.tabText, tab === tb.key && styles.tabTextActive]}>{tb.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {tab === 'info' && (
          <View style={styles.section}>
            {/* Key stats */}
            <View style={styles.statsGrid}>
              <StatCard icon="📅" label="Inicio" value={new Date(t.startDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })} />
              <StatCard icon="📅" label="Fin" value={new Date(t.endDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })} />
              <StatCard icon="👥" label="Plazas" value={`${t.currentParticipants ?? 0}/${t.maxParticipants ?? 32}`} />
              <StatCard icon="💰" label="Inscripción" value={t.entryFee > 0 ? `${t.currency ?? 'USD'} ${Number(t.entryFee).toLocaleString()}` : 'Gratis'} />
            </View>

            {/* Category */}
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Categoría</Text>
              <Text style={styles.infoValue}>{CATEGORY_LABELS[t.category] ?? t.category}</Text>
            </View>

            {/* Gender */}
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Género</Text>
              <Text style={styles.infoValue}>{GENDER_LABELS[t.genderCategory] ?? 'Mixto'}</Text>
            </View>

            {/* Format */}
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Formato</Text>
              <Text style={styles.infoValue}>
                {t.format === 'groups_bracket' ? 'Grupos + Eliminación' :
                 t.format === 'elimination' ? 'Eliminación directa' :
                 t.format === 'swiss' ? 'Suizo' :
                 t.format === 'round_robin' ? 'Round Robin' : t.format ?? 'Eliminación directa'}
              </Text>
            </View>

            {/* Match format */}
            {t.matchFormat && (
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>Modalidad de juego</Text>
                <Text style={styles.infoValue}>{MATCH_FORMAT_LABELS[t.matchFormat] ?? t.matchFormat}</Text>
                {t.matchFormatOverrides && Object.keys(t.matchFormatOverrides).length > 0 && (
                  <View style={{ marginTop: 6, gap: 2 }}>
                    {KNOCKOUT_STAGE_KEYS.filter((k) => (t.matchFormatOverrides as MatchFormatOverrides)[k]).map((k) => (
                      <Text key={k} style={styles.infoOverride}>
                        {KNOCKOUT_STAGE_LABELS[k]}: {MATCH_FORMAT_LABELS[(t.matchFormatOverrides as MatchFormatOverrides)[k]!]}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Description */}
            {t.description && (
              <View style={styles.descCard}>
                <Text style={styles.descText}>{t.description}</Text>
              </View>
            )}

            {/* Prizes */}
            {t.prizeInfo && (
              <View style={styles.prizesCard}>
                <Text style={styles.prizesTitle}>🥇 Premios</Text>
                <Text style={styles.descText}>{t.prizeInfo}</Text>
              </View>
            )}
          </View>
        )}

        {tab === 'groups' && (
          <View style={styles.section}>
            {!hasStarted ? (
              <Text style={styles.emptyText}>La fase de grupos aún no ha comenzado.</Text>
            ) : loadingGroups ? (
              <ActivityIndicator color="#059669" style={{ marginTop: 30 }} />
            ) : !groupsData || groupsData.length === 0 ? (
              <Text style={styles.emptyText}>Sin grupos generados todavía.</Text>
            ) : (
              groupsData.map((g) => <GroupCard key={g.groupNumber} group={g} onOpenMatch={openMatch} />)
            )}
          </View>
        )}

        {tab === 'bracket' && (
          !hasStarted ? (
            <Text style={[styles.emptyText, { marginTop: 30 }]}>El cuadro se genera cuando el torneo empieza.</Text>
          ) : loadingBracket ? (
            <ActivityIndicator color="#059669" style={{ marginTop: 30 }} />
          ) : bracketRounds.length === 0 ? (
            <Text style={[styles.emptyText, { marginTop: 30 }]}>
              {isGroupsFormat ? 'El cuadro de eliminación se genera al cerrar la fase de grupos.' : 'Aún no hay cuadro generado.'}
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 16 }}>
              <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8 }}>
                {bracketRounds.map((r) => (
                  <BracketRound
                    key={r}
                    round={r}
                    maxRound={maxRound}
                    matches={bracketData![String(r)]}
                    onOpenMatch={openMatch}
                  />
                ))}
              </View>
            </ScrollView>
          )
        )}

        {tab === 'players' && (
          <View style={styles.section}>
            {playerPairs.length === 0 ? (
              <Text style={styles.emptyText}>Aún no hay inscritos.</Text>
            ) : (
              playerPairs.map((p: any, i: number) => (
                <View key={p.id} style={styles.playerRow}>
                  <Text style={styles.playerSeed}>#{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.playerName}>
                      {p.player?.displayName ?? 'Jugador'}
                      {p.partnerId ? ` / ${nameByPlayerId.get(p.partnerId) ?? '?'}` : ''}
                    </Text>
                    <Text style={styles.playerCat}>
                      {p.player?.category ? (CATEGORY_LABELS[p.player.category] ?? p.player.category) : ''}
                      {requiresPair && !p.confirmed ? ' · pareja incompleta' : ''}
                    </Text>
                  </View>
                  <Text style={styles.playerRecord}>
                    {p.paymentStatus === 'paid' ? '✅ Pagado' : p.paymentStatus === 'courtesy' ? '🎁 Cortesía' : '⏳ Pendiente'}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* CTA: ya inscrito */}
      {myParticipant && (
        <View style={styles.ctaContainer}>
          <View style={styles.ctaSpotsRow}>
            <Text style={styles.ctaSpotsText}>
              {requiresPair && !myParticipant.confirmed
                ? '⚠️ Pareja incompleta — tu inscripción no es válida aún'
                : '✅ Estás inscrito en este torneo'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.ctaBtn, styles.ctaBtnDanger, withdrawMutation.isPending && styles.ctaBtnDisabled]}
            onPress={confirmWithdraw}
            disabled={withdrawMutation.isPending}
          >
            <Text style={styles.ctaBtnText}>
              {withdrawMutation.isPending ? 'Retirando...' : 'Retirarme del torneo'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CTA: inscribirse */}
      {canRegister && (
        <View style={styles.ctaContainer}>
          <View style={styles.ctaSpotsRow}>
            <Text style={styles.ctaSpotsText}>
              {spotsLeft > 0 ? `${spotsLeft} plazas disponibles` : 'Torneo completo'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.ctaBtn, (spotsLeft <= 0 || registerMutation.isPending) && styles.ctaBtnDisabled]}
            onPress={() => requiresPair ? setShowPartnerPicker(true) : registerMutation.mutate(undefined)}
            disabled={spotsLeft <= 0 || registerMutation.isPending}
          >
            <Text style={styles.ctaBtnText}>
              {registerMutation.isPending ? 'Inscribiendo...' : spotsLeft > 0 ? '✅ Inscribirse' : 'Sin plazas'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal: elegir pareja */}
      <Modal visible={showPartnerPicker} animationType="slide" transparent onRequestClose={() => setShowPartnerPicker(false)}>
        <View style={partnerModal.overlay}>
          <View style={partnerModal.sheet}>
            <Text style={partnerModal.title}>Elige tu pareja</Text>
            <Text style={partnerModal.subtitle}>Opcional — puedes inscribirte solo y completar la pareja después</Text>
            <TextInput
              style={partnerModal.input}
              placeholder="Buscar por nombre o email…"
              value={partnerQuery}
              onChangeText={searchPartner}
            />
            {searchingPartner && <ActivityIndicator style={{ marginTop: 12 }} />}
            <ScrollView style={{ maxHeight: 240, marginTop: 8 }}>
              {partnerResults.map((u) => (
                <TouchableOpacity key={u.id} style={partnerModal.resultRow}
                  onPress={() => registerMutation.mutate(u.id)}>
                  <Text style={partnerModal.resultName}>{u.name}</Text>
                  <Text style={partnerModal.resultEmail}>{u.email}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={partnerModal.soloBtn} onPress={() => registerMutation.mutate(undefined)} disabled={registerMutation.isPending}>
              <Text style={partnerModal.soloBtnText}>
                {registerMutation.isPending ? 'Inscribiendo...' : 'Inscribirme sin pareja por ahora'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={partnerModal.cancelBtn} onPress={() => setShowPartnerPicker(false)}>
              <Text style={partnerModal.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  hero: {
    backgroundColor: '#064e3b', paddingTop: 56, paddingBottom: 20, paddingHorizontal: 16,
  },
  backBtn: { marginBottom: 12 },
  backText: { color: '#6ee7b7', fontSize: 24, fontWeight: '300' },
  heroContent: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sportEmoji: { marginTop: 2 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff', lineHeight: 26 },
  heroClub: { fontSize: 13, color: '#6ee7b7', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2.5, borderBottomColor: '#059669' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#9ca3af' },
  tabTextActive: { color: '#059669' },
  section: { padding: 16, gap: 12 },
  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 20 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    flex: 1, minWidth: '44%', backgroundColor: '#fff', borderRadius: 14,
    padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  statIcon: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: 15, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  infoCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  infoLabel: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
  infoValue: { fontSize: 14, color: '#111827', fontWeight: '700' },
  infoOverride: { fontSize: 12, color: '#6b7280' },
  descCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  descText: { fontSize: 14, color: '#374151', lineHeight: 22 },
  prizesCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  prizesTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 12 },
  playerRow: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  playerSeed: { fontSize: 14, fontWeight: '800', color: '#9ca3af', width: 28 },
  playerName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  playerCat: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  playerRecord: { fontSize: 12, fontWeight: '700', color: '#059669' },
  ctaContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 34, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  ctaSpotsRow: { alignItems: 'center', marginBottom: 8 },
  ctaSpotsText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  ctaBtn: { backgroundColor: '#059669', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  ctaBtnDisabled: { backgroundColor: '#d1d5db' },
  ctaBtnDanger: { backgroundColor: '#dc2626' },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
})

const partnerModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  title: { fontSize: 17, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 4, marginBottom: 14 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  resultRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  resultName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  resultEmail: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  soloBtn: { marginTop: 14, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#059669', alignItems: 'center' },
  soloBtnText: { color: '#059669', fontWeight: '700', fontSize: 14 },
  cancelBtn: { marginTop: 8, paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { color: '#9ca3af', fontWeight: '600', fontSize: 13 },
})

const bracket = StyleSheet.create({
  round: { width: 170, gap: 8 },
  roundLabel: { fontSize: 11, fontWeight: '800', color: '#6b7280', textAlign: 'center', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  match: {
    backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    position: 'relative', paddingBottom: 4,
  },
  player: { paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  winner: { backgroundColor: '#f0fdf4' },
  bye: { opacity: 0.4 },
  playerName: { flex: 1, fontSize: 11, fontWeight: '600', color: '#374151' },
  winnerText: { color: '#059669', fontWeight: '800' },
  score: { fontSize: 10, fontWeight: '700', color: '#6b7280', textAlign: 'center', marginTop: 2 },
  courtTime: { fontSize: 9, fontWeight: '700', color: '#059669', backgroundColor: '#f0fdf4', paddingVertical: 3, paddingHorizontal: 8 },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginHorizontal: 8 },
  liveDot: {
    position: 'absolute', top: 6, right: 6,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444',
  },
})

const groupStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 15, fontWeight: '800', color: '#111827' },
  doneTag: { fontSize: 11, fontWeight: '700', color: '#059669' },
  table: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  tableHeaderRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tableHeaderText: { fontSize: 10, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f9fafb', alignItems: 'center' },
  tableCell: { width: 40, fontSize: 12, color: '#374151', fontWeight: '600', textAlign: 'center' },
  tableCellName: { flex: 1, width: undefined, textAlign: 'left', fontWeight: '700', color: '#111827' },
  matchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f9fafb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  matchNames: { fontSize: 12, color: '#374151', fontWeight: '600' },
  matchCourtTime: { fontSize: 10, color: '#9ca3af', fontWeight: '600', marginTop: 1 },
  matchScore: { fontSize: 11, fontWeight: '700', color: '#6b7280', marginLeft: 8 },
})
