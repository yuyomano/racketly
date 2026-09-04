'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AlertTriangle, RotateCcw } from 'lucide-react'

// Fallback compartido para los error.tsx de cada segmento de ruta (Next.js App Router
// monta el error.tsx del segmento más cercano a donde ocurrió el error de render).
export function ErrorFallback({
  error,
  reset,
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string }
  reset: () => void
  homeHref: string
  homeLabel: string
}) {
  const t = useTranslations('Common.errorBoundary')

  useEffect(() => {
    console.error('[error-boundary]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" strokeWidth={1.75} />
        </div>
        <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-400 mt-1.5">{t('description')}</p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl px-4 py-2.5 transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> {t('retry')}
          </button>
          <Link
            href={homeHref}
            className="text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl px-4 py-2.5 transition-colors"
          >
            {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  )
}
