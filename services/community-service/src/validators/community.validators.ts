import { Request, Response, NextFunction } from 'express'
import { AnyZodObject, z, ZodError } from 'zod'

export const createPostSchema = z.object({
  body: z.object({
    type: z.enum(['text', 'photo', 'video', 'reel', 'poll']).default('text'),
    content: z.string().min(1, 'El post no puede estar vacío').max(2000, 'Post muy largo'),
    mediaUrls: z.array(z.string().url()).max(10).default([]),
    sportTag: z.enum(['padel', 'pickleball', 'both']).optional(),
    groupId: z.string().cuid().optional(),
  }),
})

export const createCommentSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'El comentario no puede estar vacío').max(1000),
    parentId: z.string().cuid().optional(),
  }),
})

export const createGearReviewSchema = z.object({
  body: z.object({
    brand: z.string().min(1).max(50),
    model: z.string().min(1).max(100),
    sport: z.enum(['padel', 'pickleball', 'both']),
    rating: z.number().int().min(1).max(5),
    reviewText: z.string().min(1).max(2000),
    photos: z.array(z.string().url()).max(10).default([]),
  }),
})

// Mismo patrón que auth-service — parsea body/query/params y devuelve 400 con detalle por campo.
export function validate(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({ body: req.body, query: req.query, params: req.params })
      return next()
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        })
      }
      return next(err)
    }
  }
}
