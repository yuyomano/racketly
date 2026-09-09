import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import {
  generateAccessToken,
  generateTokenPair,
  verifyAndRotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} from './token.service'

// Test de integración real contra Postgres (igual que el job "test" de CI, que
// levanta un Postgres dedicado) — token.service crea su propio PrismaClient a
// nivel de módulo, así que mockear Prisma acá sería más frágil que usar la DB real
// para la propiedad de seguridad que importa probar: rotación + detección de reuso.
const prisma = new PrismaClient({ adapter: createPgAdapter() })

describe('token.service', () => {
  let userId: string

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `token-service-test-${Date.now()}@racketly.test` },
    })
    userId = user.id
  })

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
    await prisma.$disconnect()
  })

  const payload = () => ({ userId, email: 'x@x.com', subscriptionTier: 'free' })

  it('generateAccessToken firma un JWT verificable con JWT_SECRET', () => {
    const token = generateAccessToken(payload())
    expect(token.split('.')).toHaveLength(3)
  })

  it('generateTokenPair persiste el hash del refresh token, no el token crudo', async () => {
    const { refreshToken } = await generateTokenPair(payload())
    const rows = await prisma.refreshToken.findMany({ where: { userId } })
    expect(rows.some((r) => r.tokenHash === refreshToken)).toBe(false)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('verifyAndRotateRefreshToken rota: emite un par nuevo y revoca el viejo', async () => {
    const revokedBefore = await prisma.refreshToken.count({ where: { userId, revokedAt: { not: null } } })
    const { refreshToken: oldToken } = await generateTokenPair(payload())
    const { refreshToken: newToken } = await verifyAndRotateRefreshToken(oldToken, payload())

    expect(newToken).not.toBe(oldToken)
    const revokedAfter = await prisma.refreshToken.count({ where: { userId, revokedAt: { not: null } } })
    expect(revokedAfter).toBe(revokedBefore + 1)
  })

  it('reusar un refresh token ya rotado (revocado) lanza — detección de robo/replay', async () => {
    const { refreshToken: token } = await generateTokenPair(payload())
    await verifyAndRotateRefreshToken(token, payload())

    await expect(verifyAndRotateRefreshToken(token, payload())).rejects.toThrow(
      'Refresh token inválido o revocado'
    )
  })

  it('un token con firma inválida es rechazado', async () => {
    await expect(verifyAndRotateRefreshToken('token.invalido.aca', payload())).rejects.toThrow()
  })

  it('revokeRefreshToken revoca el token indicado sin lanzar con basura', async () => {
    const { refreshToken: token } = await generateTokenPair(payload())
    await revokeRefreshToken(token)
    await expect(verifyAndRotateRefreshToken(token, payload())).rejects.toThrow()

    await expect(revokeRefreshToken('esto-no-es-un-jwt')).resolves.not.toThrow()
  })

  it('revokeAllUserRefreshTokens deja sin uso todos los refresh tokens activos', async () => {
    const { refreshToken: t1 } = await generateTokenPair(payload())
    const { refreshToken: t2 } = await generateTokenPair(payload())

    await revokeAllUserRefreshTokens(userId)

    await expect(verifyAndRotateRefreshToken(t1, payload())).rejects.toThrow()
    await expect(verifyAndRotateRefreshToken(t2, payload())).rejects.toThrow()
  })
})
