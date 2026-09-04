import { cn } from '@/lib/utils'

// Primitivos de tabla compartidos — antes cada página reescribía a mano
// `<table className="w-full">` + `<thead className="text-left text-xs text-gray-400
// uppercase tracking-wider bg-gray-50">` + `<tbody className="divide-y divide-gray-50">`,
// con pequeñas variaciones. No envuelve en su propio `overflow-x-auto`: quien lo usa
// decide el contenedor (a veces es el `<Card>` completo, a veces columnas sticky que
// necesitan control fino del scroll — como en CourtScheduleGrid).

export function Table({
  className,
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn('w-full text-sm', className)} {...props}>
      {children}
    </table>
  )
}

export function TableHead({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  // text-gray-400 sobre bg-gray-50 daba ~2.2:1 (falla AA). ink-600 sobre ink-50 pasa AA
  // manteniendo el mismo peso visual liviano de una cabecera de tabla.
  return (
    <thead
      className={cn('text-left text-xs text-ink-600 uppercase tracking-wider bg-ink-50', className)}
      {...props}
    >
      {children}
    </thead>
  )
}

export function TableBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('divide-y divide-ink-50', className)} {...props}>
      {children}
    </tbody>
  )
}

export function TableRow({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('hover:bg-ink-50 transition-colors', className)} {...props}>
      {children}
    </tr>
  )
}

export function Th({
  className,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('px-4 py-3 font-semibold', className)} {...props}>
      {children}
    </th>
  )
}

export function Td({
  className,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-4 py-3', className)} {...props}>
      {children}
    </td>
  )
}

// Fila de una sola celda para skeleton/empty state — evita repetir el <tr><td colSpan=...>
// a mano en cada tabla.
export function TableSpanRow({
  colSpan,
  className,
  children,
}: {
  colSpan: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <tr>
      <td colSpan={colSpan} className={className}>
        {children}
      </td>
    </tr>
  )
}
