import { cn } from '@/lib/utils'

export type BadgeTone = 'emerald' | 'amber' | 'gray' | 'red' | 'blue' | 'violet'

const TONES: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  amber:   'bg-amber-50 text-amber-700 ring-amber-600/10',
  gray:    'bg-gray-100 text-gray-600 ring-gray-500/10',
  red:     'bg-red-50 text-red-600 ring-red-600/10',
  blue:    'bg-blue-50 text-blue-700 ring-blue-600/10',
  violet:  'bg-violet-50 text-violet-700 ring-violet-600/10',
}

export function Badge({
  tone = 'gray', dot, className, children,
}: {
  tone?: BadgeTone; dot?: boolean; className?: string; children: React.ReactNode
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset',
      TONES[tone], className
    )}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', {
        emerald: 'bg-emerald-500', amber: 'bg-amber-500', gray: 'bg-gray-400',
        red: 'bg-red-500', blue: 'bg-blue-500', violet: 'bg-violet-500',
      }[tone])} />}
      {children}
    </span>
  )
}
