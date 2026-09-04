import React from 'react'
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native'
import { Text } from '../../components/ui/Text'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { communityApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import type { Post } from '@racketly/shared-types'
import { Badge } from '../../components/ui/Badge'
import { PadelIcon } from '../../components/ui/SportIcons'
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
                ? {
                    ...p,
                    isLikedByMe: !p.isLikedByMe,
                    likesCount: p.likesCount + (p.isLikedByMe ? -1 : 1),
                  }
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
      <View style={styles.header}>
        <Text style={styles.title}>Comunidad</Text>
        <TouchableOpacity style={styles.postBtn} onPress={() => navigation.navigate('CreatePost')}>
          <Ionicons name="add" size={14} color={colors.white} />
          <Text style={styles.postBtnText}>Publicar</Text>
        </TouchableOpacity>
      </View>

      {/* Groups Quick Access */}
      <View style={styles.groupsRow}>
        {groupShortcuts.map((g) => (
          <TouchableOpacity key={g.label} style={styles.groupChip}>
            {g.label === 'Palas' ? (
              <PadelIcon size={18} color={colors.ink700} />
            ) : (
              <Ionicons name={g.icon} size={18} color={colors.ink700} />
            )}
            <Text style={styles.groupLabel}>{g.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.court600} style={{ marginTop: 40 }} />
      ) : !data || data.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name="chatbubbles-outline"
            size={44}
            color={colors.ink300}
            style={{ marginBottom: 12 }}
          />
          <Text style={styles.emptyText}>Aún no hay publicaciones</Text>
          <Text style={styles.emptySub}>¡Sé el primero en publicar algo!</Text>
        </View>
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

function PostCard({
  post,
  onLike,
  onComment,
}: {
  post: Post
  onLike: () => void
  onComment: () => void
}) {
  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={17} color={colors.court700} />
        </View>
        <View>
          <Text style={styles.authorName}>
            {(post as any).author?.playerProfile?.displayName || 'Anónimo'}
          </Text>
          <Text style={styles.postTime}>
            {new Date(post.createdAt).toLocaleDateString('es-CO')}
          </Text>
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
            color={post.isLikedByMe ? colors.referee500 : colors.ink500}
          />
          <Text style={[styles.actionText, post.isLikedByMe && { color: colors.referee500 }]}>
            {post.likesCount}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onComment} hitSlop={6}>
          <Ionicons name="chatbubble-outline" size={15} color={colors.ink500} />
          <Text style={styles.actionText}>{post.commentsCount}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const groupShortcuts: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'body-outline', label: 'Técnica' },
  { icon: 'bulb-outline', label: 'Táctica' },
  { icon: 'tennisball-outline', label: 'Palas' },
  { icon: 'trophy-outline', label: 'Torneos' },
]

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.court900,
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: { color: colors.white, fontSize: 22, fontWeight: '900' },
  postBtn: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    backgroundColor: colors.court500,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  postBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  groupsRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink100,
  },
  groupChip: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.ink50,
    borderRadius: 12,
    gap: 3,
  },
  groupLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, color: colors.textMuted, fontWeight: '600' },
  emptySub: { fontSize: 13, color: colors.ink400, marginTop: 4 },
  postCard: {
    margin: 12,
    marginBottom: 4,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.ink100,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.court100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  postTime: { fontSize: 11, color: colors.ink400 },
  postContent: { fontSize: 14, color: colors.ink700, lineHeight: 20, marginBottom: 10 },
  postMedia: { width: '100%', height: 200, borderRadius: 12, marginBottom: 10 },
  postFooter: {
    flexDirection: 'row',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: colors.ink100,
    paddingTop: 10,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, color: colors.textMuted },
})
