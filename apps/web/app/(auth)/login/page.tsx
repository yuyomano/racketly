'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Mail, Lock, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PadelIcon } from '@/components/ui/SportIcons'
import GoogleProviderWrapper from '../../GoogleProviderWrapper'
import { GoogleLoginButton } from './GoogleLoginButton'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

export default function LoginPage() {
  const t = useTranslations('Auth.login')
  const router = useRouter()

  const DEMO_ACCOUNTS = [
    {
      label: t('demoAdminLabel'),
      sub: t('demoAdminSub'),
      email: 'admin@racketly.app',
      pass: 'Admin2026!',
    },
    {
      label: t('demoGroupALabel'),
      sub: t('demoGroupASub'),
      email: 'carlos.pro@racketly.app',
      pass: 'Test2026!',
    },
    {
      label: t('demoGroupBLabel'),
      sub: t('demoGroupBSub'),
      email: 'juan.amateur@racketly.app',
      pass: 'Test2026!',
    },
  ]
  const [mode, setMode] = useState<'player' | 'admin'>('player')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('errorLogin'))
        return
      }
      router.push(mode === 'admin' ? '/dashboard' : '/booking')
      router.refresh()
    } catch {
      setError(t('errorConnection'))
    } finally {
      setLoading(false)
    }
  }

  function fillDemo(acc: (typeof DEMO_ACCOUNTS)[0]) {
    setEmail(acc.email)
    setPassword(acc.pass)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-court-600 flex items-center justify-center text-white mx-auto">
            <PadelIcon size={26} />
          </div>
          <h1 className="font-display text-2xl font-black text-ink-900 mt-4 tracking-tight">
            {t('brand')}
          </h1>
          <p className="text-ink-500 text-sm mt-1">
            {mode === 'admin' ? t('subtitleAdmin') : t('subtitlePlayer')}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-ink-100 p-8 space-y-5">
          <div className="flex border border-ink-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setMode('player')}
              className={cn(
                'flex-1 py-2.5 text-sm font-semibold transition-colors',
                mode === 'player'
                  ? 'bg-court-600 text-white'
                  : 'bg-white text-ink-500 hover:bg-ink-50'
              )}
            >
              {t('tabPlayer')}
            </button>
            <button
              type="button"
              onClick={() => setMode('admin')}
              className={cn(
                'flex-1 py-2.5 text-sm font-semibold transition-colors',
                mode === 'admin'
                  ? 'bg-court-600 text-white'
                  : 'bg-white text-ink-500 hover:bg-ink-50'
              )}
            >
              {t('tabAdmin')}
            </button>
          </div>

          <div>
            <h2 className="font-display text-lg font-bold text-ink-900">{t('title')}</h2>
            <p className="text-sm text-ink-500 mt-0.5">
              {mode === 'admin' ? t('subheadingAdmin') : t('subheadingPlayer')}
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 bg-referee-50 border border-referee-100 text-referee-700 text-sm rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-ink-600 mb-1.5"
              >
                {t('emailLabel')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  id="login-email"
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
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-ink-600 mb-1.5"
              >
                {t('passwordLabel')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  className="w-full border border-ink-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40 focus:border-court-400 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-court-600 hover:bg-court-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === 'admin' ? (
                t('submitAdmin')
              ) : (
                t('submitPlayer')
              )}
            </button>
          </form>

          {GOOGLE_CLIENT_ID && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-ink-100" />
                <span className="text-xs text-ink-400">{t('orContinueWith')}</span>
                <div className="flex-1 h-px bg-ink-100" />
              </div>
              <GoogleProviderWrapper clientId={GOOGLE_CLIENT_ID}>
                <GoogleLoginButton onError={setError} />
              </GoogleProviderWrapper>
            </div>
          )}

          {mode === 'player' && (
            <p className="text-center text-sm text-ink-500">
              {t('noAccount')}{' '}
              <Link href="/registro" className="text-court-600 font-semibold hover:text-court-700">
                {t('signupLink')}
              </Link>
            </p>
          )}

          {mode === 'admin' && (
            <div className="border-t border-ink-100 pt-4">
              <p className="text-xs font-semibold text-ink-400 mb-2.5">{t('demoAccountsLabel')}</p>
              <div className="grid grid-cols-3 gap-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => fillDemo(acc)}
                    className="text-left bg-ink-50 hover:bg-court-50 border border-ink-100 hover:border-court-200 rounded-xl px-3 py-2.5 transition-colors"
                  >
                    <p className="text-[11px] font-bold text-ink-700">{acc.label}</p>
                    <p className="text-[10px] text-ink-400 mt-0.5">{acc.sub}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
