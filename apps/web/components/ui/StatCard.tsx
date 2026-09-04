import type { LucideIcon } from 'lucide-react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { Card } from './Card'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  trendUp,
  tone = 'gray',
  onClick,
  active,
}: {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  trend?: string
  trendUp?: boolean
  tone?: 'emerald' | 'amber' | 'violet' | 'gray'
  onClick?: () => void
  active?: boolean
}) {
  // Antes: icono en una placa de color redondeada (el "SaaS-card-kit"). Ahora: una
  // línea superior de 2px hace de acento de tono, y el icono queda pequeño y neutro
  // junto a la etiqueta — el número es lo único que compite por atención.
  const ruleClass = {
    emerald: 'border-t-court-500',
    amber: 'border-t-trophy-500',
    violet: 'border-t-ink-400',
    gray: 'border-t-ink-100',
  }[tone]

  const isLong = value.length > 8
  const valueSizeClass = isLong ? 'text-lg' : value.length > 6 ? 'text-2xl' : 'text-[1.75rem]'

  return (
    <Card
      className={cn(
        'p-5 border-t-2 transition-colors',
        ruleClass,
        onClick && 'cursor-pointer hover:border-court-200',
        active && 'ring-2 ring-court-500/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5 text-ink-500">
        <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
        <p className="text-xs font-medium truncate">{label}</p>
      </div>
      <p
        className={cn(
          'font-display font-score font-black text-ink-900 mt-1.5 tracking-tight',
          valueSizeClass,
          isLong ? 'leading-tight break-words' : 'leading-none truncate'
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-ink-400 mt-1.5 truncate">{sub}</p>}
      {trend && (
        <div
          className={cn(
            'mt-3 inline-flex items-center gap-1 text-xs font-semibold',
            trendUp ? 'text-court-600' : 'text-referee-500'
          )}
        >
          {trendUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {trend}
        </div>
      )}
    </Card>
  )
}
