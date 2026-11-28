// The tape chart read against the test database (spec: stage-1-tape-chart.md, "The chart"): the
// window, rooms left with out-of-order rooms and unassigned bookings per night, bars, readers and
// the hotel scope.
import { addDays, calendarDateIn } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bookStay } from '../reservations/change/testing.ts'
import { DAY, type KoraBooking, koraBooking } from '../reservations/testing.ts'
import { limitTo, person } from '../tenancy/testing.ts'
import { createTestApp } from '../test/harness.ts'
import { assign, chartOf, outOfOrder, roomsOf } from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('tape chart', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraBooking

  beforeAll(async () => {
    k = await koraBooking(t)
  })

  it('starts two nights before the business date and counts rooms left, out of order and unassigned', async () => {
    const today = calendarDateIn('Africa/Lagos')
    const from = addDays([today, DAY].sort().at(-1) ?? DAY, 10)
    const exk = await roomsOf(t, k.owner.cookie, k.vi.id, k.types.exk.id)
    const first = exk[0]
    const second = exk[1]
    if (!first || !second) throw new Error('no rooms')
    const stay = { roomTypeId: k.types.exk.id, ratePlanId: k.bar.id }
    const a = await bookStay(t, k.frontDesk.cookie, k.vi.id, {
      ...stay,
      arrival: from,
      departure: addDays(from, 2),
    })
    await bookStay(t, k.frontDesk.cookie, k.vi.id, {
      ...stay,
      arrival: from,
      departure: addDays(from, 1),
    })
    await assign(t, k.frontDesk.cookie, a.stay, first.id)
    await outOfOrder(t, k.gm.cookie, {
      propertyId: k.vi.id,
      roomId: second.id,
      from,
      backInService: addDays(from, 1),
    })
    const standard = await chartOf(t, k.frontDesk.cookie, k.vi.id, { days: 14 })
    expect(standard.status).toBe(200)
    expect(standard.data.from).toBe(addDays(DAY, -2))
    expect(standard.data.roomTypes[0]?.nights).toHaveLength(14)
    expect(standard.data.roomTypes.map((type) => type.name)).toEqual([
      'Standard Queen',
      'Deluxe King',
      'Executive King',
      'Junior Suite',
    ])
    expect(standard.data.roomTypes[1]?.tonightPrice).toBe('150000.00')
    const chart = await chartOf(t, k.frontDesk.cookie, k.vi.id, { from, days: 7 })
    const nights = chart.data.roomTypes.find((type) => type.id === k.types.exk.id)?.nights
    expect(nights?.[0]).toMatchObject({
      rooms: 3,
      outOfOrder: 1,
      booked: 2,
      left: 0,
      unassigned: 1,
    })
    expect(nights?.[1]).toMatchObject({ outOfOrder: 0, booked: 1, left: 2, unassigned: 0 })
    const bar = chart.data.stays.find((s) => s.id === a.stay.id)
    expect(bar).toMatchObject({ roomId: first.id, guestShort: 'Collins S.', movable: true })
    expect(chart.data.can).toMatchObject({
      open: true,
      move: true,
      status: true,
      outOfOrder: false,
    })
  })

  it('reads for housekeeping without opening reservations, and is a hotel page', async () => {
    const grace = await person(t, k.orgId, 'Grace Akpan', 'housekeeping_supervisor')
    await limitTo(t, k.owner, grace, [k.vi.id])
    const theirs = await chartOf(t, grace.cookie, k.vi.id, { days: 1 })
    expect(theirs.status).toBe(200)
    expect(theirs.data.can).toMatchObject({
      open: false,
      move: false,
      status: true,
      outOfOrder: true,
    })
    expect((await chartOf(t, grace.cookie, k.ikeja.id)).data.data?.code).toBe('PROPERTY_NOT_FOUND')
    expect((await chartOf(t, k.cashier.cookie, k.vi.id)).status).toBe(403)
    expect((await chartOf(t, k.other.cookie, k.vi.id)).data.data?.code).toBe('PROPERTY_NOT_FOUND')
  })
})
