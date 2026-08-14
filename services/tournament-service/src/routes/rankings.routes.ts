import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

// GET /api/rankings?sport=padel&category=B1&country=CO&city=Bogota
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sport = 'padel', category, country, city, page = '1', limit = '50' } = req.query
    const where: Record<string, unknown> = {}
    if (category) where.category = category
    if (country) where.country = country
    if (city) where.city = { contains: city as string, mode: 'insensitive' }

    const orderBy = sport === 'pickleball' ? { eloPickleball: 'desc' as const } : { eloPadel: 'desc' as const }

    const [players, total] = await Promise.all([
      prisma.playerProfile.findMany({
        where,
        orderBy,
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
        select: {
          userId: true, displayName: true, avatarUrl: true,
          eloPadel: true, eloPickleball: true, category: true,
          country: true, city: true,
        },
      }),
      prisma.playerProfile.count({ where }),
    ])

    return res.json({ success: true, data: players, pagination: { page: Number(page), pageSize: Number(limit), total } })
  } catch (err) { return next(err) }
})

// GET /api/rankings/elo-history/:userId
router.get('/elo-history/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const history = await prisma.eloHistory.findMany({
      where: { playerId: req.params.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return res.json({ success: true, data: history })
  } catch (err) { return next(err) }
})

export { router as rankingsRouter }
