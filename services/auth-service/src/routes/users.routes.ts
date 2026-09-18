import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'

const router = Router()
const prisma = new PrismaClient({ adapter: createPgAdapter() })

type ProfileRow = {
  userId: string
  displayName: string
  avatarUrl: string | null
  city: string
  category: string | null
  user: { email: string }
}

function toPlayerItem(p: ProfileRow) {
  return {
    id: p.userId,
    name: p.displayName,
    email: p.user.email,
    avatarUrl: p.avatarUrl,
    city: p.city,
    category: p.category,
  }
}

// Junta ids de dueño + jugadores (excluye invitados sin userId) de un set de reservas.
function collectParticipantIds(
  bookings: { userId?: string; players: unknown }[],
  excludeId?: string
): string[] {
  const ids = new Set<string>()
  for (const b of bookings) {
    if (b.userId) ids.add(b.userId)
    const players = Array.isArray(b.players) ? (b.players as Array<{ userId?: string }>) : []
    for (const p of players) {
      if (p.userId) ids.add(p.userId)
    }
  }
  if (excludeId) ids.delete(excludeId)
  return [...ids]
}

// GET /api/users/search?q=texto&limit=10&excludeId=me&clubId=X&filter=club|withMe|city|all
// Busca usuarios por nombre o email para agregar a una reserva. `filter` restringe el universo
// de candidatos antes de aplicar `q`: club = jugó en ese club, withMe = jugó conmigo antes,
// city = vive en la misma ciudad del club, all = búsqueda global (comportamiento previo).
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      q = '',
      limit = '10',
      excludeId,
      clubId,
      filter = 'all',
    } = req.query as Record<string, string>
    const take = Math.min(Number(limit) || 10, 20)
    const textFilter = q.trim()
      ? {
          OR: [
            { displayName: { contains: q, mode: 'insensitive' as const } },
            { user: { email: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}

    if (filter === 'club' && clubId) {
      const bookings = await prisma.booking.findMany({
        where: { status: { not: 'cancelled' }, slot: { court: { clubId } } },
        select: { userId: true, players: true },
        orderBy: { createdAt: 'desc' },
        take: 300,
      })
      const ids = collectParticipantIds(bookings, excludeId)
      if (ids.length === 0) return res.json({ success: true, data: [] })
      const profiles = await prisma.playerProfile.findMany({
        where: { userId: { in: ids }, ...textFilter },
        include: { user: { select: { email: true } } },
        take,
        orderBy: { displayName: 'asc' },
      })
      return res.json({ success: true, data: profiles.map(toPlayerItem) })
    }

    if (filter === 'withMe' && excludeId) {
      const [mine, withMe] = await Promise.all([
        prisma.booking.findMany({
          where: { userId: excludeId, status: { not: 'cancelled' } },
          select: { userId: true, players: true },
          take: 300,
        }),
        prisma.$queryRaw<{ userId: string; players: unknown }[]>`
          SELECT "userId", players FROM bookings
          WHERE players @> ${JSON.stringify([{ userId: excludeId }])}::jsonb
          AND status != 'cancelled'
          LIMIT 300
        `,
      ])
      const ids = collectParticipantIds([...mine, ...withMe], excludeId)
      if (ids.length === 0) return res.json({ success: true, data: [] })
      const profiles = await prisma.playerProfile.findMany({
        where: { userId: { in: ids }, ...textFilter },
        include: { user: { select: { email: true } } },
        take,
        orderBy: { displayName: 'asc' },
      })
      return res.json({ success: true, data: profiles.map(toPlayerItem) })
    }

    if (filter === 'city' && clubId) {
      const club = await prisma.club.findUnique({ where: { id: clubId }, select: { city: true } })
      if (!club) return res.json({ success: true, data: [] })
      const profiles = await prisma.playerProfile.findMany({
        where: {
          city: club.city,
          ...(excludeId ? { userId: { not: excludeId } } : {}),
          ...textFilter,
        },
        include: { user: { select: { email: true } } },
        take,
        orderBy: { displayName: 'asc' },
      })
      return res.json({ success: true, data: profiles.map(toPlayerItem) })
    }

    // filter === 'all': comportamiento previo, requiere texto para no listar a todo el mundo.
    if (!q || q.trim().length < 2) {
      return res.json({ success: true, data: [] })
    }
    const profiles = await prisma.playerProfile.findMany({
      where: {
        ...textFilter,
        ...(excludeId ? { userId: { not: excludeId } } : {}),
      },
      include: { user: { select: { email: true } } },
      take,
      orderBy: { displayName: 'asc' },
    })
    return res.json({ success: true, data: profiles.map(toPlayerItem) })
  } catch (err) {
    return next(err)
  }
})

export { router as usersRouter }
