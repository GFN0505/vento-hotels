import { describe, expect, it } from 'vitest'
import { isLgaOf, NIGERIAN_LGAS } from './lgas.ts'
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

describe('NIGERIAN_LGAS', () => {
  it('lists the 774 LGAs under the right number per state', () => {
    const counts = Object.fromEntries(
      Object.entries(NIGERIAN_LGAS).map(([state, lgas]) => [state, lgas.length]),
    )
    expect(Object.keys(counts).sort()).toEqual([...NIGERIAN_STATES].sort())
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(774)
    expect(counts).toMatchObject({ Lagos: 20, Kano: 44, 'FCT (Abuja)': 6, Bayelsa: 8, Rivers: 23 })
    for (const lgas of Object.values(NIGERIAN_LGAS)) expect(new Set(lgas).size).toBe(lgas.length)
  })

  it('checks an LGA against its state', () => {
    expect(isLgaOf('Lagos', 'Eti-Osa')).toBe(true)
    expect(isLgaOf('Rivers', 'Eti-Osa')).toBe(false)
    expect(isLgaOf('Atlantis', 'Eti-Osa')).toBe(false)
  })
})
