import React, { useState } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Text } from '../../components/ui/Text'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { communityApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { BackButton } from '../../components/ui/BackButton'
import { Badge } from '../../components/ui/Badge'
import type { Post, Comment } from '@racketly/shared-types'
import { colors } from '../../theme'

type CommentWithAuthor = Comment & {
  author?: { id: string; playerProfile?: { displayName?: string; avatarUrl?: string } }
  replies?: CommentWithAuthor[]
}

export function PostDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const post = route.params.post as Post
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [text, setText] = useState('')

  const { data: comments, isLoading } = useQuery({
    queryKey: ['post-comments', post.id],
    queryFn: () => communityApi.getComments(post.id),
    select: (res) => res.data.data as CommentWithAuthor[],
  })

  const likeMutation = useMutation({
    mutationFn: () => communityApi.likePost(post.id, user!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-feed'] }),
  })

  const commentMutation = useMutation({
    mutationFn: () =>
      communityApi.addComment(post.id, { authorId: user!.id, content: text.trim() }),
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: ['post-comments', post.id] })
      qc.invalidateQueries({ queryKey: ['community-feed'] })
    },
  })

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} light={false} />
        <Text style={styles.title}>Publicación</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
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
                <Badge tone={post.sportTag === 'padel' ? 'emerald' : 'amber'}>
                  {post.sportTag}
                </Badge>
              </View>
            )}
          </View>
          <Text style={styles.postContent}>{post.content}</Text>
          <View style={styles.postFooter}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => likeMutation.mutate()}
              hitSlop={6}
            >
              <Ionicons
                name={post.isLikedByMe ? 'heart' : 'heart-outline'}
                size={16}
                color={post.isLikedByMe ? colors.referee500 : colors.ink500}
              />
              <Text style={styles.actionText}>{post.likesCount}</Text>
            </TouchableOpacity>
            <View style={styles.actionBtn}>
              <Ionicons name="chatbubble-outline" size={15} color={colors.ink500} />
              <Text style={styles.actionText}>{comments?.length ?? post.commentsCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Comentarios</Text>
          {isLoading ? (
            <ActivityIndicator color={colors.court600} style={{ marginTop: 20 }} />
          ) : !comments || comments.length === 0 ? (
            <Text style={styles.emptyComments}>Sé el primero en comentar</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <View style={styles.commentAvatar}>
                  <Ionicons name="person" size={14} color={colors.court700} />
                </View>
                <View style={styles.commentBody}>
                  <Text style={styles.commentAuthor}>
                    {c.author?.playerProfile?.displayName || 'Anónimo'}
                  </Text>
                  <Text style={styles.commentText}>{c.content}</Text>
                </View>
              </View>
            ))
          )}
        </View>
        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.commentInput}
          placeholder="Escribe un comentario..."
          placeholderTextColor={colors.ink400}
          value={text}
          onChangeText={setText}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={() => commentMutation.mutate()}
          disabled={!text.trim() || commentMutation.isPending}
        >
          {commentMutation.isPending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="send" size={16} color={colors.white} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink100,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink700 },
  scroll: { flex: 1 },
  postCard: { padding: 16, borderBottomWidth: 8, borderBottomColor: colors.bg },
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
  postContent: { fontSize: 15, color: colors.ink700, lineHeight: 21, marginBottom: 12 },
  postFooter: {
    flexDirection: 'row',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: colors.ink100,
    paddingTop: 10,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, color: colors.textMuted },
  commentsSection: { padding: 16 },
  commentsTitle: { fontSize: 14, fontWeight: '700', color: colors.ink700, marginBottom: 12 },
  emptyComments: { fontSize: 13, color: colors.ink400, textAlign: 'center', marginTop: 12 },
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.court100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentBody: { flex: 1, backgroundColor: colors.bg, borderRadius: 12, padding: 10 },
  commentAuthor: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  commentText: { fontSize: 13, color: colors.ink700, lineHeight: 18 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.ink100,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.ink100,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.textPrimary,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.court600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
})
