import React from 'react'
import {
  View, Text, FlatList,
  StyleSheet, Alert,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { membershipsApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { ScreenHeader } from '../../components/ui/ScreenHeader'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'

const STATUS_CONFIG: Record<string, { label: string; tone: 'emerald' | 'amber' | 'red' | 'gray' }> = {
  active:          { label: 'Activa',           tone: 'emerald' },
  pending_cancel:  { label: 'Se cancela pronto', tone: 'amber' },
  cancelled:       { label: 'Cancelada',         tone: 'red' },
  past_due:        { label: 'Pago pendiente',    tone: 'amber' },
  expired:         { label: 'Expirada',          tone: 'gray' },
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

  const active    = memberships?.filter((m) => m.status === 'active')    ?? []
  const inactive  = memberships?.filter((m) => m.status !== 'active')    ?? []

  return (
    <View style={styles.container}>
      <ScreenHeader onBack={() => navigation.goBack()} title="Mis Membresías" />

      {isLoading ? (
        <View style={{ padding: 16, gap: 12 }}>
          {[0, 1].map((i) => (
            <View key={i} style={styles.card}>
              <Skeleton style={{ width: '50%', height: 16, marginBottom: 10 }} />
              <Skeleton style={{ width: '70%', height: 13, marginBottom: 6 }} />
              <Skeleton style={{ width: '40%', height: 13 }} />
            </View>
          ))}
        </View>
      ) : memberships?.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon="pricetag-outline"
            title="Sin membresías activas"
            description="Suscríbete a un club para jugar una vez al día con un precio fijo mensual."
          />
          <Button onPress={() => navigation.navigate('Home')} style={styles.exploreBtn}>
            Ver clubs con membresía →
          </Button>
        </View>
      ) : (
        <FlatList
          data={[...active, ...inactive]}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={active.length > 0 ? (
            <View style={styles.benefitsCard}>
              <Text style={styles.benefitsTitle}>🎫 Beneficios activos</Text>
              <View style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>✅</Text>
                <Text style={styles.benefitText}>1 sesión gratuita por día en tu club</Text>
              </View>
              <View style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>⚡</Text>
                <Text style={styles.benefitText}>Sesiones extra al precio por jugador</Text>
              </View>
              <View style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>🚫</Text>
                <Text style={styles.benefitText}>Cancelable en cualquier momento</Text>
              </View>
            </View>
          ) : null}
          renderItem={({ item: m }) => {
            const isActive = m.status === 'active'
            const pendingCancel = isActive && m.cancelAtPeriodEnd
            const status = STATUS_CONFIG[pendingCancel ? 'pending_cancel' : m.status] ?? STATUS_CONFIG.expired
            const nextDate = new Date(m.nextBillingDate).toLocaleDateString('es', {
              day: 'numeric', month: 'long', year: 'numeric',
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
                    {m.plan?.sessionsPerDay ?? 1} sesión/día incluida · {m.plan?.currency} {Number(m.plan?.price ?? 0).toLocaleString()}/mes
                  </Text>
                </View>

                {/* Fechas */}
                <View style={styles.dateRow}>
                  <View style={styles.dateItem}>
                    <Text style={styles.dateLabel}>Desde</Text>
                    <Text style={styles.dateValue}>
                      {new Date(m.startDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <View style={styles.dateItem}>
                    <Text style={styles.dateLabel}>
                      {pendingCancel ? 'Se cancela el' : isActive ? 'Próximo cobro' : 'Cancelada el'}
                    </Text>
                    <Text style={styles.dateValue}>
                      {isActive ? nextDate : new Date(m.cancelledAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                </View>

                {/* Cancelar */}
                {isActive && !pendingCancel && (
                  <Button
                    variant="danger"
                    size="sm"
                    onPress={() => confirmCancel(m.id, m.club?.name)}
                    loading={cancelMutation.isPending}
                  >
                    Cancelar membresía
                  </Button>
                )}
                {pendingCancel && (
                  <Text style={styles.pendingCancelText}>
                    Sigues teniendo tus beneficios hasta el {nextDate}. No se te cobrará el siguiente período.
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
  container: { flex: 1, backgroundColor: '#f9fafb' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  exploreBtn: { marginTop: 20 },
  benefitsCard: {
    backgroundColor: '#064e3b', borderRadius: 16, padding: 16, marginBottom: 4,
  },
  benefitsTitle: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  benefitIcon: { fontSize: 16, width: 24 },
  benefitText: { fontSize: 13, color: '#6ee7b7', flex: 1 },
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardInactive: { opacity: 0.7 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  clubName: { fontSize: 17, fontWeight: '800', color: '#111827' },
  clubCity: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '700' },
  planBox: { backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginBottom: 12 },
  planName: { fontSize: 14, fontWeight: '700', color: '#065f46' },
  planDetail: { fontSize: 12, color: '#059669', marginTop: 2 },
  dateRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dateItem: { flex: 1 },
  dateLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  dateValue: { fontSize: 13, color: '#374151', fontWeight: '700', marginTop: 2 },
  pendingCancelText: { fontSize: 12, color: '#b45309', backgroundColor: '#fffbeb', borderRadius: 10, padding: 10, lineHeight: 18 },
})
