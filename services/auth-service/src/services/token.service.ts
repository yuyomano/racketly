import jwt from 'jsonwebtoken'
import { createHash, randomUUID } from 'crypto'
import { PrismaClient } from '@prisma/client'

if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET / JWT_REFRESH_SECRET no configurados — auth-service no puede arrancar sin secretos reales.')
}

const JWT_SECRET = process.env.JWT_SECRET
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY = '30d'
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

const prisma = new PrismaClient()

export interface TokenPayload {
  userId: string
  email: string
  subscriptionTier: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY })
}

function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, jti: randomUUID() }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  })
}

// Genera un refresh token nuevo y persiste su hash (nunca el token crudo) para
// poder revocarlo individualmente más tarde (logout real, detección de reuso).
async function issueRefreshToken(userId: string): Promise<string> {
  const token = signRefreshToken(userId)
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  })
  return token
}

export async function generateTokenPair(payload: TokenPayload) {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: await issueRefreshToken(payload.userId),
    expiresIn: 15 * 60, // segundos — debe coincidir con ACCESS_TOKEN_EXPIRY
  }
}

// Verifica la firma del refresh token Y que su hash siga vigente (no revocado, no
// expirado) en la base de datos. Si es válido, lo rota: revoca la fila vieja y emite
// un par nuevo — así un token robado que se reutiliza después de rotar ya no sirve.
export async function verifyAndRotateRefreshToken(token: string, payloadForAccess: TokenPayload) {
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string; jti: string }
  const tokenHash = hashToken(token)

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } })
  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== decoded.userId) {
    throw new Error('Refresh token inválido o revocado')
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } })

  return {
    accessToken: generateAccessToken(payloadForAccess),
    refreshToken: await issueRefreshToken(decoded.userId),
    expiresIn: 15 * 60,
  }
}

export async function revokeRefreshToken(token: string): Promise<void> {
  try {
    const tokenHash = hashToken(token)
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  } catch {
    // token malformado — nada que revocar, no debe romper el logout
  }
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
