import { cn } from '@/lib/utils'

// "Líneas, no cajas": el borde de 1px hace todo el trabajo de separación. La sombra
// difusa por defecto (el "SaaS-card-kit" — la misma sombra gris bajo cada tarjeta) se
// retira; quien la necesite para un elemento flotante real (menú, modal) la agrega
// explícitamente vía className.
export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('bg-white rounded-xl border border-ink-100', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-6 py-5 border-b border-ink-100', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('font-display text-[15px] font-bold text-ink-900 tracking-tight', className)}
      {...props}
    >
      {children}
    </h3>
  )
}

export function CardBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-6', className)} {...props}>
      {children}
    </div>
  )
}
