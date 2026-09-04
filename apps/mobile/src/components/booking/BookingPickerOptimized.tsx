import React, { useMemo, useState } from 'react'
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { Text } from '../ui/Text'
import * as Haptics from 'expo-haptics'
import { useQuery } from '@tanstack/react-query'
import { clubsApi } from '../../services/api'
import { EmptyState } from '../ui/EmptyState'
import { ScheduleGridSkeleton } from '../ui/Skeleton'
import { colors, radius, spacing, fontSize } from '../../theme'
import { sportLabel } from '../../constants/sportIcons'
import { SportIcon } from '../ui/SportIcons'

export type Slot = {
  id: string
  date: string
  startTime: string
  endTime: string
  basePrice: number
  peakPrice: number
  currency: string
  isAvailable: boolean
  isPeak: boolean
  court: { id: string; name: string; sport: string; surface: string; capacity?: number }
}

function formatTime(time: string) {
  return time.slice(0, 5)
}
function formatDateKey(d: Date) {
  return d.toISOString().split('T')[0]
}
function addDays(base: Date, n: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d
}
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function tap(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  Haptics.impactAsync(style).catch(() => {})
}

// ── Grid ágil: pistas en columnas, horas en filas — mismo criterio visual que la
// Cuadrícula del dashboard (CourtScheduleGrid.tsx) para que un club que reserva
// desde el móvil y lo revisa desde el dashboard reconozca la misma disposición.
// Reemplaza el flujo anterior de 2 pasos (elegir hora → elegir pista, cada uno en
// su propia sección) por una sola grilla donde un toque = una celda = pista+hora,
// y ese toque abre directamente la hoja de confirmación (ver BookingConfirmSheet).
export function BookingPickerOptimized({
  clubId,
  onSlotSelected,
  selectedSlotId,
}: {
  clubId: string
  onSlotSelected: (slot: Slot) => void
  selectedSlotId?: string | null
}) {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedSport, setSelectedSport] = useState<string | null>(null)
  const [selectedSurface, setSelectedSurface] = useState<string | null>(null)

  const { data: club } = useQuery({
    queryKey: ['club', clubId],
    queryFn: () => clubsApi.getById(clubId),
    select: (r) => r.data.data,
  })

  const DAYS = useMemo(
    () => Array.from({ length: club?.bookingHorizonDays ?? 7 }, (_, i) => addDays(new Date(), i)),
    [club?.bookingHorizonDays]
  )

  const { data: slots, isLoading } = useQuery({
    queryKey: ['availability', clubId, formatDateKey(selectedDate)],
    queryFn: () => clubsApi.getAvailability(clubId, formatDateKey(selectedDate)),
    select: (r) => r.data.data as Slot[],
  })

  const sports = useMemo(() => [...new Set((slots ?? []).map((s) => s.court.sport))], [slots])
  const surfaces = useMemo(
    () => [...new Set((slots ?? []).map((s) => s.court.surface).filter(Boolean))],
    [slots]
  )

  const filteredSlots = (slots ?? []).filter(
    (s) =>
      s.isAvailable &&
      (selectedSport === null || s.court.sport === selectedSport) &&
      (selectedSurface === null || s.court.surface === selectedSurface)
  )

  const courts = useMemo(() => {
    const map = new Map<string, Slot['court']>()
    filteredSlots.forEach((s) => map.set(s.court.id, s.court))
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [filteredSlots])

  const times = useMemo(
    () => [...new Set(filteredSlots.map((s) => s.startTime))].sort(),
    [filteredSlots]
  )

  function cellFor(courtId: string, time: string) {
    return filteredSlots.find((s) => s.court.id === courtId && s.startTime === time) ?? null
  }

  function changeDate(day: Date) {
    tap()
    setSelectedDate(day)
  }
  function changeSport(s: string | null) {
    tap()
    setSelectedSport(s)
  }
  function changeSurface(s: string | null) {
    tap()
    setSelectedSurface(s)
  }
  function selectCell(slot: Slot) {
    tap(Haptics.ImpactFeedbackStyle.Medium)
    onSlotSelected(slot)
  }

  return (
    <View>
      {/* Selector horizontal de fecha */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateRow}
      >
        {DAYS.map((day) => {
          const isSelected = formatDateKey(day) === formatDateKey(selectedDate)
          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={[styles.dayBtn, isSelected && styles.dayBtnActive]}
              onPress={() => changeDate(day)}
            >
              <Text style={[styles.dayName, isSelected && styles.dayNameActive]}>
                {DAY_NAMES[day.getDay()]}
              </Text>
              <Text style={[styles.dayNum, isSelected && styles.dayNumActive]}>
                {day.getDate()}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Filtros táctiles rápidos: deporte y superficie (cubierta/exterior, muro/cristal) */}
      {(sports.length > 1 || surfaces.length > 1) && (
        <View style={styles.filtersWrap}>
          {sports.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <TouchableOpacity
                style={[styles.chip, selectedSport === null && styles.chipActive]}
                onPress={() => changeSport(null)}
              >
                <Text style={[styles.chipText, selectedSport === null && styles.chipTextActive]}>
                  Todos
                </Text>
              </TouchableOpacity>
              {sports.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, styles.chipRow, selectedSport === s && styles.chipActive]}
                  onPress={() => changeSport(s)}
                >
                  <SportIcon
                    sport={s}
                    size={12}
                    color={selectedSport === s ? colors.white : colors.ink500}
                  />
                  <Text style={[styles.chipText, selectedSport === s && styles.chipTextActive]}>
                    {sportLabel(s)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {surfaces.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <TouchableOpacity
                style={[
                  styles.chip,
                  styles.chipSurface,
                  selectedSurface === null && styles.chipActive,
                ]}
                onPress={() => changeSurface(null)}
              >
                <Text style={[styles.chipText, selectedSurface === null && styles.chipTextActive]}>
                  Toda superficie
                </Text>
              </TouchableOpacity>
              {surfaces.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.chip,
                    styles.chipSurface,
                    selectedSurface === s && styles.chipActive,
                  ]}
                  onPress={() => changeSurface(s)}
                >
                  <Text style={[styles.chipText, selectedSurface === s && styles.chipTextActive]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Grid ágil: pistas × horas */}
      {isLoading ? (
        <ScheduleGridSkeleton rows={5} cols={Math.max(courts.length, 3)} />
      ) : times.length === 0 || courts.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Sin horarios disponibles"
          description="Prueba con otra fecha, deporte o superficie"
        />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* Encabezado de pistas */}
            <View style={styles.gridHeaderRow}>
              <View style={styles.timeHeaderCell} />
              {courts.map((c) => (
                <View key={c.id} style={styles.courtHeaderCell}>
                  <SportIcon sport={c.sport} size={12} color={colors.court700} />
                  <Text style={styles.courtHeaderText} numberOfLines={1}>
                    {c.name}
                  </Text>
                </View>
              ))}
            </View>
            {/* Filas de hora */}
            {times.map((time) => (
              <View key={time} style={styles.gridRow}>
                <View style={styles.timeCell}>
                  <Text style={styles.timeCellText}>{formatTime(time)}</Text>
                </View>
                {courts.map((c) => {
                  const slot = cellFor(c.id, time)
                  const isSelected = !!slot && slot.id === selectedSlotId
                  if (!slot) {
                    return (
                      <View key={c.id} style={[styles.cell, styles.cellOccupied]}>
                        <Text style={styles.cellOccupiedText}>—</Text>
                      </View>
                    )
                  }
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.cell,
                        styles.cellAvailable,
                        slot.isPeak && styles.cellPeak,
                        isSelected && styles.cellSelected,
                      ]}
                      onPress={() => selectCell(slot)}
                    >
                      <Text style={[styles.cellText, isSelected && styles.cellTextSelected]}>
                        {slot.currency}{' '}
                        {(slot.isPeak ? slot.peakPrice : slot.basePrice).toLocaleString()}
                      </Text>
                      {slot.isPeak && !isSelected && <Text style={styles.cellPeakBadge}>Peak</Text>}
                    </TouchableOpacity>
                  )
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Leyenda de estados — mismo criterio visual que la cuadrícula del dashboard */}
      {times.length > 0 && courts.length > 0 && (
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.cellAvailable]} />
            <Text style={styles.legendText}>Disponible</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.cellSelected]} />
            <Text style={styles.legendText}>Seleccionado</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.cellOccupied]} />
            <Text style={styles.legendText}>Ocupado</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const CELL_WIDTH = 92

const styles = StyleSheet.create({
  dateRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  dayBtn: {
    width: 52,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.ink100,
  },
  dayBtnActive: { backgroundColor: colors.court600 },
  dayName: { fontSize: fontSize.xs, color: colors.ink400, fontWeight: '600' },
  dayNameActive: { color: colors.court100 },
  dayNum: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  dayNumActive: { color: colors.white },

  filtersWrap: { paddingHorizontal: spacing.lg, gap: 8, marginTop: spacing.sm },
  filterRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.ink100,
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipSurface: { backgroundColor: colors.ink50, borderWidth: 1, borderColor: colors.ink200 },
  chipActive: { backgroundColor: colors.court600, borderColor: colors.court600 },
  chipText: { fontSize: fontSize.sm, color: colors.ink500, fontWeight: '500' },
  chipTextActive: { color: colors.white },

  gridHeaderRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginTop: spacing.md },
  timeHeaderCell: { width: 56 },
  courtHeaderCell: { width: CELL_WIDTH, alignItems: 'center', gap: 2, paddingBottom: 6 },
  courtHeaderText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textPrimary },

  gridRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: 6 },
  timeCell: { width: 56, justifyContent: 'center' },
  timeCellText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink500 },

  cell: {
    width: CELL_WIDTH,
    marginLeft: 4,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cellAvailable: {
    backgroundColor: colors.court50,
    borderWidth: 1.5,
    borderColor: colors.court200,
  },
  cellPeak: { backgroundColor: colors.trophy50, borderColor: colors.trophy100 },
  cellSelected: { backgroundColor: colors.court600, borderColor: colors.court600 },
  cellOccupied: { backgroundColor: colors.ink50, borderWidth: 1, borderColor: colors.ink100 },
  cellText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.court800 },
  cellTextSelected: { color: colors.white },
  cellOccupiedText: { fontSize: fontSize.sm, color: colors.ink300 },
  cellPeakBadge: { fontSize: 9, color: colors.trophy600, fontWeight: '700', marginTop: 2 },

  legendRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendText: { fontSize: fontSize.xs, color: colors.ink500 },
})
