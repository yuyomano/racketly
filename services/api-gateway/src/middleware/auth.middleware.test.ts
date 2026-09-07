import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { Request, Response } from 'express'
import { makeAttachUser, parseCookieHeader } from './auth.middleware'

const SECRET = 'test-secret'
const attachUser = makeAttachUser(SECRET)

function fakeReq(headers: Record<string, string> = {}): Request {
  return { headers: { ...headers } } as unknown as Request
}

describe('attachUser', () => {
  it('con un JWT válido, agrega x-user-id/role/email al request', () => {
    const token = jwt.sign({ userId: 'u1', role: 'admin', email: 'a@a.com' }, SECRET)
    const req = fakeReq({ authorization: `Bearer ${token}` })
    const next = vi.fn()

    attachUser(req, {} as Response, next)

    expect(req.headers['x-user-id']).toBe('u1')
    expect(req.headers['x-user-role']).toBe('admin')
    expect(req.headers['x-user-email']).toBe('a@a.com')
    expect(next).toHaveBeenCalledOnce()
  })

  it('sin role en el payload, cae a "player" por defecto', () => {
    const token = jwt.sign({ userId: 'u1', email: 'a@a.com' }, SECRET)
    const req = fakeReq({ authorization: `Bearer ${token}` })

    attachUser(req, {} as Response, vi.fn())

    expect(req.headers['x-user-role']).toBe('player')
  })

  it('anti-suplantación: descarta x-user-* enviados directamente por el cliente sin token', () => {
    const req = fakeReq({
      'x-user-id': 'atacante',
      'x-user-role': 'admin',
      'x-user-email': 'atacante@evil.com',
    })

    attachUser(req, {} as Response, vi.fn())

    expect(req.headers['x-user-id']).toBeUndefined()
    expect(req.headers['x-user-role']).toBeUndefined()
    expect(req.headers['x-user-email']).toBeUndefined()
  })

  it('anti-suplantación: un token con firma inválida no debe dejar pasar headers falsificados', () => {
    const forged = jwt.sign({ userId: 'atacante', role: 'admin' }, 'otro-secret')
    const req = fakeReq({
      authorization: `Bearer ${forged}`,
      'x-user-id': 'atacante',
      'x-user-role': 'admin',
    })
    const next = vi.fn()

    attachUser(req, {} as Response, next)

    expect(req.headers['x-user-id']).toBeUndefined()
    expect(req.headers['x-user-role']).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })

  it('un token expirado se rechaza igual que uno inválido', () => {
    const token = jwt.sign({ userId: 'u1' }, SECRET, { expiresIn: -10 })
    const req = fakeReq({ authorization: `Bearer ${token}` })

    attachUser(req, {} as Response, vi.fn())

    expect(req.headers['x-user-id']).toBeUndefined()
  })

  it('sin Authorization header, lee el token de la cookie racketly_token', () => {
    const token = jwt.sign({ userId: 'u1' }, SECRET)
    const req = fakeReq({ cookie: `otra=x; racketly_token=${token}` })

    attachUser(req, {} as Response, vi.fn())

    expect(req.headers['x-user-id']).toBe('u1')
  })

  it('sin token en ningún lado, sigue sin bloquear la petición', () => {
    const req = fakeReq()
    const next = vi.fn()

    attachUser(req, {} as Response, next)

    expect(req.headers['x-user-id']).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })
})

describe('parseCookieHeader', () => {
  it('parsea múltiples cookies separadas por ";"', () => {
    const req = fakeReq({ cookie: 'a=1; b=2; racketly_token=abc.def.ghi' })
    expect(parseCookieHeader(req)).toEqual({ a: '1', b: '2', racketly_token: 'abc.def.ghi' })
  })

  it('sin header cookie, devuelve objeto vacío', () => {
    expect(parseCookieHeader(fakeReq())).toEqual({})
  })
})
