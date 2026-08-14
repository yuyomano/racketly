'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Trophy, GraduationCap, Users2, UserCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS = { CalendarDays, Trophy, GraduationCap, Users2, UserCircle } as const
export type AppNavIconKey = keyof typeof ICONS

export function AppNavLink({ href, label, icon }: { href: string; label: string; icon: AppNavIconKey }) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/community' && pathname.startsWith(href))
  const Icon = ICONS[icon]

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors',
        isActive ? 'text-emerald-700 bg-emerald-50' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
      )}
    >
      <Icon className="w-4 h-4" strokeWidth={2} />
      <span className="hidden md:inline">{label}</span>
    </Link>
  )
}
