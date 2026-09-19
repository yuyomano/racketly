import React, { useState, useEffect, useRef } from 'react'
import { View, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { Text } from '../../components/ui/Text'
import { Ionicons } from '@expo/vector-icons'
import { io, Socket } from 'socket.io-client'
import { useQuery } from '@tanstack/react-query'
import { matchesApi } from '../../services/api'
import { BackButton } from '../../components/ui/BackButton'
import { colors } from '../../theme'
import {
  MATCH_FORMAT_LABELS,
  DEUCE_RULE_LABELS,
  gamePointLabel,
  type MatchFormat,
  type DeuceRule,
} from '@racketly/utils'

const WS_URL = process.env.EXPO_PUBLIC_API_URL
  ? process.env.EXPO_PUBLIC_API_URL.replace('http', 'ws')
  : 'ws://localhost:3003'

type SetScore = { player1: number; player2: number }

type Match = {
  id: string
  player1: { displayName: string; category: string; eloPadel: number } | null
  player2: { displayName: string; category: string; eloPadel: number } | null
  score: SetScore[]
  status: string
  isLive: boolean
  winnerId?: string | null
  format: MatchFormat
  deuceRule: DeuceRule
  initialServer: number
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

export function LiveScoringScreen({ route, navigation }: { route: any; navigation: any }) {
  const { matchId, isReferee = false } = route.params as { matchId: string; isReferee?: boolean }
  const socketRef = useRef<Socket | null>(null)

  const [connected, setConnected] = useState(false)
  const [match, setMatch] = useState<Match | null>(null)
  const [live, setLive] = useState<LiveState | null>(null)
  const [finished, setFinished] = useState(false)
  const [eloChanges, setEloChanges] = useState<Record<
    string,
    { before: number; after: number; delta: number }
  > | null>(null)

  const { data: loadedMatch, isLoading: loadingMatch } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => matchesApi.getById(matchId),
    select: (r) => r.data.data as Match,
    enabled: matchId !== 'demo',
  })

  useEffect(() => {
    if (!loadedMatch) return
    setMatch(loadedMatch)
    if (loadedMatch.status === 'completed' || loadedMatch.status === 'walkover') {
      setFinished(true)
    }
  }, [loadedMatch])

  useEffect(() => {
    const socket = io(`${WS_URL}/live`, { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('match:join', matchId)
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('live:state', (state: LiveState) => setLive(state))

    socket.on(
      'match:finished',
      ({
        eloChanges: changes,
        winnerId,
      }: {
        sets: SetScore[]
        eloChanges: any
        winnerId: string
      }) => {
        setEloChanges(changes)
        setFinished(true)
        if (match) setMatch({ ...match, winnerId })
      }
    )

    socket.on('error', ({ message }: { message: string }) => {
      Alert.alert('Error WebSocket', message)
    })

    return () => {
      socket.disconnect()
    }
  }, [matchId])

  function addPoint(side: 1 | 2) {
    socketRef.current?.emit('point:add', { matchId, side })
  }

  function undoPoint() {
    socketRef.current?.emit('point:undo', { matchId })
  }

  function finishMatch() {
    Alert.alert(
      'Finalizar partido',
      '¿Estás seguro? Se calcularán los cambios de ELO para ambos jugadores.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: () => {
            socketRef.current?.emit('match:finish', {
              matchId,
              sets: live?.completedSets ?? [],
            })
            setFinished(true)
          },
        },
      ]
    )
  }

  // ─── Vista de resultado final ─────────────────────────────────────────────
  if (finished) {
    const finalSets = live?.completedSets ?? []
    const p1Score = finalSets.reduce((a, s) => a + (s.player1 > s.player2 ? 1 : 0), 0)
    const p2Score = finalSets.reduce((a, s) => a + (s.player2 > s.player1 ? 1 : 0), 0)

    return (
      <View style={styles.finishedContainer}>
        <Text style={styles.finishedTitle}>Partido finalizado</Text>
        <Text style={styles.finishedScore}>
          {finalSets.map((s) => `${s.player1}/${s.player2}`).join('  ')}
        </Text>
        <Text style={styles.finishedSets}>
          Sets: {p1Score} – {p2Score}
        </Text>

        {eloChanges && (
          <View style={styles.eloChangesBox}>
            <Text style={styles.eloChangesTitle}>Cambios de ELO</Text>
            {Object.entries(eloChanges).map(([playerId, change]) => (
              <View key={playerId} style={styles.eloRow}>
                <Text style={styles.eloPlayerId}>{playerId.slice(0, 8)}…</Text>
                <Text style={styles.eloBefore}>{change.before}</Text>
                <Text style={styles.eloArrow}>→</Text>
                <Text style={styles.eloAfter}>{change.after}</Text>
                <Text
                  style={[
                    styles.eloDelta,
                    { color: change.delta > 0 ? colors.court600 : colors.referee600 },
                  ]}
                >
                  {change.delta > 0 ? `+${change.delta}` : change.delta}
                </Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.backBtn2} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn2Text}>Volver a torneos</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (loadingMatch) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.court500} size="large" />
      </View>
    )
  }

  const format = live?.format ?? match?.format ?? 'best_of_3_full'
  const deuceRule = live?.deuceRule ?? match?.deuceRule ?? 'advantage'
  const server = live?.server ?? (match?.initialServer === 2 ? 2 : 1)
  const completedSets = live?.completedSets ?? []
  const games = live?.games ?? { player1: 0, player2: 0 }
  const points = live?.points ?? { player1: 0, player2: 0 }
  const inTiebreak = live?.inTiebreak ?? false
  const inSuperTiebreak = live?.inSuperTiebreak ?? false
  const p1Sets = completedSets.reduce((a, s) => a + (s.player1 > s.player2 ? 1 : 0), 0)
  const p2Sets = completedSets.reduce((a, s) => a + (s.player2 > s.player1 ? 1 : 0), 0)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>{isReferee ? 'Live Scoring' : 'EN VIVO'}</Text>
        <View
          style={[styles.connDot, { backgroundColor: connected ? colors.court500 : colors.referee500 }]}
        />
        {isReferee && <Text style={styles.refereeLabel}>Árbitro</Text>}
      </View>

      <View style={styles.formatRow}>
        <Text style={styles.formatBadge}>{MATCH_FORMAT_LABELS[format]}</Text>
        <Text style={styles.formatBadge}>{DEUCE_RULE_LABELS[deuceRule]}</Text>
      </View>

      <View style={styles.spectatorNamesRow}>
        <View style={styles.spectatorNameWrap}>
          {server === 1 && <View style={styles.serverDot} />}
          <Text style={styles.spectatorName} numberOfLines={1}>
            {match?.player1?.displayName || 'Jugador 1'}
          </Text>
        </View>
        <Text style={styles.spectatorVs}>vs</Text>
        <View style={styles.spectatorNameWrap}>
          {server === 2 && <View style={styles.serverDot} />}
          <Text style={styles.spectatorName} numberOfLines={1}>
            {match?.player2?.displayName || 'Jugador 2'}
          </Text>
        </View>
      </View>

      <View style={styles.liveBoard}>
        <View style={styles.setsCounter}>
          <Text style={styles.setsCountNum}>{p1Sets}</Text>
          <Text style={styles.setsCountLabel}>SETS</Text>
          <Text style={styles.setsCountNum}>{p2Sets}</Text>
        </View>

        <View style={styles.setsDetail}>
          {completedSets.map((s, i) => (
            <View key={i} style={styles.setDetailRow}>
              <Text style={[styles.setDetailScore, s.player1 > s.player2 && styles.setDetailWinner]}>
                {s.player1}
              </Text>
              <Text style={styles.setDetailSep}>-</Text>
              <Text style={[styles.setDetailScore, s.player2 > s.player1 && styles.setDetailWinner]}>
                {s.player2}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.gameScoreBox}>
          <Text style={styles.gameScoreLabel}>
            {inSuperTiebreak ? 'Super tie-break' : inTiebreak ? 'Tie-break' : 'Juego'}
          </Text>
          <Text style={styles.gameScoreValue}>
            {inTiebreak || inSuperTiebreak
              ? `${points.player1} - ${points.player2}`
              : `${gamePointLabel(points, 1, deuceRule)} - ${gamePointLabel(points, 2, deuceRule)}`}
          </Text>
          {!inSuperTiebreak && (
            <Text style={styles.gameScoreGames}>
              Games: {games.player1}-{games.player2}
            </Text>
          )}
        </View>

        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{connected ? 'Transmisión en vivo' : 'Reconectando...'}</Text>
        </View>
      </View>

      {isReferee ? (
        <View style={styles.refereeControls}>
          <View style={styles.pointBtnRow}>
            <TouchableOpacity style={styles.pointBtn} onPress={() => addPoint(1)}>
              <Text style={styles.pointBtnText}>
                +1 {match?.player1?.displayName || 'Jugador 1'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pointBtn} onPress={() => addPoint(2)}>
              <Text style={styles.pointBtnText}>
                +1 {match?.player2?.displayName || 'Jugador 2'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.pointBtnRow}>
            <TouchableOpacity style={styles.undoBtn} onPress={undoPoint}>
              <Ionicons name="arrow-undo-outline" size={16} color={colors.ink300} />
              <Text style={styles.undoBtnText}>Deshacer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.finishBtn} onPress={finishMatch}>
              <Ionicons name="flag-outline" size={16} color={colors.white} />
              <Text style={styles.finishBtnText}>Finalizar partido</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.matchInfo}>
          <Text style={styles.matchInfoTitle}>Partido #{matchId.slice(0, 8)}</Text>
          <Text style={styles.matchInfoSub}>Los datos se actualizan automáticamente</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink900 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.ink800,
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
  connDot: { width: 10, height: 10, borderRadius: 5 },
  refereeLabel: {
    backgroundColor: colors.referee600,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scroll: { flex: 1 },
  formatRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 12,
  },
  formatBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink300,
    backgroundColor: colors.ink700,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  // Referee
  finishBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.referee600,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  refereeControls: { paddingHorizontal: 12, paddingBottom: 24, gap: 10 },
  pointBtnRow: { flexDirection: 'row', gap: 10 },
  pointBtn: {
    flex: 1,
    backgroundColor: colors.court600,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointBtnText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  undoBtn: {
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.ink600,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoBtnText: { color: colors.ink300, fontSize: 14, fontWeight: '600' },
  // Spectator
  spectatorNamesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  spectatorNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  serverDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.court500 },
  spectatorName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
  },
  spectatorVs: { fontSize: 12, color: colors.ink400, fontWeight: '700' },
  gameScoreBox: { alignItems: 'center', marginBottom: 20 },
  gameScoreLabel: { fontSize: 12, color: colors.ink400, fontWeight: '700', letterSpacing: 1 },
  gameScoreValue: { fontSize: 40, fontWeight: '900', color: colors.white, marginTop: 4 },
  gameScoreGames: { fontSize: 13, color: colors.ink300, marginTop: 4 },
  liveBoard: { padding: 24, alignItems: 'center' },
  setsCounter: { flexDirection: 'row', alignItems: 'center', gap: 24, marginBottom: 24 },
  setsCountNum: { fontSize: 80, fontWeight: '900', color: colors.white },
  setsCountLabel: { fontSize: 12, color: colors.ink400, fontWeight: '700', letterSpacing: 2 },
  setsDetail: { flexDirection: 'row', gap: 20, marginBottom: 20 },
  setDetailRow: {
    alignItems: 'center',
    backgroundColor: colors.ink700,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  setDetailScore: { fontSize: 28, fontWeight: '800', color: colors.ink400 },
  setDetailWinner: { color: colors.court500 },
  setDetailSep: { fontSize: 16, color: colors.ink600 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.referee500 },
  liveText: { fontSize: 13, color: colors.ink300 },
  matchInfo: { padding: 24, alignItems: 'center' },
  matchInfoTitle: { fontSize: 16, color: colors.ink400, fontWeight: '600' },
  matchInfoSub: { fontSize: 12, color: colors.ink600, marginTop: 4 },
  // Finished
  finishedContainer: {
    flex: 1,
    backgroundColor: colors.court900,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  finishedTitle: { fontSize: 28, fontWeight: '900', color: colors.white, textAlign: 'center' },
  finishedScore: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.court300,
    marginTop: 12,
    letterSpacing: 4,
  },
  finishedSets: { fontSize: 16, color: colors.court200, marginTop: 8 },
  eloChangesBox: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    marginTop: 24,
    width: '100%',
  },
  eloChangesTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  eloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink50,
  },
  eloPlayerId: { flex: 1, fontSize: 12, color: colors.textMuted },
  eloBefore: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  eloArrow: { fontSize: 14, color: colors.ink300 },
  eloAfter: { fontSize: 14, color: colors.textPrimary, fontWeight: '700' },
  eloDelta: { fontSize: 14, fontWeight: '700', minWidth: 40, textAlign: 'right' },
  backBtn2: {
    marginTop: 24,
    borderWidth: 1.5,
    borderColor: colors.court300,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  backBtn2Text: { color: colors.court300, fontSize: 15, fontWeight: '600' },
})
