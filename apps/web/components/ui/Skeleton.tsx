import { cn } from '@/lib/utils'

// Bloque base — todo skeleton de la app compone a partir de este, para que el
// timing y el tono de gris sean siempre los mismos en vez de que cada página
// reinvente su propio animate-pulse.
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-gray-100 rounded-lg', className)} />
}

// Filas de tabla — cabecera implícita ya la pinta la página real; esto solo
// reemplaza las filas de datos mientras cargan.
export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className={cn('h-4', j === 0 ? 'w-24' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Grid de StatCards (Overview, Reservas, etc).
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  )
}

// Lista de tarjetas — para páginas tipo Jugadores/Canchas/Mis Clubs/Administradores
// que muestran una lista de entidades, no una tabla ni stat cards.
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border border-gray-100 rounded-2xl p-4 flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Grid de tarjetas — para páginas tipo Torneos/Clases/Membresías donde el
// contenido son tarjetas en grilla, no filas.
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-gray-100 rounded-2xl p-5 space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  )
}
