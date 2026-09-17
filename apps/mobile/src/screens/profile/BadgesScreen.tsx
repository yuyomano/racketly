import React from 'react'
import { View, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Share } from 'react-native'
import { Text } from '../../components/ui/Text'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { gamificationApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { EmptyState } from '../../components/ui/EmptyState'
import { colors } from '../../theme'

interface BadgeItem {
  id: string
  name: string
  description: string
  iconUrl: string
  xpReward: number
  earned: boolean
  earnedAt: string | null
}

export function BadgesScreen({ navigation }: { navigation: any }) {
  const { user } = useAuthStore()

  const { data, isLoading } = useQuery({
    queryKey: ['badges', user?.id],
    queryFn: () => gamificationApi.badges(user!.id),
    select: (res) => res.data.data as BadgeItem[],
    enabled: !!user?.id,
  })

  const badges = data ?? []
  const earnedCount = badges.filter((b) => b.earned).length

  function shareExternally(badge: BadgeItem) {
    Share.share({
      message: `🏆 ¡Desbloqueé la insignia "${badge.name}" en Racketly! ${badge.description}`,
    })
  }

  function shareInCommunity(badge: BadgeItem) {
    navigation.navigate('Comunidad', {
      screen: 'CreatePost',
      params: {
        initialContent: `🏆 ¡Desbloqueé la insignia "${badge.name}"! ${badge.description}`,
      },
    })
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Insignias y logros</Text>
          <Text style={styles.subtitle}>
            {earnedCount}/{badges.length} desbloqueadas
          </Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.court600} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={badges}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => (
            <View style={[styles.card, !item.earned && styles.cardLocked]}>
              <Text style={[styles.icon, !item.earned && styles.iconLocked]}>{item.iconUrl}</Text>
              {!item.earned && (
                <Ionicons
                  name="lock-closed"
                  size={14}
                  color={colors.ink400}
                  style={styles.lockIcon}
                />
              )}
              <Text style={[styles.name, !item.earned && styles.textLocked]}>{item.name}</Text>
              <Text style={[styles.description, !item.earned && styles.textLocked]}>
                {item.description}
              </Text>
              <Text style={styles.xp}>+{item.xpReward} XP</Text>
              {item.earned && (
                <View style={styles.shareRow}>
                  <TouchableOpacity style={styles.shareBtn} onPress={() => shareInCommunity(item)}>
                    <Ionicons name="people-outline" size={14} color={colors.court600} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shareBtn} onPress={() => shareExternally(item)}>
                    <Ionicons name="share-social-outline" size={14} color={colors.court600} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="ribbon-outline"
              title="Aún no hay insignias disponibles"
              description="Vuelve más tarde"
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
  subtitle: { color: colors.court300, fontSize: 12, marginTop: 2 },
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.ink100,
    alignItems: 'center',
    gap: 4,
  },
  cardLocked: { backgroundColor: colors.ink50, borderColor: colors.ink100 },
  icon: { fontSize: 36 },
  iconLocked: { opacity: 0.35 },
  lockIcon: { position: 'absolute', top: 10, right: 10 },
  name: { fontSize: 13, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  description: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  textLocked: { color: colors.ink400 },
  xp: { fontSize: 11, fontWeight: '700', color: colors.trophy600, marginTop: 2 },
  shareRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  shareBtn: {
    backgroundColor: colors.court50,
    borderRadius: 10,
    padding: 6,
  },
})
