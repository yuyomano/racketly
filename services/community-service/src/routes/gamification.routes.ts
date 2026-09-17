import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { xpToLevel, xpForNextLevel } from '@racketly/utils'
import { requireAuth } from '../middleware/auth.middleware'
import { AppError } from '../middleware/error.middleware'
import { validate } from '../validators/community.validators'
import { z } from 'zod'

const router = Router()
const prisma = new PrismaClient({ adapter: createPgAdapter() })

const awardXpSchema = z.object({
  body: z.object({
    missionId: z.string().cuid(),
  }),
})

// conditionType → cómo calcular el progreso del usuario contra esa condición.
// Cubre solo los tipos "tier 1" (datos que ya genera una acción real existente).
// Los demás (matches, wins, streak, tourn_wins, both_sports) quedan sin evaluador
// todavía porque dependen del flujo de partidos casuales, no confirmado end-to-end.
const TIER1_CONDITIONS = [
  'signup',
  'bookings',
  'tournaments',
  'posts',
  'likes',
  'courses',
  'partners',
  'elo',
  'level',
  'clubs',
  'countries',
] as const

async function getConditionCount(userId: string, conditionType: string): Promise<number> {
  switch (conditionType) {
    case 'signup':
      return 1
    case 'bookings':
      return prisma.booking.count({ where: { userId, status: { not: 'cancelled' } } })
    case 'tournaments':
      return prisma.tournamentParticipant.count({ where: { playerId: userId } })
    case 'posts':
      return prisma.post.count({ where: { authorId: userId } })
    case 'likes': {
      const agg = await prisma.post.aggregate({
        where: { authorId: userId },
        _sum: { likesCount: true },
      })
      return agg._sum.likesCount ?? 0
    }
    case 'courses':
      return prisma.enrollment.count({ where: { userId, completedAt: { not: null } } })
    case 'partners':
      return prisma.matchApplication.count({
        where: { applicantId: userId, status: 'accepted' },
      })
    case 'elo': {
      const profile = await prisma.playerProfile.findUnique({
        where: { userId },
        select: { eloPadel: true, eloPickleball: true },
      })
      if (!profile) return 0
      return Math.max(profile.eloPadel, profile.eloPickleball)
    }
    case 'level': {
      const profile = await prisma.playerProfile.findUnique({
        where: { userId },
        select: { level: true },
      })
      return profile?.level ?? 0
    }
    case 'clubs':
    case 'countries': {
      const bookings = await prisma.booking.findMany({
        where: { userId, status: { not: 'cancelled' } },
        select: { slot: { select: { court: { select: { clubId: true, club: { select: { country: true } } } } } } },
      })
      if (conditionType === 'clubs') {
        return new Set(bookings.map((b) => b.slot.court.clubId)).size
      }
      return new Set(bookings.map((b) => b.slot.court.club.country)).size
    }
    default:
      return 0
  }
}

// Otorga las insignias "tier 1" que el usuario ya cumple pero no tiene registradas,
// suma su XP y recalcula nivel (mismo patrón que /award-xp). Se llama al pedir el
// catálogo de insignias — no hace falta enganchar esto en cada acción del monorepo:
// basta con que se re-evalúe la próxima vez que el usuario abra la pantalla.
// depth acota la recursión: subir de nivel por el XP recién otorgado puede desbloquear
// una insignia "level", que a su vez suma más XP — 5 pasadas es de sobra para esa cadena.
async function checkAndAwardBadges(userId: string, depth = 0): Promise<void> {
  if (depth >= 5) return

  const [candidateBadges, userBadges] = await Promise.all([
    prisma.badge.findMany({ where: { conditionType: { in: TIER1_CONDITIONS as unknown as string[] } } }),
    prisma.userBadge.findMany({ where: { userId } }),
  ])
  const earnedIds = new Set(userBadges.map((ub) => ub.badgeId))
  const unearned = candidateBadges.filter((b) => !earnedIds.has(b.id))
  if (unearned.length === 0) return

  const countByCondition = new Map<string, number>()
  for (const badge of unearned) {
    if (!countByCondition.has(badge.conditionType)) {
      countByCondition.set(badge.conditionType, await getConditionCount(userId, badge.conditionType))
    }
  }

  const toAward = unearned.filter((b) => (countByCondition.get(b.conditionType) ?? 0) >= b.conditionValue)
  if (toAward.length === 0) return

  const totalXp = toAward.reduce((sum, b) => sum + b.xpReward, 0)
  await prisma.$transaction(async (tx) => {
    await tx.userBadge.createMany({
      data: toAward.map((b) => ({ userId, badgeId: b.id })),
      skipDuplicates: true,
    })
    const profile = await tx.playerProfile.update({
      where: { userId },
      data: { xpPoints: { increment: totalXp } },
    })
    const newLevel = xpToLevel(profile.xpPoints)
    if (newLevel > profile.level) {
      await tx.playerProfile.update({ where: { userId }, data: { level: newLevel } })
    }
  })

  await checkAndAwardBadges(userId, depth + 1)
}

// GET /api/gamification/:userId/badges — catálogo completo, con las ganadas marcadas
// (para poder mostrar también las bloqueadas en la pantalla de insignias)
router.get('/:userId/badges', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await checkAndAwardBadges(req.params.userId)

    const [allBadges, userBadges] = await Promise.all([
      prisma.badge.findMany({ orderBy: { xpReward: 'asc' } }),
      prisma.userBadge.findMany({ where: { userId: req.params.userId } }),
    ])
    const earnedByBadgeId = new Map(userBadges.map((ub) => [ub.badgeId, ub.earnedAt]))
    const data = allBadges.map((badge) => ({
      ...badge,
      earned: earnedByBadgeId.has(badge.id),
      earnedAt: earnedByBadgeId.get(badge.id) ?? null,
    }))
    return res.json({ success: true, data })
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
