import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSessionUser } from '@/lib/auth-web'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { AppNavLink, type AppNavIconKey } from './AppNavLink'

const NAV_KEYS: { href: string; key: string; icon: AppNavIconKey }[] = [
  { href: '/booking', key: 'booking', icon: 'CalendarDays' },
  { href: '/tournaments', key: 'tournaments', icon: 'Trophy' },
  { href: '/academy', key: 'academy', icon: 'GraduationCap' },
  { href: '/community', key: 'community', icon: 'Users2' },
  { href: '/profile', key: 'profile', icon: 'UserCircle' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const t = await getTranslations('AppNav')
  const navItems = NAV_KEYS.map((item) => ({
    href: item.href,
    icon: item.icon,
    label: t(item.key),
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur-sm border-b border-gray-100 flex items-center justify-between px-4 sm:px-6 gap-3">
        <Link href="/booking" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-base shrink-0">
            🎾
          </div>
          <span className="font-black text-gray-900 tracking-tight hidden sm:inline">Racketly</span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <AppNavLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <LanguageSwitcher />
          <span className="text-sm text-gray-400 hidden lg:inline">{user.email}</span>
          <LogoutButton label={t('logout')} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto py-8 px-4">{children}</main>
    </div>
  )
}

function LogoutButton({ label }: { label: string }) {
  return (
    <form
      action={async () => {
        'use server'
        const { cookies } = await import('next/headers')
        const { redirect } = await import('next/navigation')
        const cookieStore = await cookies()
        cookieStore.delete('racketly_token')
        cookieStore.delete('racketly_user')
        redirect('/login')
      }}
    >
      <button
        type="submit"
        className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 text-xs font-medium transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
        {label}
      </button>
    </form>
  )
}
