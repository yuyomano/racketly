'use client'

import { useTranslations } from 'next-intl'
import { Search, Clock, Plus, X, RefreshCw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { bookingStatusMeta, bookingStatusLabel, BOOKING_STATUS } from '@/lib/booking-status'

// ── Vista de cuadrícula: columnas = horas del día, filas = pistas ──────────────
// Extraído de reservas/page.tsx para poder reutilizarlo (mismo componente que usa
// también la agenda de torneos/eventos) y para poder testear/evolucionar la grilla
// sin tocar el resto de la lógica de la página de Reservas.
// Cada celda ocupada por una reserva usa colSpan según su duración real (en pasos
// de 30 min) para que se vea del ancho correcto en vez de un solo bloque fijo.
const GRID_STEP_MIN = 30

type PlayerEntry = { name: string }
type BookingRow = {
  id: string
  status: string
  amountPaid: number
  currency: string
  players: (PlayerEntry & { amountOwed?: number; amountPaid?: number })[]
  slot: {
    date: string
    startTime: string
    endTime: string
    court: { id: string; name: string; sport: string; capacity: number }
  }
  userId: string
}
type ClassBookingRow = {
  id: string
  studentUserId: string
  studentName: string
  amountOwed: number
  amountPaid: number
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded'
  paymentMethod: 'cash' | 'card' | null
  status: string
}
type ClassSlotRow = {
  id: string
  courtId: string | null
  date: string
  startTime: string
  durationMinutes: number
  maxStudents: number
  price: number
  currency: string
  notes: string | null
  status: string
  professor: { name: string; isExternal: boolean; sport: string }
  court: { id: string; name: string } | null
  bookings: ClassBookingRow[]
}
type CourtRow = { id: string; name: string; sport: 'padel' | 'pickleball'; isActive: boolean }

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function fmtMin(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
function effectiveAmountPaid(b: BookingRow): number {
  const hasOwed = b.players.some((p) => p.amountOwed != null)
  if (hasOwed) return b.players.reduce((s, p) => s + (p.amountPaid ?? 0), 0)
  return b.amountPaid ?? 0
}

// ── Leyenda de estados — mismo vocabulario de color que Overview y la vista Lista ──
function StatusLegend() {
  const t = useTranslations('Reservas')
  const entries: { key: string; extraClass?: string; label: string }[] = [
    { key: 'confirmed', label: bookingStatusLabel(t, 'confirmed') },
    { key: 'pending', label: bookingStatusLabel(t, 'pending') },
    { key: 'class', extraClass: 'bg-violet-50 border-violet-200', label: t('grid.clase') },
    { key: 'completed', label: bookingStatusLabel(t, 'completed') },
    { key: 'cancelled', label: bookingStatusLabel(t, 'cancelled') },
  ]
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/50 text-[0.6875rem] text-gray-500">
      {entries.map((e) => (
        <div key={e.key} className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded border ${e.extraClass ?? BOOKING_STATUS[e.key]?.gridClass.split(' ').filter((c) => c.startsWith('bg-') || c.startsWith('border-')).join(' ')}`} />
          {e.label}
        </div>
      ))}
    </div>
  )
}

// ── Skeleton: forma de la grilla mientras carga, en vez de dejarla en blanco ──────
function GridSkeleton({ columns }: { columns: number }) {
  return (
    <div className="overflow-x-auto animate-pulse">
      <table className="border-collapse table-fixed w-full">
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-t border-gray-100">
              <td className="px-3 py-2" style={{ width: '9.375rem' }}>
                <div className="h-4 w-24 bg-gray-200 rounded mb-1.5" />
                <div className="h-3 w-14 bg-gray-100 rounded-full" />
              </td>
              {Array.from({ length: Math.min(columns, 12) }).map((_, j) => (
                <td key={j} className="border-l border-gray-100 px-1 py-2">
                  <div className="h-10 bg-gray-100 rounded" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CourtScheduleGrid({
  bookings, courts, classSlots, loading,
  gridDate, setGridDate, hourFrom, setHourFrom, hourTo, setHourTo,
  onEdit, onCancel, cancellingId, onNewBooking, onEditClass,
}: {
  bookings: BookingRow[]; courts: CourtRow[]; classSlots: ClassSlotRow[]; loading: boolean
  gridDate: string; setGridDate: (v: string) => void
  hourFrom: string; setHourFrom: (v: string) => void
  hourTo: string; setHourTo: (v: string) => void
  onEdit: (b: BookingRow) => void
  onCancel: (b: BookingRow) => void
  cancellingId: string | null
  onNewBooking: () => void
  onEditClass: (s: ClassSlotRow) => void
}) {
  const t = useTranslations('Reservas')
  const fromMin = toMin(hourFrom)
  const toMinVal = toMin(hourTo)
  const columns: number[] = []
  for (let m = fromMin; m < toMinVal; m += GRID_STEP_MIN) columns.push(m)

  const bookingsForDate = bookings.filter((b) => b.slot?.date === gridDate)
  const classesForDate = classSlots.filter((s) => s.date === gridDate && s.status !== 'cancelled')

  type Cell = { kind: 'empty' } | { kind: 'skip' } | { kind: 'booking'; booking: BookingRow; span: number } | { kind: 'class'; classSlot: ClassSlotRow; span: number }

  const rows = courts.map((court) => {
    const cells: Cell[] = new Array(columns.length).fill(null).map(() => ({ kind: 'empty' as const }))
    // Ordenadas para que, si hay un solape, siempre gane una reserva activa/completada
    // sobre una cancelada (una cancelación nunca debería poder "tapar" en la grilla a la
    // reserva real que ocupa ese horario), y dentro del mismo estado, la que empieza primero.
    const courtBookings = bookingsForDate
      .filter((b) => b.slot?.court?.id === court.id)
      .sort((a, b) => {
        const pa = a.status === 'cancelled' ? 1 : 0
        const pb = b.status === 'cancelled' ? 1 : 0
        return pa !== pb ? pa - pb : toMin(a.slot.startTime) - toMin(b.slot.startTime)
      })
    for (const b of courtBookings) {
      const startIdx = columns.indexOf(toMin(b.slot.startTime))
      if (startIdx === -1) continue // fuera del rango de horas visible
      const durationMin = Math.max(GRID_STEP_MIN, toMin(b.slot.endTime) - toMin(b.slot.startTime))
      const span = Math.min(Math.round(durationMin / GRID_STEP_MIN), columns.length - startIdx)
      // Si otra reserva ya ocupa alguna celda de este rango (solape real de horarios en
      // la misma pista), no la dibujamos encima: dos <td colSpan> superpuestos en la misma
      // fila desalinean todas las columnas siguientes respecto al encabezado, haciendo que
      // reservas posteriores aparezcan bajo una hora que no es la suya.
      const hasConflict = Array.from({ length: span }, (_, k) => cells[startIdx + k]).some((c) => c.kind !== 'empty')
      if (hasConflict) continue
      cells[startIdx] = { kind: 'booking', booking: b, span }
      for (let k = 1; k < span; k++) cells[startIdx + k] = { kind: 'skip' }
    }

    // Clases del profesor en esta pista — el backend ya evita que choquen con reservas
    // nuevas, pero esta comprobación protege la grilla de datos viejos/legado.
    const courtClasses = classesForDate.filter((s) => s.courtId === court.id)
    for (const s of courtClasses) {
      const startIdx = columns.indexOf(toMin(s.startTime))
      if (startIdx === -1) continue
      const span = Math.min(Math.max(1, Math.round(s.durationMinutes / GRID_STEP_MIN)), columns.length - startIdx)
      const hasConflict = Array.from({ length: span }, (_, k) => cells[startIdx + k]).some((c) => c.kind !== 'empty')
      if (hasConflict) continue
      cells[startIdx] = { kind: 'class', classSlot: s, span }
      for (let k = 1; k < span; k++) cells[startIdx + k] = { kind: 'skip' }
    }
    return { court, cells }
  })

  const showSkeleton = loading && bookings.length === 0 && courts.length === 0

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">{t('grid.fecha')}</label>
          <Input type="date" value={gridDate} onChange={(e) => setGridDate(e.target.value)}
            className="px-4 py-2 w-auto" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">{t('grid.desde')}</label>
          <Input type="time" step={1800} value={hourFrom} onChange={(e) => setHourFrom(e.target.value)}
            className="px-3 py-2 w-auto" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">{t('grid.hasta')}</label>
          <Input type="time" step={1800} value={hourTo} onChange={(e) => setHourTo(e.target.value)}
            className="px-3 py-2 w-auto" />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {loading && !showSkeleton && <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />}
          <button
            onClick={onNewBooking}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('grid.nuevaReserva')}
          </button>
        </div>
      </div>

      <StatusLegend />

      {showSkeleton ? (
        <GridSkeleton columns={columns.length} />
      ) : columns.length === 0 ? (
        <EmptyState icon={Clock} title={t('grid.rangoInvalido')} description={t('grid.rangoInvalidoDesc')} />
      ) : courts.length === 0 ? (
        <EmptyState icon={Search} title={loading ? t('grid.cargandoPistas') : t('grid.sinPistas')} description={t('grid.sinPistasDesc')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse table-fixed">
            <colgroup>
              <col style={{ width: '9.375rem' }} />
              {columns.map((m) => <col key={m} style={{ width: '4rem' }} />)}
            </colgroup>
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider bg-gray-50">
                <th className="px-3 py-2 sticky left-0 bg-gray-50 z-10">{t('grid.pista')}</th>
                {columns.map((m) => (
                  <th key={m} className="px-1 py-2 text-center font-medium border-l border-gray-100">{fmtMin(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ court, cells }) => (
                <tr key={court.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 sticky left-0 bg-white z-10 border-r border-gray-100">
                    <p className="text-sm font-semibold text-gray-800 truncate">{court.name}</p>
                    <Badge tone={court.sport === 'padel' ? 'emerald' : 'amber'}>
                      {court.sport === 'padel' ? t('grid.padel') : t('grid.pickleball')}
                    </Badge>
                  </td>
                  {cells.map((cell, i) => {
                    if (cell.kind === 'skip') return null
                    if (cell.kind === 'empty') {
                      return <td key={i} className="border-l border-gray-100 bg-white h-14" />
                    }
                    if (cell.kind === 'class') {
                      const s = cell.classSlot
                      const activeStudents = s.bookings.filter((bk) => bk.status === 'active')
                      const cupos = `${activeStudents.length}/${s.maxStudents}`
                      const studentNames = activeStudents.map((bk) => bk.studentName).join(', ')
                      return (
                        <td key={i} colSpan={cell.span} className="border-l border-gray-100 p-0 align-top">
                          <div
                            className="h-14 px-2 py-1 border text-[0.6875rem] leading-tight overflow-hidden bg-violet-50 hover:bg-violet-100 text-violet-800 border-violet-200 cursor-pointer transition-colors"
                            onClick={() => onEditClass(s)}
                            title={t('grid.claseTitle', { name: s.professor.name, cupos, students: studentNames ? ` — ${studentNames}` : '' })}
                          >
                            <span className="font-semibold truncate block">🎓 {s.professor.name} · {cupos}</span>
                            <p className="opacity-70 truncate">{studentNames || t('grid.sinAlumnosAun')}</p>
                          </div>
                        </td>
                      )
                    }
                    const b = cell.booking
                    const isActive = b.status !== 'cancelled' && b.status !== 'completed'
                    const names = (b.players ?? []).map((p) => p.name).join(', ') || '—'
                    const meta = bookingStatusMeta(b.status)
                    return (
                      <td key={i} colSpan={cell.span} className="border-l border-gray-100 p-0 align-top">
                        <div className={`h-14 px-2 py-1 border text-[0.6875rem] leading-tight overflow-hidden ${meta.gridClass} ${isActive ? 'cursor-pointer' : ''}`}
                          onClick={() => isActive && onEdit(b)}
                          title={isActive ? t('grid.bookingTitle', { names }) : `${names} · ${bookingStatusLabel(t, b.status)}`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-semibold truncate">{names}</span>
                            {isActive && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onCancel(b) }}
                                disabled={cancellingId === b.id}
                                className="shrink-0 text-current opacity-60 hover:opacity-100"
                                title={t('grid.cancelarReservaTitle')}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <p className="opacity-70 truncate">{formatCurrency(effectiveAmountPaid(b), b.currency)}{!isActive && ` · ${bookingStatusLabel(t, b.status)}`}</p>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
