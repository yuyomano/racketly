import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { Text } from '../../components/ui/Text'
import { Ionicons } from '@expo/vector-icons'
import { io, Socket } from 'socket.io-client'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth.store'
import { matchesApi } from '../../services/api'
import { BackButton } from '../../components/ui/BackButton'
import { colors } from '../../theme'

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
}

function ScoreInput({
  value,
  onInc,
  onDec,
  disabled,
}: {
  value: number
  onInc: () => void
  onDec: () => void
  disabled: boolean
}) {
  return (
    <View style={styles.scoreControl}>
      <TouchableOpacity
        style={[styles.scoreBtn, styles.scoreBtnDec, disabled && styles.scoreBtnDisabled]}
        onPress={onDec}
        disabled={disabled}
      >
        <Text style={styles.scoreBtnText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.scoreValue}>{value}</Text>
      <TouchableOpacity
        style={[styles.scoreBtn, styles.scoreBtnInc, disabled && styles.scoreBtnDisabled]}
        onPress={onInc}
        disabled={disabled}
      >
        <Text style={styles.scoreBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  )
}

export function LiveScoringScreen({ route, navigation }: { route: any; navigation: any }) {
  const { matchId, isReferee = false } = route.params as { matchId: string; isReferee?: boolean }
  const { user } = useAuthStore()
  const socketRef = useRef<Socket | null>(null)

  const [connected, setConnected] = useState(false)
  const [match, setMatch] = useState<Match | null>(null)
  const [sets, setSets] = useState<SetScore[]>([{ player1: 0, player2: 0 }])
  const [finished, setFinished] = useState(false)
  const [eloChanges, setEloChanges] = useState<Record<
    string,
    { before: number; after: number; delta: number }
  > | null>(null)
  const [spectatorScore, setSpectatorScore] = useState<SetScore[]>([])

  const { data: loadedMatch, isLoading: loadingMatch } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => matchesApi.getById(matchId),
    select: (r) => r.data.data as Match,
    enabled: matchId !== 'demo',
  })

  useEffect(() => {
    if (!loadedMatch) return
    setMatch(loadedMatch)
    const existingScore =
      Array.isArray(loadedMatch.score) && loadedMatch.score.length > 0
        ? loadedMatch.score
        : [{ player1: 0, player2: 0 }]
    setSets(existingScore)
    setSpectatorScore(existingScore)
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

    // Espectador recibe actualizaciones
    socket.on('score:updated', ({ sets: updatedSets }: { sets: SetScore[] }) => {
      setSpectatorScore(updatedSets)
    })

    socket.on(
      'match:finished',
      ({
        sets: finalSets,
        eloChanges: changes,
        winnerId,
      }: {
        sets: SetScore[]
        eloChanges: any
        winnerId: string
      }) => {
        setSpectatorScore(finalSets)
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

  function updateSet(setIndex: number, player: 'player1' | 'player2', delta: number) {
    setSets((prev) => {
      const next = [...prev]
      const current = next[setIndex][player] + delta
      next[setIndex] = { ...next[setIndex], [player]: Math.max(0, current) }
      return next
    })
  }

  function addSet() {
    setSets((prev) => [...prev, { player1: 0, player2: 0 }])
  }

  function removeSet() {
    if (sets.length > 1) setSets((prev) => prev.slice(0, -1))
  }

  function sendScore() {
    socketRef.current?.emit('score:update', { matchId, sets })
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
            socketRef.current?.emit('match:finish', { matchId, sets })
            setFinished(true)
          },
        },
      ]
    )
  }

  // ─── Vista de resultado final ─────────────────────────────────────────────
  if (finished) {
    const finalSets = isReferee ? sets : spectatorScore
    const p1Score = finalSets.reduce((a, s) => a + (s.player1 > s.player2 ? 1 : 0), 0)
    const p2Score = finalSets.reduce((a, s) => a + (s.player2 > s.player1 ? 1 : 0), 0)

    return (
      <View style={styles.finishedContainer}>
        <Text style={styles.finishedTitle}>Partido finalizado</Text>
        <Text style={styles.finishedScore}>
          {finalSets.map((s, i) => `${s.player1}/${s.player2}`).join('  ')}
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

  // ─── Vista árbitro ─────────────────────────────────────────────────────────
  if (isReferee) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Live Scoring</Text>
            <View
              style={[
                styles.connDot,
                { backgroundColor: connected ? colors.court500 : colors.referee500 },
              ]}
            />
          </View>
          <Text style={styles.refereeLabel}>Árbitro</Text>
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Sets */}
          {sets.map((set, i) => (
            <View key={i} style={styles.setCard}>
              <View style={styles.setHeader}>
                <Text style={styles.setTitle}>Set {i + 1}</Text>
                {i === sets.length - 1 && sets.length > 1 && (
                  <TouchableOpacity onPress={removeSet}>
                    <Text style={styles.removeSetText}>Eliminar</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.setRow}>
                {/* Jugador 1 */}
                <View style={styles.playerScore}>
                  <Text style={styles.playerLabel} numberOfLines={1}>
                    {match?.player1?.displayName || 'Jugador 1'}
                  </Text>
                  <ScoreInput
                    value={set.player1}
                    onInc={() => updateSet(i, 'player1', 1)}
                    onDec={() => updateSet(i, 'player1', -1)}
                    disabled={false}
                  />
                </View>

                <Text style={styles.setVs}>VS</Text>

                {/* Jugador 2 */}
                <View style={styles.playerScore}>
                  <Text style={styles.playerLabel} numberOfLines={1}>
                    {match?.player2?.displayName || 'Jugador 2'}
                  </Text>
                  <ScoreInput
                    value={set.player2}
                    onInc={() => updateSet(i, 'player2', 1)}
                    onDec={() => updateSet(i, 'player2', -1)}
                    disabled={false}
                  />
                </View>
              </View>
            </View>
          ))}

          {/* Añadir set */}
          <TouchableOpacity style={styles.addSetBtn} onPress={addSet}>
            <Text style={styles.addSetText}>+ Añadir set</Text>
          </TouchableOpacity>

          {/* Botones de acción */}
          <TouchableOpacity
            style={[styles.updateBtn, !connected && styles.updateBtnDisabled]}
            onPress={sendScore}
            disabled={!connected}
          >
            <Ionicons name="radio-outline" size={16} color={colors.white} />
            <Text style={styles.updateBtnText}>Enviar marcador en vivo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.finishBtn} onPress={finishMatch}>
            <Ionicons name="flag-outline" size={16} color={colors.white} />
            <Text style={styles.finishBtnText}>Finalizar partido</Text>
          </TouchableOpacity>

          <View style={{ height: 60 }} />
        </ScrollView>
      </View>
    )
  }

  // ─── Vista espectador ──────────────────────────────────────────────────────
  if (loadingMatch) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.court500} size="large" />
      </View>
    )
  }

  const displaySets = spectatorScore.length > 0 ? spectatorScore : [{ player1: 0, player2: 0 }]
  const p1Sets = displaySets.reduce((a, s) => a + (s.player1 > s.player2 ? 1 : 0), 0)
  const p2Sets = displaySets.reduce((a, s) => a + (s.player2 > s.player1 ? 1 : 0), 0)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>EN VIVO</Text>
        <View
          style={[styles.connDot, { backgroundColor: connected ? colors.court500 : colors.ink300 }]}
        />
      </View>

      {(match?.player1 || match?.player2) && (
        <View style={styles.spectatorNamesRow}>
          <Text style={styles.spectatorName} numberOfLines={1}>
            {match?.player1?.displayName || 'Jugador 1'}
          </Text>
          <Text style={styles.spectatorVs}>vs</Text>
          <Text style={styles.spectatorName} numberOfLines={1}>
            {match?.player2?.displayName || 'Jugador 2'}
          </Text>
        </View>
      )}

      <View style={styles.liveBoard}>
        {/* Marcador global */}
        <View style={styles.setsCounter}>
          <Text style={styles.setsCountNum}>{p1Sets}</Text>
          <Text style={styles.setsCountLabel}>SETS</Text>
          <Text style={styles.setsCountNum}>{p2Sets}</Text>
        </View>

        {/* Detalle de sets */}
        <View style={styles.setsDetail}>
          {displaySets.map((s, i) => (
            <View key={i} style={styles.setDetailRow}>
              <Text
                style={[styles.setDetailScore, s.player1 > s.player2 && styles.setDetailWinner]}
              >
                {s.player1}
              </Text>
              <Text style={styles.setDetailSep}>-</Text>
              <Text
                style={[styles.setDetailScore, s.player2 > s.player1 && styles.setDetailWinner]}
              >
                {s.player2}
              </Text>
            </View>
          ))}
        </View>

        {/* Estado */}
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            {connected ? 'Transmisión en vivo' : 'Reconectando...'}
          </Text>
        </View>
      </View>

      <View style={styles.matchInfo}>
        <Text style={styles.matchInfoTitle}>Partido #{matchId.slice(0, 8)}</Text>
        <Text style={styles.matchInfoSub}>Los datos se actualizan automáticamente</Text>
      </View>
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
  // Referee
  setCard: { margin: 12, backgroundColor: colors.ink700, borderRadius: 20, padding: 20 },
  setHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  setTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  removeSetText: { color: colors.referee500, fontSize: 13 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playerScore: { flex: 1, alignItems: 'center', gap: 10 },
  playerLabel: { fontSize: 13, color: colors.ink300, fontWeight: '600', textAlign: 'center' },
  setVs: { fontSize: 14, color: colors.ink600, fontWeight: '700' },
  scoreControl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreBtnInc: { backgroundColor: colors.court600 },
  scoreBtnDec: { backgroundColor: colors.ink600 },
  scoreBtnDisabled: { opacity: 0.4 },
  scoreBtnText: { color: colors.white, fontSize: 22, fontWeight: '700', lineHeight: 26 },
  scoreValue: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.white,
    minWidth: 50,
    textAlign: 'center',
  },
  addSetBtn: {
    margin: 12,
    borderWidth: 1.5,
    borderColor: colors.ink600,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  addSetText: { color: colors.ink400, fontSize: 14, fontWeight: '600' },
  updateBtn: {
    margin: 12,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.court600,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBtnDisabled: { opacity: 0.5 },
  updateBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  finishBtn: {
    marginHorizontal: 12,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.referee600,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  // Spectator
  spectatorNamesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  spectatorName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
  },
  spectatorVs: { fontSize: 12, color: colors.ink400, fontWeight: '700' },
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
