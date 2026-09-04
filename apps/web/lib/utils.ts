import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Monedas que no usan decimales
const ZERO_DECIMAL = new Set([
  'JPY',
  'KRW',
  'IDR',
  'VND',
  'CLP',
  'PYG',
  'COP',
  'MXN',
  'ARS',
  'HUF',
  'ISK',
  'UGX',
  'XOF',
  'XAF',
  'CRC',
  'GTQ',
])

export function formatCurrency(amount: number, currency = 'COP') {
  const decimals = ZERO_DECIMAL.has(currency) ? 0 : 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

// Tasas aproximadas a USD (orientativas, no para transacciones reales)
const FX_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CHF: 1.12,
  CAD: 0.73,
  AUD: 0.65,
  NZD: 0.6,
  SGD: 0.74,
  JPY: 0.0066,
  CNY: 0.138,
  KRW: 0.00073,
  HKD: 0.128,
  INR: 0.012,
  THB: 0.028,
  MYR: 0.215,
  IDR: 0.000062,
  PHP: 0.0174,
  VND: 0.000039,
  TWD: 0.031,
  MXN: 0.057,
  COP: 0.000238,
  ARS: 0.00098,
  BRL: 0.18,
  CLP: 0.00105,
  PEN: 0.265,
  UYU: 0.025,
  BOB: 0.145,
  DOP: 0.017,
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
}

export function toUSD(amount: number, currency: string): number {
  return amount * (FX_TO_USD[currency] ?? 1)
}

// `locale` es opcional (default 'es') para no romper callers existentes — pero cualquier
// componente dentro del árbol de next-intl debería pasar el locale activo (useLocale())
// para que la fecha respete el idioma que el usuario eligió en el selector ES/EN.
export function formatDate(date: string | Date, locale = 'es') {
  return new Date(date).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(date: string | Date, locale = 'es') {
  return new Date(date).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatDateShort(date: string | Date, locale = 'es') {
  return new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

// Variación porcentual para KPIs con tendencia (ej. StatCard). Sin período anterior
// (prev = 0) no hay base de comparación válida, así que no se muestra tendencia.
export function pctTrend(
  curr: number,
  prev: number
): { trend: string; trendUp: boolean } | undefined {
  if (!prev) return undefined
  const pct = Math.round(((curr - prev) / prev) * 100)
  if (pct === 0) return { trend: '0%', trendUp: true }
  return { trend: `${pct > 0 ? '+' : ''}${pct}%`, trendUp: pct > 0 }
}
