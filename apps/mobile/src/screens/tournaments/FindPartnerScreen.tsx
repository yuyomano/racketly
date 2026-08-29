import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, Alert,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { partnerApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { ScreenHeader } from '../../components/ui/ScreenHeader'
import { sportLabel } from '../../constants/sportIcons'
import { SportIcon } from '../../components/ui/SportIcons'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { colors } from '../../theme'

// Skeleton de lista mientras carga — mismas dimensiones que .card (line ~477)
function CardListSkeleton() {
  return (
    <View style={{ padding: 16 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ backgroundColor: colors.white, borderRadius: 18, padding: 16, marginBottom: 12 }}>
          <Skeleton style={{ width: '60%', height: 15, marginBottom: 8 }} />
          <Skeleton style={{ width: '40%', height: 13 }} />
        </View>
      ))}
    </View>
  )
}

type MatchRequest = {
  id: string
  sport: string
  city: string
  levelMin: string
  levelMax: string
  preferredDate: string
  timePreference: string
  message: string
  status: string
  expiresAt: string
  requester: {
    id: string
    playerProfile: { displayName: string; avatarUrl: string | null; category: string; eloPadel: number }
  }
}

const CATEGORIES = ['C4', 'C3', 'C2', 'C1', 'B3', 'B2', 'B1', 'A', 'Open']
const SPORTS = ['padel', 'pickleball']

function Badge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    open: { label: 'Abierta', color: colors.primary600 },
    matched: { label: 'Con compañero', color: colors.violet600 },
    expired: { label: 'Expirada', color: colors.gray400 },
    cancelled: { label: 'Cancelada', color: colors.gray400 },
  }
  const s = map[status] ?? { label: status, color: colors.gray400 }
  return (
    <View style={[styles.statusBadge, { backgroundColor: s.color + '20', borderColor: s.color }]}>
      <Text style={[styles.statusBadgeText, { color: s.color }]}>{s.label}</Text>
    </View>
  )
}

function CategoryBadge({ cat }: { cat: string }) {
  const color = cat === 'Open' ? colors.violet600
    : cat.startsWith('A') ? colors.red600
    : cat.startsWith('B') ? colors.amber600
    : colors.primary600
  return (
    <View style={[styles.catBadge, { backgroundColor: color + '20', borderColor: color }]}>
      <Text style={[styles.catBadgeText, { color }]}>{cat}</Text>
    </View>
  )
}

type MyRequest = MatchRequest & {
  applications: {
    id: string
    applicantId: string
    message: string | null
    status: string
    createdAt: string
    applicant: { id: string; playerProfile: { displayName: string; avatarUrl: string | null; category: string; eloPadel: number } }
  }[]
}

export function FindPartnerScreen({ navigation }: { navigation: any }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'browse' | 'mine'>('browse')
  const [sport, setSport] = useState<string>('padel')
  const [city, setCity] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newRequest, setNewRequest] = useState({
    sport: 'padel',
    city: '',
    levelMin: 'C2',
    levelMax: 'C1',
    preferredDate: '',
    timePreference: 'flexible',
    message: '',
  })

  const { data: requests, isLoading } = useQuery({
    queryKey: ['partner-requests', sport, city],
    queryFn: () => partnerApi.listRequests({ sport, city: city || undefined, status: 'open' }),
    select: (r) => r.data.data as MatchRequest[],
  })

  const applyMutation = useMutation({
    mutationFn: (requestId: string) =>
      partnerApi.apply(requestId, {
        applicantId: user!.id,
        message: '¡Hola! Me interesa jugar contigo.',
      }),
    onSuccess: () => {
      Alert.alert('✅ Solicitud enviada', 'El jugador recibirá una notificación.')
      qc.invalidateQueries({ queryKey: ['partner-requests'] })
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'No se pudo enviar'),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      partnerApi.createRequest({ ...newRequest, requesterId: user!.id }),
    onSuccess: () => {
      setShowCreateModal(false)
      qc.invalidateQueries({ queryKey: ['partner-requests'] })
      qc.invalidateQueries({ queryKey: ['my-partner-requests'] })
      Alert.alert('✅ Solicitud publicada', 'Los jugadores de tu nivel la verán.')
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'Inténtalo de nuevo'),
  })

  const { data: myRequests, isLoading: loadingMine } = useQuery({
    queryKey: ['my-partner-requests', user?.id],
    queryFn: () => partnerApi.mine(user!.id),
    select: (r) => r.data.data as MyRequest[],
    enabled: !!user?.id && tab === 'mine',
  })

  const respondMutation = useMutation({
    mutationFn: ({ applicationId, status }: { applicationId: string; status: 'accepted' | 'rejected' }) =>
      partnerApi.respond(applicationId, status),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['my-partner-requests'] })
      if (vars.status === 'accepted') {
        Alert.alert('🎾 ¡Compañero confirmado!', 'Ahora ve a Reservas y crea la reserva agregándolo como acompañante.')
      }
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'No se pudo procesar'),
  })

  return (
    <View style={styles.container}>
      <ScreenHeader onBack={() => navigation.goBack()} title="🤝 Find a Partner" subtitle="Encuentra compañeros de tu nivel" />

      {/* Tabs */}
      <View style={styles.mainTabs}>
        <TouchableOpacity style={[styles.mainTabBtn, tab === 'browse' && styles.mainTabBtnActive]} onPress={() => setTab('browse')}>
          <Text style={[styles.mainTabText, tab === 'browse' && styles.mainTabTextActive]}>Buscar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.mainTabBtn, tab === 'mine' && styles.mainTabBtnActive]} onPress={() => setTab('mine')}>
          <Text style={[styles.mainTabText, tab === 'mine' && styles.mainTabTextActive]}>Mis solicitudes</Text>
        </TouchableOpacity>
      </View>

      {tab === 'mine' ? (
        loadingMine ? (
          <CardListSkeleton />
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {!myRequests || myRequests.length === 0 ? (
              <EmptyState icon="mail-open-outline" title="No has publicado solicitudes" description={'Toca "+ Buscar pareja" para publicar una'} />
            ) : (
              myRequests.map((req) => (
                <View key={req.id} style={styles.card}>
                  <View style={styles.cardBody}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailIcon}>📍</Text>
                      <Text style={styles.detailText}>{req.city} · {req.preferredDate} · {req.timePreference}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailIcon}>🎯</Text>
                      <Text style={styles.detailText}>Nivel {req.levelMin} – {req.levelMax}</Text>
                    </View>
                  </View>
                  <Badge status={req.status} />
                  {req.applications.length === 0 ? (
                    <Text style={styles.noApplicants}>Sin aplicantes todavía</Text>
                  ) : (
                    req.applications.map((app) => {
                      const profile = app.applicant?.playerProfile
                      return (
                        <View key={app.id} style={styles.applicantRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.applicantName}>{profile?.displayName || 'Jugador'}</Text>
                            {app.message ? <Text style={styles.applicantMsg}>"{app.message}"</Text> : null}
                          </View>
                          {app.status === 'pending' ? (
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <TouchableOpacity
                                style={styles.acceptBtn}
                                onPress={() => respondMutation.mutate({ applicationId: app.id, status: 'accepted' })}
                                disabled={respondMutation.isPending}
                              >
                                <Text style={styles.acceptBtnText}>✓</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.rejectBtn}
                                onPress={() => respondMutation.mutate({ applicationId: app.id, status: 'rejected' })}
                                disabled={respondMutation.isPending}
                              >
                                <Text style={styles.rejectBtnText}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          ) : app.status === 'accepted' ? (
                            <Button size="sm" onPress={() => navigation.navigate('Reservas')} style={styles.bookWithBtn}>
                              Reservar 🎾
                            </Button>
                          ) : (
                            <Text style={styles.applicantStatusText}>Rechazado</Text>
                          )}
                        </View>
                      )
                    })
                  )}
                </View>
              ))
            )}
            <View style={{ height: 100 }} />
          </ScrollView>
        )
      ) : (
      <>
      {/* Filtros */}
      <View style={styles.filtersContainer}>
        {/* Sport toggle */}
        <View style={styles.sportToggle}>
          {SPORTS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sportToggleBtn, sport === s && styles.sportToggleBtnActive]}
              onPress={() => setSport(s)}
            >
              <View style={styles.sportToggleRow}>
                <SportIcon sport={s} size={13} color={sport === s ? colors.white : colors.gray500} />
                <Text style={[styles.sportToggleText, sport === s && styles.sportToggleTextActive]}>
                  {sportLabel(s)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ciudad */}
        <TextInput
          style={styles.cityInput}
          placeholder="🔍 Filtrar por ciudad..."
          placeholderTextColor="#9ca3af"
          value={city}
          onChangeText={setCity}
        />
      </View>

      {/* Lista de solicitudes */}
      {isLoading ? (
        <CardListSkeleton />
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {!requests || requests.length === 0 ? (
            <EmptyState icon="tennisball-outline" title="No hay solicitudes disponibles" description="¡Sé el primero en publicar!" />
          ) : (
            requests.map((req) => {
              const profile = req.requester?.playerProfile
              const isOwn = req.requester?.id === user?.id
              return (
                <View key={req.id} style={styles.card}>
                  {/* Player info */}
                  <View style={styles.cardHeader}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {profile?.displayName?.[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{profile?.displayName || 'Jugador'}</Text>
                      <Text style={styles.playerElo}>ELO: {profile?.eloPadel || 1000}</Text>
                    </View>
                    {profile?.category && <CategoryBadge cat={profile.category} />}
                  </View>

                  {/* Detalles */}
                  <View style={styles.cardBody}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailIcon}>📍</Text>
                      <Text style={styles.detailText}>{req.city}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailIcon}>📅</Text>
                      <Text style={styles.detailText}>{req.preferredDate} · {req.timePreference}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailIcon}>🎯</Text>
                      <Text style={styles.detailText}>Busca nivel {req.levelMin} – {req.levelMax}</Text>
                    </View>
                    {req.message ? (
                      <Text style={styles.message}>"{req.message}"</Text>
                    ) : null}
                  </View>

                  {/* Acción */}
                  {!isOwn && (
                    <Button
                      size="sm"
                      onPress={() => applyMutation.mutate(req.id)}
                      loading={applyMutation.isPending}
                      style={styles.applyBtn}
                    >
                      ¡Me apunto! 🙋
                    </Button>
                  )}
                  {isOwn && (
                    <View style={styles.ownBadge}>
                      <Text style={styles.ownBadgeText}>Tu solicitud</Text>
                    </View>
                  )}
                </View>
              )
            })
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
      </>
      )}

      {/* FAB crear solicitud */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
      >
        <Text style={styles.fabText}>+ Buscar pareja</Text>
      </TouchableOpacity>

      {/* Modal crear solicitud */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nueva solicitud</Text>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
            {/* Sport */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Deporte</Text>
              <View style={styles.sportToggle}>
                {SPORTS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sportToggleBtn, newRequest.sport === s && styles.sportToggleBtnActive]}
                    onPress={() => setNewRequest({ ...newRequest, sport: s })}
                  >
                    <View style={styles.sportToggleRow}>
                      <SportIcon sport={s} size={13} color={newRequest.sport === s ? colors.white : colors.gray500} />
                      <Text style={[styles.sportToggleText, newRequest.sport === s && styles.sportToggleTextActive]}>
                        {sportLabel(s)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Ciudad */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Ciudad</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ej: Bogotá"
                placeholderTextColor="#9ca3af"
                value={newRequest.city}
                onChangeText={(v) => setNewRequest({ ...newRequest, city: v })}
              />
            </View>

            {/* Fecha */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Fecha preferida (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="2026-05-20"
                placeholderTextColor="#9ca3af"
                value={newRequest.preferredDate}
                onChangeText={(v) => setNewRequest({ ...newRequest, preferredDate: v })}
              />
            </View>

            {/* Horario */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Horario preferido</Text>
              {['mañana (8am-12pm)', 'tarde (12pm-6pm)', 'noche (6pm-10pm)', 'flexible'].map((h) => (
                <TouchableOpacity
                  key={h}
                  style={[styles.optionBtn, newRequest.timePreference === h && styles.optionBtnActive]}
                  onPress={() => setNewRequest({ ...newRequest, timePreference: h })}
                >
                  <Text style={[styles.optionText, newRequest.timePreference === h && styles.optionTextActive]}>{h}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Niveles */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Nivel mínimo del partner</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.levelRow}>
                  {CATEGORIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.levelBtn, newRequest.levelMin === c && styles.levelBtnActive]}
                      onPress={() => setNewRequest({ ...newRequest, levelMin: c })}
                    >
                      <Text style={[styles.levelBtnText, newRequest.levelMin === c && styles.levelBtnTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Nivel máximo del partner</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.levelRow}>
                  {CATEGORIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.levelBtn, newRequest.levelMax === c && styles.levelBtnActive]}
                      onPress={() => setNewRequest({ ...newRequest, levelMax: c })}
                    >
                      <Text style={[styles.levelBtnText, newRequest.levelMax === c && styles.levelBtnTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Mensaje */}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Mensaje (opcional)</Text>
              <TextInput
                style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Cuéntales algo sobre ti o lo que buscas..."
                placeholderTextColor="#9ca3af"
                multiline
                value={newRequest.message}
                onChangeText={(v) => setNewRequest({ ...newRequest, message: v })}
              />
            </View>

            <Button onPress={() => createMutation.mutate()} loading={createMutation.isPending} style={styles.publishBtn}>
              Publicar solicitud 🤝
            </Button>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray50 },
  filtersContainer: { backgroundColor: colors.white, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.gray200, gap: 10 },
  sportToggle: { flexDirection: 'row', gap: 8 },
  sportToggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.gray100, alignItems: 'center' },
  sportToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sportToggleBtnActive: { backgroundColor: colors.primary600 },
  sportToggleText: { fontSize: 13, fontWeight: '600', color: colors.gray500 },
  sportToggleTextActive: { color: colors.white },
  cityInput: { borderWidth: 1.5, borderColor: colors.gray200, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: colors.gray900 },
  list: { flex: 1, padding: 12 },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary900, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: colors.white, fontSize: 18, fontWeight: '700' },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '700', color: colors.gray900 },
  playerElo: { fontSize: 12, color: colors.gray500, marginTop: 1 },
  catBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1.5 },
  catBadgeText: { fontSize: 12, fontWeight: '700' },
  cardBody: { gap: 6, marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailIcon: { fontSize: 14, width: 20 },
  detailText: { fontSize: 13, color: colors.gray700 },
  message: { fontSize: 13, color: colors.gray500, fontStyle: 'italic', backgroundColor: colors.gray50, padding: 10, borderRadius: 10, marginTop: 4 },
  applyBtn: { borderRadius: 12 },
  ownBadge: { backgroundColor: colors.primary50, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  ownBadgeText: { color: colors.primary600, fontSize: 13, fontWeight: '600' },
  fab: { position: 'absolute', bottom: 24, right: 20, backgroundColor: colors.primary600, borderRadius: 28, paddingVertical: 14, paddingHorizontal: 22, shadowColor: colors.primary600, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  fabText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: colors.white },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.gray200, paddingTop: 28 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.gray900 },
  modalClose: { fontSize: 22, color: colors.gray500 },
  modalForm: { padding: 20 },
  formField: { marginBottom: 20 },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.gray700, marginBottom: 8 },
  formInput: { borderWidth: 1.5, borderColor: colors.gray300, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.gray900 },
  optionBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: colors.gray200, marginBottom: 6 },
  optionBtnActive: { backgroundColor: colors.primary50, borderColor: colors.primary600 },
  optionText: { fontSize: 14, color: colors.gray500 },
  optionTextActive: { color: colors.primary600, fontWeight: '600' },
  levelRow: { flexDirection: 'row', gap: 8 },
  levelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.gray100, borderWidth: 1.5, borderColor: 'transparent' },
  levelBtnActive: { backgroundColor: colors.primary50, borderColor: colors.primary600 },
  levelBtnText: { fontSize: 13, fontWeight: '600', color: colors.gray500 },
  levelBtnTextActive: { color: colors.primary600 },
  publishBtn: { marginTop: 8 },
  // Tabs
  mainTabs: { flexDirection: 'row', backgroundColor: colors.white, padding: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.gray200 },
  mainTabBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: colors.gray100 },
  mainTabBtnActive: { backgroundColor: colors.primary900 },
  mainTabText: { fontSize: 13, fontWeight: '700', color: colors.gray500 },
  mainTabTextActive: { color: colors.white },
  // Mis solicitudes
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1.5, marginBottom: 8 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  noApplicants: { fontSize: 12, color: colors.gray400, fontStyle: 'italic', marginTop: 4 },
  applicantRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.gray100, paddingTop: 8, marginTop: 8 },
  applicantName: { fontSize: 13, fontWeight: '700', color: colors.gray900 },
  applicantMsg: { fontSize: 12, color: colors.gray500, fontStyle: 'italic', marginTop: 2 },
  applicantStatusText: { fontSize: 12, color: colors.gray400 },
  acceptBtn: { backgroundColor: colors.primary600, borderRadius: 8, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  rejectBtn: { backgroundColor: colors.red100, borderRadius: 8, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  rejectBtnText: { color: colors.red600, fontSize: 14, fontWeight: '800' },
  bookWithBtn: { backgroundColor: colors.violet600, borderRadius: 10 },
})
