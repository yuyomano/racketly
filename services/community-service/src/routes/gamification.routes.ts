import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import { PrismaClient } from '@prisma/client'
import { xpToLevel, xpForNextLevel } from '@racketly/utils'
import { requireAuth } from '../middleware/auth.middleware'
import { AppError } from '../middleware/error.middleware'
import { validate } from '../validators/community.validators'
import { z } from 'zod'

const router = Router()
const prisma = new PrismaClient()

const awardXpSchema = z.object({
  body: z.object({
    missionId: z.string().cuid(),
  }),
})

// GET /api/gamification/:userId/badges
router.get('/:userId/badges', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const badges = await prisma.userBadge.findMany({
      where: { userId: req.params.userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
    })
    return res.json({ success: true, data: badges })
  } catch (err) {
    return next(err)
  }
})

// GET /api/gamification/:userId/progress
router.get('/:userId/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.playerProfile.findUnique({
      where: { userId: req.params.userId },
      select: { xpPoints: true, level: true },
    })
    if (!profile) return res.status(404).json({ success: false, error: 'Perfil no encontrado' })

    const level = xpToLevel(profile.xpPoints)
    const levelProgress = xpForNextLevel(profile.xpPoints)

    return res.json({
      success: true,
      data: { xpPoints: profile.xpPoints, level, ...levelProgress },
    })
  } catch (err) {
    return next(err)
  }
})

// POST /api/gamification/:userId/award-xp
// El caller ya no manda un `amount`/`reason` libres — eso permitía auto-otorgarse XP
// repetidamente. El monto ahora sale de Mission.xpReward (una acción real y verificable
// del catálogo, ver prisma/seed.ts) y queda registrado en UserMission para no poder
// completarla dos veces. Solo el propio dueño del perfil puede completar sus misiones.
// ponytail: las misiones recurrentes (isRecurring) solo se pueden completar una vez —
// UserMission guarda un único completedAt, no un historial por ciclo. Falta un mecanismo
// de reset/intervalo para permitir volver a completarlas; nada lo necesita todavía.
router.post(
  '/:userId/award-xp',
  requireAuth,
  validate(awardXpSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.userId !== req.params.userId) {
        throw new AppError('No podés otorgar XP a otro usuario', 403)
      }
      const { missionId } = req.body

      const result = await prisma.$transaction(async (tx) => {
        const mission = await tx.mission.findUnique({ where: { id: missionId } })
        if (!mission) throw new AppError('Misión no encontrada', 404)

        const now = new Date()
        if (mission.startDate && mission.startDate > now)
          throw new AppError('La misión todavía no empezó', 400)
        if (mission.endDate && mission.endDate < now)
          throw new AppError('La misión ya terminó', 400)

        const existing = await tx.userMission.findUnique({
          where: { userId_missionId: { userId: req.params.userId, missionId } },
        })
        if (existing?.completedAt) throw new AppError('Misión ya completada', 409)

        await tx.userMission.upsert({
          where: { userId_missionId: { userId: req.params.userId, missionId } },
          create: { userId: req.params.userId, missionId, progress: 1, completedAt: now },
          update: { completedAt: now },
        })

        let profile = await tx.playerProfile.update({
          where: { userId: req.params.userId },
          data: { xpPoints: { increment: mission.xpReward } },
        })
        const newLevel = xpToLevel(profile.xpPoints)
        const leveledUp = newLevel > profile.level
        if (leveledUp) {
          profile = await tx.playerProfile.update({
            where: { userId: req.params.userId },
            data: { level: newLevel },
          })
        }

        if (mission.badgeId) {
          await tx.userBadge.upsert({
            where: { userId_badgeId: { userId: req.params.userId, badgeId: mission.badgeId } },
            create: { userId: req.params.userId, badgeId: mission.badgeId },
            update: {},
          })
        }

        return { newXp: profile.xpPoints, newLevel, leveledUp, mission: mission.title }
      })

      return res.json({ success: true, data: result })
    } catch (err) {
      return next(err)
    }
  }
)

// GET /api/gamification/missions
router.get('/missions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const missions = await prisma.mission.findMany({
      where: {
        OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
      },
      orderBy: { xpReward: 'desc' },
    })
    return res.json({ success: true, data: missions })
  } catch (err) {
    return next(err)
  }
})

export { router as gamificationRouter }
