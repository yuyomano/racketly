import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import { PrismaClient } from '@prisma/client'
import { requireAuth } from '../middleware/auth.middleware'

const router = Router()
const prisma = new PrismaClient()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, sport } = req.query
    const where: Record<string, unknown> = {}
    if (category) where.category = category
    if (sport) where.sport = sport
    const groups = await prisma.group.findMany({
      where,
      orderBy: { memberCount: 'desc' },
      take: 50,
    })
    return res.json({ success: true, data: groups })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/join', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!
    await prisma.groupMember.create({ data: { groupId: req.params.id, userId } })
    await prisma.group.update({
      where: { id: req.params.id },
      data: { memberCount: { increment: 1 } },
    })
    return res.json({ success: true, message: 'Unido al grupo' })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/leave', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!
    await prisma.groupMember.deleteMany({ where: { groupId: req.params.id, userId } })
    await prisma.group.update({
      where: { id: req.params.id },
      data: { memberCount: { decrement: 1 } },
    })
    return res.json({ success: true, message: 'Saliste del grupo' })
  } catch (err) {
    return next(err)
  }
})

export { router as groupsRouter }
