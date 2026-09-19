'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Bell, MapPin, Users, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

type Notification = {
  id: string
  type: string
  title: string
  body: string
  isRead: boolean
  createdAt: string
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  nearby_court: MapPin,
  rival_available: Users,
  tournament_category: Trophy,
}

async function fetchNotifications(): Promise<Notification[]> {
  const res = await fetch('/api/notifications')
  const data = await res.json()
  if (!res.ok) return []
  return data.data ?? []
}

export function NotificationsClient() {
  const t = useTranslations('ProfileNotifications')
  const queryClient = useQueryClient()

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
  })

  const markRead = useMutation({
    mutationFn: (id: string) => fetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllRead = useMutation({
    mutationFn: () => fetch('/api/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const hasUnread = (notifications ?? []).some((n) => !n.isRead)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/profile"
          className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t('backLink')}
        </Link>
        {hasUnread && (
          <button
            onClick={() => markAllRead.mutate()}
            className="text-xs font-semibold text-court-600 hover:text-court-700"
          >
            {t('markAll')}
          </button>
        )}
      </div>

      <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (notifications ?? []).length === 0 ? (
        <Card className="p-10 flex flex-col items-center text-center text-ink-400">
          <Bell className="w-6 h-6 mb-2" />
          <p className="text-sm">{t('empty')}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {(notifications ?? []).map((n) => {
            const Icon = TYPE_ICONS[n.type] ?? Bell
            return (
              <Card
                key={n.id}
                onClick={() => !n.isRead && markRead.mutate(n.id)}
                className={cn(
                  'p-4 flex items-center gap-3 cursor-pointer',
                  !n.isRead && 'border-court-500 bg-court-50'
                )}
              >
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-court-700" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-ink-900">{n.title}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{n.body}</p>
                </div>
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-court-500 shrink-0" />}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
