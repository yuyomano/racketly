import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogOut, Menu } from 'lucide-react'
import { getTranslations, getLocale } from 'next-intl/server'
import { getSessionUser, getAdminClubs } from '@/lib/auth-web'
import { ClubSelectorClient } from './ClubSelectorClient'
import { NavLink } from './NavLink'
import { UserMenuClient } from './UserMenuClient'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import type { NavIconKey } from './NavLink'

// Checkbox oculto + `peer` de Tailwind: abre/cierra el sidebar en mobile sin JS de
// cliente, porque este layout es un Server Component (no puede usar useState). El
// checkbox y todo lo que reacciona a él (aside, overlay, botón hamburguesa) son
// hermanos dentro del mismo div raíz — así el CSS `peer-checked` los alcanza a todos.
const SIDEBAR_TOGGLE_ID = 'sidebar-toggle'

const NAV_KEYS: { href: string; key: string; icon: NavIconKey }[] = [
  { href: '/dashboard',                  key: 'overview',      icon: 'LayoutDashboard' },
  { href: '/dashboard/reservas',         key: 'reservas',      icon: 'CalendarDays' },
  { href: '/dashboard/jugadores',        key: 'jugadores',     icon: 'Contact' },
  { href: '/dashboard/canchas',          key: 'pistas',        icon: 'CircleDot' },
  { href: '/dashboard/torneos',          key: 'torneos',       icon: 'Trophy' },
  { href: '/dashboard/clases',           key: 'clases',        icon: 'GraduationCap' },
  { href: '/dashboard/membresias',       key: 'membresias',    icon: 'CreditCard' },
  { href: '/dashboard/caja',             key: 'caja',          icon: 'Wallet' },
  { href: '/dashboard/mis-clubs',        key: 'misClubs',      icon: 'Building2' },
  { href: '/dashboard/estadisticas',     key: 'estadisticas',  icon: 'BarChart3' },
  { href: '/dashboard/administradores',  key: 'admins',        icon: 'Users' },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const clubs = await getAdminClubs(user.id)
  const t = await getTranslations('Nav')
  const tLayout = await getTranslations('DashboardLayout')
  const locale = await getLocale()
  const navItems = NAV_KEYS.map((item) => ({ ...item, label: t(item.key) }))

  return (
    <div className="min-h-screen bg-gray-50">
      <input type="checkbox" id={SIDEBAR_TOGGLE_ID} className="peer hidden" />
      <Sidebar clubs={clubs} user={user} navItems={navItems} t={tLayout} />
      <label
        htmlFor={SIDEBAR_TOGGLE_ID}
        aria-hidden="true"
        className="hidden peer-checked:block fixed inset-0 bg-black/40 z-30 lg:hidden"
      />
      <TopBar clubs={clubs} t={tLayout} locale={locale} />
      <main className="pt-16 min-h-screen lg:ml-64">
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  )
}

function Sidebar({ clubs, user, navItems, t }: {
  clubs: any[]; user: any
  navItems: { href: string; label: string; icon: NavIconKey }[]
  t: Awaited<ReturnType<typeof getTranslations>>
}) {
  return (
    <aside
      className="hidden peer-checked:flex lg:flex flex-col
        w-64 min-h-screen bg-gradient-to-b from-primary-900 to-[#042b22] fixed top-0 left-0 z-40"
    >
      {/* Logo */}
      <div className="px-6 py-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-lg shrink-0">
            🎾
          </div>
          <div>
            <p className="text-white font-black text-lg leading-none tracking-tight">Racketly</p>
            <p className="text-emerald-300 text-[11px] mt-0.5 font-medium">Club Dashboard</p>
          </div>
        </Link>
      </div>

      <div className="mx-4 h-px bg-white/10" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
        ))}
      </nav>

      {/* Club selector */}
      <div className="px-4 py-4">
        <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wide mb-2 px-0.5">{t('clubActivo')}</p>
        <ClubSelectorClient clubs={clubs} />
      </div>

      <div className="mx-4 h-px bg-white/10" />

      {/* Usuario + logout */}
      <div className="px-4 py-4">
        <div className="mb-3">
          <UserMenuClient email={user.email} />
        </div>
        <LogoutButton label={t('cerrarSesion')} />
      </div>
    </aside>
  )
}

function TopBar({ clubs, t, locale }: {
  clubs: any[]
  t: Awaited<ReturnType<typeof getTranslations>>
  locale: string
}) {
  return (
    <header className="fixed top-0 left-0 right-0 lg:left-64 h-16 bg-white/80 backdrop-blur-sm border-b border-gray-100 z-20 flex items-center justify-between px-4 sm:px-6 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <label
          htmlFor={SIDEBAR_TOGGLE_ID}
          className="lg:hidden shrink-0 -ml-1 p-2 rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer"
          aria-label={t('abrirMenu')}
        >
          <Menu className="w-5 h-5" />
        </label>
        <p className="text-sm text-gray-400 truncate">
          {clubs.length > 0 ? t('administrasClubs', { count: clubs.length }) : t('sinClubs')}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-sm text-gray-400 capitalize hidden sm:block">
          {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        <LanguageSwitcher />
      </div>
    </header>
  )
}

function LogoutButton({ label }: { label: string }) {
  return (
    <form action={async () => {
      'use server'
      const { cookies } = await import('next/headers')
      const { redirect } = await import('next/navigation')
      const cookieStore = await cookies()
      cookieStore.delete('racketly_token')
      cookieStore.delete('racketly_user')
      redirect('/login')
    }}>
      <button
        type="submit"
        className="flex items-center gap-2 w-full text-left text-white/40 hover:text-white text-xs font-medium transition-colors px-0.5 py-1"
      >
        <LogOut className="w-3.5 h-3.5" />
        {label}
      </button>
    </form>
  )
}
