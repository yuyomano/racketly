'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations, useLocale } from 'next-intl'
import { Heart, MessageCircle, Send, Loader2 } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Post, Comment } from '@racketly/shared-types'

type PostWithAuthor = Post & {
  author?: { id: string; playerProfile?: { displayName?: string; avatarUrl?: string | null } }
}
type CommentWithAuthor = Comment & {
  author?: { id: string; playerProfile?: { displayName?: string; avatarUrl?: string | null } }
}

const SPORT_OPTIONS: { value: string | null; labelKey: 'general' | 'padel' | 'pickleball' }[] = [
  { value: null, labelKey: 'general' },
  { value: 'padel', labelKey: 'padel' },
  { value: 'pickleball', labelKey: 'pickleball' },
]

export function CommunityFeedClient({ userId }: { userId: string }) {
  const t = useTranslations('Community')
  const qc = useQueryClient()
  const [content, setContent] = useState('')
  const [sportTag, setSportTag] = useState<string | null>(null)
  const [openComments, setOpenComments] = useState<string | null>(null)

  const { data: posts, isLoading } = useQuery({
    queryKey: ['community-feed', userId],
    queryFn: async () => {
      const res = await fetch(`/api/posts?userId=${userId}&limit=30`, { cache: 'no-store' })
      const json = await res.json()
      return (json.data ?? []) as PostWithAuthor[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorId: userId,
          type: 'text',
          content: content.trim(),
          sportTag: sportTag || undefined,
        }),
      })
      if (!res.ok) throw new Error(t('createPost.errorPublish'))
      return res.json()
    },
    onSuccess: () => {
      setContent('')
      setSportTag(null)
      qc.invalidateQueries({ queryKey: ['community-feed', userId] })
    },
  })

  const likeMutation = useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetch(`/api/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      return res.json()
    },
    onMutate: async (postId: string) => {
      await qc.cancelQueries({ queryKey: ['community-feed', userId] })
      const previous = qc.getQueryData<PostWithAuthor[]>(['community-feed', userId])
      qc.setQueryData<PostWithAuthor[]>(['community-feed', userId], (old) =>
        old?.map((p) =>
          p.id === postId
            ? {
                ...p,
                isLikedByMe: !p.isLikedByMe,
                likesCount: p.likesCount + (p.isLikedByMe ? -1 : 1),
              }
            : p
        )
      )
      return { previous }
    },
    onError: (_err, _postId, ctx) => {
      if (ctx?.previous) qc.setQueryData(['community-feed', userId], ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['community-feed', userId] }),
  })

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>

      {/* Crear post */}
      <Card>
        <CardBody className="space-y-3">
          <textarea
            className="w-full resize-none border border-ink-200 rounded-xl px-3.5 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-court-500/30 focus:border-court-400"
            rows={3}
            placeholder={t('createPost.placeholder')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {SPORT_OPTIONS.map((s) => (
                <button
                  key={s.labelKey}
                  onClick={() => setSportTag(s.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    sportTag === s.value
                      ? 'bg-court-50 text-court-700 ring-1 ring-court-600/20'
                      : 'bg-ink-50 text-ink-500 hover:bg-ink-100'
                  }`}
                >
                  {t(`createPost.sports.${s.labelKey}`)}
                </button>
              ))}
            </div>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!content.trim() || createMutation.isPending}
              className="flex items-center gap-1.5 bg-court-600 hover:bg-court-700 disabled:opacity-50 disabled:hover:bg-court-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('createPost.publish')}
            </button>
          </div>
        </CardBody>
      </Card>

      {/* Feed */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-court-500 animate-spin" />
        </div>
      ) : !posts || posts.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title={t('feed.emptyTitle')}
          description={t('feed.emptyDescription')}
        />
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              userId={userId}
              isOpen={openComments === post.id}
              onToggleComments={() => setOpenComments(openComments === post.id ? null : post.id)}
              onLike={() => likeMutation.mutate(post.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PostCard({
  post,
  userId,
  isOpen,
  onToggleComments,
  onLike,
}: {
  post: PostWithAuthor
  userId: string
  isOpen: boolean
  onToggleComments: () => void
  onLike: () => void
}) {
  const t = useTranslations('Community')
  const locale = useLocale()
  const dateLocale = locale === 'en' ? 'en-US' : 'es-CO'
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-court-50 flex items-center justify-center text-court-700 font-bold text-sm shrink-0">
            {(post.author?.playerProfile?.displayName || '?')[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink-900 truncate">
              {post.author?.playerProfile?.displayName || t('feed.anonymous')}
            </p>
            <p className="text-xs text-ink-400">
              {new Date(post.createdAt).toLocaleDateString(dateLocale)}
            </p>
          </div>
          {post.sportTag && (
            <div className="ml-auto">
              <Badge tone={post.sportTag === 'padel' ? 'emerald' : 'amber'}>{post.sportTag}</Badge>
            </div>
          )}
        </div>

        <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">{post.content}</p>

        <div className="flex items-center gap-5 pt-2 border-t border-ink-100">
          <button
            onClick={onLike}
            className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-referee-500 transition-colors"
          >
            <Heart
              className={`w-4 h-4 ${post.isLikedByMe ? 'fill-referee-500 text-referee-500' : ''}`}
              strokeWidth={2}
            />
            <span className={post.isLikedByMe ? 'text-referee-500 font-semibold' : ''}>
              {post.likesCount}
            </span>
          </button>
          <button
            onClick={onToggleComments}
            className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-court-600 transition-colors"
          >
            <MessageCircle className="w-4 h-4" strokeWidth={2} />
            {post.commentsCount}
          </button>
        </div>

        {isOpen && <CommentsSection postId={post.id} userId={userId} />}
      </CardBody>
    </Card>
  )
}

function CommentsSection({ postId, userId }: { postId: string; userId: string }) {
  const t = useTranslations('Community')
  const qc = useQueryClient()
  const [text, setText] = useState('')

  const { data: comments, isLoading } = useQuery({
    queryKey: ['post-comments', postId],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${postId}/comments`, { cache: 'no-store' })
      const json = await res.json()
      return (json.data ?? []) as CommentWithAuthor[]
    },
  })

  const commentMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorId: userId, content: text.trim() }),
      })
      if (!res.ok) throw new Error(t('comments.errorComment'))
      return res.json()
    },
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: ['post-comments', postId] })
      qc.invalidateQueries({ queryKey: ['community-feed'] })
    },
  })

  return (
    <div className="pt-3 border-t border-ink-100 space-y-3">
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 text-court-500 animate-spin" />
        </div>
      ) : !comments || comments.length === 0 ? (
        <p className="text-xs text-ink-400 text-center py-2">{t('comments.emptyState')}</p>
      ) : (
        <div className="space-y-2.5">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-court-50 flex items-center justify-center text-court-700 font-bold text-xs shrink-0">
                {(c.author?.playerProfile?.displayName || '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 bg-ink-50 rounded-xl px-3 py-2">
                <p className="text-xs font-bold text-ink-900">
                  {c.author?.playerProfile?.displayName || t('feed.anonymous')}
                </p>
                <p className="text-sm text-ink-700">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) commentMutation.mutate()
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('comments.placeholder')}
          className="flex-1 border border-ink-200 rounded-full px-3.5 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-court-500/30 focus:border-court-400"
        />
        <button
          type="submit"
          disabled={!text.trim() || commentMutation.isPending}
          className="w-9 h-9 rounded-full bg-court-600 hover:bg-court-700 disabled:opacity-50 text-white flex items-center justify-center shrink-0 transition-colors"
        >
          {commentMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>
    </div>
  )
}
