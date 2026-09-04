import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'live'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-court-600 hover:bg-court-700 text-white shadow-sm shadow-court-600/20',
  secondary: 'bg-white hover:bg-ink-50 text-ink-700 border border-ink-100',
  ghost: 'bg-transparent hover:bg-ink-50 text-ink-600',
  danger: 'bg-referee-50 hover:bg-referee-100 text-referee-600',
  // Reservado para acciones de alta energía y en vivo (ej. "Reservar ahora", "Marcar en
  // vivo") — el acento `ball` comunica disponibilidad/urgencia, no se usa como color
  // decorativo en botones secundarios.
  live: 'bg-ball-500 hover:bg-ball-600 text-ink-900 shadow-sm shadow-ball-500/30',
}

const SIZES: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-xs',
  md: 'px-5 py-2.5 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150',
        'active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-court-500/50 focus-visible:ring-offset-2',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
