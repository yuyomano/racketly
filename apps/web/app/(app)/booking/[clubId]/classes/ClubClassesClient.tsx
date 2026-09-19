'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  GraduationCap,
  Loader2,
  MapPin,
  Star,
  X,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Club = { id: string; name: string; city: string; country: string; currency: string }

type Professor = {
  id: string
  name: string
  avatarUrl: string | null
  bio: string | null
  sport: string
  hourlyRate: number
  currency: string
}

type ClassBooking = { id: string; studentUserId: string; status: string }

type ClassSlot = {
  id: string
  professorId: string
  courtId: string | null
  court: { id: string; name: string } | null
  professor: Professor
  date: string
  startTime: string
  durationMinutes: number
  maxStudents: number
  price: number
  currency: string
  status: string
  bookings: ClassBooking[]
}

async function fetchProfessors(clubId: string, errorMessage: string): Promise<Professor[]> {
  const res = await fetch(`/api/professors/${clubId}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.data ?? []
}

async function fetchClassSlots(
  clubId: string,
  professorId: string,
  errorMessage: string
): Promise<ClassSlot[]> {
  const params = new URLSearchParams({ upcoming: '1' })
  if (professorId) params.set('professorId', professorId)
  const res = await fetch(`/api/classes/${clubId}?${params.toString()}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.data ?? []
}

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function ClubClassesClient({
  club,
  userId,
  displayName,
}: {
  club: Club
  userId: string
  displayName: string
}) {
  const t = useTranslations('Booking.classes')
  const locale = useLocale()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [professorId, setProfessorId] = useState('')

  const { data: professors, isLoading: professorsLoading } = useQuery({
    queryKey: ['professors', club.id],
    queryFn: () => fetchProfessors(club.id, t('errorFetchProfessors')),
  })

  const { data: slots, isLoading: slotsLoading } = useQuery({
    queryKey: ['class-slots', club.id, professorId],
    queryFn: () => fetchClassSlots(club.id, professorId, t('errorFetchSlots')),
  })

  const bookMutation = useMutation({
    mutationFn: async (slotId: string) => {
      const res = await fetch(`/api/classes/${slotId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentUserId: userId, studentName: displayName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('errorBook'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('classBooked'))
      queryClient.invalidateQueries({ queryKey: ['class-slots', club.id] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/classes/bookings/${bookingId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('errorCancel'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('classCancelledToast'))
      queryClient.invalidateQueries({ queryKey: ['class-slots', club.id] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const isLoading = professorsLoading || slotsLoading

  return (
    <div className="space-y-6 pb-24">
      <Link
        href={`/booking/${club.id}`}
        className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('backToClub')}
      </Link>

      <div>
        <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>
        <p className="flex items-center gap-1 text-sm text-ink-400 mt-0.5">
          <MapPin className="w-3.5 h-3.5" /> {club.name}
        </p>
      </div>

      {professors && professors.length > 0 && (
        <div className="flex border border-ink-200 rounded-xl overflow-hidden w-fit overflow-x-auto">
          <button
            onClick={() => setProfessorId('')}
            className={cn(
              'px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors',
              professorId === '' ? 'bg-court-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
            )}
          >
            {t('allProfessors')}
          </button>
          {professors.map((p) => (
            <button
              key={p.id}
              onClick={() => setProfessorId(p.id)}
              className={cn(
                'px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors',
                professorId === p.id
                  ? 'bg-court-600 text-white'
                  : 'bg-white text-ink-500 hover:bg-ink-50'
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : !professors || professors.length === 0 ? (
        <EmptyState icon={GraduationCap} title={t('emptyProfessors')} />
      ) : !slots || slots.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t('emptySlots')} />
      ) : (
        <div className="space-y-3">
          {slots.map((s) => {
            const activeBookings = s.bookings.filter((b) => b.status === 'active')
            const myBooking = activeBookings.find((b) => b.studentUserId === userId)
            const full = activeBookings.length >= s.maxStudents
            return (
              <Card key={s.id} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-ink-900 truncate">{s.professor.name}</p>
                      {myBooking && <Badge tone="emerald">{t('bookedBadge')}</Badge>}
                    </div>
                    <p className="flex items-center gap-1 text-xs text-ink-400 mt-1">
                      <CalendarClock className="w-3 h-3" />
                      {new Date(s.date + 'T00:00:00').toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                      })}
                      <Clock className="w-3 h-3 ml-1.5" />
                      {s.startTime.slice(0, 5)}–{addMinutes(s.startTime, s.durationMinutes)}
                    </p>
                    {s.court && (
                      <p className="flex items-center gap-1 text-xs text-ink-400 mt-1">
                        <MapPin className="w-3 h-3" /> {s.court.name}
                      </p>
                    )}
                    <p className="flex items-center gap-1 text-xs text-ink-400 mt-1">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      {t('spotsLabel', { booked: activeBookings.length, max: s.maxStudents })}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <span className="text-sm font-semibold text-ink-700">
                      {s.currency} {s.price.toFixed(0)}
                    </span>
                    {myBooking ? (
                      <button
                        onClick={() => cancelMutation.mutate(myBooking.id)}
                        disabled={cancelMutation.isPending}
                        className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" /> {t('cancelButton')}
                      </button>
                    ) : (
                      <button
                        onClick={() => bookMutation.mutate(s.id)}
                        disabled={full || bookMutation.isPending}
                        className="flex items-center gap-1 text-xs font-semibold text-white bg-court-600 hover:bg-court-700 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
                      >
                        {bookMutation.isPending && bookMutation.variables === s.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : full ? (
                          <>{t('fullButton')}</>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> {t('bookButton')}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
