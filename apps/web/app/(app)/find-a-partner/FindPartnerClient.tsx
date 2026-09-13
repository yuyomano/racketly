'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Handshake, Loader2, MapPin, Plus, Star } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { FormField } from '@/components/ui/FormField'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

const CATEGORIES = ['C4', 'C3', 'C2', 'C1', 'B3', 'B2', 'B1', 'A', 'Open'] as const
const TIME_PREFERENCES = ['morning', 'afternoon', 'evening', 'flexible'] as const

type MatchRequest = {
  id: string
  requesterId: string
  sport: 'padel' | 'pickleball'
  levelMin: string
  levelMax: string
  city: string
  maxDistanceKm: number
  preferredDate: string | null
  timePreference: string | null
  message: string | null
  status: string
  requester: {
    id: string
    playerProfile: {
      displayName: string
      avatarUrl: string | null
      category: string
      eloPadel: number
    } | null
  }
  _count: { applications: number }
}

async function fetchRequests(sport: 'all' | 'padel' | 'pickleball'): Promise<MatchRequest[]> {
  const params = new URLSearchParams()
  if (sport !== 'all') params.set('sport', sport)
  const res = await fetch(`/api/match-requests?${params.toString()}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to load match requests')
  return data.data ?? []
}

export function FindPartnerClient({ userId }: { userId: string }) {
  const t = useTranslations('FindPartner.list')
  const locale = useLocale()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [sport, setSport] = useState<'all' | 'padel' | 'pickleball'>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [applyRequest, setApplyRequest] = useState<MatchRequest | null>(null)

  const {
    data: requests,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['match-requests', sport],
    queryFn: () => fetchRequests(sport),
  })

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/match-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('errorCreate'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('createSuccess'))
      setCreateOpen(false)
      queryClient.invalidateQueries({ queryKey: ['match-requests'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const applyMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      const res = await fetch(`/api/match-requests/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('errorApply'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('applySuccess'))
      setApplyRequest(null)
      queryClient.invalidateQueries({ queryKey: ['match-requests'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>
          <p className="text-sm text-ink-400 mt-0.5">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/find-a-partner/mine"
            className="text-sm font-semibold text-court-700 bg-court-50 hover:bg-court-100 px-3.5 py-2 rounded-xl transition-colors"
          >
            {t('myRequestsLink')}
          </Link>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> {t('createButton')}
          </Button>
        </div>
      </div>

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
            {v === 'all' ? t('sportAll') : v === 'padel' ? t('sportPadel') : t('sportPickleball')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{t('loadError')}</p>
      ) : !requests || requests.length === 0 ? (
        <EmptyState icon={Handshake} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {requests.map((r) => {
            const isMine = r.requesterId === userId
            return (
              <Card key={r.id} className="p-5 h-full">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-ink-900 leading-snug">
                    {r.requester.playerProfile?.displayName ?? '—'}
                  </h3>
                  {r.sport === 'padel' ? (
                    <PadelIcon size={16} className="text-ink-300 shrink-0" />
                  ) : (
                    <PickleballIcon size={16} className="text-ink-300 shrink-0" />
                  )}
                </div>
                <p className="flex items-center gap-1 text-xs text-ink-400 mt-1">
                  <MapPin className="w-3 h-3" /> {r.city}
                </p>
                {r.requester.playerProfile && (
                  <p className="flex items-center gap-1 text-xs text-ink-400 mt-1">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />{' '}
                    {r.requester.playerProfile.eloPadel} ELO
                  </p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap mt-3">
                  <Badge tone="violet">
                    {r.levelMin === r.levelMax ? r.levelMin : `${r.levelMin}–${r.levelMax}`}
                  </Badge>
                  {r.preferredDate && (
                    <Badge tone="gray">
                      {new Date(r.preferredDate + 'T00:00:00').toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Badge>
                  )}
                  {r.timePreference && <Badge tone="gray">{r.timePreference}</Badge>}
                </div>
                {r.message && <p className="text-sm text-ink-500 mt-2 line-clamp-2">{r.message}</p>}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-ink-400">
                    {t('applicationsCount', { count: r._count.applications })}
                  </span>
                  {isMine ? (
                    <Badge tone="blue">{t('yourRequestBadge')}</Badge>
                  ) : (
                    <Button size="sm" onClick={() => setApplyRequest(r)}>
                      {t('applyButton')}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <CreateRequestModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(payload) => createMutation.mutate(payload)}
        isPending={createMutation.isPending}
      />

      <Modal
        open={!!applyRequest}
        onClose={() => setApplyRequest(null)}
        title={t('applyModalTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplyRequest(null)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={applyMutation.isPending}
              onClick={() => {
                const form = document.getElementById('apply-message') as HTMLTextAreaElement | null
                applyMutation.mutate({ id: applyRequest!.id, message: form?.value ?? '' })
              }}
            >
              {applyMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('confirmApply')
              )}
            </Button>
          </>
        }
      >
        <FormField label={t('applyMessageLabel')} htmlFor="apply-message">
          <Textarea id="apply-message" rows={3} placeholder={t('applyMessagePlaceholder')} />
        </FormField>
      </Modal>
    </div>
  )
}

function CreateRequestModal({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => void
  isPending: boolean
}) {
  const t = useTranslations('FindPartner.list')
  const [sport, setSport] = useState<'padel' | 'pickleball'>('padel')
  const [levelMin, setLevelMin] = useState<(typeof CATEGORIES)[number]>('B2')
  const [levelMax, setLevelMax] = useState<(typeof CATEGORIES)[number]>('B1')
  const [city, setCity] = useState('')
  const [maxDistanceKm, setMaxDistanceKm] = useState('20')
  const [preferredDate, setPreferredDate] = useState('')
  const [timePreference, setTimePreference] = useState('')
  const [message, setMessage] = useState('')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('createModalTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            disabled={!city.trim() || isPending}
            onClick={() =>
              onSubmit({
                sport,
                levelMin,
                levelMax,
                city: city.trim(),
                maxDistanceKm: Number(maxDistanceKm) || 20,
                ...(preferredDate && { preferredDate }),
                ...(timePreference && { timePreference }),
                ...(message.trim() && { message: message.trim() }),
              })
            }
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('publishButton')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('fieldSport')} htmlFor="req-sport">
            <Select
              id="req-sport"
              value={sport}
              onChange={(e) => setSport(e.target.value as 'padel' | 'pickleball')}
            >
              <option value="padel">{t('sportPadel')}</option>
              <option value="pickleball">{t('sportPickleball')}</option>
            </Select>
          </FormField>
          <FormField label={t('fieldCity')} htmlFor="req-city" required>
            <Input id="req-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('fieldMaxDistance')} htmlFor="req-distance">
            <Input
              id="req-distance"
              type="number"
              min={1}
              value={maxDistanceKm}
              onChange={(e) => setMaxDistanceKm(e.target.value)}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('fieldLevelMin')} htmlFor="req-level-min">
            <Select
              id="req-level-min"
              value={levelMin}
              onChange={(e) => setLevelMin(e.target.value as (typeof CATEGORIES)[number])}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('fieldLevelMax')} htmlFor="req-level-max">
            <Select
              id="req-level-max"
              value={levelMax}
              onChange={(e) => setLevelMax(e.target.value as (typeof CATEGORIES)[number])}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('fieldPreferredDate')} htmlFor="req-date">
            <Input
              id="req-date"
              type="date"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
            />
          </FormField>
          <FormField label={t('fieldTimePreference')} htmlFor="req-time">
            <Select
              id="req-time"
              value={timePreference}
              onChange={(e) => setTimePreference(e.target.value)}
            >
              <option value="">{t('timeAny')}</option>
              {TIME_PREFERENCES.map((v) => (
                <option key={v} value={v}>
                  {t(`time_${v}`)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label={t('fieldMessage')} htmlFor="req-message">
          <Textarea
            id="req-message"
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  )
}
