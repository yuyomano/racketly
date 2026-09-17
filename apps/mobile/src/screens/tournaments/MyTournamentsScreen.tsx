import React, { useState } from 'react'
import { View, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Text } from '../../components/ui/Text'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { tournamentsApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { formatDate } from '@racketly/utils'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { colors } from '../../theme'
import { sportLabel } from '../../constants/sportIcons'
import { SportIcon } from '../../components/ui/SportIcons'
import { roundLabel } from './TournamentDetailScreen'

interface MyTournament {
  id: string
  tournamentId: string
  tournamentName: string
  sport: string
  status: string
  clubName: string | null
  location: string
  category: string
  startDate: string
  endDate: string
  partnerName: string | null
  paymentStatus: string
  isActive: boolean
  lastResult: { round: number; maxRound: number; won: boolean; opponentName: string | null } | null
}

const paymentLabel: Record<string, string> = {
  pending: 'Pago pendiente',
  paid: 'Pagado',
  courtesy: 'Cortesía',
}

export function MyTournamentsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'active' | 'finished'>('active')

  const { data, isLoading } = useQuery({
    queryKey: ['my-tournaments', user?.id],
    queryFn: () => tournamentsApi.mine(user!.id),
    select: (res) => res.data.data as MyTournament[],
    enabled: !!user?.id,
  })

  const tournaments = (data ?? []).filter((t) => (tab === 'active' ? t.isActive : !t.isActive))

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Mis torneos</Text>
      </View>

      <View style={styles.filters}>
        {(['active', 'finished'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.filterChip, tab === t && styles.filterChipActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.filterChipText, tab === t && styles.filterChipTextActive]}>
              {t === 'active' ? 'Activos' : 'Finalizados'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.court600} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                navigation.navigate('TournamentDetail', {
                  tournament: {
                    id: item.tournamentId,
                    name: item.tournamentName,
                    sport: item.sport,
                    status: item.status,
                    location: item.location,
                    category: item.category,
                    startDate: item.startDate,
                    endDate: item.endDate,
                  },
                })
              }
            >
              <View style={styles.cardHeader}>
                <Badge
                  tone={item.sport === 'padel' ? 'emerald' : 'amber'}
                  icon={
                    <SportIcon
                      sport={item.sport}
                      size={11}
                      color={item.sport === 'padel' ? colors.court700 : colors.trophy700}
                    />
                  }
                >
                  {sportLabel(item.sport)}
                </Badge>
                <Badge tone="violet">{item.category}</Badge>
                {item.status === 'in_progress' && (
                  <Badge tone="red" icon={<Ionicons name="radio" size={10} color={colors.referee600} />}>
                    En vivo
                  </Badge>
                )}
              </View>
              <Text style={styles.tournamentName}>{item.tournamentName}</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                <Text style={styles.location}>{item.location}</Text>
              </View>
              <View style={styles.dateRow}>
                <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                <Text style={styles.date}>{formatDate(item.startDate)}</Text>
              </View>
              {item.partnerName && (
                <View style={styles.dateRow}>
                  <Ionicons name="people-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.date}>Pareja: {item.partnerName}</Text>
                </View>
              )}
              <View style={styles.footerRow}>
                <Badge tone={item.paymentStatus === 'paid' ? 'emerald' : 'amber'}>
                  {paymentLabel[item.paymentStatus] ?? item.paymentStatus}
                </Badge>
                {item.lastResult && (
                  <Text style={[styles.result, item.lastResult.won && styles.resultWon]}>
                    {item.lastResult.round === item.lastResult.maxRound && item.lastResult.won
                      ? '🏆 Campeón'
                      : `${item.lastResult.won ? 'Ganó' : 'Perdió'} en ${roundLabel(item.lastResult.round, item.lastResult.maxRound)}`}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="trophy-outline"
              title={tab === 'active' ? 'No tienes torneos activos' : 'No tienes torneos finalizados'}
              description="Los torneos en los que te inscribas aparecerán aquí"
            />
          }
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
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: { padding: 2 },
  title: { color: colors.white, fontSize: 22, fontWeight: '900' },
  filters: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink100,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.ink50,
  },
  filterChipActive: { backgroundColor: colors.court600 },
  filterChipText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  filterChipTextActive: { color: colors.white },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.ink100,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', gap: 8 },
  tournamentName: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  locationRow: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  location: { fontSize: 13, color: colors.textMuted },
  dateRow: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  date: { fontSize: 12, color: colors.textMuted },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  result: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  resultWon: { color: colors.court700 },
})
