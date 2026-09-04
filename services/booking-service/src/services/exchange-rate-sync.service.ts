import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FRANKFURTER = 'https://api.frankfurter.app'

export const DEFAULT_CURRENCIES = [
  'COP',
  'EUR',
  'MXN',
  'CLP',
  'ARS',
  'BRL',
  'PEN',
  'GBP',
  'CAD',
  'DOP',
]

// Frankfurter (BCE) solo cubre ~30 monedas de referencia del Banco Central Europeo y
// no incluye varias monedas latinoamericanas que sí usan clubes reales (COP, DOP, ARS,
// PEN, CLP...). Para esas, en vez de dejarlas huérfanas hasta que alguien cargue una
// tasa manual, se usa esta tabla aproximada como respaldo (mismos valores orientativos
// que ya usa `apps/web/lib/utils.ts` para las conversiones del lado del cliente).
const FALLBACK_RATES_TO_USD: Record<string, number> = {
  COP: 0.000238,
  ARS: 0.00098,
  CLP: 0.00105,
  PEN: 0.265,
  DOP: 0.017,
  UYU: 0.025,
  BOB: 0.145,
  CRC: 0.00193,
  GTQ: 0.129,
  HNL: 0.04,
  PYG: 0.000135,
  AED: 0.272,
  SAR: 0.267,
  QAR: 0.274,
  KWD: 3.25,
  BHD: 2.65,
  OMR: 2.6,
  ILS: 0.272,
  TRY: 0.031,
  ZAR: 0.054,
  NGN: 0.00063,
  EGP: 0.02,
  MAD: 0.098,
  KES: 0.0077,
  GHS: 0.063,
  VND: 0.000039,
}

// Sincroniza tasas → USD para las monedas pedidas: primero contra Frankfurter (ECB);
// las que Frankfurter no cubre (monedas latinoamericanas sobre todo) caen a la tabla
// de respaldo aproximada, marcadas con source='fallback' para que se distingan en el
// panel de tasas de cambio. Usado tanto por POST /api/exchange-rates/sync como al
// crear un club con una moneda que todavía no tenemos guardada.
export async function syncCurrencies(
  currencies: string[]
): Promise<{ rows: any[]; date: string | null }> {
  const toSync = [...new Set(currencies.map((c) => c.toUpperCase()))].filter((c) => c !== 'USD')
  if (toSync.length === 0) return { rows: [], date: null }

  const url = `${FRANKFURTER}/latest?from=USD&to=${toSync.join(',')}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Error al contactar Frankfurter API')

  const json: any = await res.json()
  const rates: Record<string, number> = json.rates ?? {}

  const upserted: any[] = []
  for (const [currency, usdPerUnit] of Object.entries(rates)) {
    // Frankfurter da: 1 USD = X currency → necesitamos 1 currency = ? USD
    const rateToUsd = 1 / (usdPerUnit as number)
    const row = await prisma.exchangeRate.upsert({
      where: { from_to: { from: currency, to: 'USD' } },
      update: { rate: rateToUsd, source: 'frankfurter' },
      create: { from: currency, to: 'USD', rate: rateToUsd, source: 'frankfurter' },
    })
    upserted.push(row)
  }

  const missing = toSync.filter((c) => !(c in rates))
  for (const currency of missing) {
    const fallbackRate = FALLBACK_RATES_TO_USD[currency]
    if (!fallbackRate) continue // moneda desconocida — no hay ni ECB ni respaldo, se deja para carga manual
    const row = await prisma.exchangeRate.upsert({
      where: { from_to: { from: currency, to: 'USD' } },
      update: { rate: fallbackRate, source: 'fallback' },
      create: { from: currency, to: 'USD', rate: fallbackRate, source: 'fallback' },
    })
    upserted.push(row)
  }

  return { rows: upserted, date: json.date ?? null }
}

// Todas las monedas que hay que tener sincronizadas por defecto: las por defecto del
// sistema + la moneda de cada club creado (aunque ese club nunca haya generado una
// reserva) — así "Sync automático" en el panel de tasas de cambio no depende de que
// ya exista una fila previa en ExchangeRate para acordarse de esa moneda.
export async function getTrackedCurrencies(): Promise<string[]> {
  const [existing, clubCurrencies] = await Promise.all([
    prisma.exchangeRate.findMany({ select: { from: true } }),
    prisma.club.findMany({ select: { currency: true }, distinct: ['currency'] }),
  ])
  return [
    ...new Set([
      ...DEFAULT_CURRENCIES,
      ...existing.map((r) => r.from),
      ...clubCurrencies.map((c) => c.currency),
    ]),
  ]
}

// Best-effort: si la moneda de un club recién creado no está entre las tasas ya
// guardadas, la sincroniza de inmediato para que no quede huérfana hasta el próximo
// sync manual. Nunca debe hacer fallar la creación del club si Frankfurter falla.
export async function ensureCurrencyTracked(currency: string): Promise<void> {
  try {
    if (currency === 'USD') return
    const existing = await prisma.exchangeRate.findUnique({
      where: { from_to: { from: currency, to: 'USD' } },
    })
    if (existing) return
    await syncCurrencies([currency])
    console.info(`[exchange-rate-sync] Moneda nueva sincronizada: ${currency}`)
  } catch (err) {
    console.error(`[exchange-rate-sync] No se pudo sincronizar la moneda nueva ${currency}:`, err)
  }
}
