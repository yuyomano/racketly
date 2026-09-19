'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, Clock, GraduationCap, Loader2, MapPin, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'

type MyEnrollment = {
  id: string
  progressPercent: number
  course: {
    id: string
    title: string
    sport: string
    level: string
    instructor: { displayName: string }
    _count: { lessons: number }
  }
}

type MyClassBooking = {
  id: string
  session: {
    id: string
    title: string
    date: string
    startTime: string
    durationMinutes: number
    locationDescription: string
    status: string
    instructor: { displayName: string }
    club: { id: string; name: string; city: string } | null
  }
}

async function fetchMyEnrollments(userId: string, errorMessage: string): Promise<MyEnrollment[]> {
  const res = await fetch(`/api/courses/enrollments/user/${userId}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.data ?? []
}

async function fetchMyClasses(errorMessage: string): Promise<MyClassBooking[]> {
  const res = await fetch('/api/instructors/sessions/mine')
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.data ?? []
}

export function MyCoursesClient({ userId }: { userId: string }) {
  const t = useTranslations('Academy.mine')
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: enrollments, isLoading } = useQuery({
    queryKey: ['courses', 'mine', userId],
    queryFn: () => fetchMyEnrollments(userId, t('errorFetch')),
  })

  const { data: classes, isLoading: classesLoading } = useQuery({
    queryKey: ['instructor-sessions', 'mine', userId],
    queryFn: () => fetchMyClasses(t('errorFetchClasses')),
  })

  const cancelMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/instructors/sessions/${sessionId}/book`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('errorCancelClass'))
      return data
    },
    onSuccess: () => {
      toast.success(t('classCancelledToast'))
      queryClient.invalidateQueries({ queryKey: ['instructor-sessions', 'mine', userId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <Link
        href="/academy"
        className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('backLink')}
      </Link>

      <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>

      <h2 className="text-lg font-black text-ink-900 tracking-tight">{t('coursesTitle')}</h2>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : !enrollments || enrollments.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Link
              href="/academy"
              className="text-sm font-semibold text-white bg-court-600 hover:bg-court-700 rounded-xl px-5 py-2.5 transition-colors"
            >
              {t('emptyAction')}
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {enrollments.map((e) => (
            <Link key={e.id} href={`/academy/courses/${e.course.id}`}>
              <Card className="p-4 hover:border-court-200 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-ink-900 truncate">{e.course.title}</p>
                    <p className="text-xs text-ink-400 mt-1">
                      {t('instructorLessonsLabel', {
                        instructor: e.course.instructor?.displayName ?? '',
                        lessons: t('lessonsCount', { count: e.course._count.lessons }),
                      })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-court-600 shrink-0">
                    {e.progressPercent}%
                  </span>
                </div>
                <div className="h-1.5 bg-ink-100 rounded-full mt-3 overflow-hidden">
                  <div className="h-full bg-court-500" style={{ width: `${e.progressPercent}%` }} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <h2 className="text-lg font-black text-ink-900 tracking-tight">{t('classesTitle')}</h2>

      {classesLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : !classes || classes.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={t('emptyClassesTitle')}
          description={t('emptyClassesDescription')}
          action={
            <Link
              href="/academy"
              className="text-sm font-semibold text-white bg-court-600 hover:bg-court-700 rounded-xl px-5 py-2.5 transition-colors"
            >
              {t('emptyAction')}
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {classes.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-ink-900 truncate">{c.session.title}</p>
                    {c.session.status === 'cancelled' && (
                      <Badge tone="red">{t('classCancelledBadge')}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-400 mt-1">{c.session.instructor.displayName}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-400 mt-1">
                    <CalendarClock className="w-3 h-3" /> {c.session.date}
                    <Clock className="w-3 h-3 ml-1.5" /> {c.session.startTime.slice(0, 5)} ·{' '}
                    {t('durationLabel', { minutes: c.session.durationMinutes })}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-ink-400 mt-1 truncate">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {c.session.club
                      ? `${c.session.club.name}, ${c.session.club.city}`
                      : c.session.locationDescription}
                  </p>
                </div>
                <button
                  onClick={() => cancelMutation.mutate(c.session.id)}
                  disabled={cancelMutation.isPending}
                  className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" /> {t('cancelClassButton')}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
