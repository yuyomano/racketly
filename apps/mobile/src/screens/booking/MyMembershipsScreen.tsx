import React from 'react'
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Text } from '../../components/ui/Text'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { membershipsApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { BackButton } from '../../components/ui/BackButton'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { colors } from '../../theme'

const STATUS_CONFIG: Record<string, { label: string; tone: 'emerald' | 'amber' | 'red' | 'gray' }> =
  {
    active: { label: 'Activa', tone: 'emerald' },
    pending_cancel: { label: 'Se cancela pronto', tone: 'amber' },
    cancelled: { label: 'Cancelada', tone: 'red' },
    past_due: { label: 'Pago pendiente', tone: 'amber' },
    expired: { label: 'Expirada', tone: 'gray' },
  }

export function MyMembershipsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const { data: memberships, isLoading } = useQuery({
    queryKey: ['my-memberships', user?.id],
    queryFn: () => membershipsApi.getMyMemberships(user!.id),
    select: (r) => r.data.data as any[],
    enabled: !!user?.id,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => membershipsApi.cancel(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['my-memberships'] })
      Alert.alert('Membresía cancelada', res.data.message)
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.error || 'No se pudo cancelar'),
  })

  function confirmCancel(id: string, clubName: string) {
    Alert.alert(
      'Cancelar membresía',
      `¿Seguro que quieres cancelar tu membresía en ${clubName}? Seguirá activa (con todos sus beneficios) hasta el fin del período ya pagado, y no se te cobrará el siguiente mes.`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, cancelar', style: 'destructive', onPress: () => cancelMutation.mutate(id) },
      ]
    )
  }

  const active = memberships?.filter((m) => m.status === 'active') ?? []
  const inactive = memberships?.filter((m) => m.status !== 'active') ?? []

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Mis Membresías</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.court600} style={{ marginTop: 60 }} />
      ) : memberships?.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon="pricetag-outline"
            title="Sin membresías activas"
            description="Suscríbete a un club para jugar una vez al día con un precio fijo mensual."
          />
          <TouchableOpacity style={styles.exploreBtn} onPress={() => navigation.navigate('Home')}>
            <Text style={styles.exploreBtnText}>Ver clubs con membresía</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={[...active, ...inactive]}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            active.length > 0 ? (
              <View style={styles.benefitsCard}>
                <View style={styles.benefitsTitleRow}>
                  <Ionicons name="pricetag" size={16} color={colors.white} />
                  <Text style={styles.benefitsTitle}>Beneficios activos</Text>
                </View>
                <View style={styles.benefitRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={colors.court300}
                    style={styles.benefitIcon}
                  />
                  <Text style={styles.benefitText}>1 sesión gratuita por día en tu club</Text>
                </View>
                <View style={styles.benefitRow}>
                  <Ionicons
                    name="flash"
                    size={16}
                    color={colors.court300}
                    style={styles.benefitIcon}
                  />
                  <Text style={styles.benefitText}>Sesiones extra al precio por jugador</Text>
                </View>
                <View style={styles.benefitRow}>
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={colors.court300}
                    style={styles.benefitIcon}
                  />
                  <Text style={styles.benefitText}>Cancelable en cualquier momento</Text>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item: m }) => {
            const isActive = m.status === 'active'
            const pendingCancel = isActive && m.cancelAtPeriodEnd
            const status =
              STATUS_CONFIG[pendingCancel ? 'pending_cancel' : m.status] ?? STATUS_CONFIG.expired
            const nextDate = new Date(m.nextBillingDate).toLocaleDateString('es', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })

            return (
              <View style={[styles.card, !isActive && styles.cardInactive]}>
                {/* Club + status */}
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clubName}>{m.club?.name ?? 'Club'}</Text>
                    <Text style={styles.clubCity}>{m.club?.city}</Text>
                  </View>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </View>

                {/* Plan info */}
                <View style={styles.planBox}>
                  <Text style={styles.planName}>{m.plan?.name ?? 'Membresía Mensual'}</Text>
                  <Text style={styles.planDetail}>
                    {m.plan?.sessionsPerDay ?? 1} sesión/día incluida · {m.plan?.currency}{' '}
                    {Number(m.plan?.price ?? 0).toLocaleString()}/mes
                  </Text>
                </View>

                {/* Fechas */}
                <View style={styles.dateRow}>
                  <View style={styles.dateItem}>
                    <Text style={styles.dateLabel}>Desde</Text>
                    <Text style={styles.dateValue}>
                      {new Date(m.startDate).toLocaleDateString('es', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Text>
                  </View>
                  <View style={styles.dateItem}>
                    <Text style={styles.dateLabel}>
                      {pendingCancel
                        ? 'Se cancela el'
                        : isActive
                          ? 'Próximo cobro'
                          : 'Cancelada el'}
                    </Text>
                    <Text style={styles.dateValue}>
                      {isActive
                        ? nextDate
                        : new Date(m.cancelledAt).toLocaleDateString('es', {
                            day: 'numeric',
                            month: 'short',
                          })}
                    </Text>
                  </View>
                </View>

                {/* Cancelar */}
                {isActive && !pendingCancel && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => confirmCancel(m.id, m.club?.name)}
                    disabled={cancelMutation.isPending}
                  >
                    <Text style={styles.cancelBtnText}>Cancelar membresía</Text>
                  </TouchableOpacity>
                )}
                {pendingCancel && (
                  <Text style={styles.pendingCancelText}>
                    Sigues teniendo tus beneficios hasta el {nextDate}. No se te cobrará el
                    siguiente período.
                  </Text>
                )}
              </View>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.court900,
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: { padding: 4 },
  backText: { color: colors.court300, fontSize: 24, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: colors.white },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  exploreBtn: {
    marginTop: 20,
    backgroundColor: colors.court600,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  exploreBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  benefitsCard: {
    backgroundColor: colors.court900,
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  benefitsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  benefitsTitle: { fontSize: 14, fontWeight: '800', color: colors.white },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  benefitIcon: { width: 16 },
  benefitText: { fontSize: 13, color: colors.court300, flex: 1 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.ink100,
  },
  cardInactive: { opacity: 0.7 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  clubName: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  clubCity: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '700' },
  planBox: { backgroundColor: colors.court50, borderRadius: 10, padding: 12, marginBottom: 12 },
  planName: { fontSize: 14, fontWeight: '700', color: colors.court800 },
  planDetail: { fontSize: 12, color: colors.court600, marginTop: 2 },
  dateRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dateItem: { flex: 1 },
  dateLabel: { fontSize: 11, color: colors.ink400, fontWeight: '600' },
  dateValue: { fontSize: 13, color: colors.ink700, fontWeight: '700', marginTop: 2 },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: colors.referee100,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: { color: colors.referee500, fontSize: 13, fontWeight: '600' },
  pendingCancelText: {
    fontSize: 12,
    color: colors.trophy800,
    backgroundColor: colors.trophy50,
    borderRadius: 10,
    padding: 10,
    lineHeight: 18,
  },
})
