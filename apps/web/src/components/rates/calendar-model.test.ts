import { describe, expect, it } from 'vitest'
import {
  bandLabel,
  type CalendarRow,
  cellLabel,
  cellMarks,
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

  it('bands a season over its dates, with its range and shared min stay', () => {
    const dates = ['2026-12-16', '2026-12-17', '2026-12-18', '2026-12-19']
    const own = row({
      cells: dates.map((date) => ({ ...cell, date, dateMinStay: date >= '2026-12-18' ? 2 : null })),
    })
    const calendar = {
      propertyId: BAR,
      propertyName: 'Kora Victoria Island',
      businessDate: '2026-12-16',
      lastRateDate: '2028-12-16',
      live: false,
      canEdit: true,
      dates: dates.map((date) => ({ date, weekend: false, past: false })),
      seasons: [{ name: 'Festive season', from: '2026-12-18', to: '2027-01-02' }],
      roomTypes: [{ id: BAR, name: 'Standard Queen', code: 'STQ', left: [], rows: [own] }],
    }
    const bands = seasonBands(calendar)
    expect(bands.map((b) => [b.season?.name ?? null, b.span])).toEqual([
      [null, 2],
      ['Festive season', 2],
    ])
    const festive = bands[1]?.season
    if (!festive) throw new Error('no season')
    expect(bandLabel(festive)).toBe('Festive season · 18 Dec–2 Jan · min 2')
    // Inside the season the band says it; a different min stay still shows on the cell.
    expect(cellMarks({ ...cell, from: 'date', minStay: 2 }, festive)).toEqual({
      dot: false,
      min: null,
    })
    expect(cellMarks({ ...cell, from: 'date', minStay: 3 }, festive)).toEqual({
      dot: false,
      min: 3,
    })
    expect(cellMarks({ ...cell, from: 'date', minStay: 1 }, null)).toEqual({ dot: true, min: null })
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
