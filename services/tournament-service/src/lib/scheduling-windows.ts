import { zonedTimeToUtc } from '@racketly/utils'

// ─── Horarios de apertura/cierre por día ──────────────────────────────────────
export type SchedulingWindow = { date: string; openTime: string; closeTime: string }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function sanitizeSchedulingWindows(input: unknown): SchedulingWindow[] | null {
  if (!Array.isArray(input)) return null
  const result: SchedulingWindow[] = []
  for (const w of input) {
    if (!w || typeof w !== 'object') continue
    const { date, openTime, closeTime } = w as Record<string, unknown>
    if (typeof date !== 'string' || !DATE_RE.test(date)) continue
    if (typeof openTime !== 'string' || !TIME_RE.test(openTime)) continue
    if (typeof closeTime !== 'string' || !TIME_RE.test(closeTime)) continue
    if (closeTime <= openTime) continue
    result.push({ date, openTime, closeTime })
  }
  result.sort((a, b) => a.date.localeCompare(b.date))
  return result.length > 0 ? result : null
}

// Convierte las franjas guardadas (fecha + hora local del club) a rangos absolutos
// en ms, y ofrece "el próximo instante jugable" — usado por el scheduler para no
// agendar partidos fuera de las franjas declaradas, saltando al día siguiente si hace falta.
// openTime/closeTime son hora LOCAL del club (ej. "08:00" en Santo Domingo, no UTC) —
// timezone es el IANA de Club.timezone; sin esto, "08:00" se agendaba como 08:00 UTC,
// desplazando los partidos varias horas respecto a lo que el admin configuró.
export function windowsToMs(
  windows: SchedulingWindow[],
  timezone: string
): { start: number; end: number }[] {
  return windows.map((w) => ({
    start: zonedTimeToUtc(w.date, w.openTime, timezone),
    end: zonedTimeToUtc(w.date, w.closeTime, timezone),
  }))
}

export function nextPlayable(t: number, windows: { start: number; end: number }[]): number {
  for (const w of windows) {
    if (t <= w.start) return w.start
    if (t >= w.start && t < w.end) return t
  }
  return Infinity
}
