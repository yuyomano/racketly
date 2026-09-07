import { describe, it, expect } from 'vitest'
import {
  zonedTimeToUtc,
  normalizeSetScore,
  PairWorkloadTracker,
  findWorkloadEligibleStart,
  PAIR_DAILY_MATCH_LIMIT,
  PAIR_DAILY_SET_LIMIT,
  PAIR_HALF_DAY_MATCH_LIMIT,
  xpToLevel,
  xpForNextLevel,
} from './index'

describe('zonedTimeToUtc', () => {
  it('convierte hora local de Santo Domingo (UTC-4, sin horario de verano) a UTC', () => {
    const ms = zonedTimeToUtc('2026-08-15', '08:00', 'America/Santo_Domingo')
    expect(new Date(ms).toISOString()).toBe('2026-08-15T12:00:00.000Z')
  })

  it('UTC se comporta como identidad', () => {
    const ms = zonedTimeToUtc('2026-08-15', '08:00', 'UTC')
    expect(new Date(ms).toISOString()).toBe('2026-08-15T08:00:00.000Z')
  })

  it('respeta el cambio de horario de verano (Madrid, verano vs. invierno)', () => {
    // Madrid en agosto está en CEST (UTC+2)
    const summer = zonedTimeToUtc('2026-08-15', '10:00', 'Europe/Madrid')
    expect(new Date(summer).toISOString()).toBe('2026-08-15T08:00:00.000Z')
    // Madrid en enero está en CET (UTC+1)
    const winter = zonedTimeToUtc('2026-01-15', '10:00', 'Europe/Madrid')
    expect(new Date(winter).toISOString()).toBe('2026-01-15T09:00:00.000Z')
  })

  it('zonas con offset positivo grande no se rompen (Asia/Tokyo, UTC+9, cruza al día anterior en UTC)', () => {
    const ms = zonedTimeToUtc('2026-08-15', '02:00', 'Asia/Tokyo')
    expect(new Date(ms).toISOString()).toBe('2026-08-14T17:00:00.000Z')
  })
})

describe('normalizeSetScore', () => {
  it('normaliza tuplas [p1, p2] (formato legacy de seed/simulación)', () => {
    expect(normalizeSetScore([6, 4])).toEqual({ p1: 6, p2: 4 })
  })

  it('normaliza objetos { p1, p2 } (formato del modal de resultado del dashboard)', () => {
    expect(normalizeSetScore({ p1: 6, p2: 3 })).toEqual({ p1: 6, p2: 3 })
  })

  it('normaliza objetos { player1, player2 } (formato incorrecto que causó el bug de standings en 0)', () => {
    expect(normalizeSetScore({ player1: 7, player2: 5 })).toEqual({ p1: 7, p2: 5 })
  })

  it('devuelve 0/0 para entradas nulas, undefined o inválidas', () => {
    expect(normalizeSetScore(null)).toEqual({ p1: 0, p2: 0 })
    expect(normalizeSetScore(undefined)).toEqual({ p1: 0, p2: 0 })
    expect(normalizeSetScore('garbage')).toEqual({ p1: 0, p2: 0 })
    expect(normalizeSetScore({})).toEqual({ p1: 0, p2: 0 })
  })
})

describe('PairWorkloadTracker', () => {
  const day1 = Date.UTC(2026, 7, 15, 10, 0, 0) // mañana, 10:00 UTC

  it('permite partidos hasta el límite diario y luego los bloquea (repartidos entre mañana y tarde para no chocar con el límite de media jornada)', () => {
    const tracker = new PairWorkloadTracker()
    const key = 'pair-a'
    const afternoon = Date.UTC(2026, 7, 15, 14, 0, 0)
    const slots = [day1, day1, afternoon] // 2 en la mañana (límite de media jornada) + 1 en la tarde = 3 = límite diario
    expect(slots.length).toBe(PAIR_DAILY_MATCH_LIMIT)
    for (const slot of slots) {
      expect(tracker.fits(key, slot, 1)).toBe(true)
      tracker.register(key, slot, 1)
    }
    // el día ya tiene PAIR_DAILY_MATCH_LIMIT partidos → cualquier hora de ese día se bloquea
    expect(tracker.fits(key, afternoon, 1)).toBe(false)
  })

  it('bloquea por límite de sets aunque no se haya llegado al límite de partidos', () => {
    const tracker = new PairWorkloadTracker()
    const key = 'pair-b'
    tracker.register(key, day1, PAIR_DAILY_SET_LIMIT) // un solo partido consume todos los sets del día
    expect(tracker.fits(key, day1, 1)).toBe(false)
  })

  it('el límite de media jornada es más estricto que el diario', () => {
    const tracker = new PairWorkloadTracker()
    const key = 'pair-c'
    for (let i = 0; i < PAIR_HALF_DAY_MATCH_LIMIT; i++) {
      tracker.register(key, day1, 1)
    }
    // mismo bloque de mañana → ya no cabe, aunque el límite diario no se alcanzó
    expect(tracker.fits(key, day1, 1)).toBe(false)
  })

  it('parejas distintas no se afectan entre sí', () => {
    const tracker = new PairWorkloadTracker()
    tracker.register('pair-x', day1, PAIR_DAILY_SET_LIMIT)
    expect(tracker.fits('pair-y', day1, 1)).toBe(true)
  })
})

describe('findWorkloadEligibleStart', () => {
  it('devuelve el primer horario de pista si nadie está saturado', () => {
    const tracker = new PairWorkloadTracker()
    const lowerBound = Date.UTC(2026, 7, 15, 10, 0, 0)
    const start = findWorkloadEligibleStart({
      lowerBound,
      sets: 1,
      pairKeys: ['pair-a'],
      tracker,
      earliestCourtAtOrAfter: (notBefore) => notBefore,
    })
    expect(start).toBe(lowerBound)
  })

  it('salta al siguiente bloque de media jornada si la pareja ya está saturada', () => {
    const tracker = new PairWorkloadTracker()
    const morning = Date.UTC(2026, 7, 15, 10, 0, 0)
    for (let i = 0; i < PAIR_HALF_DAY_MATCH_LIMIT; i++) tracker.register('pair-a', morning, 1)

    const start = findWorkloadEligibleStart({
      lowerBound: morning,
      sets: 1,
      pairKeys: ['pair-a'],
      tracker,
      earliestCourtAtOrAfter: (notBefore) => notBefore,
    })
    // debe saltar a mediodía (frontera mañana/tarde) o después, no seguir en la mañana
    expect(start).toBeGreaterThanOrEqual(Date.UTC(2026, 7, 15, 12, 0, 0))
  })

  it('lanza si ninguna pareja del grupo cabe en maxIterations bloques', () => {
    const tracker = new PairWorkloadTracker()
    const lowerBound = Date.UTC(2026, 7, 15, 10, 0, 0)
    expect(() =>
      findWorkloadEligibleStart({
        lowerBound,
        sets: 1,
        pairKeys: ['pair-a'],
        tracker,
        earliestCourtAtOrAfter: () => {
          throw new Error('no debería pedir pista si ya está bloqueado')
        },
        maxIterations: 0,
      })
    ).toThrow()
  })
})

describe('xpToLevel', () => {
  it('0 XP es nivel 1', () => {
    expect(xpToLevel(0)).toBe(1)
  })

  it('XP justo en un umbral sube de nivel', () => {
    expect(xpToLevel(99)).toBe(1)
    expect(xpToLevel(100)).toBe(2)
  })

  it('XP por encima del último umbral se queda en el nivel máximo (11)', () => {
    expect(xpToLevel(15000)).toBe(11)
    expect(xpToLevel(999999)).toBe(11)
  })
})

describe('xpForNextLevel', () => {
  it('a mitad de camino entre dos umbrales da ~50%', () => {
    // nivel 1: 0-100
    expect(xpForNextLevel(50)).toEqual({ current: 0, next: 100, percent: 50 })
  })

  it('en el nivel máximo no divide por cero — da 100% en vez de NaN', () => {
    expect(xpForNextLevel(15000)).toEqual({ current: 15000, next: 15000, percent: 100 })
    expect(xpForNextLevel(999999)).toEqual({ current: 15000, next: 15000, percent: 100 })
  })

  it('justo al empezar un nivel da 0%', () => {
    expect(xpForNextLevel(100)).toEqual({ current: 100, next: 250, percent: 0 })
  })
})
