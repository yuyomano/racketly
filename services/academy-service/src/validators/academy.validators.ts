import { Request, Response, NextFunction } from 'express'
import { z, ZodError } from 'zod'

export const updateProgressSchema = z.object({
  body: z.object({
    progressPercent: z.number().int().min(0).max(100),
    lastLessonId: z.string().cuid().optional(),
  }),
})

// Mismo patrón que auth-service — parsea body/query/params y devuelve 400 con detalle por campo.
export function validate(schema: z.ZodType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({ body: req.body, query: req.query, params: req.params })
      return next()
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          details: err.issues.map((e) => ({ field: e.path.join('.'), message: e.message })),
        })
      }
      return next(err)
    }
  }
}
