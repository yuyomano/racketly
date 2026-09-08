import { Router, Request as ExpressRequest, Response, NextFunction } from 'express'
// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>
import { PrismaClient } from '@prisma/client'
import { requireAuth } from '../middleware/auth.middleware'
import { createPostSchema, createCommentSchema, validate } from '../validators/community.validators'

const router = Router()
const prisma = new PrismaClient()

// GET /api/posts — feed
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId, sport, userId, page = '1', limit = '20' } = req.query
    const where: Record<string, unknown> = {}
    if (groupId) where.groupId = groupId
    if (sport) where.sportTag = sport
    // Si no es premium, solo posts no-premium
    // (en producción: verificar suscripción del usuario)

    const posts = await prisma.post.findMany({
      where,
      include: {
        author: {
          select: { id: true, playerProfile: { select: { displayName: true, avatarUrl: true } } },
        },
        _count: { select: { comments: true, likes: true } },
        likes: userId ? { where: { userId: userId as string }, select: { userId: true } } : false,
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    })

    const data = posts.map(({ likes, ...post }) => ({
      ...post,
      isLikedByMe: Array.isArray(likes) && likes.length > 0,
    }))

    return res.json({ success: true, data })
  } catch (err) {
    return next(err)
  }
})

// POST /api/posts — crear post
router.post(
  '/',
  requireAuth,
  validate(createPostSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, content, mediaUrls, sportTag, groupId } = req.body
      const post = await prisma.post.create({
        data: { type, content, mediaUrls, sportTag, groupId, authorId: req.userId! },
        include: {
          author: {
            select: { id: true, playerProfile: { select: { displayName: true, avatarUrl: true } } },
          },
        },
      })
      return res.status(201).json({ success: true, data: post })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/posts/:id/like
router.post('/:id/like', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!
    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId: req.params.id, userId } },
    })

    if (existing) {
      await prisma.postLike.delete({ where: { postId_userId: { postId: req.params.id, userId } } })
      await prisma.post.update({
        where: { id: req.params.id },
        data: { likesCount: { decrement: 1 } },
      })
      return res.json({ success: true, data: { liked: false } })
    }

    await prisma.postLike.create({ data: { postId: req.params.id, userId } })
    await prisma.post.update({
      where: { id: req.params.id },
      data: { likesCount: { increment: 1 } },
    })
    return res.json({ success: true, data: { liked: true } })
  } catch (err) {
    return next(err)
  }
})

// POST /api/posts/:id/comments
router.post(
  '/:id/comments',
  requireAuth,
  validate(createCommentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { content, parentId } = req.body
      const comment = await prisma.comment.create({
        data: { postId: req.params.id, authorId: req.userId!, content, parentId },
      })
      await prisma.post.update({
        where: { id: req.params.id },
        data: { commentsCount: { increment: 1 } },
      })
      return res.status(201).json({ success: true, data: comment })
    } catch (err) {
      return next(err)
    }
  }
)

// GET /api/posts/:id/comments
router.get('/:id/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { postId: req.params.id, parentId: null },
      include: {
        author: {
          select: { id: true, playerProfile: { select: { displayName: true, avatarUrl: true } } },
        },
        replies: {
          include: {
            author: {
              select: {
                id: true,
                playerProfile: { select: { displayName: true, avatarUrl: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return res.json({ success: true, data: comments })
  } catch (err) {
    return next(err)
  }
})

export { router as postsRouter }
