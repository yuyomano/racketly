'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, GraduationCap, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'

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

async function fetchMyEnrollments(userId: string, errorMessage: string): Promise<MyEnrollment[]> {
  const res = await fetch(`/api/courses/enrollments/user/${userId}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.data ?? []
}

export function MyCoursesClient({ userId }: { userId: string }) {
  const t = useTranslations('Academy.mine')
  const { data: enrollments, isLoading } = useQuery({
    queryKey: ['courses', 'mine', userId],
    queryFn: () => fetchMyEnrollments(userId, t('errorFetch')),
  })

  return (
    <div className="space-y-6">
      <Link
        href="/academy"
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('backLink')}
      </Link>

      <h1 className="text-xl font-black text-gray-900 tracking-tight">{t('title')}</h1>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
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
              className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl px-5 py-2.5 transition-colors"
            >
              {t('emptyAction')}
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {enrollments.map((e) => (
            <Link key={e.id} href={`/academy/courses/${e.course.id}`}>
              <Card className="p-4 hover:border-emerald-200 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{e.course.title}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {t('instructorLessonsLabel', {
                        instructor: e.course.instructor?.displayName ?? '',
                        lessons: t('lessonsCount', { count: e.course._count.lessons }),
                      })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600 shrink-0">
                    {e.progressPercent}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${e.progressPercent}%` }}
                  />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
