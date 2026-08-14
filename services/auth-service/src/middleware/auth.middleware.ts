import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError } from './error.middleware'

export interface AuthPayload {
  userId: string
  email: string
  subscriptionTier: string
  iat: number
  exp: number
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Token de autenticación requerido', 401))
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload
    req.user = payload
    return next()
  } catch {
    return next(new AppError('Token inválido o expirado', 401))
  }
}

export function requireSubscription(tiers: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('No autenticado', 401))
    if (!tiers.includes(req.user.subscriptionTier)) {
      return next(new AppError('Suscripción premium requerida para este contenido', 403))
    }
    return next()
  }
}
