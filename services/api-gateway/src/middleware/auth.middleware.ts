import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// Verifies the JWT if present (Bearer header or racketly_token cookie) and
// forwards user info as x-user-* headers to downstream services, que confían
// en ellos sin volver a verificar la firma — por eso este archivo es el punto
// de mayor riesgo de suplantación de todo el gateway.
export function parseCookieHeader(req: Request): Record<string, string> {
  return (req.headers.cookie || '').split(';').reduce<Record<string, string>>((acc, part) => {
    const [k, ...v] = part.trim().split('=')
    if (k) acc[k.trim()] = decodeURIComponent(v.join('='))
    return acc
  }, {})
}

export function makeAttachUser(jwtSecret: string) {
  return function attachUser(req: Request, _res: Response, next: NextFunction) {
    // Siempre limpiar primero cualquier x-user-* que venga en la petición original —
    // si no, un cliente sin token (o con token inválido) podría mandar estos headers
    // directamente y hacerse pasar por cualquier usuario, ya que los microservicios
    // downstream confían en ellos sin volver a verificar la firma del JWT.
    delete req.headers['x-user-id']
    delete req.headers['x-user-role']
    delete req.headers['x-user-email']

    let token: string | undefined

    const authHeader = req.headers['authorization']
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    } else {
      token = parseCookieHeader(req)['racketly_token']
    }

    if (token) {
      try {
        const payload = jwt.verify(token, jwtSecret) as any
        req.headers['x-user-id'] = payload.userId || payload.id || ''
        req.headers['x-user-role'] = payload.role || 'player'
        req.headers['x-user-email'] = payload.email || ''
      } catch {
        // token inválido/expirado — los headers ya quedaron limpios arriba
      }
    }
    next()
  }
}
