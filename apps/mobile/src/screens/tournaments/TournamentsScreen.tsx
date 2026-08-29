import React, { useState, useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { tournamentsApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import type { Tournament } from '@racketly/shared-types'
import { formatDate } from '@racketly/utils'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { ScreenHeader } from '../../components/ui/ScreenHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Button } from '../../components/ui/Button'
import { colors } from '../../theme'
import { sportLabel } from '../../constants/sportIcons'
import { SportIcon } from '../../components/ui/SportIcons'

export function TournamentsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuthStore()
  const [sport, setSport] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('open')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)

  // Por defecto solo mostramos torneos de clubes cercanos o donde jugué en los últimos
  // 3 meses (mismo criterio que "Dónde jugamos hoy?"). Para ver todos, hay que buscar
  // el club específico desde Home → Club → Torneos.
  useEffect(() => {
    ;(async () => {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync()
      if (permStatus === 'granted') {
        const loc = await Location.getCurrentPositionAsync({})
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude })
      }
    })()
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['tournaments', { sport, status, userId: user?.id, ...location }],
    queryFn: () => tournamentsApi.list({
      sport: sport || undefined,
      status,
      userId: user?.id,
      lat: location?.lat,
      lng: location?.lng,
      radius: 30,
    }),
    select: (res) => res.data.data as Tournament[],
    enabled: !!user?.id,
  })

  return (
    <View style={styles.container}>
      <ScreenHeader title="🏆 Torneos y Ligas" subtitle="Cerca de ti o en clubes donde jugaste (últimos 3 meses)">
        {/* Accesos rápidos */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('Home')}
          >
            <Ionicons name="search" size={14} color={colors.white} />
            <Text style={styles.quickBtnText}>Buscar en clubes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('FindPartner')}
          >
            <Ionicons name="people" size={14} color={colors.white} />
            <Text style={styles.quickBtnText}>Find a Partner</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickBtn, styles.quickBtnLive]}
            onPress={() => setStatus('in_progress')}
          >
            <Ionicons name="radio" size={14} color={colors.white} />
            <Text style={styles.quickBtnText}>En Vivo</Text>
          </TouchableOpacity>
        </View>
      </ScreenHeader>

      {/* Filters */}
      <View style={styles.filters}>
        {['open', 'in_progress', 'completed'].map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.filterChip, status === s && styles.filterChipActive]}
            onPress={() => setStatus(s)}
          >
            <Text style={[styles.filterChipText, status === s && styles.filterChipTextActive]}>
              {s === 'open' ? 'Abiertos' : s === 'in_progress' ? 'En curso' : 'Finalizados'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ padding: 16, gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.card}>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <Skeleton style={{ width: 60, height: 20, borderRadius: 10 }} />
                <Skeleton style={{ width: 50, height: 20, borderRadius: 10 }} />
              </View>
              <Skeleton style={{ width: '70%', height: 16, marginBottom: 8 }} />
              <Skeleton style={{ width: '45%', height: 13 }} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('TournamentDetail', { tournament: item })}>
              {item.sponsorLogoUrl && (
                <View style={styles.sponsored}>
                  <Text style={styles.sponsoredText}>Patrocinado</Text>
                </View>
              )}
              <View style={styles.cardHeader}>
                <Badge
                  tone={item.sport === 'padel' ? 'emerald' : 'amber'}
                  icon={<SportIcon sport={item.sport} size={11} color={item.sport === 'padel' ? colors.primary700 : colors.amber700} />}
                >
                  {sportLabel(item.sport)}
                </Badge>
                <Badge tone="violet">{item.category}</Badge>
              </View>
              <Text style={styles.tournamentName}>{item.name}</Text>
              <Text style={styles.location}>📍 {item.location}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.date}>📅 {formatDate(item.startDate)}</Text>
                <View style={styles.participants}>
                  <Text style={styles.participantsText}>
                    {item.currentParticipants}/{item.maxParticipants} jugadores
                  </Text>
                </View>
              </View>
              {item.entryFee > 0 && (
                <Text style={styles.entryFee}>
                  💳 Inscripción: {item.entryFee} {item.currency}
                </Text>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="trophy-outline"
              title="Sin torneos cerca o en tus clubes habituales"
              description="Toca 'Buscar en clubes' arriba para revisar si algún otro club tiene torneos abiertos"
            />
          }
        />
      )}

      {/* FAB */}
      <Button onPress={() => navigation.navigate('CreateTournament')} style={styles.fab}>
        <Ionicons name="add" size={16} color={colors.white} /> Crear torneo
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  quickActions: { flexDirection: 'row', gap: 8 },
  quickBtn: { flex: 1, flexDirection: 'row', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  quickBtnLive: { backgroundColor: 'rgba(220,38,38,0.3)' },
  quickBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  filters: { flexDirection: 'row', gap: 8, padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6' },
  filterChipActive: { backgroundColor: '#059669' },
  filterChipText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  sponsored: { position: 'absolute', top: 12, right: 12, backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  sponsoredText: { fontSize: 10, color: '#92400e', fontWeight: '600' },
  cardHeader: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  sportBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  padelBadge: { backgroundColor: '#d1fae5' },
  pickleBadge: { backgroundColor: '#fef3c7' },
  sportBadgeText: { fontSize: 12, fontWeight: '600' },
  categoryBadge: { backgroundColor: '#ede9fe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  categoryText: { fontSize: 12, color: '#6d28d9', fontWeight: '700' },
  tournamentName: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 4 },
  location: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 12, color: '#6b7280' },
  participants: { backgroundColor: '#f0fdf4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  participantsText: { fontSize: 12, color: '#059669', fontWeight: '600' },
  entryFee: { fontSize: 13, color: '#7c3aed', fontWeight: '600', marginTop: 8 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#9ca3af' },
  fab: {
    position: 'absolute', bottom: 24, right: 24, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 30, shadowColor: colors.primary600, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
})
