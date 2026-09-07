'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useGoogleLogin } from '@react-oauth/google'

export function GoogleLoginButton({ onError }: { onError: (msg: string) => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const login = useGoogleLogin({
    flow: 'implicit',
    onSuccess: async (tokenResponse) => {
      setLoading(true)
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: tokenResponse.access_token }),
        })
        const data = await res.json()
        if (!res.ok) {
          onError(data.error || 'Error al autenticar con Google')
          return
        }
        router.push('/dashboard')
        router.refresh()
      } catch {
        onError('Error de conexión con Google.')
      } finally {
        setLoading(false)
      }
    },
    onError: () => {
      onError('No se pudo completar el inicio de sesión con Google.')
      setLoading(false)
    },
  })

  return (
    <button
      type="button"
      onClick={() => login()}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 border border-ink-200 rounded-xl py-3 px-4 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-60 transition-all active:scale-[0.99]"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin text-ink-400" /> : <GoogleIcon />}
      Continuar con Google
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  )
}
