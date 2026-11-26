import { describe, expect, it } from 'vitest'
import {
  type CalendarRow,
  cellLabel,
  editable,
  moveCell,
  pageFrom,
  seasonBands,
} from './calendar-model'

const BAR = '01934b6e-0000-7000-8000-000000000003'
const row = (over: Partial<CalendarRow> = {}): CalendarRow => ({
  ratePlanId: BAR,
  name: 'Best available',
  code: 'BAR',
  pricing: 'own',
  parent: null,
  bookableBy: 'anyone',
  pricesIncludeTaxes: false,
  cells: [],
  ...over,
})
const cell = {
  date: '2026-11-27',
  price: '150000.00',
  from: 'standard' as const,
  closed: false,
  closedToArrival: true,
  minStay: 2,
  datePrice: null,
  dateMinStay: 2,
  seasonName: null,
}

describe('rate calendar', () => {
  it('says the room type, plan, night, price and restrictions of a cell', () => {
    expect(cellLabel('Deluxe King', row(), cell, false)).toBe(
      'Deluxe King, Best available, Fri 27 Nov, ₦150,000, closed to arrival, min stay 2 nights',
    )
    const derived = row({
      name: 'Bed & breakfast',
      pricing: 'derived',
      parent: { id: BAR, name: 'Best available' },
    })
    expect(
      cellLabel('Deluxe King', derived, { ...cell, closedToArrival: false, minStay: 1 }, true),
    ).toBe('Deluxe King, Bed & breakfast, Fri 27 Nov, ₦150,000, follows Best available, past date')
  })

  it('lets only own prices from the business date on be typed into', () => {
    expect(editable(row(), false, true)).toBe(true)
    expect(editable(row(), true, true)).toBe(false)
    expect(editable(row({ pricing: 'derived' }), false, true)).toBe(false)
    expect(editable(row(), false, false)).toBe(false)
  })

  it('groups dates under their season into bands', () => {
    const dates = ['2026-12-16', '2026-12-17', '2026-12-18', '2026-12-19', '2026-12-20']
    const bands = seasonBands(dates, [
      { name: 'Festive season', from: '2026-12-18', to: '2027-01-02' },
    ])
    expect(bands.map((b) => [b.name, b.span])).toEqual([
      [null, 2],
      ['Festive season', 3],
    ])
  })

  it('moves one cell with the arrows and stops at the edges', () => {
    const size = { rows: 3, cols: 14 }
    expect(moveCell('ArrowRight', { row: 0, col: 13 }, size)).toEqual({ row: 0, col: 13 })
    expect(moveCell('ArrowDown', { row: 1, col: 4 }, size)).toEqual({ row: 2, col: 4 })
    expect(moveCell('End', { row: 1, col: 4 }, size)).toEqual({ row: 1, col: 13 })
    expect(moveCell('a', { row: 1, col: 4 }, size)).toBeNull()
  })

  it('pages by the nights shown', () => {
    expect(pageFrom('2026-11-25', 14, 1)).toBe('2026-12-09')
    expect(pageFrom('2026-11-25', 14, -1)).toBe('2026-11-11')
  })
})
