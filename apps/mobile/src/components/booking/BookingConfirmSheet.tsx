import React, { useEffect, useState } from 'react'
import { View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bookingsApi, membershipsApi, creditsApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { colors, radius, spacing, fontSize } from '../../theme'
import { sportLabel } from '../../constants/sportIcons'
import { SportIcon } from '../ui/SportIcons'
import { Button } from '../ui/Button'
import type { Slot } from './BookingPickerOptimized'

function formatTime(time: string) {
  return time.slice(0, 5)
}
function formatDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ── Confirmación rápida en Bottom Sheet — reemplaza la navegación a pantalla
// completa para el caso más común (dueño paga solo, sin dividir con nadie): un
// toque en la grilla (BookingPickerOptimized) abre esta hoja, un toque más confirma.
// El flujo completo de roster + pago dividido sigue disponible sin tocarlo —
// "Agregar jugadores y dividir pago" navega a BookingScreen tal como antes.
// Usa exactamente el mismo contrato de bookingsApi.create que BookingScreen.
export function BookingConfirmSheet({
  visible, slot, club, onClose, navigation,
}: {
  visible: boolean
  slot: Slot | null
  club: { id: string; name: string } | null
  onClose: () => void
  navigation: any
}) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    if (visible) setShowSuccess(false)
  }, [visible])

  const { data: pricingData, isLoading: pricingLoading } = useQuery({
    queryKey: ['booking-pricing', slot?.id, user?.id, club?.id],
    queryFn: () => membershipsApi.getPricing({ userId: user!.id, slotId: slot!.id, clubId: club!.id }),
    select: (r) => r.data.data,
    enabled: !!user?.id && !!slot && !!club,
  })

  const { data: creditSummary } = useQuery({
    queryKey: ['user-credit', user?.id, club?.id],
    queryFn: () => creditsApi.getUserCredit(user!.id, club!.id),
    select: (r) => r.data.summary?.[club!.id] as { total: number; currency: string } | undefined,
    enabled: !!user?.id && !!club,
  })

  const slotBasePrice = slot ? (slot.isPeak ? slot.peakPrice : slot.basePrice) : 0
  const capacity = slot?.court.capacity || 4
  const pricing = pricingData ?? {
    pricingType: 'pay_per_use', price: slotBasePrice, pricePerPlayer: slotBasePrice / capacity,
    membershipPlan: null, currency: slot?.currency,
  }
  const isMembershipIncluded = pricing.pricingType === 'membership_included'
  const isMembershipExtra = pricing.pricingType === 'membership_extra'
  const perPlayerPrice = isMembershipIncluded ? 0 : (slotBasePrice / capacity)
  const hasCoveringCredit = !isMembershipIncluded && !isMembershipExtra && (creditSummary?.total ?? 0) >= perPlayerPrice
  const finalPrice = isMembershipIncluded ? 0 : isMembershipExtra ? (pricing.pricePerPlayer ?? perPlayerPrice) : (hasCoveringCredit ? 0 : perPlayerPrice)

  const mutation = useMutation({
    mutationFn: () =>
      bookingsApi.create({
        slotId: slot!.id,
        userId: user!.id,
        clubId: club!.id,
        ownerName: user?.profile?.displayName || user?.email?.split('@')[0] || 'Jugador',
        ownerPay: true,
        currency: pricing.currency,
        paymentProvider: isMembershipIncluded ? 'membership' : 'stripe',
        pricingType: pricing.pricingType,
        membershipId: pricing.membershipId ?? null,
        players: [],
      }),
    onSuccess: async (res) => {
      const { booking, payment } = res.data.data
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
      const alreadyConfirmed = booking.status === 'confirmed' || payment?.devMode || payment?.provider === 'membership'
      if (!alreadyConfirmed) {
        try {
          await bookingsApi.confirm(booking.id, { userId: user!.id, paymentIntentId: payment?.paymentIntentId })
        } catch { /* el resumen en Mis reservas mostrará el estado real */ }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setShowSuccess(true)
      setTimeout(() => {
        onClose()
        navigation.navigate('MyBookings')
      }, 1100)
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
    },
  })

  // Guard después de todos los hooks (nunca antes) — un return temprano entre hooks
  // rompe las Reglas de Hooks apenas slot/club dejan de ser null en un re-render.
  if (!slot || !club) return null

  function confirmTap() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    mutation.mutate()
  }
  function openFullFlow() {
    Haptics.selectionAsync().catch(() => {})
    onClose()
    navigation.navigate('Booking', { slot, club })
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {showSuccess ? (
            <View style={styles.successBox}>
              <View style={styles.successIcon}><Ionicons name="checkmark" size={28} color={colors.white} /></View>
              <Text style={styles.successText}>¡Reserva confirmada!</Text>
            </View>
          ) : (
            <>
              <View style={styles.headerRow}>
                <SportIcon sport={slot.court.sport} size={16} color={colors.primary700} />
                <Text style={styles.title}>{slot.court.name}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={20} color={colors.gray400} />
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitle}>{club.name} · {sportLabel(slot.court.sport)}</Text>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>📅 {formatDate(slot.date)}</Text>
                <Text style={styles.summaryLabel}>🕐 {formatTime(slot.startTime)}-{formatTime(slot.endTime)}</Text>
              </View>

              <View style={[styles.priceCard, isMembershipIncluded && styles.priceCardMembership]}>
                {pricingLoading ? (
                  <ActivityIndicator color={colors.white} />
                ) : isMembershipIncluded ? (
                  <>
                    <Text style={styles.priceTag}>✅ {pricing.membershipPlan}</Text>
                    <Text style={styles.priceAmount}>¡Incluida!</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.priceTag}>{hasCoveringCredit ? 'Cubierto con crédito' : 'Tu parte'}</Text>
                    <Text style={styles.priceAmount}>{pricing.currency} {finalPrice.toLocaleString()}</Text>
                  </>
                )}
              </View>

              <TouchableOpacity style={styles.addPlayersLink} onPress={openFullFlow}>
                <Ionicons name="people-outline" size={14} color={colors.primary700} />
                <Text style={styles.addPlayersLinkText}>Agregar jugadores y dividir el pago</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary700} />
              </TouchableOpacity>

              <Button onPress={confirmTap} loading={mutation.isPending} disabled={pricingLoading} style={styles.confirmBtn}>
                {isMembershipIncluded ? 'Confirmar reserva ✅' : 'Reservar ahora 🎾'}
              </Button>

              {mutation.isError && (
                <Text style={styles.errorText}>No se pudo completar la reserva. Intenta de nuevo.</Text>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: spacing['3xl'] },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gray200, alignSelf: 'center', marginBottom: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: fontSize.sm, color: colors.gray500, marginTop: 2, marginLeft: 24 },
  summaryRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
  summaryLabel: { fontSize: fontSize.sm, color: colors.gray700, fontWeight: '600' },
  priceCard: { marginTop: spacing.lg, backgroundColor: colors.primary900, borderRadius: radius.xl, padding: spacing.lg, alignItems: 'center' },
  priceCardMembership: { backgroundColor: colors.primary800 },
  priceTag: { fontSize: fontSize.xs, color: colors.primary300, fontWeight: '700' },
  priceAmount: { fontSize: fontSize['2xl'], fontWeight: '900', color: colors.white, marginTop: 4 },
  addPlayersLink: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: spacing.lg, paddingVertical: 8 },
  addPlayersLinkText: { fontSize: fontSize.sm, color: colors.primary700, fontWeight: '700' },
  confirmBtn: { borderRadius: radius.lg, marginTop: spacing.sm },
  errorText: { color: colors.red600, fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.sm },
  successBox: { alignItems: 'center', paddingVertical: spacing['3xl'] },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary500, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  successText: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
})
