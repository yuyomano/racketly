import React, { useState, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, Image, Linking, Share, FlatList, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { bookingsApi, membershipsApi, usersApi, creditsApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { ScreenHeader } from '../../components/ui/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { colors } from '../../theme'
import { sportIcon, sportLabel } from '../../constants/sportIcons'
import { SportIcon } from '../../components/ui/SportIcons'

type PlayerItem = { id: string; name: string; email: string; avatarUrl?: string; city?: string }
type PlayerWithPay = PlayerItem & { pay: boolean; isGuest?: boolean }

// ── Fila de un compañero: revisa si tiene membresía propia o crédito que lo cubran ──
// Los invitados (isGuest) nunca tienen cuenta, así que no tiene sentido consultar
// su membresía/crédito — esas queries se saltan por completo para ellos.
function PlayerPayRow({ player, slotId, clubId, pricePerPlayer, onTogglePay, onRemove }: {
  player: PlayerWithPay
  slotId: string
  clubId: string
  pricePerPlayer: number
  onTogglePay: () => void
  onRemove: () => void
}) {
  const { data: playerPricing } = useQuery({
    queryKey: ['player-pricing', player.id, slotId, clubId],
    queryFn: () => membershipsApi.getPricing({ userId: player.id, slotId, clubId }),
    select: (r) => r.data.data,
    enabled: !player.isGuest,
  })
  const { data: playerCredit } = useQuery({
    queryKey: ['player-credit', player.id, clubId],
    queryFn: () => creditsApi.getUserCredit(player.id, clubId),
    select: (r) => r.data.summary?.[clubId] as { total: number; currency: string } | undefined,
    enabled: !player.isGuest,
  })

  const hasMembership = !player.isGuest && playerPricing?.pricingType === 'membership_included'
  const hasCoveringCredit = !hasMembership && !player.isGuest && (playerCredit?.total ?? 0) >= pricePerPlayer

  return (
    <View style={styles.playerRow}>
      <View style={styles.playerRowInfo}>
        <Text style={styles.playerRowName}>{player.name}{player.isGuest ? ' (invitado)' : ''}</Text>
        {hasMembership && <Text style={styles.playerRowSub}>🎫 Tiene membresía en este club</Text>}
        {hasCoveringCredit && (
          <Text style={styles.playerRowSub}>
            💳 Cubre con crédito ({playerCredit!.currency} {playerCredit!.total.toLocaleString()})
          </Text>
        )}
      </View>
      <View style={styles.playerRowActions}>
        {hasMembership || hasCoveringCredit ? (
          <Text style={styles.playerRowCovered}>{hasMembership ? '🎫 No paga' : '💳 No paga'}</Text>
        ) : (
          <TouchableOpacity
            style={[styles.payToggle, player.pay && styles.payToggleActive]}
            onPress={onTogglePay}
          >
            <Text style={[styles.payToggleText, player.pay && styles.payToggleTextActive]}>
              {player.pay ? '💳 Paga ahora' : '📱 Paga luego'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={18} color="#6b7280" />
        </TouchableOpacity>
      </View>
    </View>
  )
}

function formatTime(time: string) {
  return time.slice(0, 5)
}
function formatDate(date: string) {
  // date is "YYYY-MM-DD"
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
}

type Slot = {
  id: string
  date: string
  startTime: string
  endTime: string
  basePrice: number
  peakPrice: number
  currency: string
  isPeak: boolean
  court: { id: string; name: string; sport: string; surface: string; capacity?: number }
}

const PAYMENT_METHODS = [
  { id: 'card',        label: 'Tarjeta de crédito/débito', icon: '💳', disabled: false },
  { id: 'mercadopago', label: 'MercadoPago (próximamente)', icon: '🟦', disabled: true },
]

export function BookingScreen({ route, navigation }: { route: any; navigation: any }) {
  const { slot, club } = route.params as { slot: Slot; club: { id: string; name: string } }
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [paymentMethod, setPaymentMethod] = useState<string>('card')
  const [step, setStep] = useState<'confirm' | 'success'>('confirm')
  const [bookingResult, setBookingResult] = useState<{ id: string; qrCode?: string } | null>(null)
  const [players, setPlayers] = useState<PlayerWithPay[]>([])
  const [showInviteGuest, setShowInviteGuest] = useState(false)
  const [guestNameInput, setGuestNameInput] = useState('')
  const [guestLinkLoading, setGuestLinkLoading] = useState(false)
  const [ownerPay, setOwnerPay] = useState(true)
  const [playerSearch, setPlayerSearch] = useState('')
  const playerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [playerQuery, setPlayerQuery] = useState('')
  // Agregar compañero se hace en un modal aparte (no inline en el scroll largo del resumen):
  // así el buscador siempre queda arriba, nunca tapado por el teclado.
  const [showAddPlayer, setShowAddPlayer] = useState(false)

  function onPlayerSearchChange(text: string) {
    setPlayerSearch(text)
    if (playerSearchTimer.current) clearTimeout(playerSearchTimer.current)
    playerSearchTimer.current = setTimeout(() => setPlayerQuery(text), 400)
  }

  const { data: playerResults, isFetching: searchingPlayers } = useQuery({
    queryKey: ['user-search', playerQuery],
    queryFn: () => usersApi.search(playerQuery, user?.id),
    select: (r) => r.data.data as PlayerItem[],
    enabled: playerQuery.trim().length >= 2,
  })

  function addPlayer(p: PlayerItem) {
    if (players.find((x) => x.id === p.id)) return
    const capacity = slot.court.capacity || 4
    if (players.length + 1 >= capacity) {
      Alert.alert('Cupo completo', `Esta cancha admite máximo ${capacity} jugadores`)
      return
    }
    setPlayers((prev) => [...prev, { ...p, pay: false }])
    setPlayerSearch('')
    setPlayerQuery('')
  }
  function addGuestPlayer(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const capacity = slot.court.capacity || 4
    if (players.length + 1 >= capacity) {
      Alert.alert('Cupo completo', `Esta cancha admite máximo ${capacity} jugadores`)
      return
    }
    setPlayers((prev) => [...prev, {
      id: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      email: '',
      pay: false,
      isGuest: true,
    }])
    setPlayerSearch('')
    setPlayerQuery('')
    setShowAddPlayer(false)
  }
  function removePlayer(id: string) {
    setPlayers((prev) => prev.filter((p) => p.id !== id))
  }
  function togglePlayerPay(id: string) {
    setPlayers((prev) => prev.map((p) => p.id === id ? { ...p, pay: !p.pay } : p))
  }

  // ── Pricing dinámico según membresía ──────────────────────────────────────
  const { data: pricingData, isLoading: pricingLoading } = useQuery({
    queryKey: ['booking-pricing', slot.id, user?.id, club.id],
    queryFn: () => membershipsApi.getPricing({ userId: user!.id, slotId: slot.id, clubId: club.id }),
    select: (r) => r.data.data,
    enabled: !!user?.id,
  })

  // ── Crédito disponible en este club ───────────────────────────────────────
  const { data: creditSummary } = useQuery({
    queryKey: ['user-credit', user?.id, club.id],
    queryFn: () => creditsApi.getUserCredit(user!.id, club.id),
    select: (r) => r.data.summary?.[club.id] as { total: number; currency: string } | undefined,
    enabled: !!user?.id,
  })

  const slotBasePrice = slot.isPeak ? slot.peakPrice : slot.basePrice

  function slotDurationLabel() {
    const [sh, sm] = slot.startTime.split(':').map(Number)
    const [eh, em] = slot.endTime.split(':').map(Number)
    const mins = (eh * 60 + em) - (sh * 60 + sm)
    if (mins === 60) return '1 hora'
    if (mins === 90) return '1 hora 30 min'
    if (mins === 120) return '2 horas'
    return `${mins} min`
  }
  const pricing = pricingData ?? {
    pricingType: 'pay_per_use',
    price: slotBasePrice,
    pricePerPlayer: slotBasePrice,
    originalPrice: slotBasePrice,
    membershipPlan: null,
    sessionsUsedToday: 0,
    sessionsAllowedPerDay: 0,
    currency: slot.currency,
    savings: 0,
  }

  const isMembershipIncluded = pricing.pricingType === 'membership_included'
  const isMembershipExtra    = pricing.pricingType === 'membership_extra'

  // Per-player price for pay_per_use
  const capacity      = slot.court.capacity || 4
  const perPlayerPrice = isMembershipIncluded ? 0 : (slotBasePrice / capacity)
  const ownerHasCoveringCredit = !isMembershipIncluded && !isMembershipExtra && (creditSummary?.total ?? 0) >= perPlayerPrice
  const payingExtras  = players.filter((p) => p.pay).length
  const payingCount   = (ownerPay && !ownerHasCoveringCredit ? 1 : 0) + payingExtras
  const missingPlayers = Math.max(0, capacity - (players.length + 1))
  const rosterComplete = missingPlayers === 0
  const finalPrice    = isMembershipIncluded
    ? 0
    : isMembershipExtra
      ? pricing.pricePerPlayer ?? perPlayerPrice
      : perPlayerPrice * payingCount

  const mutation = useMutation({
    mutationFn: () =>
      bookingsApi.create({
        slotId: slot.id,
        userId: user!.id,
        clubId: club.id,
        ownerName: user?.profile?.displayName || user?.email?.split('@')[0] || 'Jugador',
        ownerPay,
        currency: pricing.currency,
        paymentProvider: isMembershipIncluded ? 'membership' : paymentMethod === 'mercadopago' ? 'mercadopago' : 'stripe',
        pricingType: pricing.pricingType,
        membershipId: pricing.membershipId ?? null,
        players: players.map((p) => p.isGuest
          ? { name: p.name, pay: p.pay }
          : { userId: p.id, name: p.name, avatarUrl: p.avatarUrl, pay: p.pay }),
      }),
    onSuccess: async (res) => {
      const { booking, payment } = res.data.data
      qc.invalidateQueries({ queryKey: ['my-bookings'] })

      // Si el backend ya confirmó (membresía o dev_mode sin Stripe), usar QR directo
      const alreadyConfirmed = booking.status === 'confirmed' || payment?.devMode || payment?.provider === 'membership'

      if (alreadyConfirmed) {
        setBookingResult({ id: booking.id, qrCode: booking.qrCode })
        setStep('success')
        return
      }

      // Pago real con Stripe: llamar a /confirm con el paymentIntentId
      try {
        const confirmRes = await bookingsApi.confirm(booking.id, {
          userId: user!.id,
          paymentIntentId: payment?.paymentIntentId,
        })
        setBookingResult({ id: booking.id, qrCode: confirmRes.data.data.qrCode })
      } catch {
        setBookingResult({ id: booking.id })
      }
      setStep('success')
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo completar la reserva')
    },
  })

  const sportEmoji = sportIcon(slot.court.sport)
  const sportName  = slot.court.sport === 'padel' ? 'pádel'  : 'pickleball'

  function buildWhatsAppMessage() {
    const date = formatDate(slot.date)
    const time = `${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`
    const paymentLine = isMembershipIncluded
      ? 'Reserva hecha en Racketly — ¡no tienes que pagar nada, solo aparecer! 🚀'
      : `Reserva hecha en Racketly — tu parte es ${pricing.currency} ${perPlayerPrice.toLocaleString()} 💳`
    return (
      `¡Te invito a jugar ${sportName}! ${sportEmoji}\n\n` +
      `🏟️ ${slot.court.name}\n` +
      `📍 ${club.name}\n` +
      `📅 ${date}\n` +
      `⏰ ${time}\n\n` +
      paymentLine
    )
  }

  async function openWhatsApp(text: string) {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    const canOpen = await Linking.canOpenURL(url)
    if (canOpen) {
      Linking.openURL(url)
    } else {
      // Fallback: sistema de compartir nativo (SMS, email, etc.)
      Share.share({ message: text })
    }
  }

  function shareWhatsApp() {
    // Cubierto por membresía — nada que pagar, se comparte directo.
    if (isMembershipIncluded) {
      openWhatsApp(buildWhatsAppMessage())
      return
    }
    // Cupo lleno (dueño + compañeros ya agregados) — no hay lugar para el invitado.
    if (players.length + 1 >= capacity) {
      Alert.alert('Cupo completo', 'Esta reserva ya tiene todos los jugadores. No se puede agregar al invitado.')
      return
    }
    setGuestNameInput('')
    setShowInviteGuest(true)
  }

  async function confirmGuestInviteAndShare() {
    const name = guestNameInput.trim()
    if (!bookingResult || !name) return

    setGuestLinkLoading(true)
    try {
      const current = await bookingsApi.getById(bookingResult.id)
      const existing = (current.data.data.players ?? []).map((p: any) => ({
        userId: p.userId ?? undefined,
        guestId: p.guestId ?? undefined,
        name: p.name,
      }))
      const updateRes = await bookingsApi.updatePlayers(bookingResult.id, [...existing, { name }])
      const updatedPlayers: any[] = updateRes.data.data.players ?? []
      const newGuest = updatedPlayers.find((p) => p.guestId && !existing.some((e: any) => e.guestId === p.guestId))
      if (!newGuest) throw new Error('No se pudo identificar al invitado recién agregado')

      const linkRes = await bookingsApi.guestLink(bookingResult.id, newGuest.guestId)
      const payUrl: string = linkRes.data.data.url
      const amount = Number(newGuest.amountOwed || 0)

      setShowInviteGuest(false)
      const date = formatDate(slot.date)
      const time = `${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`
      openWhatsApp(
        `¡Te invito a jugar ${sportName}! ${sportEmoji}\n\n` +
        `🏟️ ${slot.court.name}\n` +
        `📍 ${club.name}\n` +
        `📅 ${date}\n` +
        `⏰ ${time}\n\n` +
        `Reserva hecha en Racketly — tu parte es ${pricing.currency} ${amount.toLocaleString()} 💳\n` +
        `Paga aquí: ${payUrl}`
      )
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo generar el link de pago')
    } finally {
      setGuestLinkLoading(false)
    }
  }

  if (step === 'success' && bookingResult) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successIconWrap}>
          <Ionicons name="checkmark" size={40} color={colors.white} />
        </View>
        <Text style={styles.successTitle}>¡Reserva confirmada!</Text>
        <Text style={styles.successSub}>
          {slot.court.name} · {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
        </Text>
        <Text style={styles.successDate}>{formatDate(slot.date)}</Text>
        <Text style={styles.successClub}>{club.name}</Text>

        {/* QR Code */}
        {bookingResult.qrCode && (
          <View style={styles.qrContainer}>
            <Text style={styles.qrLabel}>Muestra este QR en la entrada</Text>
            <Image
              source={{ uri: bookingResult.qrCode }}
              style={styles.qrImage}
              resizeMode="contain"
            />
          </View>
        )}

        {/* WhatsApp share */}
        <TouchableOpacity style={styles.whatsappBtn} onPress={shareWhatsApp}>
          <Ionicons name="logo-whatsapp" size={18} color={colors.white} />
          <Text style={styles.whatsappBtnText}>Invitar compañero por WhatsApp</Text>
        </TouchableOpacity>

        <Button variant="secondary" onPress={() => navigation.navigate('MyBookings')} style={styles.doneBtn}>
          Ver mis reservas
        </Button>

        <TouchableOpacity
          style={styles.backHomeBtn}
          onPress={() => navigation.popToTop()}
        >
          <Text style={styles.backHomeBtnText}>Volver al inicio</Text>
        </TouchableOpacity>

        {/* Modal: nombre del invitado — necesario para crear su registro de pago y el link */}
        <Modal visible={showInviteGuest} transparent animationType="fade" onRequestClose={() => setShowInviteGuest(false)}>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>📲 Invitar por WhatsApp</Text>
                <TouchableOpacity onPress={() => setShowInviteGuest(false)}>
                  <Ionicons name="close" size={22} color={colors.gray500} />
                </TouchableOpacity>
              </View>
              <Text style={styles.playerResultsEmpty}>
                ¿Cómo se llama tu invitado? Con esto le generamos su link de pago.
              </Text>
              <View style={styles.playerSearchWrap}>
                <TextInput
                  style={styles.playerSearchInput}
                  placeholder="Nombre del invitado"
                  placeholderTextColor={colors.gray400}
                  value={guestNameInput}
                  onChangeText={setGuestNameInput}
                  autoFocus
                />
              </View>
              <Button
                onPress={confirmGuestInviteAndShare}
                loading={guestLinkLoading}
                disabled={!guestNameInput.trim()}
              >
                Generar link y compartir
              </Button>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader onBack={() => navigation.goBack()} title="Confirmar reserva" />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Resumen de la reserva */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>📅 Resumen</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Club</Text>
            <Text style={styles.summaryValue}>{club.name}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Pista</Text>
            <Text style={styles.summaryValue}>{slot.court.name}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Deporte</Text>
            <View style={styles.summarySportRow}>
              <SportIcon sport={slot.court.sport} size={14} color={colors.textPrimary} />
              <Text style={[styles.summaryValue, styles.summarySportText]}>{sportLabel(slot.court.sport)}</Text>
            </View>
          </View>
          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Superficie</Text>
            <Text style={styles.summaryValue}>{slot.court.surface}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Fecha</Text>
            <Text style={styles.summaryValue}>{formatDate(slot.date)}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Horario</Text>
            <Text style={styles.summaryValue}>
              {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
            </Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tarifa</Text>
            <Text style={[styles.summaryValue, { color: slot.isPeak ? colors.amber600 : colors.primary600 }]}>
              {slot.isPeak ? '⚡ Peak hour' : '🟢 Off-peak'}
            </Text>
          </View>
        </View>

        {/* Crédito disponible en este club */}
        {!!creditSummary && creditSummary.total > 0 && (
          <View style={styles.creditBanner}>
            <Text style={styles.creditBannerText}>
              💳 Tienes {creditSummary.currency} {creditSummary.total.toLocaleString()} de crédito disponible en este club
            </Text>
          </View>
        )}

        {/* Precio total — dinámico según membresía */}
        <View style={[styles.priceCard, isMembershipIncluded && styles.priceCardMembership]}>
          {pricingLoading ? (
            <ActivityIndicator color="#fff" />
          ) : isMembershipIncluded ? (
            <>
              <Text style={styles.membershipTag}>✅ {pricing.membershipPlan}</Text>
              <Text style={styles.priceAmount}>¡Incluida!</Text>
              <Text style={styles.priceSub}>
                Sesión {pricing.sessionsUsedToday + 1}/{pricing.sessionsAllowedPerDay} de hoy · precio normal {pricing.currency} {(pricing.originalPrice ?? 0).toLocaleString()}
              </Text>
            </>
          ) : isMembershipExtra ? (
            <>
              <Text style={styles.membershipTag}>⚡ {pricing.membershipPlan} — sesión extra</Text>
              <Text style={styles.priceAmount}>{pricing.currency} {finalPrice.toLocaleString()}</Text>
              <Text style={styles.priceSub}>
                Por jugador · precio pista {pricing.currency} {(pricing.originalPrice ?? 0).toLocaleString()}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.priceLabel}>
                {payingCount === 0 ? 'Nadie paga aún' : payingCount === 1 ? 'Tu parte' : `Pagas por ${payingCount} jugadores`}
              </Text>
              <Text style={styles.priceAmount}>
                {pricing.currency} {finalPrice.toLocaleString()}
              </Text>
              <Text style={styles.priceSub}>
                {slotDurationLabel()} · {pricing.currency} {perPlayerPrice.toLocaleString()} por jugador · pista {pricing.currency} {slotBasePrice.toLocaleString()}
              </Text>
            </>
          )}
        </View>

        {/* Método de pago — solo visible si NO está cubierta por membresía */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Método de pago</Text>
          {isMembershipIncluded ? (
            <View style={styles.membershipPaymentInfo}>
              <Text style={styles.membershipPaymentText}>
                🎫 Esta sesión está cubierta por tu membresía mensual en el club. No se realizará ningún cargo.
              </Text>
            </View>
          ) : PAYMENT_METHODS.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.paymentMethod,
                paymentMethod === method.id && styles.paymentMethodActive,
                method.disabled && styles.paymentMethodDisabled,
              ]}
              onPress={() => !method.disabled && setPaymentMethod(method.id)}
              disabled={method.disabled}
            >
              <Text style={[styles.paymentIcon, method.disabled && { opacity: 0.4 }]}>{method.icon}</Text>
              <Text style={[
                styles.paymentLabel,
                paymentMethod === method.id && styles.paymentLabelActive,
                method.disabled && { color: colors.gray400 },
              ]}>
                {method.label}
              </Text>
              <View style={[styles.radio, paymentMethod === method.id && styles.radioActive, method.disabled && { opacity: 0.3 }]}>
                {paymentMethod === method.id && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Jugadores y quién paga qué */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👥 Jugadores y pago ({players.length + 1}/{capacity})</Text>
          <Text style={styles.sectionHint}>
            {isMembershipIncluded || isMembershipExtra
              ? 'Agrega a tus compañeros y marca quién paga su parte ahora'
              : 'Marca quién paga ahora — el resto puede pagar su parte luego desde la app'}
          </Text>

          {missingPlayers > 0 && (
            <View style={styles.rosterWarning}>
              <Text style={styles.rosterWarningText}>
                ⚠️ Faltan {missingPlayers} jugador{missingPlayers > 1 ? 'es' : ''} para completar la reserva ({capacity} en total). No necesitan pagar ahora, pero deben estar agregados.
              </Text>
            </View>
          )}

          {/* Fila del dueño de la reserva */}
          <View style={styles.playerRow}>
            <View style={styles.playerRowInfo}>
              <Text style={styles.playerRowName}>Tú</Text>
              <Text style={styles.playerRowSub}>{user?.profile?.displayName || user?.email || ''}</Text>
            </View>
            {isMembershipIncluded ? (
              <Text style={styles.playerRowCovered}>🎫 Incluido</Text>
            ) : isMembershipExtra ? (
              <Text style={styles.playerRowCovered}>✅ Pagas ahora</Text>
            ) : ownerHasCoveringCredit ? (
              <Text style={styles.playerRowCovered}>💳 Cubierto con crédito</Text>
            ) : (
              <TouchableOpacity
                style={[styles.payToggle, ownerPay && styles.payToggleActive]}
                onPress={() => setOwnerPay((v) => !v)}
              >
                <Text style={[styles.payToggleText, ownerPay && styles.payToggleTextActive]}>
                  {ownerPay ? '💳 Paga ahora' : '📱 Paga luego'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Filas de compañeros agregados — cada uno revisa su propia membresía/crédito */}
          {players.map((p) => (
            <PlayerPayRow
              key={p.id}
              player={p}
              slotId={slot.id}
              clubId={club.id}
              pricePerPlayer={perPlayerPrice}
              onTogglePay={() => togglePlayerPay(p.id)}
              onRemove={() => removePlayer(p.id)}
            />
          ))}

          {/* Agregar compañero — abre un modal aparte para que el buscador quede siempre
              arriba, sin importar qué tan largo sea este resumen */}
          {players.length + 1 >= capacity ? (
            <View style={styles.rosterFullBox}>
              <Text style={styles.rosterFullText}>✅ Cupo completo ({capacity}/{capacity})</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.addPlayerBtn} onPress={() => setShowAddPlayer(true)}>
              <Ionicons name="person-add-outline" size={16} color={colors.primary700} />
              <Text style={styles.addPlayerBtnText}>Agregar compañero</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Política de cancelación */}
        <View style={styles.policyBox}>
          <Text style={styles.policyTitle}>📋 Política de cancelación</Text>
          <Text style={styles.policyText}>
            Cancela gratis hasta <Text style={{ fontWeight: '700' }}>24 horas antes</Text> y recibe el reembolso completo.{'\n'}
            Cancelaciones con menos de 24h reciben el <Text style={{ fontWeight: '700' }}>50%</Text>.
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Botón de confirmar fijo */}
      <View style={styles.footer}>
        <View style={styles.footerPrice}>
          <Text style={styles.footerPriceLabel}>
            {isMembershipIncluded ? 'Con membresía' : isMembershipExtra ? 'Por jugador' : `Pagas (${payingCount})`}
          </Text>
          <Text style={[styles.footerPriceAmount, isMembershipIncluded && { color: colors.primary600 }]}>
            {isMembershipIncluded ? '¡Gratis!' : `${pricing.currency} ${finalPrice.toLocaleString()}`}
          </Text>
        </View>
        <Button
          onPress={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={pricingLoading || !rosterComplete}
          style={styles.confirmBtn}
        >
          {!rosterComplete
            ? `Faltan ${missingPlayers} jugador${missingPlayers > 1 ? 'es' : ''}`
            : isMembershipIncluded ? 'Confirmar reserva ✅' : 'Reservar ahora 🎾'}
        </Button>
      </View>

      {/* Modal: agregar compañero — el buscador queda pegado arriba, nunca lo tapa el teclado */}
      <Modal visible={showAddPlayer} transparent animationType="slide" onRequestClose={() => setShowAddPlayer(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>➕ Agregar compañero</Text>
              <TouchableOpacity onPress={() => setShowAddPlayer(false)}>
                <Ionicons name="close" size={22} color={colors.gray500} />
              </TouchableOpacity>
            </View>

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

            <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalResultsScroll}>
              {playerQuery.length < 2 ? (
                <Text style={styles.playerResultsEmpty}>Escribe al menos 2 letras para buscar</Text>
              ) : (playerResults ?? []).filter((p) => !players.find((x) => x.id === p.id)).length === 0 ? (
                <Text style={styles.playerResultsEmpty}>
                  {searchingPlayers ? 'Buscando...' : 'Sin resultados'}
                </Text>
              ) : (
                (playerResults ?? [])
                  .filter((p) => !players.find((x) => x.id === p.id))
                  .map((p) => (
                    <TouchableOpacity key={p.id} style={styles.playerResultRow} onPress={() => addPlayer(p)}>
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

              {/* No tiene cuenta en la app: agregarlo como invitado, sin necesidad de buscarlo */}
              {playerSearch.trim().length >= 2 && (
                <TouchableOpacity
                  style={styles.addGuestRow}
                  onPress={() => addGuestPlayer(playerSearch)}
                >
                  <View style={[styles.playerResultAvatar, styles.guestAvatar]}>
                    <Ionicons name="person-add" size={16} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.playerResultName}>Agregar a "{playerSearch.trim()}" como invitado</Text>
                    <Text style={styles.playerResultSub}>No tiene cuenta en la app</Text>
                  </View>
                  <Ionicons name="add-circle" size={22} color={colors.primary600} />
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray50 },
  scroll: { flex: 1 },
  summaryCard: { margin: 16, backgroundColor: colors.white, borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: colors.gray900, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  summarySportRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summarySportText: { maxWidth: undefined, textAlign: 'left' },
  summaryLabel: { fontSize: 14, color: colors.gray500 },
  summaryValue: { fontSize: 14, fontWeight: '600', color: colors.gray900, maxWidth: '60%', textAlign: 'right' },
  divider: { height: 1, backgroundColor: colors.gray100 },
  creditBanner: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#ede9fe', borderRadius: 14, padding: 12, borderLeftWidth: 3, borderLeftColor: colors.violet600 },
  creditBannerText: { fontSize: 13, color: '#5b21b6', fontWeight: '600' },
  priceCard: { marginHorizontal: 16, backgroundColor: colors.primary900, borderRadius: 20, padding: 20, alignItems: 'center' },
  priceLabel: { fontSize: 13, color: colors.primary300 },
  priceAmount: { fontSize: 32, fontWeight: '900', color: colors.white, marginTop: 4 },
  priceSub: { fontSize: 12, color: colors.primary300, marginTop: 4 },
  section: { margin: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.gray900, marginBottom: 12 },
  paymentMethod: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 2, borderColor: colors.gray100, gap: 12,
  },
  paymentMethodActive: { borderColor: colors.primary600, backgroundColor: colors.primary50 },
  paymentMethodDisabled: { opacity: 0.55, backgroundColor: colors.gray50 },
  paymentIcon: { fontSize: 24 },
  paymentLabel: { flex: 1, fontSize: 15, color: colors.gray700, fontWeight: '500' },
  paymentLabelActive: { color: colors.primary800, fontWeight: '600' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.gray300, justifyContent: 'center', alignItems: 'center' },
  radioActive: { borderColor: colors.primary600 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary600 },
  policyBox: { marginHorizontal: 16, backgroundColor: colors.amber50, borderRadius: 14, padding: 16, borderLeftWidth: 3, borderLeftColor: colors.amber500 },
  policyTitle: { fontSize: 14, fontWeight: '700', color: '#92400e', marginBottom: 6 },
  policyText: { fontSize: 13, color: '#78350f', lineHeight: 20 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, padding: 16, paddingBottom: 32,
    borderTopWidth: 1, borderTopColor: colors.gray200,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
  },
  footerPrice: { flex: 1 },
  footerPriceLabel: { fontSize: 12, color: colors.gray500 },
  footerPriceAmount: { fontSize: 20, fontWeight: '800', color: colors.gray900 },
  confirmBtn: { backgroundColor: colors.primary600, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24 },
  // Players section
  sectionHint: { fontSize: 12, color: colors.gray400, marginBottom: 10, marginTop: -4 },
  rosterWarning: { backgroundColor: colors.amber50, borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.amber500, marginBottom: 10 },
  rosterWarningText: { fontSize: 12, color: '#92400e', lineHeight: 17 },
  rosterFullBox: { backgroundColor: colors.primary50, borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.primary600 },
  rosterFullText: { fontSize: 12, color: colors.primary800, fontWeight: '700' },
  addPlayerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: colors.primary200, backgroundColor: colors.primary50,
    borderRadius: 12, paddingVertical: 12,
  },
  addPlayerBtnText: { color: colors.primary700, fontSize: 14, fontWeight: '700' },
  // Modal: agregar compañero
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.gray900 },
  modalResultsScroll: { marginTop: 6 },
  // Filas de jugador con toggle de pago
  playerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 8, borderWidth: 1, borderColor: colors.gray200,
  },
  playerRowInfo: { flex: 1, marginRight: 8 },
  playerRowName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  playerRowSub: { fontSize: 12, color: colors.gray400, marginTop: 1 },
  playerRowCovered: { fontSize: 12, fontWeight: '700', color: colors.primary600 },
  playerRowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payToggle: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.gray100 },
  payToggleActive: { backgroundColor: colors.primary100 },
  payToggleText: { fontSize: 12, fontWeight: '600', color: colors.gray500 },
  payToggleTextActive: { color: colors.primary800 },
  playerSearchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.gray50, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.gray200 },
  playerSearchInput: { flex: 1, fontSize: 14, color: colors.textPrimary },
  playerResults: { backgroundColor: colors.white, borderRadius: 12, marginTop: 6, borderWidth: 1, borderColor: colors.gray200, overflow: 'hidden' },
  playerResultsEmpty: { padding: 12, fontSize: 13, color: colors.gray400, textAlign: 'center' },
  playerResultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  playerResultAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary600, alignItems: 'center', justifyContent: 'center' },
  playerResultAvatarText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  playerResultName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  playerResultSub: { fontSize: 12, color: colors.gray400, marginTop: 1 },
  addGuestRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.primary200, borderStyle: 'dashed' },
  guestAvatar: { backgroundColor: colors.gray400 },
  // Membership pricing
  priceCardMembership: { backgroundColor: colors.primary800 },
  membershipTag: { fontSize: 12, color: colors.primary300, fontWeight: '700', marginBottom: 4 },
  membershipPaymentInfo: { backgroundColor: colors.primary50, borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: colors.primary600 },
  membershipPaymentText: { fontSize: 13, color: colors.primary800, lineHeight: 20 },
  // Success
  successContainer: { flex: 1, backgroundColor: colors.primary900, justifyContent: 'center', alignItems: 'center', padding: 32 },
  successIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary500, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successTitle: { fontSize: 28, fontWeight: '900', color: colors.white, textAlign: 'center' },
  successSub: { fontSize: 16, color: colors.primary300, marginTop: 8, textAlign: 'center' },
  successDate: { fontSize: 14, color: colors.primary200, marginTop: 4, textAlign: 'center' },
  successClub: { fontSize: 14, color: colors.primary200, fontWeight: '600', textAlign: 'center' },
  qrContainer: { backgroundColor: colors.white, borderRadius: 24, padding: 24, marginTop: 24, alignItems: 'center', width: '100%' },
  qrLabel: { fontSize: 13, color: colors.gray500, marginBottom: 12, fontWeight: '600' },
  qrImage: { width: 200, height: 200 },
  whatsappBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#25D366', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 24, marginTop: 20, width: '100%',
  },
  whatsappIcon: { fontSize: 20 },
  whatsappBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  doneBtn: { marginTop: 12, width: '100%' },
  backHomeBtn: { marginTop: 12 },
  backHomeBtnText: { color: colors.primary300, fontSize: 14 },
})
