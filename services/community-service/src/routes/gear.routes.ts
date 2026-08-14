import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

// GET /api/gear — reseñas de palas/paletas
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sport, brand, page = '1', limit = '20' } = req.query
    const where: Record<string, unknown> = {}
    if (sport) where.sport = sport
    if (brand) where.brand = { contains: brand as string, mode: 'insensitive' }

    const reviews = await prisma.gearReview.findMany({
      where,
      include: { reviewer: { select: { id: true, playerProfile: { select: { displayName: true, avatarUrl: true, category: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    })
    return res.json({ success: true, data: reviews })
  } catch (err) { return next(err) }
})

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const review = await prisma.gearReview.create({ data: req.body })
    return res.status(201).json({ success: true, data: review })
  } catch (err) { return next(err) }
})

export { router as gearRouter }
