'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Star, PlayCircle, Lock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Lesson = { id: string; title: string; orderIndex: number; videoDurationSeconds: number; isFreePreview: boolean }
type Course = {
  id: string; title: string; description: string; sport: string; level: string
  price: number; currency: string; isPremium: boolean; durationHours: number
  instructor: { displayName: string; bio: string | null; ratingAvg: number; totalReviews: number }
  lessons: Lesson[]
  _count: { enrollments: number }
}
type Enrollment = { id: string; courseId: string; progressPercent: number }

async function fetchMyEnrollments(userId: string): Promise<Enrollment[]> {
  const res = await fetch(`/api/courses/enrollments/user/${userId}`)
  const data = await res.json()
  if (!res.ok) return []
  return (data.data ?? []).map((e: any) => ({ id: e.id, courseId: e.course?.id ?? e.courseId, progressPercent: e.progressPercent }))
}

export function CourseDetailClient({ course, userId }: { course: Course; userId: string }) {
  const t = useTranslations('Academy.courseDetail')
  const queryClient = useQueryClient()
  const toast = useToast()
  const [error, setError] = useState('')

  const LEVEL_LABEL: Record<string, string> = {
    beginner: t('levelBeginner'), intermediate: t('levelIntermediate'), advanced: t('levelAdvanced'), pro: t('levelPro'),
  }

  const { data: enrollments } = useQuery({ queryKey: ['courses', 'mine', userId], queryFn: () => fetchMyEnrollments(userId) })
  const myEnrollment = enrollments?.find((e) => e.courseId === course.id)

  const enrollMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/courses/${course.id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('errorEnroll'))
      return data.data
    },
    onError: (e: Error) => setError(e.message),
    onSuccess: () => {
      setError('')
      toast.success(t('enrollSuccess'))
      queryClient.invalidateQueries({ queryKey: ['courses', 'mine', userId] })
    },
  })

  const sortedLessons = [...course.lessons].sort((a, b) => a.orderIndex - b.orderIndex)

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Link href="/academy" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
        <ArrowLeft className="w-4 h-4" /> {t('backLink')}
      </Link>

      <Card className="p-6">
        <h1 className="text-xl font-black text-gray-900 tracking-tight">{course.title}</h1>
        <p className="text-sm text-gray-400 mt-1">
          {course.instructor.displayName} · <Star className="w-3.5 h-3.5 inline text-amber-400 fill-amber-400 -mt-0.5" /> {course.instructor.ratingAvg.toFixed(1)} ({course.instructor.totalReviews})
        </p>

        <div className="flex items-center gap-1.5 flex-wrap mt-4">
          <Badge tone="violet">{LEVEL_LABEL[course.level] ?? course.level}</Badge>
          {course.isPremium && <Badge tone="amber">{t('premiumBadge')}</Badge>}
          <Badge tone="gray">{t('lessonsCount', { count: sortedLessons.length })}</Badge>
          <Badge tone="gray">{t('durationHours', { hours: course.durationHours })}</Badge>
        </div>

        <p className="text-sm text-gray-500 mt-4">{course.description}</p>

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5 mt-4">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </p>
        )}

        <div className="mt-5">
          {myEnrollment ? (
            <div className="bg-emerald-50 rounded-xl px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4" /> {t('enrolledLabel', { percent: myEnrollment.progressPercent })}
              </p>
              <div className="h-1.5 bg-emerald-100 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${myEnrollment.progressPercent}%` }} />
              </div>
            </div>
          ) : (
            <Button onClick={() => enrollMutation.mutate()} disabled={enrollMutation.isPending} className="w-full">
              {enrollMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : course.price > 0 ? t('enrollPaid', { currency: course.currency, price: course.price.toFixed(0) }) : t('enrollFree')}
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-bold text-gray-900 mb-4">{t('contentTitle')}</h2>
        {sortedLessons.length === 0 ? (
          <p className="text-sm text-gray-400">{t('noLessons')}</p>
        ) : (
          <div className="space-y-1.5">
            {sortedLessons.map((l, idx) => {
              const unlocked = !!myEnrollment || l.isFreePreview
              const minutes = Math.round(l.videoDurationSeconds / 60)
              return (
                <div key={l.id} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl', unlocked ? 'hover:bg-gray-50' : 'opacity-60')}>
                  {unlocked ? <PlayCircle className="w-4 h-4 text-emerald-500 shrink-0" /> : <Lock className="w-4 h-4 text-gray-300 shrink-0" />}
                  <span className="text-xs text-gray-400 w-5 shrink-0">{idx + 1}.</span>
                  <span className="text-sm text-gray-700 flex-1 truncate">{l.title}</span>
                  {l.isFreePreview && !myEnrollment && <Badge tone="blue">{t('freePreviewBadge')}</Badge>}
                  {minutes > 0 && <span className="text-xs text-gray-400 shrink-0">{t('minutesLabel', { minutes })}</span>}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
