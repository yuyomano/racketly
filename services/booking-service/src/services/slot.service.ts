import { PrismaClient } from '@prisma/client'
import { restoreCoveredCredits } from './cancellation.service'

const prisma = new PrismaClient()

/**
 * Libera slots con reservas en estado PENDING por más de 15 minutos
 * (pago no completado a tiempo — bloqueo optimista).
 * Antes de cancelar, restaura cualquier crédito que un jugador haya usado para
 * cubrir su parte (coveredBy: 'credit') — si no, ese crédito quedaría marcado
 * 'used' para siempre aunque la reserva nunca se haya completado/pagado.
 */
export async function releaseExpiredSlots(): Promise<void> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000)

  const expired = await prisma.booking.findMany({
    where: {
      status: 'pending',
      createdAt: { lt: cutoff },
    },
    select: { id: true, players: true },
  })

  if (expired.length === 0) return

  for (const booking of expired) {
    await restoreCoveredCredits(booking.players)
  }

  await prisma.booking.updateMany({
    where: { id: { in: expired.map((b) => b.id) } },
    data: { status: 'cancelled' },
  })

  console.info(`Released ${expired.length} expired slot holds (créditos usados restaurados)`)
}

/**
 * Verifica si un slot está disponible (no tiene reserva activa)
 */
export async function isSlotAvailable(slotId: string): Promise<boolean> {
  const booking = await prisma.booking.findFirst({
    where: {
      slotId,
      status: { in: ['pending', 'confirmed'] },
    },
  })
  return !booking
}

function parseMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function fmtTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

// ─── Horario pico ──────────────────────────────────────────────────────────────

export type PeakWindow = { startTime: string; endTime: string }
export type PeakSchedule = Map<number, PeakWindow[]> // dayOfWeek (0=Dom…6=Sáb) → bloques

// Comportamiento histórico (antes de que esto fuera configurable): pico en la
// mañana (antes de 10h) y en la tarde-noche (desde 18h), todos los días.
// Se usa como fallback para clubs que aún no configuraron su propio horario.
const DEFAULT_PEAK_WINDOWS: PeakWindow[] = [
  { startTime: '00:00', endTime: '10:00' },
  { startTime: '18:00', endTime: '24:00' },
]

function buildDefaultPeakSchedule(): PeakSchedule {
  const schedule: PeakSchedule = new Map()
  for (let d = 0; d <= 6; d++) schedule.set(d, DEFAULT_PEAK_WINDOWS)
  return schedule
}

/**
 * Carga el horario pico configurado por un club (PeakHourRule), agrupado por
 * día de la semana. Si el club no tiene reglas propias, devuelve el horario
 * por defecto (mañana + tarde-noche, todos los días) para no romper comportamiento.
 */
export async function getPeakSchedule(clubId: string): Promise<PeakSchedule> {
  const rules = await prisma.peakHourRule.findMany({ where: { clubId } })
  if (rules.length === 0) return buildDefaultPeakSchedule()

  const schedule: PeakSchedule = new Map()
  for (const r of rules) {
    const windows = schedule.get(r.dayOfWeek) ?? []
    windows.push({ startTime: r.startTime, endTime: r.endTime })
    schedule.set(r.dayOfWeek, windows)
  }
  return schedule
}

function isPeakMinute(dayOfWeek: number, minutes: number, schedule: PeakSchedule): boolean {
  const windows = schedule.get(dayOfWeek) ?? []
  return windows.some(
    (w) => minutes >= parseMinutes(w.startTime) && minutes < parseMinutes(w.endTime)
  )
}

/**
 * Genera slots para una cancha para los próximos N días.
 * Soporta horarios distintos para días de semana y fines de semana, y un
 * horario pico configurable por club que puede variar día a día.
 */
export async function generateSlotsForCourt(
  courtId: string,
  openTimeWeekday: string,
  closeTimeWeekday: string,
  openTimeWeekend: string,
  closeTimeWeekend: string,
  durationMinutes: number,
  basePrice: number,
  peakPrice: number,
  currency: string,
  daysAhead = 14,
  peakSchedule: PeakSchedule = buildDefaultPeakSchedule()
): Promise<number> {
  const slots: {
    courtId: string
    date: string
    startTime: string
    endTime: string
    basePrice: number
    peakPrice: number
    currency: string
    isPeak: boolean
  }[] = []
  const now = new Date()

  for (let day = 0; day < daysAhead; day++) {
    const date = new Date(now)
    date.setDate(date.getDate() + day)
    const dateStr = date.toISOString().split('T')[0]
    const dow = date.getDay() // 0=Dom, 6=Sáb
    const isWeekend = dow === 0 || dow === 6

    const openMinutes = parseMinutes(isWeekend ? openTimeWeekend : openTimeWeekday)
    const closeMinutes = parseMinutes(isWeekend ? closeTimeWeekend : closeTimeWeekday)

    for (let m = openMinutes; m + durationMinutes <= closeMinutes; m += durationMinutes) {
      const isPeak = isPeakMinute(dow, m, peakSchedule)
      slots.push({
        courtId,
        date: dateStr,
        startTime: fmtTime(m),
        endTime: fmtTime(m + durationMinutes),
        basePrice,
        peakPrice,
        currency,
        isPeak,
      })
    }
  }

  const created = await prisma.timeSlot.createMany({ data: slots, skipDuplicates: true })
  return created.count
}

/**
 * Genera slots para una cancha usando su propia configuración almacenada en DB
 */
export async function generateSlotsFromCourtConfig(
  courtId: string,
  peakSchedule?: PeakSchedule
): Promise<number> {
  const court = await prisma.court.findUnique({
    where: { id: courtId },
    include: { club: { select: { id: true, bookingHorizonDays: true } } },
  })
  if (!court) throw new Error(`Court ${courtId} not found`)

  const schedule = peakSchedule ?? (await getPeakSchedule(court.club.id))

  return generateSlotsForCourt(
    courtId,
    court.openTimeWeekday,
    court.closeTimeWeekday,
    court.openTimeWeekend,
    court.closeTimeWeekend,
    court.slotDuration,
    court.basePrice,
    court.peakPrice,
    court.currency,
    court.club.bookingHorizonDays,
    schedule
  )
}

/**
 * Genera slots para todas las canchas activas de un club
 */
export async function generateSlotsForClub(
  clubId: string
): Promise<{ slotsCreated: number; courtsProcessed: number }> {
  const courts = await prisma.court.findMany({ where: { clubId, isActive: true } })
  const schedule = await getPeakSchedule(clubId)
  let slotsCreated = 0
  for (const court of courts) {
    slotsCreated += await generateSlotsFromCourtConfig(court.id, schedule)
  }
  return { slotsCreated, courtsProcessed: courts.length }
}

/**
 * Cron diario: genera slots para todos los clubs y sus canchas activas
 */
export async function generateSlotsAllClubs(): Promise<void> {
  const clubs = await prisma.club.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  })
  let total = 0
  for (const club of clubs) {
    const { slotsCreated } = await generateSlotsForClub(club.id)
    total += slotsCreated
  }
  if (total > 0) console.info(`[slot-cron] Generated ${total} slots across ${clubs.length} clubs`)
}

/**
 * Cron por hora: cada club define su propia `slotGenerationHour` (0-23, hora
 * del servidor) — a esa hora se revisa si faltan slots dentro de su
 * `bookingHorizonDays` y se generan los que falten. `generateSlotsForClub` ya
 * es idempotente (createMany con skipDuplicates sobre el @@unique de
 * TimeSlot), así que "revisar y generar lo que falte" es simplemente
 * reinvocarlo — no hace falta calcular explícitamente qué días tienen huecos.
 * Los errores de un club no deben impedir que se procesen los demás.
 */
export async function runScheduledSlotGeneration(): Promise<void> {
  const currentHour = new Date().getHours()
  const clubs = await prisma.club.findMany({
    where: { isActive: true, slotGenerationHour: currentHour },
    select: { id: true, name: true },
  })
  if (clubs.length === 0) return

  let total = 0
  for (const club of clubs) {
    try {
      const { slotsCreated } = await generateSlotsForClub(club.id)
      total += slotsCreated
    } catch (err) {
      console.error(`[slot-cron] Error generando slots para club ${club.name} (${club.id}):`, err)
    }
  }
  if (total > 0)
    console.info(
      `[slot-cron] Generated ${total} slots across ${clubs.length} clubs at hour ${currentHour}`
    )
}

/**
 * Recalcula isPeak para los TimeSlots futuros SIN reserva activa de un club,
 * usando su horario pico actual. Se llama después de guardar cambios en
 * PeakHourRule para que el ajuste se refleje de inmediato (sin esperar al
 * cron nocturno) y sin tocar precios de reservas ya confirmadas/pendientes.
 */
export async function resyncFutureSlotsForClub(clubId: string): Promise<number> {
  const todayStr = new Date().toISOString().split('T')[0]
  const schedule = await getPeakSchedule(clubId)

  const slots = await prisma.timeSlot.findMany({
    where: { court: { clubId }, date: { gte: todayStr } },
    select: { id: true, date: true, startTime: true, isPeak: true },
  })
  if (slots.length === 0) return 0

  const bookedSlotIds = new Set(
    (
      await prisma.booking.findMany({
        where: { slotId: { in: slots.map((s) => s.id) }, status: { in: ['pending', 'confirmed'] } },
        select: { slotId: true },
      })
    ).map((b) => b.slotId)
  )

  const toMarkPeak: string[] = []
  const toMarkOffPeak: string[] = []
  for (const s of slots) {
    if (bookedSlotIds.has(s.id)) continue
    const dow = new Date(s.date + 'T00:00:00').getDay()
    const shouldBePeak = isPeakMinute(dow, parseMinutes(s.startTime), schedule)
    if (shouldBePeak && !s.isPeak) toMarkPeak.push(s.id)
    else if (!shouldBePeak && s.isPeak) toMarkOffPeak.push(s.id)
  }

  let updated = 0
  if (toMarkPeak.length > 0) {
    const r = await prisma.timeSlot.updateMany({
      where: { id: { in: toMarkPeak } },
      data: { isPeak: true },
    })
    updated += r.count
  }
  if (toMarkOffPeak.length > 0) {
    const r = await prisma.timeSlot.updateMany({
      where: { id: { in: toMarkOffPeak } },
      data: { isPeak: false },
    })
    updated += r.count
  }
  return updated
}
