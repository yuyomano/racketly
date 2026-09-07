import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { toMinutes, hasConflictingMaintenance } from '../services/schedule-conflict.service'
import { AppError } from '../middleware/error.middleware'
import { assertClubAdmin } from '../middleware/club-auth.middleware'

const router = Router()
const prisma = new PrismaClient()

// GET /api/slots/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slot = await prisma.timeSlot.findUnique({
      where: { id: req.params.id },
      include: { court: { include: { club: true } } },
    })
    if (!slot) throw new AppError('Slot no encontrado', 404)

    const active = await prisma.booking.findFirst({
      where: { slotId: slot.id, status: { in: ['pending', 'confirmed'] } },
    })

    // Auto-expire blocks
    const isExpired = slot.blockedExpiresAt && new Date() > slot.blockedExpiresAt
    const isBlocked = slot.isBlocked && !isExpired
    const underMaintenance = await hasConflictingMaintenance(
      slot.courtId,
      slot.date,
      toMinutes(slot.startTime),
      toMinutes(slot.endTime)
    )

    return res.json({
      success: true,
      data: {
        ...slot,
        isBlocked,
        underMaintenance,
        isAvailable: !active && !isBlocked && !underMaintenance,
      },
    })
  } catch (err) {
    return next(err)
  }
})

// ─── PATCH /api/slots/:id/block ──────────────────────────────────────────────
// Bloquea un slot manualmente. Expira automáticamente 1 día después.
router.patch('/:id/block', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason, blockedForUserId } = req.body
    if (!reason?.trim()) throw new AppError('Se requiere una razón para bloquear el slot', 400)

    const slot = await prisma.timeSlot.findUnique({
      where: { id: req.params.id },
      include: { court: { select: { clubId: true } } },
    })
    if (!slot) throw new AppError('Slot no encontrado', 404)
    await assertClubAdmin(req.headers['x-user-id'] as string | undefined, slot.court.clubId)

    const now = new Date()
    const expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + 1)

    const updated = await prisma.timeSlot.update({
      where: { id: req.params.id },
      data: {
        isBlocked: true,
        blockedReason: reason.trim(),
        blockedForUserId: blockedForUserId ?? null,
        blockedAt: now,
        blockedExpiresAt: expiresAt,
      },
    })

    return res.json({
      success: true,
      data: updated,
      message: 'Slot bloqueado hasta mañana a esta hora.',
    })
  } catch (err) {
    return next(err)
  }
})

// ─── DELETE /api/slots/:id/block ─────────────────────────────────────────────
// Desbloquea un slot manualmente antes de que expire.
router.delete('/:id/block', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slot = await prisma.timeSlot.findUnique({
      where: { id: req.params.id },
      include: { court: { select: { clubId: true } } },
    })
    if (!slot) throw new AppError('Slot no encontrado', 404)
    await assertClubAdmin(req.headers['x-user-id'] as string | undefined, slot.court.clubId)

    const updated = await prisma.timeSlot.update({
      where: { id: req.params.id },
      data: {
        isBlocked: false,
        blockedReason: null,
        blockedForUserId: null,
        blockedAt: null,
        blockedExpiresAt: null,
      },
    })

    return res.json({ success: true, data: updated, message: 'Slot desbloqueado.' })
  } catch (err) {
    return next(err)
  }
})

export { router as slotsRouter }
