import React, { useState, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput, Modal, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Linking, Share,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { bookingsApi, usersApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { BackButton } from '../../components/ui/BackButton'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { colors } from '../../theme'
import { sportIcon } from '../../constants/sportIcons'
import { SportIcon } from '../../components/ui/SportIcons'

type PlayerItem = { id: string; name: string; email: string; avatarUrl?: string; city?: string }
type SetScoreItem = { player1: string; player2: string }

function formatDate(date: string) {
  // date is "YYYY-MM-DD"
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
}
function formatTime(time: string) {
  return time.slice(0, 5)
}
function bookingDateTime(b: any): Date {
  const date = b.slot?.date ?? ''
  const time = b.slot?.startTime ?? '00:00'
  const [y, mo, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, mo - 1, d, h, min)
}

const STATUS_CONFIG: Record<string, { label: string; tone: 'emerald' | 'amber' | 'red' | 'gray' }> = {
  confirmed:  { label: 'Confirmada',  tone: 'emerald' },
  pending:    { label: 'Pend. pago',  tone: 'amber' },
  cancelled:  { label: 'Cancelada',   tone: 'red' },
  completed:  { label: 'Completada',  tone: 'gray' },
}

const TABS = ['upcoming', 'past'] as const
type Tab = typeof TABS[number]

export function MyBookingsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('upcoming')

  // ── Editar jugadores ──────────────────────────────────────────────────────
  const [editBookingId, setEditBookingId] = useState<string | null>(null)
  const [editCapacity, setEditCapacity] = useState(4)
  const [editPlayers, setEditPlayers] = useState<PlayerItem[]>([])
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerQuery, setPlayerQuery] = useState('')
  const playerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function openEditPlayers(b: any) {
    const current: PlayerItem[] = (Array.isArray(b.players) ? b.players : []).map((p: any) => ({
      id: p.userId ?? p.id, name: p.name, email: '', avatarUrl: p.avatarUrl,
    }))
    setEditPlayers(current)
    setEditCapacity(b.slot?.court?.capacity || 4)
    setPlayerSearch('')
    setPlayerQuery('')
    setEditBookingId(b.id)
  }
  function onPlayerSearchChange(text: string) {
    setPlayerSearch(text)
    if (playerTimer.current) clearTimeout(playerTimer.current)
    playerTimer.current = setTimeout(() => setPlayerQuery(text), 400)
  }
  function addEditPlayer(p: PlayerItem) {
    if (editPlayers.find((x) => x.id === p.id)) return
    if (editPlayers.length >= editCapacity) {
      Alert.alert('Cupo completo', `Esta cancha admite máximo ${editCapacity} jugadores`)
      return
    }
    setEditPlayers((prev) => [...prev, p])
    setPlayerSearch(''); setPlayerQuery('')
  }
  function removeEditPlayer(id: string) {
    setEditPlayers((prev) => prev.filter((p) => p.id !== id))
  }

  const { data: playerResults, isFetching: searchingPlayers } = useQuery({
    queryKey: ['user-search-edit', playerQuery],
    queryFn: () => usersApi.search(playerQuery, user?.id),
    select: (r) => r.data.data as PlayerItem[],
    enabled: playerQuery.trim().length >= 2,
  })

  const updatePlayersMutation = useMutation({
    mutationFn: () => bookingsApi.updatePlayers(editBookingId!, editPlayers.map((p) => ({ userId: p.id, name: p.name, avatarUrl: p.avatarUrl }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
      setEditBookingId(null)
      Alert.alert('✅ Jugadores actualizados')
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo actualizar'),
  })

  // Trae TODAS las reservas del usuario — propias y aquellas donde solo lo agregaron como
  // jugador — para que sepa cuándo debe jugar y tenga el QR de acceso sin importar quién reservó.
  const { data: bookings, isLoading } = useQuery({
    queryKey: ['my-bookings', user?.id],
    queryFn: () => bookingsApi.myBookings(user!.id),
    select: (r) => r.data.data as any[],
    enabled: !!user?.id,
  })

  const payMutation = useMutation({
    mutationFn: ({ bookingId, userId }: { bookingId: string; userId: string }) =>
      bookingsApi.markPlayerPaid(bookingId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
      Alert.alert('✅ Pago registrado', 'Tu pago ha sido marcado como completado.')
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo registrar el pago'),
  })

  const leaveMutation = useMutation({
    mutationFn: ({ bookingId, userId }: { bookingId: string; userId: string }) =>
      bookingsApi.leaveBooking(bookingId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
      Alert.alert('👋 Saliste de la reserva')
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo salir de la reserva'),
  })

  function confirmLeave(bookingId: string, userId: string) {
    Alert.alert(
      'Salir de la reserva',
      'No participarás en este partido. ¿Seguro?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, salir', style: 'destructive', onPress: () => leaveMutation.mutate({ bookingId, userId }) },
      ]
    )
  }

  const cancelMutation = useMutation({
    mutationFn: (id: string) => bookingsApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
      Alert.alert('✅ Reserva cancelada', 'El reembolso se procesará según la política de cancelación.')
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo cancelar'),
  })

  // ── Ingresar resultado del partido ────────────────────────────────────────
  const [matchBooking, setMatchBooking] = useState<any | null>(null)
  const [team1Ids, setTeam1Ids] = useState<string[]>([])
  const [team2Ids, setTeam2Ids] = useState<string[]>([])
  const [sets, setSets] = useState<SetScoreItem[]>([{ player1: '', player2: '' }])

  function openMatchResult(b: any) {
    const players: any[] = Array.isArray(b.players) ? b.players : []
    const half = Math.ceil(players.length / 2)
    setTeam1Ids(players.slice(0, half).map((p) => p.userId).filter(Boolean))
    setTeam2Ids(players.slice(half).map((p) => p.userId).filter(Boolean))
    setSets([{ player1: '', player2: '' }])
    setMatchBooking(b)
  }

  function togglePlayerTeam(userId: string) {
    if (team1Ids.includes(userId)) {
      setTeam1Ids((prev) => prev.filter((id) => id !== userId))
      setTeam2Ids((prev) => (prev.includes(userId) ? prev : [...prev, userId]))
    } else {
      setTeam2Ids((prev) => prev.filter((id) => id !== userId))
      setTeam1Ids((prev) => (prev.includes(userId) ? prev : [...prev, userId]))
    }
  }

  const { data: existingMatch, isLoading: loadingMatch } = useQuery({
    queryKey: ['booking-match', matchBooking?.id],
    queryFn: () => bookingsApi.getMatch(matchBooking!.id),
    select: (r) => r.data.data as any | null,
    enabled: !!matchBooking?.id,
  })

  const submitMatchMutation = useMutation({
    mutationFn: () => bookingsApi.submitMatch(matchBooking!.id, {
      team1: team1Ids,
      team2: team2Ids,
      sets: sets
        .filter((s) => s.player1.trim() !== '' && s.player2.trim() !== '')
        .map((s) => ({ player1: Number(s.player1), player2: Number(s.player2) })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking-match', matchBooking?.id] })
      Alert.alert('📤 Resultado reportado', 'Le pedimos al rival que lo confirme. Tu nivel se actualizará cuando lo haga (o en 24h si nadie objeta).')
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo guardar el resultado'),
  })

  const confirmMatchMutation = useMutation({
    mutationFn: () => bookingsApi.confirmMatch(matchBooking!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking-match', matchBooking?.id] })
      Alert.alert('✅ Resultado confirmado', 'Se actualizó el nivel de los 4 jugadores.')
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo confirmar'),
  })

  const disputeMatchMutation = useMutation({
    mutationFn: () => bookingsApi.disputeMatch(matchBooking!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking-match', matchBooking?.id] })
      Alert.alert('🚩 Resultado objetado', 'Se descartó — cualquiera de los dos equipos puede reportarlo de nuevo.')
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo objetar'),
  })

  function confirmDispute() {
    Alert.alert(
      'Objetar resultado',
      'Esto descarta el marcador reportado — deberán reportarlo de nuevo entre los dos equipos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, objetar', style: 'destructive', onPress: () => disputeMatchMutation.mutate() },
      ]
    )
  }

  function nameFor(b: any, userId: string): string {
    return (Array.isArray(b.players) ? b.players : []).find((p: any) => p.userId === userId)?.name ?? userId
  }

  async function shareBookingWhatsApp(b: any) {
    const sport = b.slot?.court?.sport === 'pickleball' ? 'pickleball' : 'pádel'
    const emoji = sportIcon(b.slot?.court?.sport)
    const text =
      `¡Te invito a jugar ${sport}! ${emoji}\n\n` +
      `🏟️ ${b.slot?.court?.name || 'Pista'}\n` +
      `📍 ${b.slot?.court?.club?.name || 'Club'}\n` +
      `📅 ${formatDate(b.slot?.date || '')}\n` +
      `⏰ ${formatTime(b.slot?.startTime || '')} - ${formatTime(b.slot?.endTime || '')}\n\n` +
      `Reserva hecha en Racketly — ¡solo tienes que aparecer! 🚀`
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    const canOpen = await Linking.canOpenURL(url)
    if (canOpen) {
      Linking.openURL(url)
    } else {
      Share.share({ message: text })
    }
  }

  function confirmCancel(id: string) {
    Alert.alert(
      'Cancelar reserva',
      '¿Seguro? Se aplicará la política de cancelación.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, cancelar', style: 'destructive', onPress: () => cancelMutation.mutate(id) },
      ]
    )
  }

  const now = new Date()
  const filtered = (bookings?.filter((b) => {
    // Canceladas o completadas van siempre a Historial, sin importar la fecha
    // (una reserva puede cancelarse con anticipación y seguir teniendo fecha futura).
    const isHistory = b.status === 'cancelled' || b.status === 'completed' || bookingDateTime(b) < now
    return tab === 'upcoming' ? !isHistory : isHistory
  }) ?? [])
    // Próximas: la más cercana primero. Historial: la más reciente primero.
    .sort((a, b) => {
      const diff = bookingDateTime(a).getTime() - bookingDateTime(b).getTime()
      return tab === 'upcoming' ? diff : -diff
    })

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Mis Reservas</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'upcoming' ? '📅 Próximas' : '🕐 Historial'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#059669" style={{ marginTop: 60 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon={tab === 'upcoming' ? 'calendar-outline' : 'time-outline'}
            title={tab === 'upcoming' ? 'Sin reservas próximas' : 'Sin historial'}
          />
          {tab === 'upcoming' && (
            <TouchableOpacity style={styles.bookBtn} onPress={() => navigation.navigate('Home')}>
              <Text style={styles.bookBtnText}>Reservar pista →</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: b }) => {
            const status = STATUS_CONFIG[b.status] || STATUS_CONFIG.completed
            const bDate = bookingDateTime(b)
            const isOwnerBooking: boolean = b.isOwnerBooking ?? (b.userId === user?.id)
            const myPlayer = Array.isArray(b.players) ? b.players.find((p: any) => p.userId === user?.id) : undefined
            const needsPay = myPlayer?.paymentStatus === 'pending'
            // Ventana de acciones "en vivo": reserva activa (no cancelada/completada) con fecha futura.
            const isActive = bDate >= now && (b.status === 'confirmed' || b.status === 'pending')
            const sport = b.slot?.court?.sport

            return (
              <View style={styles.card}>
                {/* Sport + status */}
                <View style={styles.cardTop}>
                  <SportIcon sport={sport} size={22} />
                  <Badge tone={status.tone}>{status.label}</Badge>
                </View>

                {/* Club & court */}
                <Text style={styles.courtName}>{b.slot?.court?.name || 'Pista'}</Text>
                <Text style={styles.clubName}>{b.slot?.court?.club?.name || 'Club'}</Text>

                {/* Fecha/hora */}
                <View style={styles.timeRow}>
                  <Text style={styles.date}>{b.slot?.date ? formatDate(b.slot.date) : ''}</Text>
                  <Text style={styles.time}>{formatTime(b.slot?.startTime || '')} - {formatTime(b.slot?.endTime || '')}</Text>
                  <Text style={styles.price}>
                    {b.currency} {Number(b.amountPaid || 0).toLocaleString()}
                  </Text>
                </View>

                {/* Acciones */}
                {/* Jugadores en la reserva */}
                {Array.isArray(b.players) && b.players.length > 0 && (
                  <View style={styles.playersBlock}>
                    {b.players.map((p: any, i: number) => (
                      <View key={p.userId || i} style={styles.playersRow}>
                        <Ionicons name="person-outline" size={12} color={colors.gray400} />
                        <Text style={styles.playersText}>{p.name}</Text>
                        {p.paymentStatus === 'paid'
                          ? <Text style={styles.playerPaid}>✓ pagado</Text>
                          : p.paymentStatus === 'courtesy'
                            ? <Text style={styles.playerCourtesy}>🎁 cortesía</Text>
                            : p.paymentStatus === 'pending'
                              ? <Text style={styles.playerPending}>⚠ pendiente</Text>
                              : null}
                      </View>
                    ))}
                  </View>
                )}

                {/* Recordatorio de pago — para dueño o invitado, incluso si ya no es "activa" */}
                {needsPay && b.status !== 'cancelled' && (
                  <TouchableOpacity
                    style={[styles.payReminderBtn, payMutation.isPending && { opacity: 0.7 }]}
                    onPress={() => payMutation.mutate({ bookingId: b.id, userId: user!.id })}
                    disabled={payMutation.isPending}
                  >
                    <Text style={styles.payReminderBtnText}>
                      💳 Pagar {b.currency} {Number(myPlayer.amountOwed || 0).toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                )}

                {isActive && (
                  <>
                    {/* Invitar por WhatsApp — solo quien reservó */}
                    {isOwnerBooking && (
                      <TouchableOpacity
                        style={styles.whatsappBtn}
                        onPress={() => shareBookingWhatsApp(b)}
                      >
                        <Ionicons name="logo-whatsapp" size={16} color={colors.white} />
                        <Text style={styles.whatsappBtnText}>Invitar compañero por WhatsApp</Text>
                      </TouchableOpacity>
                    )}

                    <View style={styles.actions}>
                      {/* Solo quien reservó puede gestionar jugadores o cancelar toda la reserva.
                          Un invitado solo puede salirse él mismo. */}
                      {isOwnerBooking && (
                        <TouchableOpacity
                          style={styles.editPlayersBtn}
                          onPress={() => openEditPlayers(b)}
                        >
                          <Ionicons name="people-outline" size={14} color={colors.primary700} />
                          <Text style={styles.editPlayersBtnText}>Jugadores</Text>
                        </TouchableOpacity>
                      )}
                      {b.qrCode && (
                        <TouchableOpacity style={styles.qrBtn}>
                          <Ionicons name="qr-code-outline" size={14} color={colors.white} />
                          <Text style={styles.qrBtnText}>Ver QR</Text>
                        </TouchableOpacity>
                      )}
                      {isOwnerBooking ? (
                        <TouchableOpacity
                          style={styles.cancelBtn}
                          onPress={() => confirmCancel(b.id)}
                          disabled={cancelMutation.isPending}
                        >
                          <Text style={styles.cancelBtnText}>Cancelar</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.cancelBtn}
                          onPress={() => confirmLeave(b.id, user!.id)}
                          disabled={leaveMutation.isPending}
                        >
                          <Text style={styles.cancelBtnText}>Salir</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}

                {b.status === 'completed' && (
                  <TouchableOpacity
                    style={styles.matchResultBtn}
                    onPress={() => openMatchResult(b)}
                  >
                    <Ionicons name="trophy-outline" size={14} color={colors.primary700} />
                    <Text style={styles.matchResultBtnText}>Ingresar / ver resultado</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          }}
        />
      )}

      {/* Modal: editar jugadores */}
      <Modal visible={!!editBookingId} transparent animationType="slide" onRequestClose={() => setEditBookingId(null)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>👥 Jugadores de la reserva</Text>
              <TouchableOpacity onPress={() => setEditBookingId(null)}>
                <Ionicons name="close" size={22} color={colors.gray500} />
              </TouchableOpacity>
            </View>

            {/* Buscador + resultados van FIJOS, arriba del todo — así el teclado nunca los tapa,
                sin depender de hacer scroll hasta ellos. */}
            {editPlayers.length >= editCapacity ? (
              <View style={styles.rosterFullBox}>
                <Text style={styles.rosterFullText}>✅ Cupo completo ({editCapacity}/{editCapacity})</Text>
              </View>
            ) : (
              <View style={styles.playerSearchWrap}>
                <Ionicons name="search" size={16} color={colors.gray400} />
                <TextInput
                  style={styles.playerSearchInput}
                  placeholder="Buscar por nombre o email..."
                  placeholderTextColor={colors.gray400}
                  value={playerSearch}
                  onChangeText={onPlayerSearchChange}
                  autoFocus
                />
                {searchingPlayers && <ActivityIndicator size="small" color={colors.primary600} />}
              </View>
            )}

            {editPlayers.length < editCapacity && playerQuery.length >= 2 && (
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalResultsScroll}>
                {(playerResults ?? []).filter((p) => !editPlayers.find((x) => x.id === p.id)).length === 0 ? (
                  <Text style={styles.playerResultsEmpty}>
                    {searchingPlayers ? 'Buscando...' : 'Sin resultados'}
                  </Text>
                ) : (
                  (playerResults ?? [])
                    .filter((p) => !editPlayers.find((x) => x.id === p.id))
                    .map((p) => (
                      <TouchableOpacity key={p.id} style={styles.playerResultRow} onPress={() => addEditPlayer(p)}>
                        <View style={styles.playerResultAvatar}>
                          <Text style={styles.playerResultAvatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.playerResultName}>{p.name}</Text>
                          {p.city && <Text style={styles.playerResultSub}>{p.city}</Text>}
                        </View>
                        <Ionicons name="add-circle" size={22} color={colors.primary600} />
                      </TouchableOpacity>
                    ))
                )}
              </ScrollView>
            )}

            {/* Chips actuales y guardar — solo se ven cuando no hay resultados de búsqueda abiertos */}
            {!(playerQuery.length >= 2 && editPlayers.length < editCapacity) && (
              <>
                <Text style={styles.playersCountLabel}>{editPlayers.length}/{editCapacity} jugadores</Text>
                <View style={styles.playersChips}>
                  {editPlayers.map((p) => (
                    <View key={p.id} style={styles.playerChip}>
                      <Text style={styles.playerChipName}>{p.name}</Text>
                      <TouchableOpacity onPress={() => removeEditPlayer(p.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={16} color="#6b7280" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {editPlayers.length === 0 && (
                    <Text style={styles.modalEmptyHint}>Aún no has agregado compañeros</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.savePlayersBtn, updatePlayersMutation.isPending && { opacity: 0.7 }]}
                  onPress={() => updatePlayersMutation.mutate()}
                  disabled={updatePlayersMutation.isPending}
                >
                  {updatePlayersMutation.isPending
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.savePlayersBtnText}>Guardar jugadores</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: ingresar/ver resultado del partido */}
      <Modal visible={!!matchBooking} transparent animationType="slide" onRequestClose={() => setMatchBooking(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏆 Resultado del partido</Text>
              <TouchableOpacity onPress={() => setMatchBooking(null)}>
                <Ionicons name="close" size={22} color={colors.gray500} />
              </TouchableOpacity>
            </View>

            {(() => {
              function teamOf(m: any, userId?: string | null): 1 | 2 | null {
                if (!m || !userId) return null
                if (m.player1Id === userId || m.player1PartnerId === userId) return 1
                if (m.player2Id === userId || m.player2PartnerId === userId) return 2
                return null
              }
              const isReporter = !!existingMatch && existingMatch.reportedById === user?.id
              const myTeam = teamOf(existingMatch, user?.id)
              const reporterTeam = teamOf(existingMatch, existingMatch?.reportedById)
              const isOpponent = !!existingMatch && !isReporter && myTeam !== null && myTeam !== reporterTeam
              const teamName = (side: 1 | 2) => (side === 1
                ? [existingMatch.player1Id, existingMatch.player1PartnerId]
                : [existingMatch.player2Id, existingMatch.player2PartnerId]
              ).filter(Boolean).map((id: string) => nameFor(matchBooking, id)).join(' / ')

              return (
                <>
                  {loadingMatch ? (
                    <ActivityIndicator color={colors.primary600} style={{ marginVertical: 24 }} />
                  ) : existingMatch ? (
                    <View>
                      <View style={styles.matchTeamsRow}>
                        <Text style={styles.matchTeamName}>{teamName(1)}</Text>
                        <Text style={styles.matchVs}>vs</Text>
                        <Text style={styles.matchTeamName}>{teamName(2)}</Text>
                      </View>
                      <Text style={styles.matchScoreText}>
                        {(existingMatch.score ?? []).map((s: any) => `${s.player1}-${s.player2}`).join('  ')}
                      </Text>
                      <Text style={styles.matchWinnerText}>
                        🏆 Ganó: {teamName(existingMatch.winningSide === 1 ? 1 : 2)}
                      </Text>

                      {existingMatch.scoreConfirmed ? (
                        <Text style={styles.matchConfirmedText}>✅ Confirmado — el nivel ya se actualizó</Text>
                      ) : isOpponent ? (
                        <>
                          <Text style={styles.matchPendingText}>
                            ⏳ {nameFor(matchBooking, existingMatch.reportedById)} reportó este resultado. ¿Es correcto?
                          </Text>
                          <View style={styles.matchConfirmRow}>
                            <TouchableOpacity
                              style={[styles.matchConfirmBtn, confirmMatchMutation.isPending && { opacity: 0.7 }]}
                              onPress={() => confirmMatchMutation.mutate()}
                              disabled={confirmMatchMutation.isPending || disputeMatchMutation.isPending}
                            >
                              {confirmMatchMutation.isPending
                                ? <ActivityIndicator color="#fff" size="small" />
                                : <Text style={styles.matchConfirmBtnText}>✓ Sí, confirmar</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.matchDisputeBtn, disputeMatchMutation.isPending && { opacity: 0.7 }]}
                              onPress={confirmDispute}
                              disabled={confirmMatchMutation.isPending || disputeMatchMutation.isPending}
                            >
                              <Text style={styles.matchDisputeBtnText}>🚩 No, está mal</Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      ) : isReporter ? (
                        <>
                          <Text style={styles.matchPendingText}>
                            ⏳ Esperando que el rival confirme (o se acepta solo en 24h si nadie objeta)
                          </Text>
                          <Text style={styles.matchEditHint}>¿El marcador está mal? Corrígelo abajo y guarda de nuevo.</Text>
                        </>
                      ) : (
                        <Text style={styles.matchPendingText}>⏳ Pendiente de confirmación del rival</Text>
                      )}
                    </View>
                  ) : null}

                  {!loadingMatch && (!existingMatch || (!existingMatch.scoreConfirmed && isReporter)) && (
                    <>
                      <Text style={styles.matchSectionLabel}>Equipo 1</Text>
                <View style={styles.matchTeamChips}>
                  {(matchBooking?.players ?? []).filter((p: any) => team1Ids.includes(p.userId)).map((p: any) => (
                    <TouchableOpacity key={p.userId} style={[styles.playerChip, styles.matchChipTeam1]} onPress={() => togglePlayerTeam(p.userId)}>
                      <Text style={styles.playerChipName}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.matchSectionLabel}>Equipo 2</Text>
                <View style={styles.matchTeamChips}>
                  {(matchBooking?.players ?? []).filter((p: any) => team2Ids.includes(p.userId)).map((p: any) => (
                    <TouchableOpacity key={p.userId} style={[styles.playerChip, styles.matchChipTeam2]} onPress={() => togglePlayerTeam(p.userId)}>
                      <Text style={styles.playerChipName}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.modalEmptyHint}>Toca un jugador para moverlo de equipo</Text>

                <Text style={styles.matchSectionLabel}>Marcador por set</Text>
                {sets.map((s, i) => (
                  <View key={i} style={styles.setRow}>
                    <TextInput
                      style={styles.setInput}
                      keyboardType="number-pad"
                      placeholder="0"
                      value={s.player1}
                      onChangeText={(v) => setSets((prev) => prev.map((x, j) => j === i ? { ...x, player1: v.replace(/[^0-9]/g, '') } : x))}
                    />
                    <Text style={styles.setSeparator}>-</Text>
                    <TextInput
                      style={styles.setInput}
                      keyboardType="number-pad"
                      placeholder="0"
                      value={s.player2}
                      onChangeText={(v) => setSets((prev) => prev.map((x, j) => j === i ? { ...x, player2: v.replace(/[^0-9]/g, '') } : x))}
                    />
                    {sets.length > 1 && (
                      <TouchableOpacity onPress={() => setSets((prev) => prev.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={18} color="#9ca3af" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {sets.length < 5 && (
                  <TouchableOpacity style={styles.addSetBtn} onPress={() => setSets((prev) => [...prev, { player1: '', player2: '' }])}>
                    <Ionicons name="add" size={16} color={colors.primary700} />
                    <Text style={styles.addSetBtnText}>Agregar set</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.savePlayersBtn, submitMatchMutation.isPending && { opacity: 0.7 }]}
                  onPress={() => submitMatchMutation.mutate()}
                  disabled={submitMatchMutation.isPending || team1Ids.length === 0 || team2Ids.length === 0}
                >
                  {submitMatchMutation.isPending
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.savePlayersBtnText}>{existingMatch ? 'Corregir resultado' : 'Guardar resultado'}</Text>
                  }
                </TouchableOpacity>
                    </>
                  )}
                </>
              )
            })()}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    backgroundColor: '#064e3b', paddingTop: 60, paddingBottom: 16,
    paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn: { padding: 4 },
  backText: { color: '#6ee7b7', fontSize: 24, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: '#fff' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2.5, borderBottomColor: '#059669' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#9ca3af' },
  tabTextActive: { color: '#059669' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#6b7280', fontWeight: '600' },
  bookBtn: { marginTop: 16, backgroundColor: '#059669', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  sportIcon: { fontSize: 24 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '700' },
  courtName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  clubName: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  date: { fontSize: 13, color: '#374151', fontWeight: '600', backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  time: { fontSize: 13, color: '#374151', fontWeight: '700' },
  price: { fontSize: 13, color: '#059669', fontWeight: '800', marginLeft: 'auto' },
  whatsappBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#25D366', borderRadius: 10,
    paddingVertical: 10, marginTop: 14,
  },
  whatsappIcon: { fontSize: 16 },
  whatsappBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  qrBtn: { flex: 1, flexDirection: 'row', gap: 6, backgroundColor: '#064e3b', borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  qrBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: '#fca5a5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },
  editPlayersBtn: { flex: 1, flexDirection: 'row', gap: 6, borderWidth: 1.5, borderColor: '#bbf7d0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0fdf4' },
  editPlayersBtnText: { color: colors.primary700, fontSize: 13, fontWeight: '600' },
  playersBlock: { marginTop: 8, gap: 4 },
  playersRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playersText: { fontSize: 12, color: colors.gray400, flex: 1 },
  playerPaid: { fontSize: 11, color: '#059669', fontWeight: '600' },
  playerPending: { fontSize: 11, color: '#d97706', fontWeight: '600' },
  playerCourtesy: { fontSize: 11, color: '#7c3aed', fontWeight: '600' },
  payReminderBtn: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  payReminderBtnText: { color: '#92400e', fontSize: 13, fontWeight: '700' },
  // Modal editar jugadores
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  modalEmptyHint: { fontSize: 13, color: colors.gray400, marginBottom: 8 },
  playersCountLabel: { fontSize: 12, color: colors.gray400, fontWeight: '600', marginBottom: 6 },
  modalResultsScroll: { maxHeight: 260, marginTop: 6 },
  rosterFullBox: { backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: '#059669' },
  rosterFullText: { fontSize: 12, color: '#065f46', fontWeight: '700' },
  playersChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  playerChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#bbf7d0' },
  playerChipName: { fontSize: 13, color: '#065f46', fontWeight: '600' },
  playerSearchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f9fafb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8 },
  playerSearchInput: { flex: 1, fontSize: 14, color: '#111827' },
  playerResults: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden', marginBottom: 12 },
  playerResultsEmpty: { padding: 12, fontSize: 13, color: colors.gray400, textAlign: 'center' },
  playerResultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  playerResultAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary600, alignItems: 'center', justifyContent: 'center' },
  playerResultAvatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  playerResultName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  playerResultSub: { fontSize: 12, color: colors.gray400, marginTop: 1 },
  savePlayersBtn: { backgroundColor: '#059669', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  savePlayersBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Resultado del partido
  matchResultBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4',
    borderRadius: 10, paddingVertical: 10, marginTop: 10,
  },
  matchResultBtnText: { color: colors.primary700, fontSize: 13, fontWeight: '700' },
  matchTeamsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  matchTeamName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827', textAlign: 'center' },
  matchVs: { fontSize: 12, color: colors.gray400, fontWeight: '600' },
  matchScoreText: { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center', marginVertical: 8 },
  matchWinnerText: { fontSize: 13, fontWeight: '700', color: '#059669', textAlign: 'center' },
  matchEditHint: { fontSize: 12, color: colors.gray400, textAlign: 'center', marginTop: 10, marginBottom: 6 },
  matchConfirmedText: { fontSize: 13, fontWeight: '700', color: '#059669', textAlign: 'center', marginTop: 10 },
  matchPendingText: { fontSize: 13, fontWeight: '600', color: '#d97706', textAlign: 'center', marginTop: 10 },
  matchConfirmRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  matchConfirmBtn: { flex: 1, backgroundColor: '#059669', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  matchConfirmBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  matchDisputeBtn: { flex: 1, borderWidth: 1.5, borderColor: '#fca5a5', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  matchDisputeBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
  matchSectionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 14, marginBottom: 6 },
  matchTeamChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  matchChipTeam1: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  matchChipTeam2: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  setInput: {
    width: 56, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#111827',
    backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 8,
  },
  setSeparator: { fontSize: 16, color: colors.gray400, fontWeight: '700' },
  addSetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 12 },
  addSetBtnText: { color: colors.primary700, fontSize: 13, fontWeight: '600' },
})
