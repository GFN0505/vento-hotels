import { describe, expect, it } from 'vitest'
import { basis, perNight } from './format'

// Decision 0032: prices are all-in unless their plan is marked, and labels follow the plan.
describe('price basis labels', () => {
  it('says incl. or excl. as the plan does', () => {
    expect(basis(true)).toBe('incl. taxes and service charge')
    expect(basis(false)).toBe('excl. taxes and service charge')
  })

  it('heads a page of plans by what they have in common', () => {
    expect(perNight({ exclusive: 0, total: 5 })).toBe('₦ per night incl. taxes and service charge')
    expect(perNight({ exclusive: 0, total: 0 })).toBe('₦ per night incl. taxes and service charge')
    expect(perNight({ exclusive: 2, total: 2 })).toBe('₦ per night excl. taxes and service charge')
    expect(perNight({ exclusive: 1, total: 5 })).toBe(
      '₦ per night incl. taxes and service charge unless marked excl.',
    )
  })
})
