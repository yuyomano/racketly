'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Radio, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'

function extractMatchId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const fromUrl = trimmed.match(/\/live\/([a-zA-Z0-9]+)/)
  return fromUrl ? fromUrl[1] : trimmed
}

export default function LiveEntryPage() {
  const t = useTranslations('Live.entry')
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  function submit() {
    const matchId = extractMatchId(value)
    if (!matchId) {
      setError(t('emptyError'))
      return
    }
    router.push(`/live/${matchId}`)
  }

  return (
    <div className="min-h-screen bg-ink-900 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-court-600" />
          <h1 className="text-lg font-black text-ink-900">{t('title')}</h1>
        </div>
        <p className="text-sm text-ink-400">{t('subtitle')}</p>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={t('placeholder')}
          className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          onClick={submit}
          className="w-full flex items-center justify-center gap-1.5 bg-court-600 hover:bg-court-700 text-white font-semibold text-sm rounded-xl px-4 py-2.5 transition-colors"
        >
          {t('viewButton')} <ArrowRight className="w-4 h-4" />
        </button>
      </Card>
    </div>
  )
}
