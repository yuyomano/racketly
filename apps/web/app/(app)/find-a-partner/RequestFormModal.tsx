'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { FormField } from '@/components/ui/FormField'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { CATEGORIES, TIME_PREFERENCES, fetchUpcomingPairsTournaments } from './shared'

export type RequestFormInitial = {
  sport: 'padel' | 'pickleball'
  levelMin: string
  levelMax: string
  city: string
  maxDistanceKm: string
  preferredDate: string
  timePreference: string
  tournamentId: string
  message: string
}

const DEFAULT_INITIAL: RequestFormInitial = {
  sport: 'padel',
  levelMin: 'B2',
  levelMax: 'B1',
  city: '',
  maxDistanceKm: '20',
  preferredDate: '',
  timePreference: '',
  tournamentId: '',
  message: '',
}

export function RequestFormModal({
  open,
  onClose,
  onSubmit,
  isPending,
  title,
  submitLabel,
  initial,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => void
  isPending: boolean
  title: string
  submitLabel: string
  initial?: Partial<RequestFormInitial>
}) {
  const t = useTranslations('FindPartner.list')
  const values = { ...DEFAULT_INITIAL, ...initial }
  const [sport, setSport] = useState<'padel' | 'pickleball'>(values.sport)
  const [levelMin, setLevelMin] = useState(values.levelMin)
  const [levelMax, setLevelMax] = useState(values.levelMax)
  const [city, setCity] = useState(values.city)
  const [maxDistanceKm, setMaxDistanceKm] = useState(values.maxDistanceKm)
  const [preferredDate, setPreferredDate] = useState(values.preferredDate)
  const [timePreference, setTimePreference] = useState(values.timePreference)
  const [tournamentId, setTournamentId] = useState(values.tournamentId)
  const [message, setMessage] = useState(values.message)

  const { data: tournaments } = useQuery({
    queryKey: ['tournaments-pairs-open'],
    queryFn: fetchUpcomingPairsTournaments,
    enabled: open,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
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
                ...(tournamentId && { tournamentId }),
                ...(message.trim() && { message: message.trim() }),
              })
            }
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : submitLabel}
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
            <Select id="req-level-min" value={levelMin} onChange={(e) => setLevelMin(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('fieldLevelMax')} htmlFor="req-level-max">
            <Select id="req-level-max" value={levelMax} onChange={(e) => setLevelMax(e.target.value)}>
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
        <FormField label={t('fieldTournament')} htmlFor="req-tournament">
          <Select
            id="req-tournament"
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value)}
          >
            <option value="">{t('tournamentNone')}</option>
            {tournaments?.map((tour) => (
              <option key={tour.id} value={tour.id}>
                {tour.name}
              </option>
            ))}
          </Select>
        </FormField>
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
