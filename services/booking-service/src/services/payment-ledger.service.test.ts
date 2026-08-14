import { describe, it, expect } from 'vitest'
import { resolvePaymentMethod, resolvePaymentMethodDefaultCash } from './payment-ledger.service'

describe('resolvePaymentMethod', () => {
  it('acepta "cash" explícito', () => {
    expect(resolvePaymentMethod('cash')).toBe('cash')
  })

  it('cualquier otra cosa cae a "card" por defecto', () => {
    expect(resolvePaymentMethod('card')).toBe('card')
    expect(resolvePaymentMethod(undefined)).toBe('card')
    expect(resolvePaymentMethod('tarjeta')).toBe('card')
    expect(resolvePaymentMethod(null)).toBe('card')
  })
})

describe('resolvePaymentMethodDefaultCash', () => {
  it('acepta "card" explícito', () => {
    expect(resolvePaymentMethodDefaultCash('card')).toBe('card')
  })

  it('cualquier otra cosa cae a "cash" por defecto (cobro presencial sin método explícito)', () => {
    expect(resolvePaymentMethodDefaultCash('cash')).toBe('cash')
    expect(resolvePaymentMethodDefaultCash(undefined)).toBe('cash')
    expect(resolvePaymentMethodDefaultCash(null)).toBe('cash')
  })
})
