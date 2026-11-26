import { describe, expect, it } from 'vitest'
import { formatFxRate, fxCheckMessage, fxEquivalent, fxRateJump, fxRateValueSchema } from './fx.ts'

describe('fxEquivalent', () => {
  it('shows a naira price in dollars at the CBN rate, as front desk will see it', () => {
    const result = fxEquivalent('183750.00', {
      currency: 'USD',
      rate: '1620.0000',
      source: 'cbn',
      date: '2026-11-13',
    })
    expect(result).toEqual({
      amount: '113.43',
      currency: 'USD',
      text: '≈ $113.43 at ₦1,620/$, CBN, 13 Nov 2026',
    })
  })

  it('rounds half-up to the cent and keeps the rate’s decimals', () => {
    // 1,000,000 ÷ 1,950.5 = 512.6890…
    const result = fxEquivalent('1000000', {
      currency: 'GBP',
      rate: '1950.5',
      source: 'cbn',
      date: '2026-11-25',
    })
    expect(result.amount).toBe('512.69')
    expect(result.text).toBe('≈ £512.69 at ₦1,950.5/£, CBN, 25 Nov 2026')
    expect(
      fxEquivalent('0.005', { currency: 'EUR', rate: '1', source: 'market', date: '2026-11-25' })
        .amount,
    ).toBe('0.01')
  })

  it('groups thousands in the foreign amount', () => {
    expect(
      fxEquivalent('16200000', { currency: 'USD', rate: '1620', source: 'cbn', date: '2026-11-25' })
        .text,
    ).toBe('≈ $10,000.00 at ₦1,620/$, CBN, 25 Nov 2026')
  })
})

describe('FX rate values and the typo guard', () => {
  it('accepts up to 4 decimals and commas as typed, and refuses zero', () => {
    expect(fxRateValueSchema.parse('1,620.00')).toBe('1620.0000')
    expect(fxRateValueSchema.parse('1620.1234')).toBe('1620.1234')
    expect(fxRateValueSchema.safeParse('1620.12345').success).toBe(false)
    expect(fxRateValueSchema.safeParse('0').success).toBe(false)
    expect(formatFxRate('1620.5000')).toBe('1,620.5')
  })

  it('asks to check a rate more than 10% from the last one, and not one at exactly 10%', () => {
    expect(fxRateJump('1620', '1782').needsCheck).toBe(false)
    expect(fxRateJump('1620', '1782.01').needsCheck).toBe(true)
    expect(fxRateJump('1620', '1457.99').needsCheck).toBe(true)
    expect(fxRateJump('1620', '1625').needsCheck).toBe(false)
  })

  it('words the check as the spec does', () => {
    expect(fxCheckMessage('USD', '16200', { rate: '1620', date: '2026-11-24' })).toBe(
      '₦16,200.00 is 10 times the last USD rate (₦1,620.00 on 24 Nov). Check the figure.',
    )
    expect(fxCheckMessage('USD', '1458', { rate: '1620', date: '2026-11-24' })).toBe(
      '₦1,458.00 is 10% below the last USD rate (₦1,620.00 on 24 Nov). Check the figure.',
    )
  })
})
