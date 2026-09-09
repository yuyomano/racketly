import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { createPgAdapter } from '@racketly/utils/prisma-adapter'
import { AppError } from '../middleware/error.middleware'
import { requireAuth } from '../middleware/club-auth.middleware'
import { syncCurrencies, getTrackedCurrencies } from '../services/exchange-rate-sync.service'

const router = Router()
const prisma = new PrismaClient({ adapter: createPgAdapter() })

// GET /api/exchange-rates
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rates = await prisma.exchangeRate.findMany({ orderBy: { from: 'asc' } })
    return res.json({ success: true, data: rates })
  } catch (err) {
    return next(err)
  }
})

// PUT /api/exchange-rates — upsert manual rate
// body: { from: 'COP', to: 'USD', rate: 0.000238 }
// ponytail: solo exige estar autenticado, no un rol admin — este codebase no tiene un
// sistema de roles real todavía (TokenPayload/User no tienen `role`, x-user-role siempre
// es 'player'). Subir a un chequeo de rol de verdad cuando exista esa noción de admin global.
router.put('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to = 'USD', rate } = req.body
    if (!from || rate == null) throw new AppError('Se requieren from y rate', 400)
    if (typeof rate !== 'number' || rate <= 0)
      throw new AppError('rate debe ser un número positivo', 400)

    const saved = await prisma.exchangeRate.upsert({
      where: { from_to: { from: from.toUpperCase(), to: to.toUpperCase() } },
      update: { rate, source: 'manual' },
      create: { from: from.toUpperCase(), to: to.toUpperCase(), rate, source: 'manual' },
    })
    return res.json({ success: true, data: saved })
  } catch (err) {
    return next(err)
  }
})

// POST /api/exchange-rates/sync — obtener tasas actualizadas de Frankfurter (ECB)
// body: { currencies: ['COP','EUR','MXN','JPY'] }  (opcional; si vacío sincroniza las
// monedas por defecto + las ya guardadas + la moneda de CADA club creado, aunque ese
// club nunca haya generado una tasa propia todavía).
router.post('/sync', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requested: string[] = req.body?.currencies ?? []
    const toSync = requested.length > 0 ? requested : await getTrackedCurrencies()

    const { rows, date } = await syncCurrencies(toSync)
    return res.json({ success: true, synced: rows.length, date, data: rows })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Frankfurter'))
      return next(new AppError(err.message, 502))
    return next(err)
  }
})

export default router
