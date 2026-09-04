import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { AppError } from '../middleware/error.middleware'

const router = Router()
const prisma = new PrismaClient()

// ─── POST /api/credits ───────────────────────────────────────────────────────
// Emite un crédito a un jugador (por cancelación, cambio de jugador, cortesía admin)
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, clubId, amount, currency, reason, bookingId } = req.body
    if (!userId || !clubId || !amount || !reason?.trim()) {
      throw new AppError('userId, clubId, amount y reason son requeridos', 400)
    }
    if (amount <= 0) throw new AppError('El monto debe ser mayor a 0', 400)

    const [user, club] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.club.findUnique({ where: { id: clubId } }),
    ])
    if (!user) throw new AppError('Usuario no encontrado', 404)
    if (!club) throw new AppError('Club no encontrado', 404)

    const credit = await prisma.userCredit.create({
      data: {
        userId,
        clubId,
        amount,
        currency: currency ?? club.currency ?? 'COP',
        reason: reason.trim(),
        bookingId: bookingId ?? null,
        status: 'available',
      },
    })

    return res.status(201).json({
      success: true,
      data: credit,
      message: `Crédito de ${credit.currency} ${credit.amount.toLocaleString()} emitido a ${user.firstName ?? user.email}.`,
    })
  } catch (err) {
    return next(err)
  }
})

// ─── GET /api/credits/user/:userId ──────────────────────────────────────────
// Créditos disponibles de un usuario en un club específico
router.get('/user/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params
    const { clubId } = req.query as Record<string, string>

    const where: Record<string, unknown> = { userId, status: 'available' }
    if (clubId) where.clubId = clubId

    // Auto-expire: no model field for expiry, credits are permanent for now
    const credits = await prisma.userCredit.findMany({
      where,
      include: {
        club: { select: { id: true, name: true, currency: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const totalByClub: Record<string, { total: number; currency: string; clubName: string }> = {}
    for (const c of credits) {
      if (!totalByClub[c.clubId]) {
        totalByClub[c.clubId] = { total: 0, currency: c.currency, clubName: c.club.name }
      }
      totalByClub[c.clubId].total += c.amount
    }

    return res.json({ success: true, data: credits, summary: totalByClub })
  } catch (err) {
    return next(err)
  }
})

// ─── GET /api/credits/club/:clubId ──────────────────────────────────────────
// Todos los créditos emitidos por un club (para tracking del admin)
router.get('/club/:clubId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const credits = await prisma.userCredit.findMany({
      where: { clubId: req.params.clubId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const totalAvailable = credits
      .filter((c) => c.status === 'available')
      .reduce((s, c) => s + c.amount, 0)
    const totalUsed = credits.filter((c) => c.status === 'used').reduce((s, c) => s + c.amount, 0)
    return res.json({ success: true, data: credits, summary: { totalAvailable, totalUsed } })
  } catch (err) {
    return next(err)
  }
})

// ─── PATCH /api/credits/:id/use ─────────────────────────────────────────────
// Marca un crédito como utilizado
router.patch('/:id/use', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const credit = await prisma.userCredit.findUnique({ where: { id: req.params.id } })
    if (!credit) throw new AppError('Crédito no encontrado', 404)
    if (credit.status !== 'available') throw new AppError('El crédito ya fue utilizado', 400)

    const updated = await prisma.userCredit.update({
      where: { id: req.params.id },
      data: { status: 'used', usedAt: new Date() },
    })
    return res.json({ success: true, data: updated })
  } catch (err) {
    return next(err)
  }
})

export { router as creditsRouter }
