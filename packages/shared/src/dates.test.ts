import { describe, expect, it } from 'vitest'
import { addDays, calendarDateIn, instantAt, nightsBetween, stayDatesSchema } from './dates.ts'

describe('nightsBetween', () => {
  it('counts nights for the walkthrough stays', () => {
    expect(nightsBetween('2026-11-25', '2026-11-28')).toBe(3)
    expect(nightsBetween('2026-11-28', '2026-12-02')).toBe(4)
  })

  it('counts a day use as 0 nights', () => {
    expect(nightsBetween('2026-11-25', '2026-11-25')).toBe(0)
  })

  it('crosses month, year and leap day correctly', () => {
    expect(nightsBetween('2026-12-30', '2027-01-02')).toBe(3)
    expect(nightsBetween('2028-02-28', '2028-03-01')).toBe(2)
  })

  it('rejects impossible dates', () => {
    expect(() => nightsBetween('2026-02-30', '2026-03-01')).toThrow(RangeError)
  })
})

describe('addDays', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-11-25', -1)).toBe('2026-11-24')
  })
})

describe('stayDatesSchema', () => {
  it('allows day use and refuses departure before arrival', () => {
    expect(
      stayDatesSchema.safeParse({ arrival: '2026-11-25', departure: '2026-11-25' }).success,
    ).toBe(true)
    expect(
      stayDatesSchema.safeParse({ arrival: '2026-11-25', departure: '2026-11-24' }).success,
    ).toBe(false)
  })
})

describe('calendarDateIn', () => {
  it('uses the property time zone, not the machine one', () => {
    // 23:30 UTC on 24 Nov is already 00:30 on 25 Nov in Lagos (UTC+1).
    const at = new Date('2026-11-24T23:30:00Z')
    expect(calendarDateIn('Africa/Lagos', at)).toBe('2026-11-25')
    expect(calendarDateIn('UTC', at)).toBe('2026-11-24')
  })
})

describe('instantAt', () => {
  it('finds check-in time in Lagos (UTC+1, no daylight saving)', () => {
    expect(instantAt('2026-12-09', '14:00', 'Africa/Lagos').toISOString()).toBe(
      '2026-12-09T13:00:00.000Z',
    )
  })
  it('handles zones behind UTC and summer time', () => {
    expect(instantAt('2026-07-01', '09:30', 'Europe/London').toISOString()).toBe(
      '2026-07-01T08:30:00.000Z',
    )
    expect(instantAt('2026-01-15', '00:00', 'America/New_York').toISOString()).toBe(
      '2026-01-15T05:00:00.000Z',
    )
  })
})
