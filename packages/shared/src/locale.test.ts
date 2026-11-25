import { describe, expect, it } from 'vitest'
import { DEFAULT_CURRENCY, isSupportedCurrency, NIGERIAN_STATES } from './locale.ts'

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

describe('NIGERIAN_STATES', () => {
  it('lists the 36 states and the FCT once each', () => {
    expect(NIGERIAN_STATES).toHaveLength(37)
    expect(new Set(NIGERIAN_STATES).size).toBe(37)
  })
})
