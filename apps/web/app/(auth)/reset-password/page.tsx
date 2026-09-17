'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Lock, Loader2, KeyRound, AlertCircle } from 'lucide-react'
import Image from 'next/image'

function ResetPasswordForm() {
  const t = useTranslations('Auth.resetPassword')
  const router = useRouter()
  const token = useSearchParams().get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!token) {
      setError(t('errorInvalidToken'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('errorMismatch'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('errorGeneric'))
        return
      }
      setSuccess(true)
      setTimeout(() => {
        router.push('/booking')
        router.refresh()
      }, 1500)
    } catch {
      setError(t('errorGeneric'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo-mark.png" alt="" width={56} height={56} className="mx-auto" />
          <div className="flex justify-center mt-4">
            <KeyRound className="w-8 h-8 text-court-600" />
          </div>
          <h1 className="font-display text-2xl font-black text-ink-900 mt-3 tracking-tight">
            {t('title')}
          </h1>
          <p className="text-ink-500 text-sm mt-1">{t('subtitle')}</p>
        </div>

        <div className="bg-white rounded-2xl border border-ink-100 p-8 space-y-5">
          {success ? (
            <p className="text-center text-sm text-court-600">{t('success')}</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2.5 bg-referee-50 border border-referee-100 text-referee-700 text-sm rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div>
                <label
                  htmlFor="reset-password"
                  className="block text-xs font-semibold text-ink-600 mb-1.5"
                >
                  {t('passwordLabel')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    id="reset-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('passwordPlaceholder')}
                    className="w-full border border-ink-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40 focus:border-court-400 transition-all"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reset-confirm-password"
                  className="block text-xs font-semibold text-ink-600 mb-1.5"
                >
                  {t('confirmPasswordLabel')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    id="reset-confirm-password"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('submit')}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-ink-500">
            <Link href="/login" className="text-court-600 font-semibold hover:text-court-700">
              {t('backToLogin')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
