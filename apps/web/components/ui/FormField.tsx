import { cn } from '@/lib/utils'

// Reemplaza el bloque `<div><label className="block text-xs font-semibold
// text-ink-500 mb-1">...</label>{input}</div>` repetido a mano en cada form
// del dashboard (mis-clubs, canchas, caja, jugadores, membresias...) por un
// único componente con label + hint/error consistentes.
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: React.ReactNode
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink-500 mb-1">
        {label}
        {required && <span className="text-referee-500"> *</span>}
      </label>
      {children}
      {error ? (
        <p className={cn('mt-1 text-xs text-referee-600')}>{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}
