'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  GraduationCap,
  Users,
  Star,
  Loader2,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Course = {
  id: string
  title: string
  description: string
  sport: 'padel' | 'pickleball'
  level: 'beginner' | 'intermediate' | 'advanced' | 'pro'
  price: number
  currency: string
  isPremium: boolean
  instructor: { displayName: string; ratingAvg: number }
  _count: { lessons: number; enrollments: number }
}

type Instructor = {
  userId: string
  displayName: string
  bio: string | null
  sport: string
  city: string
  country: string
  hourlyRate: number
  currency: string
  ratingAvg: number
  totalReviews: number
}

type Session = {
  id: string
  title: string
  date: string
  startTime: string
  durationMinutes: number
  maxStudents: number
  bookedCount: number
  pricePerPerson: number
  currency: string
  locationDescription: string
  status: string
}

const LEVEL_VALUES = ['all', 'beginner', 'intermediate', 'advanced', 'pro'] as const

async function fetchCourses(level: string, sport: string, errorMessage: string): Promise<Course[]> {
  const params = new URLSearchParams()
  if (level !== 'all') params.set('level', level)
  if (sport !== 'all') params.set('sport', sport)
  const res = await fetch(`/api/courses?${params.toString()}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.data ?? []
}

async function fetchInstructors(sport: string, errorMessage: string): Promise<Instructor[]> {
  const params = new URLSearchParams()
  if (sport !== 'all') params.set('sport', sport)
  const res = await fetch(`/api/instructors?${params.toString()}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.data ?? []
}

async function fetchSessions(instructorId: string, errorMessage: string): Promise<Session[]> {
  const res = await fetch(`/api/instructors/${instructorId}/sessions`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.data ?? []
}

export function AcademyClient({ userId: _userId }: { userId: string }) {
  const t = useTranslations('Academy.list')
  const [tab, setTab] = useState<'courses' | 'instructors'>('courses')
  const [level, setLevel] = useState<(typeof LEVEL_VALUES)[number]>('all')
  const [sport, setSport] = useState<'all' | 'padel' | 'pickleball'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const levelLabels: Record<(typeof LEVEL_VALUES)[number], string> = {
    all: t('levelAll'),
    beginner: t('levelBeginner'),
    intermediate: t('levelIntermediate'),
    advanced: t('levelAdvanced'),
    pro: t('levelPro'),
  }
  const sportLabels = {
    all: t('sportAll'),
    padel: t('sportPadel'),
    pickleball: t('sportPickleball'),
  } as const

  const { data: courses, isLoading: coursesLoading } = useQuery({
    queryKey: ['courses', { level, sport }],
    queryFn: () => fetchCourses(level, sport, t('errorFetchCourses')),
    enabled: tab === 'courses',
  })

  const { data: instructors, isLoading: instructorsLoading } = useQuery({
    queryKey: ['instructors', { sport }],
    queryFn: () => fetchInstructors(sport, t('errorFetchInstructors')),
    enabled: tab === 'instructors',
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>
          <p className="text-sm text-ink-400 mt-0.5">{t('subtitle')}</p>
        </div>
        <Link
          href="/academy/mine"
          className="flex items-center gap-1.5 text-sm font-semibold text-court-700 bg-court-50 hover:bg-court-100 px-3.5 py-2 rounded-xl transition-colors shrink-0"
        >
          <CalendarClock className="w-4 h-4" /> {t('myCoursesLink')}
        </Link>
      </div>

      <div className="flex border border-ink-200 rounded-xl overflow-hidden w-fit">
        {(
          [
            ['courses', t('tabCourses')],
            ['instructors', t('tabInstructors')],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={cn(
              'px-4 py-2 text-sm font-semibold transition-colors',
              tab === v ? 'bg-court-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        {tab === 'courses' && (
          <div className="flex border border-ink-200 rounded-xl overflow-hidden w-fit overflow-x-auto">
            {LEVEL_VALUES.map((v) => (
              <button
                key={v}
                onClick={() => setLevel(v)}
                className={cn(
                  'px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors',
                  level === v ? 'bg-court-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
                )}
              >
                {levelLabels[v]}
              </button>
            ))}
          </div>
        )}
        <div className="flex border border-ink-200 rounded-xl overflow-hidden w-fit">
          {(['all', 'padel', 'pickleball'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setSport(v)}
              className={cn(
                'px-4 py-2 text-sm font-semibold transition-colors',
                sport === v ? 'bg-court-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
              )}
            >
              {sportLabels[v]}
            </button>
          ))}
        </div>
      </div>

      {tab === 'courses' ? (
        coursesLoading ? (
          <div className="flex items-center justify-center py-16 text-ink-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !courses || courses.length === 0 ? (
          <EmptyState icon={GraduationCap} title={t('emptyCourses')} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((c) => (
              <Link key={c.id} href={`/academy/courses/${c.id}`}>
                <Card className="p-5 h-full hover:border-court-200 hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-ink-900 leading-snug">{c.title}</h3>
                    {c.sport === 'padel' ? (
                      <PadelIcon size={16} className="text-ink-300 shrink-0" />
                    ) : (
                      <PickleballIcon size={16} className="text-ink-300 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-ink-400 mt-1">{c.instructor?.displayName}</p>
                  <p className="text-sm text-ink-500 mt-2 line-clamp-2">{c.description}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-3">
                    <Badge tone="violet">{levelLabels[c.level] ?? c.level}</Badge>
                    {c.isPremium && <Badge tone="amber">{t('premiumBadge')}</Badge>}
                    <Badge tone="gray">{t('lessonsCount', { count: c._count.lessons })}</Badge>
                  </div>
                  <div className="flex items-center justify-between mt-3 text-xs text-ink-400">
                    <span className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />{' '}
                      {c.instructor?.ratingAvg?.toFixed(1) ?? '—'}
                    </span>
                    <span className="font-semibold text-ink-700">
                      {c.price > 0 ? `${c.currency} ${c.price.toFixed(0)}` : t('free')}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )
      ) : instructorsLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : !instructors || instructors.length === 0 ? (
        <EmptyState icon={Users} title={t('emptyInstructors')} />
      ) : (
        <div className="space-y-3">
          {instructors.map((i) => (
            <InstructorRow
              key={i.userId}
              instructor={i}
              expanded={expanded === i.userId}
              onToggle={() => setExpanded(expanded === i.userId ? null : i.userId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function InstructorRow({
  instructor,
  expanded,
  onToggle,
}: {
  instructor: Instructor
  expanded: boolean
  onToggle: () => void
}) {
  const t = useTranslations('Academy.list')
  const locale = useLocale()
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['instructor-sessions', instructor.userId],
    queryFn: () => fetchSessions(instructor.userId, t('errorFetchSessions')),
    enabled: expanded,
  })

  const toast = useToast()
  const bookMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/instructors/sessions/${sessionId}/book`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('errorBook'))
      return data
    },
    onSuccess: () => toast.success(t('sessionBooked')),
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Card className="p-5">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 text-left"
      >
        <div>
          <p className="font-bold text-ink-900">{instructor.displayName}</p>
          <p className="text-xs text-ink-400 mt-0.5">
            {t('instructorRateLabel', {
              city: instructor.city,
              country: instructor.country,
              currency: instructor.currency,
              rate: instructor.hourlyRate.toFixed(0),
            })}
          </p>
          {instructor.bio && (
            <p className="text-sm text-ink-500 mt-1.5 line-clamp-2">{instructor.bio}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1 text-xs text-ink-400">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />{' '}
            {instructor.ratingAvg.toFixed(1)} ({instructor.totalReviews})
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-ink-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-ink-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-ink-100 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-ink-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : !sessions || sessions.length === 0 ? (
            <p className="text-xs text-ink-400">{t('noSessionsAvailable')}</p>
          ) : (
            sessions.map((s) => {
              const full = s.bookedCount >= s.maxStudents
              const justBooked = bookMutation.isSuccess && bookMutation.variables === s.id
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 bg-ink-50 rounded-xl px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-800 truncate">{s.title}</p>
                    <p className="flex items-center gap-1 text-xs text-ink-400 mt-0.5">
                      <Clock className="w-3 h-3" />{' '}
                      {t('sessionDateLabel', {
                        date: new Date(s.date + 'T00:00:00').toLocaleDateString(locale, {
                          day: 'numeric',
                          month: 'short',
                        }),
                        time: s.startTime.slice(0, 5),
                        location: s.locationDescription,
                      })}
                    </p>
                  </div>
                  {justBooked ? (
                    <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-court-600">
                      <CheckCircle2 className="w-4 h-4" /> {t('sessionReserved')}
                    </span>
                  ) : (
                    <button
                      onClick={() => bookMutation.mutate(s.id)}
                      disabled={full || bookMutation.isPending}
                      className="shrink-0 text-xs font-semibold text-white bg-court-600 hover:bg-court-700 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
                    >
                      {full
                        ? t('sessionFull')
                        : t('sessionBookLabel', {
                            currency: s.currency,
                            price: s.pricePerPerson.toFixed(0),
                          })}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </Card>
  )
}
