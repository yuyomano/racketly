import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Modal, Alert,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { partnerApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { BackButton } from '../../components/ui/BackButton'
import { sportLabel } from '../../constants/sportIcons'
import { SportIcon } from '../../components/ui/SportIcons'

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
    open: { label: 'Abierta', color: '#059669' },
    matched: { label: 'Con compañero', color: '#7c3aed' },
    expired: { label: 'Expirada', color: '#9ca3af' },
    cancelled: { label: 'Cancelada', color: '#9ca3af' },
  }
  const s = map[status] ?? { label: status, color: '#9ca3af' }
  return (
    <View style={[styles.statusBadge, { backgroundColor: s.color + '20', borderColor: s.color }]}>
      <Text style={[styles.statusBadgeText, { color: s.color }]}>{s.label}</Text>
    </View>
  )
}

function CategoryBadge({ cat }: { cat: string }) {
  const color = cat === 'Open' ? '#7c3aed'
    : cat.startsWith('A') ? '#dc2626'
    : cat.startsWith('B') ? '#d97706'
    : '#059669'
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
      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>🤝 Find a Partner</Text>
          <Text style={styles.subtitle}>Encuentra compañeros de tu nivel</Text>
        </View>
      </View>

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
          <ActivityIndicator size="large" color="#059669" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {!myRequests || myRequests.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyText}>No has publicado solicitudes</Text>
                <Text style={styles.emptySub}>Toca "+ Buscar pareja" para publicar una</Text>
              </View>
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
                            <TouchableOpacity style={styles.bookWithBtn} onPress={() => navigation.navigate('Reservas')}>
                              <Text style={styles.bookWithBtnText}>Reservar 🎾</Text>
                            </TouchableOpacity>
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
                <SportIcon sport={s} size={13} color={sport === s ? '#fff' : '#6b7280'} />
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
        <ActivityIndicator size="large" color="#059669" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {!requests || requests.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🎾</Text>
              <Text style={styles.emptyText}>No hay solicitudes disponibles</Text>
              <Text style={styles.emptySub}>¡Sé el primero en publicar!</Text>
            </View>
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
                    <TouchableOpacity
                      style={[styles.applyBtn, applyMutation.isPending && styles.applyBtnDisabled]}
                      onPress={() => applyMutation.mutate(req.id)}
                      disabled={applyMutation.isPending}
                    >
                      <Text style={styles.applyBtnText}>¡Me apunto! 🙋</Text>
                    </TouchableOpacity>
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
                      <SportIcon sport={s} size={13} color={newRequest.sport === s ? '#fff' : '#6b7280'} />
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

            <TouchableOpacity
              style={[styles.publishBtn, createMutation.isPending && styles.publishBtnDisabled]}
              onPress={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.publishBtnText}>Publicar solicitud 🤝</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#064e3b', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { padding: 4 },
  backText: { color: '#6ee7b7', fontSize: 24, fontWeight: '300' },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: '#6ee7b7', marginTop: 2 },
  filtersContainer: { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', gap: 10 },
  sportToggle: { flexDirection: 'row', gap: 8 },
  sportToggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center' },
  sportToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sportToggleBtnActive: { backgroundColor: '#059669' },
  sportToggleText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  sportToggleTextActive: { color: '#fff' },
  cityInput: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: '#111827' },
  list: { flex: 1, padding: 12 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#064e3b', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  playerElo: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  catBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1.5 },
  catBadgeText: { fontSize: 12, fontWeight: '700' },
  cardBody: { gap: 6, marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailIcon: { fontSize: 14, width: 20 },
  detailText: { fontSize: 13, color: '#374151' },
  message: { fontSize: 13, color: '#6b7280', fontStyle: 'italic', backgroundColor: '#f9fafb', padding: 10, borderRadius: 10, marginTop: 4 },
  applyBtn: { backgroundColor: '#059669', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  applyBtnDisabled: { opacity: 0.6 },
  applyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ownBadge: { backgroundColor: '#f0fdf4', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  ownBadgeText: { color: '#059669', fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#6b7280', fontWeight: '600' },
  emptySub: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  fab: { position: 'absolute', bottom: 24, right: 20, backgroundColor: '#059669', borderRadius: 28, paddingVertical: 14, paddingHorizontal: 22, shadowColor: '#059669', shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  fabText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingTop: 28 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  modalClose: { fontSize: 22, color: '#6b7280' },
  modalForm: { padding: 20 },
  formField: { marginBottom: 20 },
  formLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  formInput: { borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827' },
  optionBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb', marginBottom: 6 },
  optionBtnActive: { backgroundColor: '#f0fdf4', borderColor: '#059669' },
  optionText: { fontSize: 14, color: '#6b7280' },
  optionTextActive: { color: '#059669', fontWeight: '600' },
  levelRow: { flexDirection: 'row', gap: 8 },
  levelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: 'transparent' },
  levelBtnActive: { backgroundColor: '#f0fdf4', borderColor: '#059669' },
  levelBtnText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  levelBtnTextActive: { color: '#059669' },
  publishBtn: { backgroundColor: '#059669', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  publishBtnDisabled: { opacity: 0.7 },
  publishBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Tabs
  mainTabs: { flexDirection: 'row', backgroundColor: '#fff', padding: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  mainTabBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: '#f3f4f6' },
  mainTabBtnActive: { backgroundColor: '#064e3b' },
  mainTabText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  mainTabTextActive: { color: '#fff' },
  // Mis solicitudes
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1.5, marginBottom: 8 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  noApplicants: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginTop: 4 },
  applicantRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 8, marginTop: 8 },
  applicantName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  applicantMsg: { fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginTop: 2 },
  applicantStatusText: { fontSize: 12, color: '#9ca3af' },
  acceptBtn: { backgroundColor: '#059669', borderRadius: 8, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  rejectBtn: { backgroundColor: '#fee2e2', borderRadius: 8, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  rejectBtnText: { color: '#dc2626', fontSize: 14, fontWeight: '800' },
  bookWithBtn: { backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  bookWithBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
})
