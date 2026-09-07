import React, { useState } from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Text } from '../../components/ui/Text'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clubsApi, membershipsApi, tournamentsApi, classesApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { BackButton } from '../../components/ui/BackButton'
import { colors } from '../../theme'
import { sportLabel } from '../../constants/sportIcons'
import { SportIcon } from '../../components/ui/SportIcons'
import { formatDate as formatTournamentDate } from '@racketly/utils'
import {
  BookingPickerOptimized,
  type Slot as PickerSlot,
} from '../../components/booking/BookingPickerOptimized'
import { BookingConfirmSheet } from '../../components/booking/BookingConfirmSheet'

export function ClubDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { clubId } = route.params
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [pickedSlot, setPickedSlot] = useState<PickerSlot | null>(null)

  const { data: club, isLoading: loadingClub } = useQuery({
    queryKey: ['club', clubId],
    queryFn: () => clubsApi.getById(clubId),
    select: (r) => r.data.data,
  })

  // Torneos abiertos de este club — para poder inscribirse desde acá, igual que se reserva una pista
  const { data: tournaments } = useQuery({
    queryKey: ['club-tournaments', clubId],
    queryFn: () => tournamentsApi.list({ clubId, status: 'open' }),
    select: (r) => r.data.data as any[],
  })

  // Planes de membresía del club
  const { data: membershipPlans } = useQuery({
    queryKey: ['membership-plans', clubId],
    queryFn: () => membershipsApi.getClubPlans(clubId),
    select: (r) => r.data.data as any[],
  })

  // Membresía activa del usuario en este club
  const { data: myMemberships } = useQuery({
    queryKey: ['my-memberships', user?.id],
    queryFn: () => membershipsApi.getMyMemberships(user!.id),
    select: (r) =>
      (r.data.data as any[]).filter((m) => m.clubId === clubId && m.status === 'active'),
    enabled: !!user?.id,
  })
  const activeMembership = myMemberships?.[0] ?? null

  const subscribeMutation = useMutation({
    mutationFn: (planId: string) => membershipsApi.subscribe({ userId: user!.id, planId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['my-memberships'] })
      Alert.alert('¡Suscrito!', res.data.message)
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo suscribir'),
  })

  // Clases con profesores (del club o externos) — cupos abiertos próximos
  const { data: classSlots } = useQuery({
    queryKey: ['club-classes', clubId],
    queryFn: () => classesApi.list(clubId),
    select: (r) => r.data.data as any[],
  })

  const studentName = user?.profile?.displayName || user?.email?.split('@')[0] || 'Alumno'

  const bookClassMutation = useMutation({
    mutationFn: ({ slotId, pay }: { slotId: string; pay: boolean }) =>
      classesApi.book(slotId, { studentUserId: user!.id, studentName, clubId, pay }),
    onSuccess: (_res, { pay }) => {
      qc.invalidateQueries({ queryKey: ['club-classes', clubId] })
      Alert.alert(
        'Cupo reservado',
        pay
          ? 'Tu clase quedó reservada y pagada.'
          : 'Tu clase quedó reservada. El pago se realiza en el club.'
      )
    },
    onError: (e: any) =>
      Alert.alert('Error', e.response?.data?.error || 'No se pudo reservar el cupo'),
  })

  function confirmBookClass(slotId: string) {
    Alert.alert('Reservar clase', '¿Cómo quieres pagar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'En el club', onPress: () => bookClassMutation.mutate({ slotId, pay: false }) },
      { text: 'Ahora, por la app', onPress: () => bookClassMutation.mutate({ slotId, pay: true }) },
    ])
  }

  const cancelClassMutation = useMutation({
    mutationFn: (bookingId: string) => classesApi.cancelBooking(bookingId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['club-classes', clubId] })
      const refunded = res.data?.refunded
      Alert.alert(
        'Cupo cancelado',
        refunded ? 'Se te devolvió el pago como crédito para el club.' : 'Tu cupo fue cancelado.'
      )
    },
    onError: (e: any) =>
      Alert.alert('Error', e.response?.data?.error || 'No se pudo cancelar el cupo'),
  })

  function confirmCancelClass(bookingId: string) {
    Alert.alert(
      'Cancelar cupo',
      'Cancelar con más de 24h de anticipación no tiene costo (si ya pagaste, se te devuelve como crédito). Con menos de 24h no hay devolución.',
      [
        { text: 'No cancelar', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: () => cancelClassMutation.mutate(bookingId),
        },
      ]
    )
  }

  const sports = club?.sports || []

  if (loadingClub) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.court600} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerInfo}>
          <Text style={styles.clubName} numberOfLines={1}>
            {club?.name}
          </Text>
          <Text style={styles.clubCity}>
            {club?.city}, {club?.country}
          </Text>
        </View>
        {club?.ratingAvg > 0 && (
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={colors.trophy400} />
            <Text style={styles.rating}>{club.ratingAvg.toFixed(1)}</Text>
          </View>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Info rápida */}
        <View style={styles.infoRow}>
          <View style={styles.infoPill}>
            <Ionicons name="location-outline" size={12} color={colors.ink600} />
            <Text style={styles.infoPillText}>{club?.address}</Text>
          </View>
          {club?.phone && (
            <View style={styles.infoPill}>
              <Ionicons name="call-outline" size={12} color={colors.ink600} />
              <Text style={styles.infoPillText}>{club.phone}</Text>
            </View>
          )}
        </View>

        {/* ── Membresía mensual ───────────────────────────────────────────── */}
        {(membershipPlans?.length ?? 0) > 0 && (
          <View style={styles.membershipSection}>
            {activeMembership ? (
              // Usuario ya es miembro
              <View style={styles.membershipActive}>
                <View style={styles.membershipActiveLeft}>
                  <Text style={styles.membershipActiveTitle}>Eres miembro</Text>
                  <Text style={styles.membershipActiveSub}>
                    {activeMembership.plan?.sessionsPerDay ?? 1} sesión/día incluida ·
                    {activeMembership.plan?.currency}{' '}
                    {Number(activeMembership.plan?.price ?? 0).toLocaleString()}/mes
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => navigation.navigate('MyMemberships')}
                  style={styles.manageMembershipBtn}
                >
                  <Text style={styles.manageMembershipBtnText}>Gestionar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Mostrar planes disponibles
              membershipPlans!.map((plan: any) => (
                <View key={plan.id} style={styles.membershipPlanCard}>
                  <View style={styles.membershipPlanLeft}>
                    <Text style={styles.membershipPlanName}>{plan.name}</Text>
                    <View style={styles.planFeatures}>
                      <View style={styles.planFeatureRow}>
                        <Ionicons name="checkmark-circle" size={13} color={colors.court600} />
                        <Text style={styles.planFeatureText}>
                          {plan.sessionsPerDay} sesión/día gratis
                        </Text>
                      </View>
                      <View style={styles.planFeatureRow}>
                        <Ionicons name="flash" size={13} color={colors.trophy600} />
                        <Text style={styles.planFeatureText}>
                          Sesiones extra al precio por jugador
                        </Text>
                      </View>
                      <View style={styles.planFeatureRow}>
                        <Ionicons name="close-circle-outline" size={13} color={colors.ink400} />
                        <Text style={styles.planFeatureText}>Cancela cuando quieras</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.membershipPlanRight}>
                    <Text style={styles.membershipPrice}>
                      {plan.currency}
                      {'\n'}
                      {Number(plan.price).toLocaleString()}
                    </Text>
                    <Text style={styles.membershipPriceSub}>/mes</Text>
                    <TouchableOpacity
                      style={[styles.subscribeBtn, subscribeMutation.isPending && { opacity: 0.6 }]}
                      onPress={() => subscribeMutation.mutate(plan.id)}
                      disabled={subscribeMutation.isPending}
                    >
                      <Text style={styles.subscribeBtnText}>Suscribirse</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Deportes disponibles — informativo; el filtro de deporte para reservar
            vive dentro de la grilla de Disponibilidad más abajo */}
        {sports.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Deportes</Text>
            <View style={styles.sportFilters}>
              {sports.map((s: string) => (
                <View key={s} style={[styles.sportChip, styles.sportChipRow]}>
                  <SportIcon sport={s} size={13} color={colors.ink500} />
                  <Text style={styles.sportChipText}>{sportLabel(s)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Torneos abiertos de este club */}
        {tournaments && tournaments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Torneos abiertos</Text>
            {tournaments.map((t: any) => (
              <TouchableOpacity
                key={t.id}
                style={styles.tournamentCard}
                onPress={() => navigation.navigate('TournamentDetail', { tournament: t })}
              >
                <View style={styles.tournamentCardTop}>
                  <SportIcon sport={t.sport} size={14} />
                  <Text style={styles.tournamentCardName} numberOfLines={1}>
                    {t.name}
                  </Text>
                </View>
                <View style={styles.tournamentCardFooter}>
                  <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                    <Text style={styles.tournamentCardDate}>
                      {formatTournamentDate(t.startDate)}
                    </Text>
                  </View>
                  <Text style={styles.tournamentCardSpots}>
                    {t.currentParticipants}/{t.maxParticipants} jugadores
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Clases con profesores del club o externos */}
        {classSlots && classSlots.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Clases</Text>
            {classSlots.map((s: any) => {
              const cupos = s.bookings?.filter((b: any) => b.status === 'active').length ?? 0
              const full = s.status === 'full' || cupos >= s.maxStudents
              const myBooking = s.bookings?.find(
                (b: any) => b.status === 'active' && b.studentUserId === user?.id
              )
              return (
                <View key={s.id} style={styles.classCard}>
                  <View style={styles.classCardTop}>
                    <Text style={styles.classProfName} numberOfLines={1}>
                      {s.professor?.name}
                    </Text>
                    <View
                      style={[
                        styles.classBadge,
                        s.professor?.isExternal ? styles.classBadgeExternal : styles.classBadgeClub,
                      ]}
                    >
                      <Text style={styles.classBadgeText}>
                        {s.professor?.isExternal ? 'Externo' : 'Del club'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.classDetailRow}>
                    <View style={styles.metaRow}>
                      <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                      <Text style={styles.classDetail}>{s.date}</Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                      <Text style={styles.classDetail}>
                        {s.startTime} ({s.durationMinutes} min)
                      </Text>
                    </View>
                    {s.court && (
                      <View style={styles.metaRow}>
                        <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                        <Text style={styles.classDetail}>{s.court.name}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.classCardFooter}>
                    <Text style={styles.classPrice}>
                      {s.currency} {Number(s.price).toLocaleString()}
                    </Text>
                    <Text style={styles.classCupos}>
                      {cupos}/{s.maxStudents} cupos
                    </Text>
                    {myBooking ? (
                      <TouchableOpacity
                        style={[
                          styles.classBookedPill,
                          cancelClassMutation.isPending && { opacity: 0.5 },
                        ]}
                        onPress={() => confirmCancelClass(myBooking.id)}
                        disabled={cancelClassMutation.isPending}
                      >
                        {myBooking.paymentStatus === 'paid' && (
                          <Ionicons name="checkmark-circle" size={13} color={colors.court600} />
                        )}
                        <Text style={styles.classBookedPillText}>
                          {myBooking.paymentStatus === 'paid' ? 'Pagada' : 'Reservada · cancelar'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.classBookBtn,
                          (full || bookClassMutation.isPending) && { opacity: 0.5 },
                        ]}
                        onPress={() => confirmBookClass(s.id)}
                        disabled={full || bookClassMutation.isPending}
                      >
                        <Text style={styles.classBookBtnText}>
                          {full ? 'Sin cupo' : 'Reservar'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.classPaymentHint}>
                    Paga ahora por la app o en el club · cancela sin costo hasta 24h antes
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {/* Disponibilidad — grid ágil pistas×horas: un toque en una celda abre la
            hoja de confirmación rápida (BookingConfirmSheet) más abajo. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Disponibilidad</Text>
          <BookingPickerOptimized
            clubId={clubId}
            selectedSlotId={pickedSlot?.id}
            onSlotSelected={(slot) => setPickedSlot(slot)}
          />
        </View>

        {/* Descripción */}
        {club?.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sobre el club</Text>
            <Text style={styles.description}>{club.description}</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Confirmación rápida — se abre al tocar una celda de la grilla */}
      <BookingConfirmSheet
        visible={!!pickedSlot}
        slot={pickedSlot}
        club={club ? { id: clubId, name: club.name } : null}
        onClose={() => setPickedSlot(null)}
        navigation={navigation}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.court900,
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  backText: { color: colors.court300, fontSize: 24, fontWeight: '300' },
  headerInfo: { flex: 1 },
  clubName: { fontSize: 18, fontWeight: '800', color: colors.white },
  clubCity: { fontSize: 13, color: colors.court300, marginTop: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rating: { fontSize: 15, color: colors.trophy400, fontWeight: '700' },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 16,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink100,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.ink100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  infoPillText: { fontSize: 12, color: colors.ink700 },
  section: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  sportFilters: { flexDirection: 'row', gap: 8 },
  sportChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.ink100,
  },
  sportChipRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sportChipActive: { backgroundColor: colors.court600 },
  sportChipText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  sportChipTextActive: { color: colors.white },
  dateRow: { flexDirection: 'row', gap: 6, paddingRight: 4 },
  dayBtn: {
    width: 52,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.ink100,
  },
  dayBtnActive: { backgroundColor: colors.court600 },
  dayName: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  dayNameActive: { color: colors.court100 },
  dayNum: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  dayNumActive: { color: colors.white },
  courtName: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  courtSurface: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  slotPrice: { fontSize: 12, color: colors.court600, fontWeight: '700' },
  slotPeakBadge: {
    fontSize: 9,
    color: colors.trophy600,
    fontWeight: '700',
    marginTop: 2,
    backgroundColor: colors.trophy100,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  // Paso 1: horarios
  timesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeBtn: {
    alignItems: 'center',
    backgroundColor: colors.court50,
    borderWidth: 1.5,
    borderColor: colors.court300,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 72,
  },
  timeBtnPeak: { backgroundColor: colors.trophy50, borderColor: colors.trophy400 },
  timeBtnActive: { backgroundColor: colors.court600, borderColor: colors.court600 },
  timeBtnText: { fontSize: 14, fontWeight: '700', color: colors.court800 },
  timeBtnTextActive: { color: colors.white },
  timeBtnPeakBadge: {
    fontSize: 9,
    color: colors.trophy600,
    fontWeight: '700',
    marginTop: 2,
    backgroundColor: colors.trophy100,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  // Paso 2: pistas disponibles en el horario elegido — grilla de 2 columnas
  courtsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  courtOption: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.ink100,
  },
  courtOptionTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  courtOptionBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  emptySlots: { alignItems: 'center', paddingVertical: 40 },
  emptySlotsText: { fontSize: 15, color: colors.textMuted, fontWeight: '600' },
  emptySlotsSubText: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  description: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  tournamentCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.ink100,
    marginBottom: 10,
  },
  tournamentCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tournamentCardName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  tournamentCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tournamentCardDate: { fontSize: 12, color: colors.textMuted },
  tournamentCardSpots: { fontSize: 12, color: colors.court600, fontWeight: '600' },
  // Membership section
  membershipSection: { marginHorizontal: 16, marginBottom: 4 },
  membershipActive: {
    backgroundColor: colors.court900,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  membershipActiveLeft: { flex: 1 },
  membershipActiveTitle: { fontSize: 15, fontWeight: '800', color: colors.white },
  membershipActiveSub: { fontSize: 12, color: colors.court300, marginTop: 2 },
  manageMembershipBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  manageMembershipBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  membershipPlanCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.court100,
    shadowColor: colors.court600,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  membershipPlanLeft: { flex: 1, paddingRight: 12 },
  membershipPlanName: { fontSize: 15, fontWeight: '800', color: colors.court900, marginBottom: 8 },
  planFeatures: { gap: 4, marginTop: 2 },
  planFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planFeatureText: { fontSize: 12, color: colors.ink700 },
  membershipPlanRight: { alignItems: 'center', minWidth: 80 },
  membershipPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.court600,
    textAlign: 'center',
    lineHeight: 22,
  },
  membershipPriceSub: { fontSize: 11, color: colors.textMuted, marginBottom: 10 },
  subscribeBtn: {
    backgroundColor: colors.court600,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  subscribeBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  // Clases
  classCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.ink100,
    marginBottom: 10,
  },
  classCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  classProfName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  classBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  classBadgeClub: { backgroundColor: colors.court100 },
  classBadgeExternal: { backgroundColor: colors.trophy100 },
  classBadgeText: { fontSize: 10, fontWeight: '700', color: colors.ink700 },
  classDetailRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  classDetail: { fontSize: 12, color: colors.textMuted },
  classCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  classPrice: { fontSize: 14, fontWeight: '800', color: colors.court600 },
  classCupos: { fontSize: 12, color: colors.textMuted, flex: 1 },
  classBookBtn: {
    backgroundColor: colors.court600,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  classBookBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  classBookedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.court50,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  classBookedPillText: { color: colors.court600, fontSize: 12, fontWeight: '700' },
  classPaymentHint: { fontSize: 10, color: colors.textMuted, marginTop: 6, fontStyle: 'italic' },
})
