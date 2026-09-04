'use client'

import { useTranslations } from 'next-intl'
import { ErrorFallback } from '@/components/ui/ErrorFallback'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('Common.errorBoundary')
  return (
    <ErrorFallback error={error} reset={reset} homeHref="/booking" homeLabel={t('goToBooking')} />
  )
}
