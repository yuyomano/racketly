import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

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
  } catch (err) { return next(err) }
})

// GET /api/instructors/:id/sessions
router.get('/:id/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await prisma.instructorSession.findMany({
      where: { instructorId: req.params.id, date: { gte: new Date().toISOString().split('T')[0] } },
      orderBy: { date: 'asc' },
    })
    return res.json({ success: true, data: sessions })
  } catch (err) { return next(err) }
})

// POST /api/instructors/sessions/:id/book
router.post('/sessions/:id/book', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await prisma.instructorSession.findUnique({ where: { id: req.params.id } })
    if (!session) return res.status(404).json({ success: false, error: 'Sesión no encontrada' })
    if (session.bookedCount >= session.maxStudents) return res.status(400).json({ success: false, error: 'Sesión llena' })

    await prisma.instructorSession.update({
      where: { id: req.params.id },
      data: { bookedCount: { increment: 1 } },
    })
    return res.json({ success: true, message: 'Reserva de clase confirmada' })
  } catch (err) { return next(err) }
})

export { router as instructorsRouter }
