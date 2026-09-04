'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CalendarDays,
  CircleDot,
  Trophy,
  BarChart3,
  Users,
  Building2,
  Contact,
  CreditCard,
  Wallet,
  GraduationCap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS = {
  LayoutDashboard,
  CalendarDays,
  CircleDot,
  Trophy,
  BarChart3,
  Users,
  Building2,
  Contact,
  CreditCard,
  Wallet,
  GraduationCap,
} as const

export type NavIconKey = keyof typeof ICONS

export function NavLink({ href, label, icon }: { href: string; label: string; icon: NavIconKey }) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  const Icon = ICONS[icon]

  return (
    <Link
      href={href}
      onClick={() => {
        // En mobile, el sidebar se abre marcando #sidebar-toggle (ver layout.tsx) —
        // al navegar hay que destildarlo a mano porque el layout no se remonta.
        const toggle = document.getElementById('sidebar-toggle') as HTMLInputElement | null
        if (toggle) toggle.checked = false
      }}
      className={cn(
        'group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-white/10 text-white shadow-sm'
          : 'text-white/55 hover:bg-white/5 hover:text-white/90'
      )}
    >
      <Icon
        className={cn(
          'w-[18px] h-[18px] shrink-0 transition-colors',
          isActive ? 'text-ball-500' : 'text-white/40 group-hover:text-white/70'
        )}
        strokeWidth={2}
      />
      {label}
      {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-ball-500" />}
    </Link>
  )
}
