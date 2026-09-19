'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft, Loader2, LogOut } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { LOCALE_COOKIE, LOCALES, type Locale } from '@/i18n/config'

type MeSettings = {
  language: string
  units: 'km' | 'mi'
  pushEnabled: boolean
  profileVisibility: 'public' | 'private'
}

async function fetchMe(): Promise<MeSettings> {
  const res = await fetch('/api/auth/me')
  const data = await res.json()
  if (!res.ok)
    return { language: 'es', units: 'km', pushEnabled: true, profileVisibility: 'public' }
  return {
    language: data.data?.language ?? 'es',
    units: data.data?.units ?? 'km',
    pushEnabled: data.data?.pushEnabled ?? true,
    profileVisibility: data.data?.profileVisibility ?? 'public',
  }
}

export function SettingsClient() {
  const t = useTranslations('ProfileSettings')
  const locale = useLocale()
  const router = useRouter()
  const toast = useToast()

  const { data: me, isLoading } = useQuery({ queryKey: ['me', 'settings'], queryFn: fetchMe })

  const [units, setUnits] = useState<'km' | 'mi' | null>(null)
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null)
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')

  const currentUnits = units ?? me?.units ?? 'km'
  const currentPush = pushEnabled ?? me?.pushEnabled ?? true
  const currentPrivate = isPrivate ?? me?.profileVisibility === 'private'

  const updateSettings = useMutation({
    mutationFn: (body: Partial<MeSettings>) =>
      fetch('/api/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),
    onError: () => toast.error(t('saveError')),
  })

  const deleteAccount = useMutation({
    mutationFn: () =>
      fetch('/api/auth/me', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword }),
      }),
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(t('deleteError'))
        return
      }
      await fetch('/api/auth', { method: 'DELETE' })
      router.push('/login')
    },
    onError: () => toast.error(t('deleteError')),
  })

  function setLocale(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`
    updateSettings.mutate({ language: next })
    router.refresh()
  }

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-ink-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      <Link
        href="/profile"
        className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('backLink')}
      </Link>

      <h1 className="text-xl font-black text-ink-900 tracking-tight">{t('title')}</h1>

      <Card className="p-6 space-y-2">
        <p className="text-sm font-bold text-ink-900">{t('language')}</p>
        <div className="flex border border-ink-200 rounded-xl overflow-hidden w-fit">
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${l === locale ? 'bg-court-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'}`}
            >
              {t(`languages.${l}`)}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-ink-900">{t('push')}</p>
          <p className="text-xs text-ink-400 mt-0.5">{t('pushHelper')}</p>
        </div>
        <Toggle
          checked={currentPush}
          onChange={(v) => {
            setPushEnabled(v)
            updateSettings.mutate({ pushEnabled: v })
          }}
        />
      </Card>

      <Card className="p-6 space-y-2">
        <p className="text-sm font-bold text-ink-900">{t('units')}</p>
        <div className="flex border border-ink-200 rounded-xl overflow-hidden w-fit">
          {(['km', 'mi'] as const).map((u) => (
            <button
              key={u}
              onClick={() => {
                setUnits(u)
                updateSettings.mutate({ units: u })
              }}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${currentUnits === u ? 'bg-court-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'}`}
            >
              {t(`unitsOptions.${u}`)}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-ink-900">{t('privateProfile')}</p>
          <p className="text-xs text-ink-400 mt-0.5">{t('privateProfileHelper')}</p>
        </div>
        <Toggle
          checked={currentPrivate}
          onChange={(v) => {
            setIsPrivate(v)
            updateSettings.mutate({ profileVisibility: v ? 'private' : 'public' })
          }}
        />
      </Card>

      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 text-sm font-bold text-red-600 border border-red-100 rounded-xl py-3 hover:bg-red-50 transition-colors"
      >
        <LogOut className="w-4 h-4" /> {t('logout')}
      </button>

      <Card className="p-6 bg-red-50 border-red-100 space-y-3">
        <p className="text-sm font-bold text-red-600">{t('deleteAccount')}</p>
        <p className="text-xs text-ink-500">{t('deleteAccountHelper')}</p>
        {showDeleteConfirm ? (
          <>
            <input
              type="password"
              placeholder={t('confirmPassword')}
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="w-full border border-ink-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-court-500/40"
            />
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1"
              >
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteAccount.mutate()}
                disabled={deleteAccount.isPending}
                className="flex-1"
              >
                {deleteAccount.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t('deleteAccount')
                )}
              </Button>
            </div>
          </>
        ) : (
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            {t('deleteAccount')}
          </Button>
        )}
      </Card>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${checked ? 'bg-court-500' : 'bg-ink-200'}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}
