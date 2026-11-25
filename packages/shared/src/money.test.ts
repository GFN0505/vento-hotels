import { describe, expect, it } from 'vitest'
import {
  addMoney,
  amountSchema,
  CurrencyMismatchError,
  compareMoney,
  dec,
  formatMoney,
  fxRateSchema,
  money,
  moneySchema,
  percentOf,
  subtractMoney,
  sumMoney,
  toAmount,
  toNaira,
} from './money.ts'

describe('amountSchema', () => {
  it('normalizes to two decimals', () => {
    expect(amountSchema.parse('125000')).toBe('125000.00')
    expect(amountSchema.parse(' 85.5 ')).toBe('85.50')
    expect(amountSchema.parse('-1000')).toBe('-1000.00')
  })

  it('rejects more than 2 decimals, letters, and amounts too big for numeric(14,2)', () => {
    for (const bad of ['1.005', '12abc', '', '1,000.00', '1000000000000.00', 'NaN']) {
      expect(amountSchema.safeParse(bad).success).toBe(false)
    }
    expect(amountSchema.parse('999999999999.99')).toBe('999999999999.99')
  })

  it('validates money with a supported currency', () => {
    expect(moneySchema.parse({ amount: '120000', currency: 'NGN' })).toEqual({
      amount: '120000.00',
      currency: 'NGN',
    })
    expect(moneySchema.safeParse({ amount: '1', currency: 'JPY' }).success).toBe(false)
  })
})

describe('arithmetic is exact', () => {
  it('avoids floating point errors', () => {
    const a = money('0.10', 'NGN')
    const b = money('0.20', 'NGN')
    expect(addMoney(a, b).amount).toBe('0.30')
    expect(subtractMoney(money('1.00', 'NGN'), money('0.90', 'NGN')).amount).toBe('0.10')
  })

  it('sums a folio without drift', () => {
    const lines = Array.from({ length: 1000 }, () => money('0.01', 'NGN'))
    expect(sumMoney(lines, 'NGN')).toEqual({ amount: '10.00', currency: 'NGN' })
  })

  it('refuses to mix currencies', () => {
    expect(() => addMoney(money('1', 'NGN'), money('1', 'USD'))).toThrow(CurrencyMismatchError)
    expect(() => sumMoney([money('1', 'GBP')], 'NGN')).toThrow(CurrencyMismatchError)
  })

  it('compares amounts', () => {
    expect(compareMoney(money('5', 'NGN'), money('5.00', 'NGN'))).toBe(0)
    expect(compareMoney(money('4.99', 'NGN'), money('5', 'NGN'))).toBe(-1)
  })
})

describe('rounding', () => {
  it('rounds half-up once, at the end', () => {
    expect(toAmount('2.345')).toBe('2.35')
    expect(toAmount('2.344')).toBe('2.34')
    expect(toAmount('-2.345')).toBe('-2.35')
    expect(toAmount('-0.001')).toBe('0.00')
  })

  it('computes the demo tax lines on a Deluxe King night (illustrative rates)', () => {
    // ₦150,000 base; service charge 10%, VAT 7.5%, Lagos consumption tax 5% (from config in real use).
    const base = '150000.00'
    const lines = ['10', '7.5', '5'].map((rate) => toAmount(percentOf(base, rate)))
    expect(lines).toEqual(['15000.00', '11250.00', '7500.00'])
    const total = sumMoney(
      [base, ...lines].map((amount) => money(amount, 'NGN')),
      'NGN',
    )
    expect(total.amount).toBe('183750.00')
  })

  it('keeps precision until the final rounding', () => {
    // Rounding each third would give 0.99; rounding once gives 1.00.
    const third = dec('1').dividedBy(3)
    expect(toAmount(third.plus(third).plus(third))).toBe('1.00')
  })
})

describe('foreign currency', () => {
  const fx = fxRateSchema.parse({ rate: '1950', source: 'manual', date: '2026-11-25' })

  it('converts to naira with the recorded rate', () => {
    expect(toNaira(money('323.53', 'GBP'), fx)).toEqual({ amount: '630883.50', currency: 'NGN' })
  })

  it('leaves naira unchanged', () => {
    expect(toNaira(money('100', 'NGN'), fx)).toEqual({ amount: '100.00', currency: 'NGN' })
  })

  it('rejects zero, negative and badly formed rates and dates', () => {
    expect(fxRateSchema.safeParse({ rate: '0', source: 'bank', date: '2026-11-25' }).success).toBe(
      false,
    )
    expect(fxRateSchema.safeParse({ rate: '-1', source: 'bank', date: '2026-11-25' }).success).toBe(
      false,
    )
    expect(
      fxRateSchema.safeParse({ rate: '1950', source: 'street', date: '2026-11-25' }).success,
    ).toBe(false)
    expect(
      fxRateSchema.safeParse({ rate: '1950', source: 'bank', date: '25/11/2026' }).success,
    ).toBe(false)
  })
})

describe('formatMoney', () => {
  it('formats naira and foreign currencies the way the designs show them', () => {
    expect(formatMoney(money('125000', 'NGN'))).toBe('₦125,000.00')
    expect(formatMoney(money('85', 'USD'))).toBe('$85.00')
    expect(formatMoney(money('323.53', 'GBP'))).toBe('£323.53')
  })

  it('writes negatives with a true minus sign, as on printed documents', () => {
    expect(formatMoney(money('-5000', 'NGN'))).toBe('\u2212₦5,000.00')
  })

  it('formats very large amounts without losing precision', () => {
    expect(formatMoney(money('999999999999.99', 'NGN'))).toBe('₦999,999,999,999.99')
  })
})
