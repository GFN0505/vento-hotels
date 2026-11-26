import { describe, expect, it } from 'vitest'
import { check, type DatesForm, datesIn, nothingChosen, toInput } from './change-dates-model'

const BAR = '01934b6e-0000-7000-8000-000000000003'
const STQ = '01934b6e-0000-7000-8000-000000000001'
const DLK = '01934b6e-0000-7000-8000-000000000002'
const limits = { businessDate: '2026-11-25', lastRateDate: '2028-11-25' }

const festive: DatesForm = {
  planId: BAR,
  roomTypeIds: [STQ, DLK],
  from: '2026-12-18',
  to: '2027-01-02',
  days: [0, 1, 2, 3, 4, 5, 6],
  priceMode: 'set',
  prices: { [STQ]: '140,000', [DLK]: '175000' },
  season: 'Festive season',
  minStay: 'on',
  minStayNights: '2',
  closedToArrival: 'keep',
  closed: 'keep',
}

describe('change dates', () => {
  it('sends only what was chosen, keeping the rest as it is', () => {
    expect(toInput(festive)).toEqual({
      ratePlanId: BAR,
      roomTypeIds: [STQ, DLK],
      from: '2026-12-18',
      to: '2027-01-02',
      days: [0, 1, 2, 3, 4, 5, 6],
      prices: [
        { roomTypeId: STQ, price: '140,000' },
        { roomTypeId: DLK, price: '175000' },
      ],
      seasonName: 'Festive season',
      minStay: 2,
    })
    expect(check(festive, limits)).toEqual({})
  })

  it('counts 16 dates for the festive season', () => {
    expect(datesIn(festive, limits.businessDate)).toHaveLength(16)
  })

  it('turns a restriction off, or back to the standard price', () => {
    const input = toInput({
      ...festive,
      priceMode: 'standard',
      season: '',
      minStay: 'off',
      closed: 'off',
    })
    expect(input).toMatchObject({ backToStandard: true, minStay: null, closed: false })
    expect(input).not.toHaveProperty('prices')
  })

  it('says when the days leave no dates', () => {
    const fridays = {
      ...festive,
      from: '2026-12-07',
      to: '2026-12-10',
      days: [5] as DatesForm['days'],
    }
    expect(check(fridays, limits).days).toBe('No Fridays between 7 and 10 Dec.')
  })

  it('refuses dates before the business date and asks for each price', () => {
    const past = { ...festive, from: '2026-11-20', prices: { [STQ]: '140000' } }
    const problems = check(past, limits)
    expect(problems.from).toBe("20 Nov 2026 is before the business date. Past rates can't change.")
    expect(problems[`price-${DLK}`]).toBe('Enter a price')
  })

  it('knows when nothing was chosen', () => {
    const nothing = { ...festive, priceMode: 'keep' as const, season: '', minStay: 'keep' as const }
    expect(nothingChosen(nothing)).toBe(true)
    expect(nothingChosen(festive)).toBe(false)
  })
})
