import { z } from 'zod'

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido'),
    password: z
      .string()
      .min(8, 'La contraseña debe tener al menos 8 caracteres')
      .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
      .regex(/[0-9]/, 'Debe contener al menos un número'),
    displayName: z.string().min(2, 'Nombre muy corto').max(50, 'Nombre muy largo'),
    phone: z.string().optional(),
    country: z.string().length(2, 'Código de país de 2 letras'),
    city: z.string().min(2, 'Ciudad requerida'),
    sport: z.enum(['padel', 'pickleball', 'both']).default('padel'),
  }),
})

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'Contraseña requerida'),
  }),
})

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token requerido'),
  }),
})

export const updateProfileSchema = z.object({
  body: z.object({
    displayName: z.string().min(2).max(50).optional(),
    bio: z.string().max(300).optional(),
    city: z.string().min(2).optional(),
    country: z.string().length(2).optional(),
    sport: z.enum(['padel', 'pickleball', 'both']).optional(),
    avatarUrl: z.string().url().optional(),
  }),
})

// Middleware de validación genérico
import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

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
