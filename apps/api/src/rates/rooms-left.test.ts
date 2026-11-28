// Rooms left on the rate calendar (spec: stage-1-rooms-left.md): per room type per night, the same
// figure as the tape chart's Available row and New reservation's "N left", out of order included,
// overbooked nights below 0, read by the front desk and scoped to the hotel.
import { addDays, calendarDateIn, type RateCalendar } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { roomTypes } from '../db/schema/rooms.ts'
import { bookStay } from '../reservations/change/testing.ts'
import { availabilityOf, DAY, type KoraBooking, koraBooking } from '../reservations/testing.ts'
import { chartOf, outOfOrder, roomsOf } from '../tape-chart/testing.ts'
import { createTestApp } from '../test/harness.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('rooms left on the rate calendar', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraBooking
  let from: string

  const calendar = (cookie: string, propertyId: string, start: string, nights = 7) =>
    t.rpc<RateCalendar & { message?: string }>(cookie, 'rates/calendar', {
      propertyId,
      from: start,
      nights,
    })

  beforeAll(async () => {
    k = await koraBooking(t)
    const today = calendarDateIn('Africa/Lagos')
    from = addDays([today, DAY].sort().at(-1) ?? DAY, 20)
  })

  it('counts bookings and out-of-order rooms per night, as the tape chart and New reservation do', async () => {
    const stay = { roomTypeId: k.types.exk.id, ratePlanId: k.bar.id }
    await bookStay(t, k.frontDesk.cookie, k.vi.id, {
      ...stay,
      arrival: from,
      departure: addDays(from, 3),
    })
    await bookStay(t, k.frontDesk.cookie, k.vi.id, {
      ...stay,
      arrival: addDays(from, 1),
      departure: addDays(from, 2),
    })
    const [room] = await roomsOf(t, k.owner.cookie, k.vi.id, k.types.exk.id)
    if (!room) throw new Error('no rooms')
    const ooo = await outOfOrder(t, k.gm.cookie, {
      propertyId: k.vi.id,
      roomId: room.id,
      from: addDays(from, 2),
      backInService: addDays(from, 4),
    })
    expect(ooo.status).toBe(200)

    const cal = await calendar(k.frontDesk.cookie, k.vi.id, from)
    expect(cal.status).toBe(200)
    const exk = cal.data.roomTypes.find((type) => type.id === k.types.exk.id)
    // Executive King has 3 rooms: 1 booked, 2 booked, 1 booked + 1 out of order, 1 out of order.
    expect(exk?.left.slice(0, 5)).toEqual([
      { date: from, left: 2, outOfOrder: 0 },
      { date: addDays(from, 1), left: 1, outOfOrder: 0 },
      { date: addDays(from, 2), left: 1, outOfOrder: 1 },
      { date: addDays(from, 3), left: 2, outOfOrder: 1 },
      { date: addDays(from, 4), left: 3, outOfOrder: 0 },
    ])

    const chart = await chartOf(t, k.frontDesk.cookie, k.vi.id, { from, days: 7 })
    for (const type of cal.data.roomTypes) {
      const nights = chart.data.roomTypes.find((row) => row.id === type.id)?.nights ?? []
      expect(type.left.map((night) => night.left)).toEqual(nights.map((night) => night.left))
    }
    const quote = await availabilityOf(t, k.frontDesk.cookie, k.vi.id, from, addDays(from, 4))
    const offered = quote.data.roomTypes.find((type) => type.id === k.types.exk.id)
    expect(offered?.nights.map((night) => night.left)).toEqual([2, 1, 1, 2])
  })

  it('goes below 0 on an overbooked night', async () => {
    // Standard Queen has 4 rooms; an overbooking limit of 1 lets a fifth booking in.
    const start = addDays(from, 10)
    await t.db
      .update(roomTypes)
      .set({ overbookingLimit: 1 })
      .where(eq(roomTypes.id, k.types.stq.id))
    const stay = { roomTypeId: k.types.stq.id, ratePlanId: k.bar.id }
    for (let i = 0; i < 5; i++) {
      await bookStay(t, k.frontDesk.cookie, k.vi.id, {
        ...stay,
        arrival: start,
        departure: addDays(start, 1),
      })
    }
    const cal = await calendar(k.frontDesk.cookie, k.vi.id, start, 1)
    const stq = cal.data.roomTypes.find((type) => type.id === k.types.stq.id)
    expect(stq?.left).toEqual([{ date: start, left: -1, outOfOrder: 0 }])
    const chart = await chartOf(t, k.frontDesk.cookie, k.vi.id, { from: start, days: 1 })
    const charted = chart.data.roomTypes.find((type) => type.id === k.types.stq.id)?.nights[0]
    expect(charted?.left).toBe(-1)
  })

  it("follows the hotel asked for and refuses a hotel outside the member's access", async () => {
    const ikeja = await calendar(k.owner.cookie, k.ikeja.id, from)
    expect(ikeja.status).toBe(200)
    expect(ikeja.data.roomTypes.map((type) => type.id)).not.toContain(k.types.exk.id)
    const refused = await calendar(k.frontDesk.cookie, k.ikeja.id, from)
    expect(refused.status).not.toBe(200)
  })
})
