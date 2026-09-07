import { PlayerCategory } from '@racketly/shared-types'

// ─── ELO Calculator ──────────────────────────────────────────────────────────

const ELO_K_FACTOR = 32

/**
 * Calcula el nuevo ELO de ambos jugadores después de un partido.
 * @returns { newElo1, newElo2, delta1, delta2 }
 */
export function calculateElo(
  elo1: number,
  elo2: number,
  player1Won: boolean
): { newElo1: number; newElo2: number; delta1: number; delta2: number } {
  const expected1 = 1 / (1 + Math.pow(10, (elo2 - elo1) / 400))
  const expected2 = 1 - expected1

  const score1 = player1Won ? 1 : 0
  const score2 = player1Won ? 0 : 1

  const delta1 = Math.round(ELO_K_FACTOR * (score1 - expected1))
  const delta2 = Math.round(ELO_K_FACTOR * (score2 - expected2))

  return {
    newElo1: elo1 + delta1,
    newElo2: elo2 + delta2,
    delta1,
    delta2,
  }
}

/**
 * Determina la categoría de un jugador según su ELO.
 */
export function eloToCategory(elo: number): PlayerCategory {
  if (elo < 1100) return PlayerCategory.C4
  if (elo < 1200) return PlayerCategory.C3
  if (elo < 1300) return PlayerCategory.C2
  if (elo < 1400) return PlayerCategory.C1
  if (elo < 1550) return PlayerCategory.B3
  if (elo < 1700) return PlayerCategory.B2
  if (elo < 1850) return PlayerCategory.B1
  if (elo < 2000) return PlayerCategory.A
  return PlayerCategory.OPEN
}

export const INITIAL_ELO = 1000

// ─── Date & Time Utilities ────────────────────────────────────────────────────

/**
 * Formatea una fecha a string legible en español.
 */
export function formatDate(date: string | Date, locale = 'es-CO'): string {
  return new Date(date).toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Formatea una hora (HH:mm) a formato 12h.
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const h = hours % 12 || 12
  return `${h}:${String(minutes).padStart(2, '0')} ${period}`
}

/**
 * Calcula si una fecha/hora ya pasó.
 */
export function isPast(dateTime: string | Date): boolean {
  return new Date(dateTime) < new Date()
}

/**
 * Retorna la diferencia en minutos entre dos fechas.
 */
export function minutesDiff(from: string | Date, to: string | Date): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000)
}

// ─── Currency Utilities ───────────────────────────────────────────────────────

/**
 * Formatea un monto a moneda local.
 */
export function formatCurrency(amount: number, currency: string, locale = 'es-CO'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount)
}

// ─── Geo Utilities ────────────────────────────────────────────────────────────

/**
 * Calcula la distancia en km entre dos coordenadas (Haversine).
 */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}

// ─── String Utilities ─────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function generateQrPayload(bookingId: string, expiresAt: Date): string {
  return Buffer.from(JSON.stringify({ bookingId, exp: expiresAt.getTime() })).toString('base64')
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

// ─── Score Utilities ──────────────────────────────────────────────────────────

import type { SetScore } from '@racketly/shared-types'

/**
 * Determina el ganador de un partido basado en el marcador.
 * Retorna 1 si gana player1, 2 si gana player2.
 */
export function determineWinner(sets: SetScore[]): 1 | 2 | null {
  let p1Sets = 0
  let p2Sets = 0

  for (const set of sets) {
    if (set.player1 > set.player2) p1Sets++
    else if (set.player2 > set.player1) p2Sets++
  }

  const setsNeeded = Math.ceil(sets.length / 2)
  if (p1Sets >= setsNeeded) return 1
  if (p2Sets >= setsNeeded) return 2
  return null
}

/**
 * Formatea un marcador de sets para mostrar en pantalla.
 * Ej: [{6,4},{6,3}] → "6/4 6/3"
 */
export function formatScore(sets: SetScore[]): string {
  return sets.map((s) => `${s.player1}/${s.player2}`).join(' ')
}

// ─── Validation Utilities ─────────────────────────────────────────────────────

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[\d\s\-()]{7,15}$/.test(phone)
}

export function isStrongPassword(password: string): boolean {
  return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)
}

// ─── XP & Gamification ───────────────────────────────────────────────────────

const XP_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000]

export function xpToLevel(xp: number): number {
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= XP_THRESHOLDS[i]) return i + 1
  }
  return 1
}

export function xpForNextLevel(xp: number): { current: number; next: number; percent: number } {
  const level = xpToLevel(xp)
  const current = XP_THRESHOLDS[level - 1] ?? 0
  const next = XP_THRESHOLDS[level] ?? XP_THRESHOLDS[XP_THRESHOLDS.length - 1]
  // En el nivel máximo, next === current (no hay siguiente umbral) — sin este caso
  // especial la división da 0/0 = NaN y rompe la barra de progreso en el cliente.
  const percent = next === current ? 100 : Math.round(((xp - current) / (next - current)) * 100)
  return { current, next, percent }
}

// ─── Modalidad de juego (torneos) ──────────────────────────────────────────────

export type MatchFormat =
  | 'best_of_3_full'
  | 'two_sets_super_tb'
  | 'pro_set_8'
  | 'pro_set_10'
  | 'single_set_6'
  | 'timed_30'
  | 'timed_40'

export const MATCH_FORMAT_LABELS: Record<MatchFormat, string> = {
  best_of_3_full: '3 sets completos',
  two_sets_super_tb: '2 sets + super tie-break',
  pro_set_8: 'Pro set a 8 games',
  pro_set_10: 'Pro set a 10 games',
  single_set_6: 'Set único a 6 games',
  timed_30: 'Tiempo fijo — 30 min',
  timed_40: 'Tiempo fijo — 40 min',
}

// Duración estimada por partido (minutos), usada para planificar pistas y horarios.
export const MATCH_FORMAT_DURATION_MINUTES: Record<MatchFormat, number> = {
  best_of_3_full: 90,
  two_sets_super_tb: 60,
  pro_set_8: 40,
  pro_set_10: 50,
  single_set_6: 30,
  timed_30: 30,
  timed_40: 40,
}

export function matchFormatDurationMinutes(format: string): number {
  return MATCH_FORMAT_DURATION_MINUTES[format as MatchFormat] ?? 90
}

// ─── Modalidad por ronda eliminatoria ──────────────────────────────────────────
// Las rondas eliminatorias (octavos/cuartos/semifinal/final) pueden tener una
// modalidad distinta a la del resto del torneo (ej. grupos a 2 sets, pero semis y
// final a 3 sets completos). `matchFormatOverrides` guarda solo las que el
// organizador cambió explícitamente; el resto cae a `matchFormat` (modalidad general).

export type KnockoutStageKey = 'round_of_16' | 'quarterfinal' | 'semifinal' | 'final'

export const KNOCKOUT_STAGE_KEYS: KnockoutStageKey[] = [
  'round_of_16',
  'quarterfinal',
  'semifinal',
  'final',
]

export const KNOCKOUT_STAGE_LABELS: Record<KnockoutStageKey, string> = {
  round_of_16: 'Octavos',
  quarterfinal: 'Cuartos',
  semifinal: 'Semifinal',
  final: 'Final',
}

export type MatchFormatOverrides = Partial<Record<KnockoutStageKey, MatchFormat>>

// round/maxRound: números de ronda tal como los usa el bracket (ascendentes, la
// final es la de mayor número). fromEnd=0 → final, 1 → semifinal, 2 → cuartos,
// 3 → octavos; más lejos que eso no tiene modalidad propia (usa la general).
export function knockoutStageKeyForRound(round: number, maxRound: number): KnockoutStageKey | null {
  const fromEnd = maxRound - round
  if (fromEnd === 0) return 'final'
  if (fromEnd === 1) return 'semifinal'
  if (fromEnd === 2) return 'quarterfinal'
  if (fromEnd === 3) return 'round_of_16'
  return null
}

export function resolveMatchFormat(
  tournament: { matchFormat: string; matchFormatOverrides?: MatchFormatOverrides | null },
  stageKey: KnockoutStageKey | null
): MatchFormat {
  const override = stageKey ? tournament.matchFormatOverrides?.[stageKey] : undefined
  return (override ?? tournament.matchFormat) as MatchFormat
}

// ─── Límites de carga por pareja/jugador (agendado de torneos y eventos) ──────
// Ninguna pareja (o jugador, en torneos individuales) puede quedar agendada para
// jugar más de N partidos ni M "sets completos" en un mismo día, ni más de la
// mitad de eso en una misma media jornada. Ver docs/scheduling-workload-limits.md
// para la especificación completa del algoritmo.

export const PAIR_DAILY_MATCH_LIMIT = 3
export const PAIR_HALF_DAY_MATCH_LIMIT = 2
export const PAIR_DAILY_SET_LIMIT = 6
export const PAIR_HALF_DAY_SET_LIMIT = 4

// Sets completos que un partido de esta modalidad puede llegar a consumir en el
// peor caso (se reserva ese cupo al agendar, antes de saber el resultado real —
// no se conoce cuántos sets se jugarán realmente hasta que el partido termine).
// El super tie-break de "two_sets_super_tb" decide el partido pero no es un set
// completo, así que esa modalidad reserva 2, no 3.
export const MATCH_FORMAT_MAX_SETS: Record<MatchFormat, number> = {
  best_of_3_full: 3,
  two_sets_super_tb: 2,
  pro_set_8: 1,
  pro_set_10: 1,
  single_set_6: 1,
  timed_30: 1,
  timed_40: 1,
}

export function matchFormatMaxSets(format: string): number {
  return MATCH_FORMAT_MAX_SETS[format as MatchFormat] ?? 3
}

// Identificador único de una pareja, insensible al orden de sus dos integrantes
// (o de un jugador individual, en torneos de tipo "singles" donde partnerId es null).
export function pairKey(playerId: string, partnerId?: string | null): string {
  return partnerId ? [playerId, partnerId].sort().join('|') : playerId
}

// Día (YYYY-MM-DD, UTC) y media jornada del instante `ms`. La frontera entre
// mañana/tarde es fija a las 12:00 UTC — simple, predecible, y no depende de las
// franjas horarias configuradas por día (que pueden variar de un día a otro).
export function dayKeyOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
export function halfDayKeyOf(ms: number): string {
  return `${dayKeyOf(ms)}:${new Date(ms).getUTCHours() < 12 ? 'AM' : 'PM'}`
}

// Instante (ms) del próximo límite de jornada/media-jornada estrictamente después
// de `ms` — mediodía del mismo día si `ms` es de mañana, o medianoche del día
// siguiente si ya es tarde. Sirve para "saltar" al siguiente bloque disponible
// cuando una pareja agota su cupo de partidos/sets en el bloque actual.
export function nextHalfDayBoundary(ms: number): number {
  const d = new Date(ms)
  if (d.getUTCHours() < 12) {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0)
  }
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0)
}

// Cuántos partidos y sets (peor caso) tiene ya asignados cada pareja/jugador, por
// día y por media jornada — se consulta antes de fijar el horario de un partido
// (`fits`) y se actualiza después de asignarlo (`register`). Se puede pre-sembrar
// con los partidos que ya tenían horario ANTES de esta corrida del agendador, para
// que re-agendar parcialmente (sin tocar lo ya fijado) siga respetando el límite.
export class PairWorkloadTracker {
  private byDay = new Map<string, Map<string, { matches: number; sets: number }>>()
  private byHalf = new Map<string, Map<string, { matches: number; sets: number }>>()

  private bucket(
    store: Map<string, Map<string, { matches: number; sets: number }>>,
    key: string,
    sub: string
  ) {
    let inner = store.get(key)
    if (!inner) {
      inner = new Map()
      store.set(key, inner)
    }
    let entry = inner.get(sub)
    if (!entry) {
      entry = { matches: 0, sets: 0 }
      inner.set(sub, entry)
    }
    return entry
  }

  /** ¿Puede esta pareja jugar un partido que arranca en `startMs` y reserva `sets` sets? */
  fits(key: string, startMs: number, sets: number): boolean {
    const day = this.bucket(this.byDay, key, dayKeyOf(startMs))
    const half = this.bucket(this.byHalf, key, halfDayKeyOf(startMs))
    if (day.matches + 1 > PAIR_DAILY_MATCH_LIMIT) return false
    if (day.sets + sets > PAIR_DAILY_SET_LIMIT) return false
    if (half.matches + 1 > PAIR_HALF_DAY_MATCH_LIMIT) return false
    if (half.sets + sets > PAIR_HALF_DAY_SET_LIMIT) return false
    return true
  }

  register(key: string, startMs: number, sets: number): void {
    const day = this.bucket(this.byDay, key, dayKeyOf(startMs))
    const half = this.bucket(this.byHalf, key, halfDayKeyOf(startMs))
    day.matches += 1
    day.sets += sets
    half.matches += 1
    half.sets += sets
  }
}

// Busca el instante más temprano, en o después de `lowerBound`, en el que TODAS las
// parejas de `pairKeys` respetan su cupo diario/media-jornada — probando primero la
// pista más pronto disponible en cada candidato (`earliestCourtAtOrAfter`), y si ese
// horario ya no tiene cupo para alguna pareja, saltando al siguiente bloque
// (`nextHalfDayBoundary`) y repitiendo. Lanza si no encuentra hueco en `maxIterations`
// bloques (~30 días) — señal de que faltan pistas, días, o el torneo es demasiado
// grande para la ventana de fechas configurada.
export function findWorkloadEligibleStart(opts: {
  lowerBound: number
  sets: number
  pairKeys: string[]
  tracker: PairWorkloadTracker
  earliestCourtAtOrAfter: (notBefore: number) => number
  maxIterations?: number
}): number {
  let candidate = opts.lowerBound
  for (let i = 0; i < (opts.maxIterations ?? 60); i++) {
    const courtTime = opts.earliestCourtAtOrAfter(candidate)
    const blocked = opts.pairKeys.some((k) => !opts.tracker.fits(k, courtTime, opts.sets))
    if (!blocked) return courtTime
    candidate = nextHalfDayBoundary(courtTime)
  }
  throw new Error(
    'No se encontró un horario que respete el límite de partidos/sets por jornada de una pareja — faltan pistas, días u horarios disponibles'
  )
}

// Normaliza un set de un Match.score a { p1, p2 } — el score se ha guardado en dos
// formatos históricamente: array de tuplas [p1, p2] (datos de simulación/seed) y
// array de objetos { p1, p2 } (lo que guarda el modal de resultado del dashboard).
// Cualquier código que lea Match.score (cálculo de standings de grupo, UI de
// resultado) debe pasar cada set por aquí en vez de leer set.player1/set.p1 directo.
export function normalizeSetScore(s: unknown): { p1: number; p2: number } {
  if (Array.isArray(s)) return { p1: Number(s[0]) || 0, p2: Number(s[1]) || 0 }
  const obj = s as
    { p1?: unknown; p2?: unknown; player1?: unknown; player2?: unknown } | null | undefined
  return {
    p1: Number(obj?.p1 ?? obj?.player1 ?? 0) || 0,
    p2: Number(obj?.p2 ?? obj?.player2 ?? 0) || 0,
  }
}

// Offset (ms) de una zona horaria IANA en un instante dado, respecto a UTC.
function tzOffsetMs(instantMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(instantMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  )
  return asIfUtc - instantMs
}

// Convierte una fecha+hora "de pared" (tal como la escribe un admin, ej. "08:00" un
// sábado en Santo Domingo) al instante UTC real que representa, dada la zona horaria
// IANA del club. Sin esto, cualquier hora se interpreta como si fuera UTC — un club en
// UTC-4 vería sus partidos agendados 4 horas antes de lo configurado.
// No requiere una librería de timezones: usa Intl.DateTimeFormat (ya disponible en
// Node/browsers modernos) con una doble pasada para resolver el offset del instante.
export function zonedTimeToUtc(date: string, time: string, timeZone: string): number {
  const guessUtcMs = new Date(`${date}T${time}:00.000Z`).getTime()
  const offsetMs = tzOffsetMs(guessUtcMs, timeZone)
  return guessUtcMs - offsetMs
}
