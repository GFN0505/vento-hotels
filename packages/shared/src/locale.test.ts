import { describe, expect, it } from 'vitest'
import { DEFAULT_CURRENCY, isSupportedCurrency } from './locale.ts'

describe('locale defaults', () => {
  it('defaults to naira', () => {
    expect(DEFAULT_CURRENCY).toBe('NGN')
  })

  it('accepts only the currencies v1 supports', () => {
    expect(isSupportedCurrency('GBP')).toBe(true)
    expect(isSupportedCurrency('JPY')).toBe(false)
    expect(isSupportedCurrency('ngn')).toBe(false)
  })
})
