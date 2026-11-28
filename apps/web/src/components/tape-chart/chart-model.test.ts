import type { TapeChart } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import {
  barText,
  barTime,
  bookedTypeFree,
  buildRows,
  cellProblem,
  dayList,
  laneStays,
  occupancyOf,
  roomFreeFor,
  segmentsByRoom,
  tonightCounts,
} from './chart-model'

const night = (
  date: string,
  extra: Partial<TapeChart['roomTypes'][number]['nights'][number]> = {},
) => ({
  date,
  rooms: 2,
  outOfOrder: 0,
  booked: 1,
  left: 1,
  unassigned: 0,
  ...extra,
})

const stay = (
  id: string,
  roomId: string | null,
  arrival: string,
  departure: string,
  last = 'Mensah',
) => ({
  id,
  reservationId: `r-${id}`,
  number: `VI-2611-0${id}`,
  guestName: `Daniel ${last}`,
  guestShort: `${last} D.`,
  roomTypeId: 't1',
  planName: 'Best available',
  arrival,
  departure,
  adults: 1,
  children: 0,
  roomId,
  roomFrom: arrival,
  segments: [],
  version: 1,
  status: 'confirmed' as const,
  movable: true,
  depositDue: null,
})

const room = (id: string, number: string, floor = 5) => ({
  id,
  number,
  floor,
  roomTypeId: 't1',
  features: [],
  accessible: false,
  connectsTo: [],
  status: 'inspected' as const,
  statusBy: null,
  statusAt: null,
})

const chart: TapeChart = {
  hotel: {
    id: 'h',
    name: 'Kora',
    businessDate: '2026-11-25',
    timeZone: 'Africa/Lagos',
    live: true,
  },
  from: '2026-11-23',
  days: 7,
  can: { open: true, move: true, manage: true, status: true, outOfOrder: false, setUpRooms: false },
  roomTypes: [
    {
      id: 't1',
      name: 'Executive King',
      code: 'EXK',
      maxAdults: 2,
      maxChildren: 1,
      tonightPrice: '210000.00',
      nights: [night('2026-11-25', { unassigned: 1 })],
    },
  ],
  rooms: [room('r2', '503'), room('r1', '502')],
  outOfOrder: [
    {
      id: 'o',
      roomId: 'r2',
      roomNumber: '503',
      from: '2026-11-25',
      backInService: '2026-11-27',
      reason: 'ac',
      reasonText: null,
      note: null,
      byName: 'Tunde Bello',
      status: 'active',
      version: 1,
    },
  ],
  stays: [
    stay('1', 'r1', '2026-11-25', '2026-11-28'),
    stay('2', null, '2026-11-25', '2026-11-26', 'Adebayo'),
  ],
}

describe('chart model', () => {
  it('lays out a type: header, Unassigned lane, rooms by number, Available', () => {
    const { rows, shown, total } = buildRows(chart, {}, new Set())
    expect(rows.map((row) => row.kind)).toEqual(['type', 'unassigned', 'room', 'room', 'available'])
    expect(
      rows.filter((r) => r.kind === 'room').map((r) => (r.kind === 'room' ? r.room.number : '')),
    ).toEqual(['502', '503'])
    expect({ shown, total }).toEqual({ shown: 2, total: 2 })
    expect(
      buildRows(chart, { floor: 9 }, new Set()).rows.filter((r) => r.kind === 'room'),
    ).toHaveLength(0)
  })

  it('stacks overlapping unassigned bars into lanes', () => {
    const laned = laneStays([
      stay('a', null, '2026-11-25', '2026-11-27'),
      stay('b', null, '2026-11-26', '2026-11-28'),
      stay('c', null, '2026-11-27', '2026-11-29'),
    ])
    expect(laned.lanes).toBe(2)
    expect(laned.stays.map((s) => s.lane)).toEqual([0, 1, 0])
  })

  it('says why a room is not free for a stay', () => {
    const [mensah] = chart.stays
    const other = stay('9', null, '2026-11-26', '2026-11-27')
    expect(roomFreeFor(chart, room('r1', '502'), other)).toEqual({
      free: false,
      why: '502 · Mensah D. 25–28 Nov',
    })
    expect(roomFreeFor(chart, room('r2', '503'), other)).toEqual({
      free: false,
      why: '503 · Out of order 25–27 Nov',
    })
    expect(mensah && roomFreeFor(chart, room('r1', '502'), mensah)).toEqual({ free: true })
  })

  it('fits the name to the bar, never cutting it short', () => {
    const [mensah] = chart.stays
    if (!mensah) throw new Error('no stay')
    expect(barText(mensah, 240)).toEqual({ name: 'Mensah D.', sub: '· 3 nights' })
    expect(barText(mensah, 80)).toEqual({ name: 'Mensah D.', sub: '' })
    expect(barText(mensah, 60)).toEqual({ name: 'Mensah', sub: '' })
    expect(barText(mensah, 30)).toEqual({ name: 'DM', sub: '' })
  })

  it('says who is in each room tonight and counts the night', () => {
    const r1 = room('r1', '502')
    const r2 = room('r2', '503')
    expect(occupancyOf(chart, r1)).toBe('arriving')
    expect(occupancyOf(chart, r1, '2026-11-26')).toBe('occupied')
    expect(occupancyOf(chart, r1, '2026-11-28')).toBe('leaving')
    expect(occupancyOf(chart, r1, '2026-11-29')).toBe('vacant')
    expect(occupancyOf(chart, r2)).toBe('out_of_order')
    expect(tonightCounts(chart)).toEqual({
      occupied: 0,
      arriving: 1,
      vacant: 0,
      outOfOrder: 1,
      unassigned: 1,
    })
    expect(tonightCounts(chart, '2026-11-28')).toEqual({
      occupied: 0,
      arriving: 0,
      vacant: 2,
      outOfOrder: 0,
      unassigned: 0,
    })
    const { rows } = buildRows(chart, { tonight: 'arriving' }, new Set())
    expect(
      rows.filter((r) => r.kind === 'room').map((r) => (r.kind === 'room' ? r.room.number : '')),
    ).toEqual(['502'])
    const confirmed = { status: 'confirmed' as const }
    expect(
      barTime({ arrival: '2026-11-25', departure: '2026-11-28', ...confirmed }, '2026-11-25'),
    ).toBe('tonight')
    expect(
      barTime({ arrival: '2026-11-26', departure: '2026-11-28', ...confirmed }, '2026-11-25'),
    ).toBe('later')
    expect(
      barTime({ arrival: '2026-11-23', departure: '2026-11-25', ...confirmed }, '2026-11-25'),
    ).toBe('past')
    expect(
      barTime(
        { arrival: '2026-11-23', departure: '2026-11-27', status: 'checked_in' },
        '2026-11-25',
      ),
    ).toBe('in_house')
  })

  it('reads a checked-in stay as Occupied, and keeps a moved guest’s earlier nights in the old room', () => {
    const [mensah, adebayo] = chart.stays
    if (!mensah || !adebayo) throw new Error('no stays')
    const moved = {
      ...chart,
      stays: [
        {
          ...mensah,
          status: 'checked_in' as const,
          arrival: '2026-11-23',
          roomFrom: '2026-11-25',
          segments: [{ roomId: 'r2', from: '2026-11-23', to: '2026-11-25' }],
        },
        adebayo,
      ],
      outOfOrder: [],
    }
    expect(occupancyOf(moved, room('r1', '502'))).toBe('occupied')
    // 503 was left on 25 Nov: not "leaving" (nobody checks out of it).
    expect(occupancyOf(moved, room('r2', '503'))).toBe('vacant')
    expect(
      segmentsByRoom(moved)
        .get('r2')
        ?.map((s) => [s.from, s.to]),
    ).toEqual([['2026-11-23', '2026-11-25']])
    expect(tonightCounts(moved).occupied).toBe(1)
  })

  it('groups the phone day list by type with what is on each room', () => {
    const [section] = dayList(chart, '2026-11-25')
    expect(section?.arriving.map((s) => s.guestName)).toEqual(['Daniel Adebayo'])
    expect(section?.rooms.map((r) => [r.room.number, r.status, r.line])).toEqual([
      ['502', 'inspected', 'Mensah D. · 3 nights'],
      ['503', 'out_of_order', 'Until 27 Nov · AC'],
    ])
  })
})

describe('what a cell and a move allow', () => {
  it('starts a booking only on a night the room can be sold', () => {
    const [r1, r2] = [room('r1', '502'), room('r2', '503')]
    expect(cellProblem(chart, r1, '2026-11-24')).toBe('24 Nov has passed')
    expect(cellProblem(chart, r2, '2026-11-25')).toBe('503 is out of order on 25 Nov')
    expect(cellProblem(chart, r1, '2026-11-26')).toBe('502 is taken on 26 Nov (Mensah D.)')
    expect(cellProblem(chart, r2, '2026-11-28')).toBeNull()
    const full = {
      ...chart,
      roomTypes: chart.roomTypes.map((t) => ({ ...t, nights: [night('2026-11-28', { left: 0 })] })),
    }
    expect(cellProblem(full, r2, '2026-11-28')).toBe('Executive King is full on 28 Nov')
  })

  it('keeps moves to another type for when the booked type has no free room', () => {
    const adebayo = chart.stays[1]
    if (!adebayo) throw new Error('no stay')
    // 502 is taken and 503 out of order on 25 Nov: Executive King is full for her night.
    expect(bookedTypeFree(chart, adebayo)).toBe(false)
    expect(
      bookedTypeFree(chart, { ...adebayo, arrival: '2026-11-28', departure: '2026-11-29' }),
    ).toBe(true)
  })
})
