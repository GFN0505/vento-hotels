import { describe, expect, it } from 'vitest'
import { describeChange } from './history-model'

describe('change history in words', () => {
  it('says which standard price changed, before and after', () => {
    const change = describeChange({
      action: 'rate_plan.prices_changed',
      before: {
        prices: [{ roomTypeId: 'a', roomTypeName: 'Standard Queen', weekday: '120000.00' }],
      },
      after: {
        prices: [{ roomTypeId: 'a', roomTypeName: 'Standard Queen', weekday: '110000.00' }],
      },
    })
    expect(change).toEqual({
      title: 'Standard prices changed',
      lines: ['Standard Queen ₦120,000 → ₦110,000'],
    })
  })

  it('gives a date change its range, room types, price and season', () => {
    const change = describeChange({
      action: 'rates.dates_changed',
      before: {},
      after: {
        from: '2026-12-18',
        to: '2027-01-02',
        roomTypes: [{ roomTypeName: 'Standard Queen' }, { roomTypeName: 'Deluxe King' }],
        seasonName: 'Festive season',
        cells: [{ price: '140000.00' }, { price: '175000.00' }],
      },
    })
    expect(change.lines).toEqual([
      '18 Dec 2026–2 Jan 2027 · Standard Queen and Deluxe King · Festive season',
    ])
  })

  it('names changed terms, with the offset in naira', () => {
    const change = describeChange({
      action: 'rate_plan.changed',
      before: { adjustment: { kind: 'amount', value: '15000.00' }, minStay: 1 },
      after: { adjustment: { kind: 'amount', value: '18000.00' }, minStay: 2 },
    })
    expect(change.lines).toEqual(['Offset ₦15,000 → ₦18,000', 'Min stay 1 → 2'])
  })
})
