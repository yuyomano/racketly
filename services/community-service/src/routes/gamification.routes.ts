import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { xpToLevel, xpForNextLevel } from '@racketly/utils'

const router = Router()
const prisma = new PrismaClient()

// GET /api/gamification/:userId/badges
router.get('/:userId/badges', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const badges = await prisma.userBadge.findMany({
      where: { userId: req.params.userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
    })
    return res.json({ success: true, data: badges })
  } catch (err) { return next(err) }
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

    return res.json({ success: true, data: { xpPoints: profile.xpPoints, level, ...levelProgress } })
  } catch (err) { return next(err) }
})

// POST /api/gamification/:userId/award-xp
router.post('/:userId/award-xp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, reason } = req.body
    const profile = await prisma.playerProfile.update({
      where: { userId: req.params.userId },
      data: { xpPoints: { increment: amount } },
    })
    const newLevel = xpToLevel(profile.xpPoints)
    const leveledUp = newLevel > profile.level

    if (leveledUp) {
      await prisma.playerProfile.update({
        where: { userId: req.params.userId },
        data: { level: newLevel },
      })
    }

    return res.json({ success: true, data: { newXp: profile.xpPoints, newLevel, leveledUp, reason } })
  } catch (err) { return next(err) }
})

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
  } catch (err) { return next(err) }
})

export { router as gamificationRouter }
