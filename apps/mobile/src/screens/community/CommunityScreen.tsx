import React from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { communityApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import type { Post } from '@racketly/shared-types'
import { Badge } from '../../components/ui/Badge'
import { ScreenHeader } from '../../components/ui/ScreenHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { colors } from '../../theme'

export function CommunityScreen({ navigation }: { navigation: any }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['community-feed', user?.id],
    queryFn: () => communityApi.getFeed({ userId: user?.id }),
    select: (res) => res.data.data as Post[],
  })

  const likeMutation = useMutation({
    mutationFn: (postId: string) => communityApi.likePost(postId, user!.id),
    onMutate: async (postId: string) => {
      await qc.cancelQueries({ queryKey: ['community-feed', user?.id] })
      const previous = qc.getQueryData<{ data: { data: Post[] } }>(['community-feed', user?.id])
      qc.setQueryData(['community-feed', user?.id], (old: any) => {
        if (!old) return old
        return {
          ...old,
          data: {
            ...old.data,
            data: old.data.data.map((p: Post) =>
              p.id === postId
                ? { ...p, isLikedByMe: !p.isLikedByMe, likesCount: p.likesCount + (p.isLikedByMe ? -1 : 1) }
                : p
            ),
          },
        }
      })
      return { previous }
    },
    onError: (_err, _postId, context) => {
      if (context?.previous) qc.setQueryData(['community-feed', user?.id], context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['community-feed', user?.id] }),
  })

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="👥 Comunidad"
        right={
          <TouchableOpacity style={styles.postBtn} onPress={() => navigation.navigate('CreatePost')}>
            <Ionicons name="add" size={14} color={colors.white} />
            <Text style={styles.postBtnText}>Publicar</Text>
          </TouchableOpacity>
        }
      />

      {/* Groups Quick Access */}
      <View style={styles.groupsRow}>
        {groupShortcuts.map((g) => (
          <TouchableOpacity key={g.label} style={styles.groupChip}>
            <Text style={styles.groupEmoji}>{g.emoji}</Text>
            <Text style={styles.groupLabel}>{g.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.postCard}>
              <View style={styles.postHeader}>
                <Skeleton style={{ width: 36, height: 36, borderRadius: 18 }} />
                <View style={{ marginLeft: 8 }}>
                  <Skeleton style={{ width: 100, height: 13, marginBottom: 4 }} />
                  <Skeleton style={{ width: 60, height: 11 }} />
                </View>
              </View>
              <Skeleton style={{ width: '90%', height: 13, marginTop: 12, marginBottom: 6 }} />
              <Skeleton style={{ width: '70%', height: 13 }} />
            </View>
          ))}
        </View>
      ) : !data || data.length === 0 ? (
        <EmptyState icon="chatbubbles-outline" title="Aún no hay publicaciones" description="¡Sé el primero en publicar algo!" />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onLike={() => likeMutation.mutate(item.id)}
              onComment={() => navigation.navigate('PostDetail', { post: item })}
            />
          )}
        />
      )}
    </View>
  )
}

function PostCard({ post, onLike, onComment }: { post: Post; onLike: () => void; onComment: () => void }) {
  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={17} color={colors.primary700} />
        </View>
        <View>
          <Text style={styles.authorName}>{(post as any).author?.playerProfile?.displayName || 'Anónimo'}</Text>
          <Text style={styles.postTime}>{new Date(post.createdAt).toLocaleDateString('es-CO')}</Text>
        </View>
        {post.sportTag && (
          <View style={{ marginLeft: 'auto' }}>
            <Badge tone={post.sportTag === 'padel' ? 'emerald' : 'amber'}>{post.sportTag}</Badge>
          </View>
        )}
      </View>
      <Text style={styles.postContent}>{post.content}</Text>
      {post.mediaUrls?.length > 0 && (
        <Image source={{ uri: post.mediaUrls[0] }} style={styles.postMedia} resizeMode="cover" />
      )}
      <View style={styles.postFooter}>
        <TouchableOpacity style={styles.actionBtn} onPress={onLike} hitSlop={6}>
          <Ionicons
            name={post.isLikedByMe ? 'heart' : 'heart-outline'}
            size={16}
            color={post.isLikedByMe ? colors.red500 : colors.gray500}
          />
          <Text style={[styles.actionText, post.isLikedByMe && { color: colors.red500 }]}>{post.likesCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onComment} hitSlop={6}>
          <Ionicons name="chatbubble-outline" size={15} color={colors.gray500} />
          <Text style={styles.actionText}>{post.commentsCount}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const groupShortcuts = [
  { emoji: '🏓', label: 'Técnica' },
  { emoji: '🧠', label: 'Táctica' },
  { emoji: '🎯', label: 'Palas' },
  { emoji: '🏆', label: 'Torneos' },
]

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  postBtn: { flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: '#10b981', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  postBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  groupsRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  groupChip: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f3f4f6', borderRadius: 12 },
  groupEmoji: { fontSize: 18 },
  groupLabel: { fontSize: 10, color: '#6b7280', marginTop: 2, fontWeight: '600' },
  postCard: { margin: 12, marginBottom: 4, backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18 },
  authorName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  postTime: { fontSize: 11, color: '#9ca3af' },
  sportBadge: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  padelBadge: { backgroundColor: '#d1fae5' },
  pickleBadge: { backgroundColor: '#fef3c7' },
  sportBadgeText: { fontSize: 10, fontWeight: '600' },
  postContent: { fontSize: 14, color: '#374151', lineHeight: 20, marginBottom: 10 },
  postMedia: { width: '100%', height: 200, borderRadius: 12, marginBottom: 10 },
  postFooter: { flexDirection: 'row', gap: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, color: '#6b7280' },
})
