import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import { PrismaClient } from '@prisma/client'
import { generateSlotsFromCourtConfig } from '../services/slot.service'
import { toMinutes, hasConflictingMaintenance } from '../services/schedule-conflict.service'
import { AppError } from '../middleware/error.middleware'
import { assertClubAdmin } from '../middleware/club-auth.middleware'

const router = Router()
const prisma = new PrismaClient()

// GET /api/courts/:id/slots?date=
router.get('/:id/slots', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.query
    const where: Record<string, unknown> = { courtId: req.params.id }
    if (date) where.date = date

    const slots = await prisma.timeSlot.findMany({
      where,
      include: {
        bookings: { where: { status: { in: ['pending', 'confirmed'] } }, select: { id: true } },
      },
      orderBy: { startTime: 'asc' },
    })

    const data = await Promise.all(
      slots.map(async (s) => {
        const underMaintenance = await hasConflictingMaintenance(
          s.courtId,
          s.date,
          toMinutes(s.startTime),
          toMinutes(s.endTime)
        )
        return {
          ...s,
          isAvailable: s.bookings.length === 0 && !underMaintenance,
          underMaintenance,
          bookings: undefined,
        }
      })
    )

    return res.json({ success: true, data })
  } catch (err) {
    return next(err)
  }
})

// PUT /api/courts/:id — actualizar configuración de la cancha
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.court.findUnique({
      where: { id: req.params.id },
      select: { clubId: true },
    })
    if (!existing) throw new AppError('Pista no encontrada', 404)
    await assertClubAdmin(req.headers['x-user-id'] as string | undefined, existing.clubId)

    const {
      name,
      isActive,
      hasLighting,
      isIndoor,
      surface,
      capacity,
      basePrice,
      peakPrice,
      currency,
      openTimeWeekday,
      closeTimeWeekday,
      openTimeWeekend,
      closeTimeWeekend,
      slotDuration,
    } = req.body

    if (slotDuration !== undefined && ![60, 90].includes(Number(slotDuration))) {
      throw new AppError('slotDuration debe ser 60 o 90 minutos', 400)
    }

    const court = await prisma.court.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(isActive !== undefined && { isActive }),
        ...(hasLighting !== undefined && { hasLighting }),
        ...(isIndoor !== undefined && { isIndoor }),
        ...(surface !== undefined && { surface }),
        ...(capacity !== undefined && { capacity: Number(capacity) }),
        ...(basePrice !== undefined && { basePrice: Number(basePrice) }),
        ...(peakPrice !== undefined && { peakPrice: Number(peakPrice) }),
        ...(currency !== undefined && { currency }),
        ...(openTimeWeekday !== undefined && { openTimeWeekday }),
        ...(closeTimeWeekday !== undefined && { closeTimeWeekday }),
        ...(openTimeWeekend !== undefined && { openTimeWeekend }),
        ...(closeTimeWeekend !== undefined && { closeTimeWeekend }),
        ...(slotDuration !== undefined && { slotDuration: Number(slotDuration) }),
      },
    })

    // Si se pide regenerar (solo slots futuros sin reserva)
    if (req.body.generateSlots) {
      const count = await generateSlotsFromCourtConfig(court.id)
      return res.json({ success: true, data: court, slotsGenerated: count })
    }

    return res.json({ success: true, data: court })
  } catch (err) {
    return next(err)
  }
})

// POST /api/courts/:id/generate-slots — genera slots usando la config guardada en DB
router.post('/:id/generate-slots', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const court = await prisma.court.findUnique({
      where: { id: req.params.id },
      select: { clubId: true },
    })
    if (!court) throw new AppError('Pista no encontrada', 404)
    await assertClubAdmin(req.headers['x-user-id'] as string | undefined, court.clubId)

    const count = await generateSlotsFromCourtConfig(req.params.id)
    return res.json({ success: true, data: { slotsCreated: count } })
  } catch (err) {
    return next(err)
  }
})

// ─── Bloqueos por mantenimiento ──────────────────────────────────────────────
// Bloquean un rango de fecha/hora arbitrario (chequeado por solapamiento en
// bookings/slots vía hasConflictingMaintenance), en vez de marcar TimeSlots ya
// generados uno por uno — así cubre también fechas futuras aún sin generar.

// GET /api/courts/:id/maintenance — bloqueos vigentes o futuros de la pista
router.get('/:id/maintenance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const blocks = await prisma.maintenanceBlock.findMany({
      where: { courtId: req.params.id, endAt: { gte: new Date() } },
      orderBy: { startAt: 'asc' },
    })
    return res.json({ success: true, data: blocks })
  } catch (err) {
    return next(err)
  }
})

// POST /api/courts/:id/maintenance — crear bloqueo por mantenimiento
router.post('/:id/maintenance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startAt, endAt, description, createdBy } = req.body

    if (!startAt || !endAt) throw new AppError('Se requiere fecha/hora de inicio y fin', 400)
    if (!description?.trim())
      throw new AppError('Se requiere una descripción del mantenimiento', 400)

    const start = new Date(startAt)
    const end = new Date(endAt)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new AppError('Fecha/hora inválida', 400)
    }
    if (end <= start) throw new AppError('La fecha/hora de fin debe ser posterior al inicio', 400)

    const court = await prisma.court.findUnique({ where: { id: req.params.id } })
    if (!court) throw new AppError('Pista no encontrada', 404)
    await assertClubAdmin(req.headers['x-user-id'] as string | undefined, court.clubId)

    const block = await prisma.maintenanceBlock.create({
      data: {
        courtId: req.params.id,
        startAt: start,
        endAt: end,
        description: description.trim(),
        createdBy: createdBy || null,
      },
    })

    return res.status(201).json({ success: true, data: block })
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/courts/:id/maintenance/:blockId — levantar un bloqueo antes de tiempo
router.delete(
  '/:id/maintenance/:blockId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const block = await prisma.maintenanceBlock.findUnique({
        where: { id: req.params.blockId },
        include: { court: { select: { clubId: true } } },
      })
      if (!block || block.courtId !== req.params.id)
        throw new AppError('Bloqueo no encontrado', 404)
      await assertClubAdmin(req.headers['x-user-id'] as string | undefined, block.court.clubId)

      await prisma.maintenanceBlock.delete({ where: { id: req.params.blockId } })
      return res.json({ success: true, message: 'Bloqueo de mantenimiento eliminado.' })
    } catch (err) {
      return next(err)
    }
  }
)

export { router as courtsRouter }
