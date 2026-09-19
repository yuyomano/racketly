import React from 'react'
import { View, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { Text } from '../../components/ui/Text'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { rankingsApi, profileApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { eloToCategory } from '@racketly/utils'
import { EmptyState } from '../../components/ui/EmptyState'
import { colors } from '../../theme'

type EloHistoryItem = {
  id: string
  sport: 'padel' | 'pickleball' | 'both'
  eloBefore: number
  eloAfter: number
  delta: number
  createdAt: string
}

type Stats = { totalMatches: number; wins: number; losses: number; winRate: number }

export function DetailedStatsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuthStore()

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ['eloHistory', user?.id],
    queryFn: () => rankingsApi.eloHistory(user!.id),
    select: (res) => (res.data.data as EloHistoryItem[]).slice().reverse(),
    enabled: !!user?.id,
  })

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['profileStats', user?.id],
    queryFn: () => profileApi.getStats(user!.id),
    select: (res) => res.data.data.stats as Stats,
    enabled: !!user?.id,
  })

  const isLoading = loadingHistory || loadingStats
  const padelHistory = (history ?? []).filter((h) => h.sport === 'padel' || h.sport === 'both')
  const pickleHistory = (history ?? []).filter((h) => h.sport === 'pickleball')

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Estadísticas detalladas</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.court600} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ padding: 16, gap: 16 }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Rendimiento</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats?.totalMatches ?? 0}</Text>
                <Text style={styles.statLabel}>Jugados</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.court600 }]}>
                  {stats?.wins ?? 0}
                </Text>
                <Text style={styles.statLabel}>Ganados</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.referee500 }]}>
                  {stats?.losses ?? 0}
                </Text>
                <Text style={styles.statLabel}>Perdidos</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats?.winRate ?? 0}%</Text>
                <Text style={styles.statLabel}>Efectividad</Text>
              </View>
            </View>
          </View>

          <EloTrendCard title="Evolución ELO Pádel" history={padelHistory} />
          <EloTrendCard title="Evolución ELO Pickleball" history={pickleHistory} />
        </View>
      )}
    </ScrollView>
  )
}

function EloTrendCard({ title, history }: { title: string; history: EloHistoryItem[] }) {
  if (history.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{title}</Text>
        <EmptyState
          icon="stats-chart-outline"
          title="Sin partidos registrados"
          description="Juega tu primer partido para ver tu progreso"
        />
      </View>
    )
  }

  const values = history.map((h) => h.eloAfter)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const latest = history[history.length - 1]
  const category = eloToCategory(latest.eloAfter)

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.categoryPill}>{category}</Text>
      </View>
      <View style={styles.chartRow}>
        {history.map((h) => {
          const heightPct = 12 + ((h.eloAfter - min) / range) * 88
          const positive = h.delta >= 0
          return (
            <View key={h.id} style={styles.barWrap}>
              <View
                style={[
                  styles.bar,
                  {
                    height: `${heightPct}%`,
                    backgroundColor: positive ? colors.court500 : colors.referee500,
                  },
                ]}
              />
            </View>
          )
        })}
      </View>
      <View style={styles.chartFooter}>
        <Text style={styles.chartFooterText}>{min}</Text>
        <Text style={styles.chartFooterText}>ELO actual: {latest.eloAfter}</Text>
        <Text style={styles.chartFooterText}>{max}</Text>
      </View>
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
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.ink100,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, marginBottom: 12 },
  categoryPill: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.court700,
    backgroundColor: colors.court50,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '900', color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.ink400, marginTop: 2 },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: 4,
  },
  barWrap: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, minHeight: 4 },
  chartFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  chartFooterText: { fontSize: 11, color: colors.ink400 },
})
