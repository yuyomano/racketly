import { cn } from '@/lib/utils'

export type BadgeTone = 'emerald' | 'amber' | 'gray' | 'red' | 'blue' | 'violet'

// Se conserva el vocabulario de tonos existente (usado en ~90 sitios en todo el
// dashboard) para no romper esos call sites en esta fase; lo que cambia es a qué
// color del sistema "Marcador" apunta cada tono. Antes había dos mapas paralelos
// (uno para el fondo/texto, otro inline para el punto) que podían desincronizarse —
// ahora es un único mapa con ambos valores juntos.
const TONES: Record<BadgeTone, { badge: string; dot: string }> = {
  emerald: {
    badge: 'bg-court-50 text-court-700 ring-1 ring-inset ring-court-600/10',
    dot: 'bg-court-500',
  },
  amber: {
    badge: 'bg-trophy-50 text-trophy-700 ring-1 ring-inset ring-trophy-600/10',
    dot: 'bg-trophy-500',
  },
  gray: { badge: 'bg-ink-50 text-ink-600 ring-1 ring-inset ring-ink-600/10', dot: 'bg-ink-400' },
  red: {
    badge: 'bg-referee-50 text-referee-600 ring-1 ring-inset ring-referee-600/10',
    dot: 'bg-referee-500',
  },
  blue: {
    badge: 'bg-court-50 text-court-800 ring-1 ring-inset ring-court-700/10',
    dot: 'bg-court-700',
  },
  violet: {
    badge: 'bg-trophy-50 text-trophy-800 ring-1 ring-inset ring-trophy-700/10',
    dot: 'bg-trophy-700',
  },
}

export function Badge({
  tone = 'gray',
  dot,
  className,
  children,
}: {
  tone?: BadgeTone
  dot?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full',
        TONES[tone].badge,
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', TONES[tone].dot)} />}
      {children}
    </span>
  )
}
