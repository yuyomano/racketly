import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'

const router = Router()
const prisma = new PrismaClient({ adapter: createPgAdapter() })

// GET /api/users/search?q=texto&limit=10
// Busca usuarios por nombre o email para agregar a una reserva
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q = '', limit = '10', excludeId } = req.query as Record<string, string>
    if (!q || q.trim().length < 2) {
      return res.json({ success: true, data: [] })
    }

    const profiles = await prisma.playerProfile.findMany({
      where: {
        OR: [
          { displayName: { contains: q, mode: 'insensitive' } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
        ],
        ...(excludeId ? { userId: { not: excludeId } } : {}),
      },
      include: { user: { select: { email: true } } },
      take: Math.min(Number(limit), 20),
      orderBy: { displayName: 'asc' },
    })

    const data = profiles.map((p) => ({
      id: p.userId,
      name: p.displayName,
      email: p.user.email,
      avatarUrl: p.avatarUrl,
      city: p.city,
      category: p.category,
    }))

    return res.json({ success: true, data })
  } catch (err) {
    return next(err)
  }
})

export { router as usersRouter }
