import { Request, Response, NextFunction } from 'express'

declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

// El api-gateway ya verificó el JWT y puso el id real del usuario en x-user-id
// (ver attachUser en services/api-gateway/src/index.ts). Nunca confiar en un
// userId que venga en req.body — cualquier cliente podría mandar el id de otra
// persona e inscribirse/progresar como si fuera ella.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers['x-user-id'] as string | undefined
  if (!userId) return res.status(401).json({ success: false, error: 'Autenticación requerida' })
  req.userId = userId
  return next()
}
