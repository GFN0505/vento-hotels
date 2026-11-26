import { describe, expect, it } from 'vitest'
import { checkFirstRate, priceProblem } from './first-rate-model'

const A = '01934b6e-0000-7000-8000-000000000001'
const B = '01934b6e-0000-7000-8000-000000000002'

describe('first rate', () => {
  it('turns typed prices into whole-naira amounts, with a blank Fri and Sat as the same', () => {
    const result = checkFirstRate([A, B], {
      [A]: { weekday: '120,000', weekend: '' },
      [B]: { weekday: '150000', weekend: '165000' },
    })
    expect(result.prices).toEqual([
      { roomTypeId: A, weekday: '120000.00', weekend: null },
      { roomTypeId: B, weekday: '150000.00', weekend: '165000.00' },
    ])
  })

  it('asks for every weekday price, and names the field', () => {
    const result = checkFirstRate([A, B], { [A]: { weekday: '120000', weekend: '' } })
    expect(result.prices).toBeUndefined()
    expect(result.problems[`weekday-${B}`]).toBe('Enter a weekday price')
    expect(result.order[0]).toBe(`weekday-${A}`)
  })

  it('refuses ₦0 and kobo with the shared messages', () => {
    expect(priceProblem('0', true)).toBe(
      'Enter a price above ₦0. For a free night, comp it on the stay.',
    )
    expect(priceProblem('120000.50', true)).toBe('Enter whole naira, without kobo')
    expect(priceProblem('', false)).toBeUndefined()
  })
})
