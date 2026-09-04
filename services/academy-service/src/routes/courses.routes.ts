import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { mux } from '../index'

const router = Router()
const prisma = new PrismaClient()

// GET /api/courses
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sport, level, type, isPremium, page = '1', limit = '20' } = req.query
    const where: Record<string, unknown> = {}
    if (sport) where.sport = sport
    if (level) where.level = level
    if (type) where.type = type
    if (isPremium !== undefined) where.isPremium = isPremium === 'true'

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        include: {
          instructor: { select: { displayName: true, avatarUrl: true, ratingAvg: true } },
          _count: { select: { lessons: true, enrollments: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
      }),
      prisma.course.count({ where }),
    ])
    return res.json({
      success: true,
      data: courses,
      pagination: { page: Number(page), pageSize: Number(limit), total },
    })
  } catch (err) {
    return next(err)
  }
})

// GET /api/courses/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: {
        instructor: true,
        lessons: { orderBy: { orderIndex: 'asc' } },
        _count: { select: { enrollments: true } },
      },
    })
    if (!course) return res.status(404).json({ success: false, error: 'Curso no encontrado' })
    return res.json({ success: true, data: course })
  } catch (err) {
    return next(err)
  }
})

// GET /api/courses/enrollments/user/:userId — mis cursos (con progreso)
router.get('/enrollments/user/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: req.params.userId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            sport: true,
            level: true,
            thumbnailUrl: true,
            instructor: { select: { displayName: true } },
            _count: { select: { lessons: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    })
    return res.json({ success: true, data: enrollments })
  } catch (err) {
    return next(err)
  }
})

// POST /api/courses/:id/enroll
router.post('/:id/enroll', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body
    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: req.params.id } },
    })
    if (existing) return res.status(409).json({ success: false, error: 'Ya estás inscrito' })

    const enrollment = await prisma.enrollment.create({
      data: { userId, courseId: req.params.id, progressPercent: 0 },
    })
    return res.status(201).json({ success: true, data: enrollment })
  } catch (err) {
    return next(err)
  }
})

// PUT /api/courses/enrollments/:id/progress
router.put('/enrollments/:id/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { progressPercent, lastLessonId } = req.body
    const enrollment = await prisma.enrollment.update({
      where: { id: req.params.id },
      data: {
        progressPercent,
        lastLessonId,
        completedAt: progressPercent >= 100 ? new Date().toISOString() : undefined,
      },
    })
    return res.json({ success: true, data: enrollment })
  } catch (err) {
    return next(err)
  }
})

// POST /api/courses/upload-video — obtener URL de upload para Mux
router.post('/upload-video', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!mux) {
      return res
        .status(503)
        .json({
          success: false,
          error: 'Servicio de video no configurado (MUX_TOKEN_ID requerido)',
        })
    }
    const upload = await mux.video.uploads.create({
      cors_origin: process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3000',
      new_asset_settings: { playback_policy: ['public'], encoding_tier: 'smart' },
    })
    return res.json({ success: true, data: { uploadUrl: upload.url, uploadId: upload.id } })
  } catch (err) {
    return next(err)
  }
})

export { router as coursesRouter }
