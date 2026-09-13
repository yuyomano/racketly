'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Star, ShoppingBag, Plus, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { FormField } from '@/components/ui/FormField'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { PadelIcon, PickleballIcon } from '@/components/ui/SportIcons'
import { useToast } from '@/components/ui/Toast'

type GearReview = {
  id: string
  brand: string
  model: string
  sport: 'padel' | 'pickleball' | 'both'
  rating: number
  reviewText: string
  verifiedPurchase: boolean
  reviewer: {
    id: string
    playerProfile: { displayName: string; avatarUrl: string | null; category: string } | null
  }
}

const SPORT_TABS = [
  { value: '', labelKey: 'sportAll' },
  { value: 'padel', labelKey: 'sportPadel' },
  { value: 'pickleball', labelKey: 'sportPickleball' },
] as const

async function fetchReviews(sport: string): Promise<GearReview[]> {
  const params = new URLSearchParams({ limit: '50' })
  if (sport) params.set('sport', sport)
  const res = await fetch(`/api/gear?${params}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to load reviews')
  return data.data ?? []
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={
            i < rating ? 'w-3.5 h-3.5 fill-trophy-500 text-trophy-500' : 'w-3.5 h-3.5 text-ink-200'
          }
        />
      ))}
    </div>
  )
}

export function GearClient() {
  const t = useTranslations('Gear')
  const [sport, setSport] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)

  const {
    data: reviews,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['gear-reviews', sport],
    queryFn: () => fetchReviews(sport),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>
          <p className="text-sm text-ink-500 mt-0.5">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> {t('createButton')}
        </Button>
      </div>

      <div className="flex gap-1.5">
        {SPORT_TABS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSport(s.value)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              sport === s.value
                ? 'bg-court-50 text-court-700 ring-1 ring-court-600/20'
                : 'bg-ink-50 text-ink-500 hover:bg-ink-100'
            }`}
          >
            {t(s.labelKey)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-court-500 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{t('loadError')}</p>
      ) : !reviews || reviews.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {reviews.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {r.sport === 'pickleball' ? (
                    <PickleballIcon size={16} className="text-ink-300 shrink-0" />
                  ) : (
                    <PadelIcon size={16} className="text-ink-300 shrink-0" />
                  )}
                  <p className="font-bold text-ink-900 truncate">
                    {r.brand} {r.model}
                  </p>
                </div>
                {r.verifiedPurchase && <Badge tone="emerald">{t('verifiedBadge')}</Badge>}
              </div>

              <div className="mt-2">
                <Stars rating={r.rating} />
              </div>

              <p className="text-sm text-ink-600 mt-2 leading-relaxed">{r.reviewText}</p>

              <p className="text-xs text-ink-400 mt-3 pt-3 border-t border-ink-100">
                {r.reviewer.playerProfile?.displayName ?? t('anonymous')}
              </p>
            </Card>
          ))}
        </div>
      )}

      <CreateReviewModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}

function CreateReviewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Gear')
  const toast = useToast()
  const queryClient = useQueryClient()

  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [sport, setSport] = useState<'padel' | 'pickleball' | 'both'>('padel')
  const [rating, setRating] = useState(5)
  const [reviewText, setReviewText] = useState('')

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/gear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, model, sport, rating, reviewText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('errorCreate'))
      return data.data
    },
    onSuccess: () => {
      toast.success(t('createSuccess'))
      queryClient.invalidateQueries({ queryKey: ['gear-reviews'] })
      setBrand('')
      setModel('')
      setRating(5)
      setReviewText('')
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

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
            disabled={
              !brand.trim() || !model.trim() || !reviewText.trim() || createMutation.isPending
            }
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('publishButton')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('fieldBrand')} htmlFor="gear-brand" required>
            <Input id="gear-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </FormField>
          <FormField label={t('fieldModel')} htmlFor="gear-model" required>
            <Input id="gear-model" value={model} onChange={(e) => setModel(e.target.value)} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('fieldSport')} htmlFor="gear-sport">
            <Select
              id="gear-sport"
              value={sport}
              onChange={(e) => setSport(e.target.value as typeof sport)}
            >
              <option value="padel">{t('sportPadel')}</option>
              <option value="pickleball">{t('sportPickleball')}</option>
              <option value="both">{t('sportBoth')}</option>
            </Select>
          </FormField>
          <FormField label={t('fieldRating')} htmlFor="gear-rating">
            <Select
              id="gear-rating"
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} {'★'.repeat(n)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <FormField label={t('fieldReviewText')} htmlFor="gear-text" required>
          <Textarea
            id="gear-text"
            rows={4}
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  )
}
