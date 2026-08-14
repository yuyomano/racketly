import { Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { AppError } from './error.middleware'

const prisma = new PrismaClient()

declare global {
  namespace Express {
    interface Request {
      clubAdmin?: { id: string; userId: string; clubId: string; role: string }
    }
  }
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
