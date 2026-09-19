import React from 'react'
import { View, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native'
import { Text } from '../../components/ui/Text'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { notificationsApi } from '../../services/api'
import { EmptyState } from '../../components/ui/EmptyState'
import { colors, spacing, radius, fontSize } from '../../theme'

type Notification = {
  id: string
  type: string
  title: string
  body: string
  isRead: boolean
  createdAt: string
}

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  nearby_court: 'location-outline',
  rival_available: 'people-outline',
  tournament_category: 'trophy-outline',
}

export function NotificationsScreen({ navigation }: { navigation: any }) {
  const queryClient = useQueryClient()

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(),
    select: (res) => res.data.data as Notification[],
  })

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const hasUnread = (notifications ?? []).some((n) => !n.isRead)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Notificaciones</Text>
        {hasUnread && (
          <TouchableOpacity onPress={() => markAllRead.mutate()}>
            <Text style={styles.markAllText}>Marcar todas</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.court600} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notifications ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="Sin notificaciones"
              description="Aquí verás alertas sobre canchas, rivales y torneos"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, !item.isRead && styles.cardUnread]}
              onPress={() => !item.isRead && markRead.mutate(item.id)}
            >
              <View style={styles.iconWrap}>
                <Ionicons
                  name={TYPE_ICONS[item.type] ?? 'notifications-outline'}
                  size={18}
                  color={colors.court700}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.body}</Text>
              </View>
              {!item.isRead && <View style={styles.dot} />}
            </TouchableOpacity>
          )}
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
  title: { flex: 1, color: colors.white, fontSize: 22, fontWeight: '900' },
  markAllText: { color: colors.court50, fontSize: fontSize.sm, fontWeight: '700' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.ink100,
  },
  cardUnread: { borderColor: colors.court500, backgroundColor: colors.court50 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.textPrimary },
  cardBody: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.court500 },
})
