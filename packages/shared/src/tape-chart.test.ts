import { describe, expect, it } from 'vitest'
import {
  barSpan,
  chartStartFor,
  compareRoomOptions,
  nightsOf,
  rangeLabel,
  rangesOverlap,
  roomsLeft,
  shortGuestName,
} from './tape-chart.ts'

describe('tape chart maths', () => {
  it('starts the window two nights before the business date', () => {
    expect(chartStartFor('2026-11-25')).toBe('2026-11-23')
  })

  it('places a bar in the window, clipped at either edge', () => {
    expect(barSpan('2026-11-25', '2026-11-28', '2026-11-23', 14)).toEqual({
      start: 2,
      span: 3,
      clippedStart: false,
      clippedEnd: false,
    })
    expect(barSpan('2026-11-20', '2026-11-24', '2026-11-23', 14)).toEqual({
      start: 0,
      span: 1,
      clippedStart: true,
      clippedEnd: false,
    })
    expect(barSpan('2026-12-05', '2026-12-09', '2026-11-23', 14)).toEqual({
      start: 12,
      span: 2,
      clippedStart: false,
      clippedEnd: true,
    })
    // A one-night bar on the last column, and one outside the window.
    expect(barSpan('2026-12-06', '2026-12-07', '2026-11-23', 14)?.span).toBe(1)
    expect(barSpan('2026-12-07', '2026-12-08', '2026-11-23', 14)).toBeNull()
    expect(barSpan('2026-11-01', '2026-11-23', '2026-11-23', 14)).toBeNull()
    expect(barSpan('2026-11-23', '2026-12-30', '2026-11-23', 30)?.span).toBe(30)
  })

  it('treats ranges as nights, like stays', () => {
    expect(rangesOverlap('2026-11-25', '2026-11-27', '2026-11-27', '2026-11-28')).toBe(false)
    expect(rangesOverlap('2026-11-25', '2026-11-27', '2026-11-26', '2026-11-28')).toBe(true)
    expect(nightsOf('2026-11-30', '2026-12-02')).toEqual(['2026-11-30', '2026-12-01'])
  })

  it('writes names and ranges as the chart shows them', () => {
    expect(shortGuestName('Daniel', 'Mensah')).toBe('Mensah D.')
    expect(rangeLabel('2026-11-25', '2026-11-27')).toBe('25–27 Nov')
    expect(rangeLabel('2026-11-25', '2026-11-27', true)).toBe('25–27 Nov 2026')
    expect(rangeLabel('2026-11-28', '2026-12-02')).toBe('28 Nov–2 Dec')
    expect(rangeLabel('2026-12-30', '2027-01-02')).toBe('30 Dec 2026–2 Jan 2027')
  })

  it('counts rooms left with out-of-order rooms and the overbooking limit', () => {
    expect(roomsLeft(28, 1, 20)).toEqual({ left: 7, bookable: 7 })
    expect(roomsLeft(8, 0, 9, 1)).toEqual({ left: -1, bookable: 0 })
  })

  it('offers ready rooms first when the guest arrives today', () => {
    const rooms = [
      { status: 'dirty' as const, floor: 4, number: '403' },
      { status: 'clean' as const, floor: 4, number: '408' },
      { status: 'inspected' as const, floor: 4, number: '401' },
    ]
    expect([...rooms].sort((a, b) => compareRoomOptions(a, b, true)).map((r) => r.number)).toEqual([
      '401',
      '408',
      '403',
    ])
    expect([...rooms].sort((a, b) => compareRoomOptions(a, b, false)).map((r) => r.number)).toEqual(
      ['401', '403', '408'],
    )
  })
})
