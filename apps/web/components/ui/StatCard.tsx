import type { LucideIcon } from 'lucide-react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { Card } from './Card'
import { cn } from '@/lib/utils'

export function StatCard({
  label, value, sub, icon: Icon, trend, trendUp, tone = 'gray', onClick, active,
}: {
  label: string; value: string; sub?: string; icon: LucideIcon
  trend?: string; trendUp?: boolean
  tone?: 'emerald' | 'amber' | 'violet' | 'gray'
  onClick?: () => void
  active?: boolean
}) {
  const toneClasses = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
    violet:  'bg-violet-50 text-violet-600',
    gray:    'bg-gray-50 text-gray-500',
  }[tone]

  const isLong = value.length > 8
  const valueSizeClass = isLong ? 'text-lg' : value.length > 6 ? 'text-2xl' : 'text-[1.75rem]'

  return (
    <Card
      className={cn(
        'p-5',
        onClick && 'cursor-pointer transition-shadow hover:shadow-md',
        active && 'ring-2 ring-emerald-500/60'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">{label}</p>
          <p className={cn(
            'font-black text-gray-900 mt-1.5 tracking-tight',
            valueSizeClass,
            isLong ? 'leading-tight break-words' : 'leading-none truncate',
          )}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1.5 truncate">{sub}</p>}
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', toneClasses)}>
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
      </div>
      {trend && (
        <div className={cn(
          'mt-3 inline-flex items-center gap-1 text-xs font-semibold',
          trendUp ? 'text-emerald-600' : 'text-red-500'
        )}>
          {trendUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {trend}
        </div>
      )}
    </Card>
  )
}
