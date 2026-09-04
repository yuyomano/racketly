'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { LOCALE_COOKIE, LOCALES, type Locale } from '@/i18n/config'

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale()
  const t = useTranslations('Common')
  const router = useRouter()

  function setLocale(next: Locale) {
    if (next === locale) return
    // maxAge de 1 año — el mismo criterio que la cookie de sesión (racketly_token).
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`
    router.refresh()
  }

  return (
    <div className={className}>
      <label className="sr-only">{t('language')}</label>
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-0.5 text-xs font-semibold">
        {LOCALES.map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              l === locale
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}
