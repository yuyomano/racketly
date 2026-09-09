import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { authenticate } from '../middleware/auth.middleware'
import { AppError } from '../middleware/error.middleware'
import { validate, updateProfileSchema } from '../validators/auth.validators'
import { eloToCategory } from '@racketly/utils'

const router = Router()
const prisma = new PrismaClient({ adapter: createPgAdapter() })

// GET /api/profile/:userId — perfil público
router.get('/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.playerProfile.findUnique({
      where: { userId: req.params.userId },
      include: {
        user: { select: { subscriptionTier: true, createdAt: true } },
      },
    })
    if (!profile) throw new AppError('Perfil no encontrado', 404)
    return res.json({ success: true, data: profile })
  } catch (err) {
    return next(err)
  }
})

// PUT /api/profile — actualizar mi perfil
router.put(
  '/',
  authenticate,
  validate(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Whitelist explícita: nunca permitir que el cliente modifique ELO, category, level o xpPoints
      const { displayName, bio, city, country, sport, avatarUrl } = req.body
      const data: Record<string, unknown> = {}
      if (displayName !== undefined) data.displayName = displayName
      if (bio !== undefined) data.bio = bio
      if (city !== undefined) data.city = city
      if (country !== undefined) data.country = country
      if (sport !== undefined) data.sport = sport
      if (avatarUrl !== undefined) data.avatarUrl = avatarUrl

      const updated = await prisma.playerProfile.update({
        where: { userId: req.user!.userId },
        data,
      })
      return res.json({ success: true, data: updated })
    } catch (err) {
      return next(err)
    }
  }
)

// GET /api/profile/:userId/stats
router.get('/:userId/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.playerProfile.findUnique({
      where: { userId: req.params.userId },
    })
    if (!profile) throw new AppError('Perfil no encontrado', 404)

    const category = eloToCategory(profile.eloPadel)

    // Estadísticas de partidos
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ player1Id: req.params.userId }, { player2Id: req.params.userId }],
        status: 'completed',
      },
    })

    const wins = matches.filter((m) => m.winnerId === req.params.userId).length
    const losses = matches.length - wins

    return res.json({
      success: true,
      data: {
        profile,
        category,
        stats: {
          totalMatches: matches.length,
          wins,
          losses,
          winRate: matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0,
        },
      },
    })
  } catch (err) {
    return next(err)
  }
})

export { router as profileRouter }
