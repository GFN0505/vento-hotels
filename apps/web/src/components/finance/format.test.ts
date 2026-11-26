import { describe, expect, it } from 'vitest'
import { categoriesLabel, effectiveLabel, rateLabel, ratePercentProblem } from './format'

describe('tax page wording', () => {
  it('says when each version applies, as in the design', () => {
    expect(
      effectiveLabel({
        effectiveFrom: '2020-02-01',
        effectiveTo: null,
        status: 'current',
        first: false,
      }),
    ).toBe('since 1 Feb 2020')
    expect(
      effectiveLabel({
        effectiveFrom: '2025-01-01',
        effectiveTo: '2026-12-31',
        status: 'current',
        first: true,
      }),
    ).toBe('1 Jan 2025 – 31 Dec 2026')
    expect(
      effectiveLabel({
        effectiveFrom: '2027-01-01',
        effectiveTo: null,
        status: 'scheduled',
        first: false,
      }),
    ).toBe('from 1 Jan 2027')
    expect(
      effectiveLabel({
        effectiveFrom: '1994-01-01',
        effectiveTo: '2020-01-31',
        status: 'past',
        first: true,
      }),
    ).toBe('until 31 Jan 2020')
  })

  it('names rates and categories in plain words', () => {
    expect(rateLabel({ ratePercent: '12.5', stop: false })).toBe('12.5%')
    expect(rateLabel({ ratePercent: null, stop: true })).toBe('Not charged')
    expect(categoriesLabel(['accommodation', 'food', 'beverage', 'events'])).toBe(
      'Rooms, food, drinks, events',
    )
  })

  it('checks a typed rate without floats', () => {
    expect(ratePercentProblem('12.5')).toBeUndefined()
    expect(ratePercentProblem('100')).toBeUndefined()
    expect(ratePercentProblem('100.01')).toMatch(/up to 100%/)
    expect(ratePercentProblem('0')).toMatch(/above 0%/)
    expect(ratePercentProblem('7.555')).toBe('Enter a rate like 7.5 or 12.5')
  })
})
