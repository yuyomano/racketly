import type { BadgeTone } from '@/components/ui/Badge'

// Criterio único de color de estado de reserva, usado en el Overview del dashboard, la
// vista Lista y la vista Cuadrícula de Reservas — antes cada vista tenía su propio mapa
// (con colores distintos para el mismo estado, ej. "cancelada" en gris en un lado y rojo
// en otro), lo que hacía que la misma reserva se viera distinta según la vista.
// El label NO vive acá — este archivo no es un componente y no puede llamar useTranslations,
// así que el texto se resuelve en el caller con bookingStatusLabel(t, status), pasándole su
// propia función de traducción (namespace "Overview" o "Reservas" según la página).
export const BOOKING_STATUS: Record<string, { tone: BadgeTone; gridClass: string }> = {
  confirmed: {
    tone: 'emerald',
    gridClass: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  pending: {
    tone: 'amber',
    gridClass: 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200',
  },
  completed: {
    tone: 'gray',
    gridClass: 'bg-gray-100 text-gray-500',
  },
  cancelled: {
    tone: 'red',
    gridClass: 'bg-gray-50 text-gray-300 line-through',
  },
}

export function bookingStatusMeta(status: string) {
  return (
    BOOKING_STATUS[status] ?? { tone: 'gray' as BadgeTone, gridClass: 'bg-gray-50 text-gray-500' }
  )
}

export function bookingStatusLabel(t: (key: string) => string, status: string): string {
  return BOOKING_STATUS[status] ? t(`bookingStatus.${status}`) : status
}
