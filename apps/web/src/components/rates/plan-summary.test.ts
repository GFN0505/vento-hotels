import { describe, expect, it } from 'vitest'
import { priceSummary } from './plan-summary'

const parent = { id: '01934b6e-0000-7000-8000-000000000001', name: 'Best available', code: 'BAR' }
const row = (weekday: string | null) => ({
  roomTypeId: '01934b6e-0000-7000-8000-000000000009',
  weekday,
  weekend: null,
})

describe('price summary', () => {
  it('shows the weekday range of a plan with its own prices, compared as decimals', () => {
    const plan = {
      pricing: 'own' as const,
      parent: null,
      adjustment: null,
      roomTypes: [row('320000.00'), row('95000.00'), row('150000.00')],
    }
    expect(priceSummary(plan)).toBe('₦95,000 – ₦320,000')
  })

  it('names the parent and the offset of a derived plan', () => {
    const base = { pricing: 'derived' as const, parent, roomTypes: [] }
    expect(priceSummary({ ...base, adjustment: { kind: 'amount', value: '18000.00' } })).toBe(
      'Best available + ₦18,000',
    )
    expect(priceSummary({ ...base, adjustment: { kind: 'percent', value: '-10.00' } })).toBe(
      'Best available − 10%',
    )
  })
})
