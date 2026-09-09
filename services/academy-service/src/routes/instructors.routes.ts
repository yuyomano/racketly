import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { requireAuth } from '../middleware/auth.middleware'
import { AppError } from '../middleware/error.middleware'

const router = Router()
const prisma = new PrismaClient({ adapter: createPgAdapter() })

// GET /api/instructors
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { city, country, sport, page = '1', limit = '20' } = req.query
    const where: Record<string, unknown> = { verified: true }
    if (city) where.city = { contains: city as string, mode: 'insensitive' }
    if (country) where.country = country
    if (sport) where.sport = { in: [sport, 'both'] }

    const instructors = await prisma.instructorProfile.findMany({
      where,
      orderBy: { ratingAvg: 'desc' },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    })
    return res.json({ success: true, data: instructors })
  } catch (err) {
    return next(err)
  }
})

// GET /api/instructors/:id/sessions
router.get('/:id/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await prisma.instructorSession.findMany({
      where: { instructorId: req.params.id, date: { gte: new Date().toISOString().split('T')[0] } },
      orderBy: { date: 'asc' },
    })
    return res.json({ success: true, data: sessions })
  } catch (err) {
    return next(err)
  }
})

// POST /api/instructors/sessions/:id/book
// ponytail: sin cobro todavía — pricePerPerson queda solo como referencia hasta que se
// integre un flujo de pago para clases de instructor (ver comentario en el modelo).
router.post(
  '/sessions/:id/book',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!

      const booking = await prisma.$transaction(async (tx) => {
        const session = await tx.instructorSession.findUnique({ where: { id: req.params.id } })
        if (!session) throw new AppError('Sesión no encontrada', 404)

        const existing = await tx.instructorSessionBooking.findUnique({
          where: { sessionId_userId: { sessionId: req.params.id, userId } },
        })
        if (existing && existing.status === 'active')
          throw new AppError('Ya estás inscrito en esta sesión', 409)

        // Cuenta reservas activas reales en vez de confiar en bookedCount para el chequeo
        // de cupo — bookedCount es un contador denormalizado de conveniencia para listados.
        const activeCount = await tx.instructorSessionBooking.count({
          where: { sessionId: req.params.id, status: 'active' },
        })
        if (activeCount >= session.maxStudents) throw new AppError('Sesión llena', 400)

        const created = existing
          ? await tx.instructorSessionBooking.update({
              where: { id: existing.id },
              data: { status: 'active' },
            })
          : await tx.instructorSessionBooking.create({
              data: { sessionId: req.params.id, userId, status: 'active' },
            })

        await tx.instructorSession.update({
          where: { id: req.params.id },
          data: { bookedCount: activeCount + 1 },
        })
        return created
      })

      return res.status(201).json({ success: true, data: booking })
    } catch (err) {
      return next(err)
    }
  }
)

export { router as instructorsRouter }
