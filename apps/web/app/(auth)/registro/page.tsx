'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Mail, Lock, User, MapPin, ArrowRight, Loader2, AlertCircle } from 'lucide-react'

const COUNTRY_CODES = ['DO', 'CO', 'MX', 'ES', 'AR', 'US'] as const

export default function RegistroPage() {
  const t = useTranslations('Auth.registro')
  const router = useRouter()

  const COUNTRIES = COUNTRY_CODES.map((code) => ({ code, label: t(`countries.${code}`) }))
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [country, setCountry] = useState('DO')
  const [city, setCity] = useState('')
  const [sport, setSport] = useState<'padel' | 'pickleball' | 'both'>('padel')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email, password, country, city, sport }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('errorRegister'))
        return
      }
      router.push('/booking')
      router.refresh()
    } catch {
      setError(t('errorConnection'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#042b22] flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-court-500/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-court-400/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-court-500 flex items-center justify-center text-2xl mx-auto shadow-lg shadow-court-500/30">
            🎾
          </div>
          <h1 className="text-2xl font-black text-white mt-4 tracking-tight">{t('brand')}</h1>
          <p className="text-primary-300 text-sm mt-1">{t('subtitle')}</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-2xl space-y-5">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{t('title')}</h2>
            <p className="text-sm text-ink-400 mt-0.5">{t('subheading')}</p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                {t('fullNameLabel')}
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('fullNamePlaceholder')}
                  className="w-full border border-ink-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40 focus:border-court-400 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                {t('emailLabel')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  className="w-full border border-ink-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40 focus:border-court-400 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                {t('passwordLabel')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  className="w-full border border-ink-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40 focus:border-court-400 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                  {t('countryLabel')}
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full border border-ink-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                  {t('cityLabel')}
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={t('cityPlaceholder')}
                    className="w-full border border-ink-200 rounded-xl pl-9 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40 focus:border-court-400 transition-all"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5">
                {t('sportLabel')}
              </label>
              <div className="flex border border-ink-200 rounded-xl overflow-hidden">
                {(
                  [
                    ['padel', t('sportPadel')],
                    ['pickleball', t('sportPickleball')],
                    ['both', t('sportBoth')],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSport(v)}
                    className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                      sport === v
                        ? 'bg-court-600 text-white'
                        : 'bg-white text-ink-500 hover:bg-ink-50'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-court-600 hover:bg-court-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm shadow-court-600/20 active:scale-[0.99]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {t('submit')} <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-ink-400">
            {t('alreadyAccount')}{' '}
            <Link href="/login" className="text-court-600 font-semibold hover:text-court-700">
              {t('loginLink')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
