import { Request as ExpressRequest, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { AppError } from './error.middleware'

// Express 5: ParamsDictionary ahora tipa valores como string | string[] (soporte para rutas
// con params repetidos, p.ej. `:id+`), que este repo no usa. Angostamos params a string.
type Request = ExpressRequest<Record<string, string>>

const prisma = new PrismaClient({ adapter: createPgAdapter() })

declare global {
  namespace Express {
    interface Request {
      clubAdmin?: { id: string; userId: string; clubId: string; role: string }
      userId?: string
    }
  }
}

// Exige que el caller esté autenticado (x-user-id, inyectado por el gateway desde el JWT
// verificado) sin exigir acceso a ningún club en particular — para eso está requireClubAccess.
// Para rutas self-service donde el id del recurso sale del header, nunca del body.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const userId = req.headers['x-user-id'] as string | undefined
  if (!userId) return next(new AppError('Autenticación requerida', 401))
  req.userId = userId
  next()
}

// Mismo chequeo que requireClubAccess pero como función normal en vez de middleware — para
// rutas donde el clubId no está en req.params sino que hay que resolverlo primero (desde una
// cancha, un slot, un profesor, etc.) antes de saber a qué club pertenece.
export async function assertClubAdmin(userId: string | undefined, clubId: string) {
  if (!userId) throw new AppError('Autenticación requerida', 401)
  const ca = await prisma.clubAdmin.findFirst({ where: { userId, clubId } })
  if (!ca) throw new AppError('No tienes acceso a este club', 403)
  return ca
}

// Verifica que el usuario autenticado tiene acceso al club (owner O admin)
export async function requireClubAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    const userId = req.headers['x-user-id'] as string | undefined
    if (!userId) throw new AppError('Autenticación requerida', 401)

    const clubId = req.params.id || req.params.clubId
    if (!clubId) return next()

    const ca = await prisma.clubAdmin.findFirst({ where: { userId, clubId } })
    if (!ca) throw new AppError('No tienes acceso a este club', 403)

    req.clubAdmin = ca
    next()
  } catch (err) {
    next(err)
  }
}

// Verifica que el usuario es OWNER del club (para gestión de admins e invitaciones)
export async function requireClubOwner(req: Request, _res: Response, next: NextFunction) {
  try {
    const userId = req.headers['x-user-id'] as string | undefined
    if (!userId) throw new AppError('Autenticación requerida', 401)

    const clubId = req.params.id || req.params.clubId
    if (!clubId) throw new AppError('Club no especificado', 400)

    const ca = await prisma.clubAdmin.findFirst({ where: { userId, clubId } })
    if (!ca) throw new AppError('No tienes acceso a este club', 403)
    if (ca.role !== 'owner') throw new AppError('Solo el owner puede realizar esta acción', 403)

    req.clubAdmin = ca
    next()
  } catch (err) {
    next(err)
  }
}
