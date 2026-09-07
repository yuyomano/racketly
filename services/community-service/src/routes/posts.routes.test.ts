import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { app } from '../index'

const prisma = new PrismaClient()

describe('/api/posts', () => {
  let userId: string
  let postId: string

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `posts-test-${Date.now()}@racketly.test` },
    })
    userId = user.id
  })

  afterAll(async () => {
    if (postId) {
      await prisma.postLike.deleteMany({ where: { postId } })
      await prisma.comment.deleteMany({ where: { postId } })
      await prisma.post.delete({ where: { id: postId } })
    }
    await prisma.user.delete({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it('POST / sin x-user-id responde 401', async () => {
    const res = await request(app).post('/api/posts').send({ content: 'hola' })
    expect(res.status).toBe(401)
  })

  it('POST / con contenido vacío responde 400 (validador zod)', async () => {
    const res = await request(app).post('/api/posts').set('x-user-id', userId).send({ content: '' })
    expect(res.status).toBe(400)
  })

  it('POST / crea el post y lo asocia al autor del header, no a uno enviado en el body', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('x-user-id', userId)
      .send({ content: 'Mi primer post', authorId: 'otro-usuario-cualquiera' })
    expect(res.status).toBe(201)
    expect(res.body.data.authorId).toBe(userId)
    postId = res.body.data.id
  })

  it('POST /:id/like da like y suma likesCount', async () => {
    const res = await request(app).post(`/api/posts/${postId}/like`).set('x-user-id', userId)
    expect(res.status).toBe(200)
    expect(res.body.data.liked).toBe(true)

    const post = await prisma.post.findUnique({ where: { id: postId } })
    expect(post?.likesCount).toBe(1)
  })

  it('POST /:id/like otra vez alterna a unlike y resta likesCount', async () => {
    const res = await request(app).post(`/api/posts/${postId}/like`).set('x-user-id', userId)
    expect(res.status).toBe(200)
    expect(res.body.data.liked).toBe(false)

    const post = await prisma.post.findUnique({ where: { id: postId } })
    expect(post?.likesCount).toBe(0)

    const like = await prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    })
    expect(like).toBeNull()
  })
})
