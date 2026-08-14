import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, StyleSheet
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { clubsApi } from '../../services/api'
import type { ClubProfile } from '@racketly/shared-types'
import { distanceKm } from '@racketly/utils'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { colors, radius, spacing, fontSize, shadow } from '../../theme'
import { sportLabel } from '../../constants/sportIcons'
import { PadelIcon, PickleballIcon, SportIcon } from '../../components/ui/SportIcons'
import { useAuthStore } from '../../store/auth.store'

export function HomeScreen({ navigation }: { navigation: any }) {
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [sport, setSport] = useState<'padel' | 'pickleball' | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({})
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude })
      }
    })()
  }, [])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['clubs', { search, sport, userId: user?.id, ...location }],
    queryFn: () =>
      clubsApi.search({
        search: search || undefined,
        sport: sport || undefined,
        lat: location?.lat,
        lng: location?.lng,
        radius: 30,
        userId: user?.id,
      }),
    select: (res) => res.data.data as ClubProfile[],
  })

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>🎾 Racketly</Text>
            <Text style={styles.headerSub}>¿Dónde jugamos hoy?</Text>
          </View>
          <TouchableOpacity style={styles.myBookingsBtn} onPress={() => navigation.navigate('MyBookings')}>
            <Ionicons name="calendar-outline" size={14} color={colors.white} />
            <Text style={styles.myBookingsBtnText}>Mis reservas</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar ciudad o club..."
            placeholderTextColor={colors.gray400}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => refetch()}
          />
        </View>
      </View>

      {/* Sport Filter */}
      <View style={styles.filterRow}>
        <TouchableOpacity style={[styles.filterBtn, sport === null && styles.filterBtnActive]} onPress={() => setSport(null)}>
          <Text style={[styles.filterText, sport === null && styles.filterTextActive]}>Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterBtn, styles.filterBtnRow, sport === 'padel' && styles.filterBtnActive]} onPress={() => setSport('padel')}>
          <PadelIcon size={13} color={sport === 'padel' ? colors.white : colors.gray500} />
          <Text style={[styles.filterText, sport === 'padel' && styles.filterTextActive]}>Pádel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterBtn, styles.filterBtnRow, sport === 'pickleball' && styles.filterBtnActive]} onPress={() => setSport('pickleball')}>
          <PickleballIcon size={13} color={sport === 'pickleball' ? colors.white : colors.gray500} />
          <Text style={[styles.filterText, sport === 'pickleball' && styles.filterTextActive]}>Pickleball</Text>
        </TouchableOpacity>
      </View>

      {/* Clubs List */}
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary600} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 20, paddingTop: spacing.sm }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.clubCard}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('ClubDetail', { clubId: item.id })}
            >
              <View style={styles.clubCardContent}>
                <View style={styles.clubInfo}>
                  <Text style={styles.clubName}>{item.name}</Text>
                  <Text style={styles.clubCity}>{item.city}, {item.country}</Text>
                  {(item as any).recentlyBooked && (
                    <Text style={styles.recentTag}>🕐 Jugaste aquí recientemente</Text>
                  )}
                  <View style={styles.sportTags}>
                    {item.sports.map((s) => (
                      <Badge key={s} tone={s === 'padel' ? 'emerald' : 'amber'} icon={<SportIcon sport={s} size={11} color={s === 'padel' ? colors.primary700 : colors.amber700} />}>
                        {sportLabel(s)}
                      </Badge>
                    ))}
                  </View>
                </View>
                <View style={styles.clubMeta}>
                  {item.ratingAvg > 0 && (
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={12} color={colors.amber500} />
                      <Text style={styles.rating}>{item.ratingAvg.toFixed(1)}</Text>
                    </View>
                  )}
                  {location && (item as any).latitude != null && (
                    <Text style={styles.distance}>
                      {distanceKm(location.lat, location.lng, (item as any).latitude, (item as any).longitude).toFixed(1)} km
                    </Text>
                  )}
                  <Text style={styles.courtsCount}>{(item as any).courts?.length || 0} pistas</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState icon="search-outline" title="No se encontraron clubs" description="Intenta con otra ciudad o deporte" />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primary900, paddingTop: 60, paddingBottom: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: colors.white, fontSize: fontSize.xl + 4, fontWeight: '900' },
  headerSub: { color: colors.primary300, fontSize: fontSize.sm, marginTop: 2 },
  myBookingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  myBookingsBtnText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2,
  },
  searchInput: { flex: 1, fontSize: fontSize.base, color: colors.textPrimary },
  filterRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2, borderRadius: radius.full, backgroundColor: colors.gray100 },
  filterBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterBtnActive: { backgroundColor: colors.primary600 },
  filterText: { fontSize: fontSize.sm, color: colors.gray500, fontWeight: '500' },
  filterTextActive: { color: colors.white },
  clubCard: { marginHorizontal: spacing.md, marginTop: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, ...shadow.sm },
  clubCardContent: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg },
  clubInfo: { flex: 1 },
  clubName: { fontSize: fontSize.lg - 1, fontWeight: '700', color: colors.textPrimary },
  clubCity: { fontSize: fontSize.sm, color: colors.gray500, marginTop: 2 },
  recentTag: { fontSize: fontSize.xs, color: colors.primary600, fontWeight: '600', marginTop: 2 },
  sportTags: { flexDirection: 'row', gap: spacing.xs + 2, marginTop: spacing.sm, flexWrap: 'wrap' },
  clubMeta: { alignItems: 'flex-end', gap: spacing.xs },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rating: { fontSize: fontSize.sm, color: colors.amber600, fontWeight: '600' },
  distance: { fontSize: fontSize.xs, color: colors.gray400 },
  courtsCount: { fontSize: fontSize.xs, color: colors.primary600, fontWeight: '600' },
})
