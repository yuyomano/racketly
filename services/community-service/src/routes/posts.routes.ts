import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'

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
        author: { select: { id: true, playerProfile: { select: { displayName: true, avatarUrl: true } } } },
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
  } catch (err) { return next(err) }
})

// POST /api/posts — crear post
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const post = await prisma.post.create({
      data: req.body,
      include: { author: { select: { id: true, playerProfile: { select: { displayName: true, avatarUrl: true } } } } },
    })
    return res.status(201).json({ success: true, data: post })
  } catch (err) { return next(err) }
})

// POST /api/posts/:id/like
router.post('/:id/like', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body
    const existing = await prisma.postLike.findUnique({ where: { postId_userId: { postId: req.params.id, userId } } })

    if (existing) {
      await prisma.postLike.delete({ where: { postId_userId: { postId: req.params.id, userId } } })
      await prisma.post.update({ where: { id: req.params.id }, data: { likesCount: { decrement: 1 } } })
      return res.json({ success: true, data: { liked: false } })
    }

    await prisma.postLike.create({ data: { postId: req.params.id, userId } })
    await prisma.post.update({ where: { id: req.params.id }, data: { likesCount: { increment: 1 } } })
    return res.json({ success: true, data: { liked: true } })
  } catch (err) { return next(err) }
})

// POST /api/posts/:id/comments
router.post('/:id/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comment = await prisma.comment.create({
      data: { postId: req.params.id, ...req.body },
    })
    await prisma.post.update({ where: { id: req.params.id }, data: { commentsCount: { increment: 1 } } })
    return res.status(201).json({ success: true, data: comment })
  } catch (err) { return next(err) }
})

// GET /api/posts/:id/comments
router.get('/:id/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { postId: req.params.id, parentId: null },
      include: {
        author: { select: { id: true, playerProfile: { select: { displayName: true, avatarUrl: true } } } },
        replies: { include: { author: { select: { id: true, playerProfile: { select: { displayName: true, avatarUrl: true } } } } } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return res.json({ success: true, data: comments })
  } catch (err) { return next(err) }
})

export { router as postsRouter }
