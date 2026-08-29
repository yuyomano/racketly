import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clubsApi, membershipsApi, tournamentsApi, classesApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { ScreenHeader } from '../../components/ui/ScreenHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { colors } from '../../theme'
import { sportLabel } from '../../constants/sportIcons'
import { SportIcon } from '../../components/ui/SportIcons'
import { formatDate as formatTournamentDate } from '@racketly/utils'
import { BookingPickerOptimized, type Slot as PickerSlot } from '../../components/booking/BookingPickerOptimized'
import { BookingConfirmSheet } from '../../components/booking/BookingConfirmSheet'

function formatDate(d: Date) {
  return d.toISOString().split('T')[0]
}

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
    select: (r) => (r.data.data as any[]).filter((m) => m.clubId === clubId && m.status === 'active'),
    enabled: !!user?.id,
  })
  const activeMembership = myMemberships?.[0] ?? null

  const subscribeMutation = useMutation({
    mutationFn: (planId: string) => membershipsApi.subscribe({ userId: user!.id, planId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['my-memberships'] })
      Alert.alert('🎫 ¡Suscrito!', res.data.message)
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
      Alert.alert('✅ Cupo reservado', pay ? 'Tu clase quedó reservada y pagada.' : 'Tu clase quedó reservada. El pago se realiza en el club.')
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo reservar el cupo'),
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
      Alert.alert('Cupo cancelado', refunded ? 'Se te devolvió el pago como crédito para el club.' : 'Tu cupo fue cancelado.')
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo cancelar el cupo'),
  })

  function confirmCancelClass(bookingId: string) {
    Alert.alert(
      'Cancelar cupo',
      'Cancelar con más de 24h de anticipación no tiene costo (si ya pagaste, se te devuelve como crédito). Con menos de 24h no hay devolución.',
      [
        { text: 'No cancelar', style: 'cancel' },
        { text: 'Sí, cancelar', style: 'destructive', onPress: () => cancelClassMutation.mutate(bookingId) },
      ]
    )
  }

  const sports = club?.sports || []

  if (loadingClub) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        title={club?.name || ''}
        subtitle={`${club?.city}, ${club?.country}`}
        right={club?.ratingAvg > 0 ? <Text style={styles.rating}>⭐ {club.ratingAvg.toFixed(1)}</Text> : undefined}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Info rápida */}
        <View style={styles.infoRow}>
          <View style={styles.infoPill}>
            <Text style={styles.infoPillText}>📍 {club?.address}</Text>
          </View>
          {club?.phone && (
            <View style={styles.infoPill}>
              <Text style={styles.infoPillText}>📞 {club.phone}</Text>
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
                  <Text style={styles.membershipActiveTitle}>🎫 Eres miembro</Text>
                  <Text style={styles.membershipActiveSub}>
                    {activeMembership.plan?.sessionsPerDay ?? 1} sesión/día incluida ·
                    {activeMembership.plan?.currency} {Number(activeMembership.plan?.price ?? 0).toLocaleString()}/mes
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
                    <Text style={styles.membershipPlanDetail}>
                      ✅ {plan.sessionsPerDay} sesión/día gratis{'\n'}
                      ⚡ Sesiones extra al precio por jugador{'\n'}
                      🚫 Cancela cuando quieras
                    </Text>
                  </View>
                  <View style={styles.membershipPlanRight}>
                    <Text style={styles.membershipPrice}>
                      {plan.currency}{'\n'}{Number(plan.price).toLocaleString()}
                    </Text>
                    <Text style={styles.membershipPriceSub}>/mes</Text>
                    <Button size="sm" onPress={() => subscribeMutation.mutate(plan.id)} loading={subscribeMutation.isPending} style={styles.subscribeBtn}>
                      Suscribirse
                    </Button>
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
                  <SportIcon sport={s} size={13} color="#6b7280" />
                  <Text style={styles.sportChipText}>{sportLabel(s)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Torneos abiertos de este club */}
        {tournaments && tournaments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏆 Torneos abiertos</Text>
            {tournaments.map((t: any) => (
              <TouchableOpacity
                key={t.id}
                style={styles.tournamentCard}
                onPress={() => navigation.navigate('TournamentDetail', { tournament: t })}
              >
                <View style={styles.tournamentCardTop}>
                  <SportIcon sport={t.sport} size={14} />
                  <Text style={styles.tournamentCardName} numberOfLines={1}>{t.name}</Text>
                </View>
                <View style={styles.tournamentCardFooter}>
                  <Text style={styles.tournamentCardDate}>📅 {formatTournamentDate(t.startDate)}</Text>
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
            <Text style={styles.sectionTitle}>🎓 Clases</Text>
            {classSlots.map((s: any) => {
              const cupos = s.bookings?.filter((b: any) => b.status === 'active').length ?? 0
              const full = s.status === 'full' || cupos >= s.maxStudents
              const myBooking = s.bookings?.find((b: any) => b.status === 'active' && b.studentUserId === user?.id)
              return (
                <View key={s.id} style={styles.classCard}>
                  <View style={styles.classCardTop}>
                    <Text style={styles.classProfName} numberOfLines={1}>{s.professor?.name}</Text>
                    <View style={[styles.classBadge, s.professor?.isExternal ? styles.classBadgeExternal : styles.classBadgeClub]}>
                      <Text style={styles.classBadgeText}>{s.professor?.isExternal ? 'Externo' : 'Del club'}</Text>
                    </View>
                  </View>
                  <Text style={styles.classDetail}>
                    📅 {s.date} · 🕐 {s.startTime} ({s.durationMinutes} min){s.court ? ` · 📍 ${s.court.name}` : ''}
                  </Text>
                  <View style={styles.classCardFooter}>
                    <Text style={styles.classPrice}>{s.currency} {Number(s.price).toLocaleString()}</Text>
                    <Text style={styles.classCupos}>{cupos}/{s.maxStudents} cupos</Text>
                    {myBooking ? (
                      <TouchableOpacity
                        style={[styles.classBookedPill, cancelClassMutation.isPending && { opacity: 0.5 }]}
                        onPress={() => confirmCancelClass(myBooking.id)}
                        disabled={cancelClassMutation.isPending}
                      >
                        <Text style={styles.classBookedPillText}>{myBooking.paymentStatus === 'paid' ? '✅ Reservada y pagada' : 'Reservada · cancelar'}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.classBookBtn, (full || bookClassMutation.isPending) && { opacity: 0.5 }]}
                        onPress={() => confirmBookClass(s.id)}
                        disabled={full || bookClassMutation.isPending}
                      >
                        <Text style={styles.classBookBtnText}>{full ? 'Sin cupo' : 'Reservar'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.classPaymentHint}>Paga ahora por la app o en el club · cancela sin costo hasta 24h antes</Text>
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
            onSlotSelected={(slot) => {
              // Canchas para más de 1 jugador (el caso normal: dobles) van directo al
              // flujo completo, que exige elegir el cupo completo antes de reservar —
              // la hoja rápida (BookingConfirmSheet) permitía reservar sin nadie más.
              if ((slot.court.capacity || 4) > 1) {
                navigation.navigate('Booking', { slot, club: club ? { id: clubId, name: club.name } : null })
                return
              }
              setPickedSlot(slot)
            }}
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
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  rating: { fontSize: 15, color: '#fbbf24', fontWeight: '700' },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoPill: { backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  infoPillText: { fontSize: 12, color: '#374151' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  sportFilters: { flexDirection: 'row', gap: 8 },
  sportChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6' },
  sportChipRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sportChipActive: { backgroundColor: '#059669' },
  sportChipText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  sportChipTextActive: { color: '#fff' },
  dateRow: { flexDirection: 'row', gap: 6, paddingRight: 4 },
  dayBtn: { width: 52, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#f3f4f6' },
  dayBtnActive: { backgroundColor: '#059669' },
  dayName: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  dayNameActive: { color: '#d1fae5' },
  dayNum: { fontSize: 17, fontWeight: '800', color: '#111827', marginTop: 2 },
  dayNumActive: { color: '#fff' },
  courtName: { fontSize: 13, fontWeight: '700', color: '#111827', flexShrink: 1 },
  courtSurface: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  slotPrice: { fontSize: 12, color: '#059669', fontWeight: '700' },
  slotPeakBadge: { fontSize: 9, color: '#d97706', fontWeight: '700', marginTop: 2, backgroundColor: '#fef3c7', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  // Paso 1: horarios
  timesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeBtn: { alignItems: 'center', backgroundColor: '#f0fdf4', borderWidth: 1.5, borderColor: '#86efac', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, minWidth: 72 },
  timeBtnPeak: { backgroundColor: '#fefce8', borderColor: '#fde68a' },
  timeBtnActive: { backgroundColor: '#059669', borderColor: '#059669' },
  timeBtnText: { fontSize: 14, fontWeight: '700', color: '#065f46' },
  timeBtnTextActive: { color: '#fff' },
  timeBtnPeakBadge: { fontSize: 9, color: '#d97706', fontWeight: '700', marginTop: 2, backgroundColor: '#fef3c7', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  // Paso 2: pistas disponibles en el horario elegido — grilla de 2 columnas
  courtsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  courtOption: {
    flexBasis: '48%', flexGrow: 1,
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  courtOptionTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  courtOptionBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  emptySlots: { alignItems: 'center', paddingVertical: 40 },
  emptySlotsText: { fontSize: 15, color: '#6b7280', fontWeight: '600' },
  emptySlotsSubText: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  description: { fontSize: 14, color: '#4b5563', lineHeight: 22 },
  tournamentCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10 },
  tournamentCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tournamentCardName: { fontSize: 14, fontWeight: '700', color: '#111827', flexShrink: 1 },
  tournamentCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  tournamentCardDate: { fontSize: 12, color: '#6b7280' },
  tournamentCardSpots: { fontSize: 12, color: '#059669', fontWeight: '600' },
  // Membership section
  membershipSection: { marginHorizontal: 16, marginBottom: 4 },
  membershipActive: {
    backgroundColor: '#064e3b', borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  membershipActiveLeft: { flex: 1 },
  membershipActiveTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  membershipActiveSub: { fontSize: 12, color: '#6ee7b7', marginTop: 2 },
  manageMembershipBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  manageMembershipBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  membershipPlanCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 2, borderColor: '#d1fae5',
    shadowColor: '#059669', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  membershipPlanLeft: { flex: 1, paddingRight: 12 },
  membershipPlanName: { fontSize: 15, fontWeight: '800', color: '#064e3b', marginBottom: 8 },
  membershipPlanDetail: { fontSize: 12, color: '#374151', lineHeight: 20 },
  membershipPlanRight: { alignItems: 'center', minWidth: 80 },
  membershipPrice: { fontSize: 16, fontWeight: '900', color: '#059669', textAlign: 'center', lineHeight: 22 },
  membershipPriceSub: { fontSize: 11, color: '#6b7280', marginBottom: 10 },
  subscribeBtn: { borderRadius: 10 },
  // Clases
  classCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10 },
  classCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  classProfName: { fontSize: 14, fontWeight: '700', color: '#111827', flexShrink: 1 },
  classBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  classBadgeClub: { backgroundColor: '#d1fae5' },
  classBadgeExternal: { backgroundColor: '#ede9fe' },
  classBadgeText: { fontSize: 10, fontWeight: '700', color: '#374151' },
  classDetail: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  classCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  classPrice: { fontSize: 14, fontWeight: '800', color: '#059669' },
  classCupos: { fontSize: 12, color: '#9ca3af', flex: 1 },
  classBookBtn: { backgroundColor: '#059669', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14 },
  classBookBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  classBookedPill: { backgroundColor: '#f0fdf4', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  classBookedPillText: { color: '#059669', fontSize: 12, fontWeight: '700' },
  classPaymentHint: { fontSize: 10, color: '#9ca3af', marginTop: 6, fontStyle: 'italic' },
})
