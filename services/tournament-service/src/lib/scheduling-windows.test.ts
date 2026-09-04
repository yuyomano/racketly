import { describe, it, expect } from 'vitest'
import { sanitizeSchedulingWindows, windowsToMs, nextPlayable } from './scheduling-windows'

describe('sanitizeSchedulingWindows', () => {
  it('acepta franjas válidas y las ordena por fecha', () => {
    const result = sanitizeSchedulingWindows([
      { date: '2026-08-16', openTime: '08:00', closeTime: '21:00' },
      { date: '2026-08-14', openTime: '18:00', closeTime: '22:00' },
    ])
    expect(result).toEqual([
      { date: '2026-08-14', openTime: '18:00', closeTime: '22:00' },
      { date: '2026-08-16', openTime: '08:00', closeTime: '21:00' },
    ])
  })

  it('descarta franjas donde closeTime <= openTime', () => {
    const result = sanitizeSchedulingWindows([
      { date: '2026-08-14', openTime: '22:00', closeTime: '18:00' },
    ])
    expect(result).toBeNull()
  })

  it('descarta fechas u horas con formato inválido', () => {
    const result = sanitizeSchedulingWindows([
      { date: '16-08-2026', openTime: '08:00', closeTime: '21:00' },
      { date: '2026-08-16', openTime: '8:00', closeTime: '21:00' },
      { date: '2026-08-16', openTime: '08:00', closeTime: '25:00' },
    ])
    expect(result).toBeNull()
  })

  it('devuelve null si el input no es un array o queda vacío tras filtrar', () => {
    expect(sanitizeSchedulingWindows(null)).toBeNull()
    expect(sanitizeSchedulingWindows('not an array')).toBeNull()
    expect(sanitizeSchedulingWindows([])).toBeNull()
  })
})

describe('windowsToMs', () => {
  it('convierte cada franja a un rango UTC usando la timezone del club (caso Dyllu Open, Santo Domingo)', () => {
    const windows = [{ date: '2026-08-15', openTime: '08:00', closeTime: '21:00' }]
    const [range] = windowsToMs(windows, 'America/Santo_Domingo')
    expect(new Date(range.start).toISOString()).toBe('2026-08-15T12:00:00.000Z')
    expect(new Date(range.end).toISOString()).toBe('2026-08-16T01:00:00.000Z')
  })

  it('con timezone UTC el rango coincide con la hora escrita', () => {
    const windows = [{ date: '2026-08-15', openTime: '08:00', closeTime: '21:00' }]
    const [range] = windowsToMs(windows, 'UTC')
    expect(new Date(range.start).toISOString()).toBe('2026-08-15T08:00:00.000Z')
  })
})

describe('nextPlayable', () => {
  const windows = windowsToMs(
    [
      { date: '2026-08-14', openTime: '18:00', closeTime: '22:00' },
      { date: '2026-08-15', openTime: '08:00', closeTime: '21:00' },
    ],
    'America/Santo_Domingo'
  )

  it('devuelve el mismo instante si ya cae dentro de una franja', () => {
    const t = windows[0].start + 30 * 60_000 // 30 min después de abrir el viernes
    expect(nextPlayable(t, windows)).toBe(t)
  })

  it('salta al inicio de la franja del viernes si el instante es anterior a que abra', () => {
    const before = windows[0].start - 3 * 60 * 60_000
    expect(nextPlayable(before, windows)).toBe(windows[0].start)
  })

  it('salta a la franja del sábado si el instante cae fuera de la del viernes (cerrado el viernes en la noche)', () => {
    const afterFridayCloses = windows[0].end + 60_000
    expect(nextPlayable(afterFridayCloses, windows)).toBe(windows[1].start)
  })

  it('devuelve Infinity si el instante está después de la última franja', () => {
    const afterEverything = windows[1].end + 60_000
    expect(nextPlayable(afterEverything, windows)).toBe(Infinity)
  })
})
