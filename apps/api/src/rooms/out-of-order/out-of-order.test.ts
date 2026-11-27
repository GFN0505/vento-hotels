// Out of order against the test database through the real HTTP flow (spec: stage-1-tape-chart.md,
// "Out of order" and "Tests"). Kora Victoria Island, business date 25 Nov 2026, Executive King 3
// rooms, Deluxe King 6.
import type { Availability, ChartRoom, OutOfOrderView } from '@vento/shared'
import { addDays, calendarDateIn, newId } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditFor } from '../../approvals/testing.ts'
import { rooms } from '../../db/schema/rooms.ts'
import { setHotel } from '../../finance/testing.ts'
import { bookStay, rpc } from '../../reservations/change/testing.ts'
import { availabilityOf, DAY, type KoraBooking, koraBooking } from '../../reservations/testing.ts'
import { assign, chartOf, checkOutOfOrder, outOfOrder, roomsOf } from '../../tape-chart/testing.ts'
import { limitTo, person } from '../../tenancy/testing.ts'
import { createTestApp } from '../../test/harness.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('out of order', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraBooking
  let exk: ChartRoom[]
  let dlk: ChartRoom[]
  const today = calendarDateIn('Africa/Lagos')
  const base = [today, DAY].sort().at(-1) ?? DAY
  let day = 0
  const nights = (n = 2) => {
    const from = addDays(base, 30 + day)
    day += n + 1
    return [from, addDays(from, n)] as const
  }
  const exkBar = (arrival: string, departure: string) => ({
    roomTypeId: k.types.exk.id,
    ratePlanId: k.bar.id,
    arrival,
    departure,
  })
  const room = (list: ChartRoom[], index: number) => {
    const found = list[index]
    if (!found) throw new Error(`no room ${index}`)
    return found
  }

  beforeAll(async () => {
    k = await koraBooking(t)
    exk = await roomsOf(t, k.owner.cookie, k.vi.id, k.types.exk.id)
    dlk = await roomsOf(t, k.owner.cookie, k.vi.id, k.types.dlk.id)
  })

  it('takes the room off rooms left on its nights, everywhere', async () => {
    const [from, to] = nights(2)
    const before = (await availabilityOf(t, k.frontDesk.cookie, k.vi.id, from, to)).data
    const left = (a: Availability) =>
      a.roomTypes.find((type) => type.id === k.types.exk.id)?.nights.map((n) => n.left)
    const made = await outOfOrder(
      t,
      k.gm.cookie,
      { propertyId: k.vi.id, roomId: room(exk, 0).id, from, backInService: to },
      { note: 'Compressor fault, part needed' },
    )
    expect(made.status).toBe(200)
    expect(made.data).toMatchObject({ from, backInService: to, reason: 'ac', status: 'active' })
    const after = (await availabilityOf(t, k.frontDesk.cookie, k.vi.id, from, to)).data
    expect(left(after)).toEqual(left(before)?.map((n) => n - 1))
    const chart = await chartOf(t, k.gm.cookie, k.vi.id, { from, days: 7 })
    const night = chart.data.roomTypes.find((type) => type.id === k.types.exk.id)?.nights[0]
    expect(night).toMatchObject({ rooms: 3, outOfOrder: 1, left: 2 })
    expect(chart.data.outOfOrder.map((p) => p.id)).toContain(made.data.id)
    const event = (await auditFor(t, k.orgId, 'room.out_of_order', room(exk, 0).id))[0]
    expect(event?.after).toMatchObject({ nights: 2, reason: 'ac', liveProperty: false })
    expect(event?.after).not.toHaveProperty('exception')
  })

  it('sells nothing on a night the last free room is out of order', async () => {
    const [from, to] = nights(1)
    // Two Executive Kings booked, the third out of order: none left that night.
    await bookStay(t, k.frontDesk.cookie, k.vi.id, exkBar(from, to))
    await bookStay(t, k.frontDesk.cookie, k.vi.id, exkBar(from, to))
    const off = await outOfOrder(t, k.gm.cookie, {
      propertyId: k.vi.id,
      roomId: room(exk, 2).id,
      from,
      backInService: to,
    })
    expect(off.status).toBe(200)
    const offered = (await availabilityOf(t, k.frontDesk.cookie, k.vi.id, from, to)).data
    const type = offered.roomTypes.find((r) => r.id === k.types.exk.id)
    expect(type?.nights[0]?.left).toBe(0)
    expect(type?.soldOut).toEqual([from])
    const chart = await chartOf(t, k.gm.cookie, k.vi.id, { from, days: 7 })
    expect(chart.data.roomTypes.find((r) => r.id === k.types.exk.id)?.nights[0]?.left).toBe(0)
    await expect(bookStay(t, k.frontDesk.cookie, k.vi.id, exkBar(from, to))).rejects.toThrow(
      /SOLD_OUT/,
    )
  })

  it('refuses a room with a booking, a night that would go short, an overlap, the past, too long', async () => {
    const [from, to] = nights(2)
    const stay = await bookStay(t, k.frontDesk.cookie, k.vi.id, exkBar(from, to))
    await assign(t, k.frontDesk.cookie, stay.stay, room(exk, 1).id)
    const ask = { propertyId: k.vi.id, roomId: room(exk, 1).id, from, backInService: to }
    const check = await checkOutOfOrder(t, k.gm.cookie, ask)
    expect(check.data.blockers[0]?.guestName).toBe('Sarah Collins')
    expect(check.data.problem?.code).toBe('OOO_ROOM_HAS_BOOKINGS')
    const refused = await outOfOrder(t, k.gm.cookie, ask)
    expect(refused.data.data?.code).toBe('OOO_ROOM_HAS_BOOKINGS')
    expect(refused.data.message).toMatch(
      /^Room \S+ has Sarah Collins on .+\. Move the booking first\.$/,
    )

    // Two more Executive Kings booked unassigned: all three sold, so any room off is a shortfall.
    await bookStay(t, k.frontDesk.cookie, k.vi.id, exkBar(from, addDays(from, 1)))
    await bookStay(t, k.frontDesk.cookie, k.vi.id, exkBar(from, addDays(from, 1)))
    const short = await outOfOrder(t, k.gm.cookie, { ...ask, roomId: room(exk, 2).id })
    expect(short.data.data?.code).toBe('OOO_WOULD_OVERBOOK')
    expect(short.data.message).toMatch(/^Executive King would be 1 room short on /)
    // The second night still has a room.
    const fine = await outOfOrder(t, k.gm.cookie, {
      ...ask,
      roomId: room(exk, 2).id,
      from: addDays(from, 1),
    })
    expect(fine.status).toBe(200)
    const overlap = await outOfOrder(t, k.gm.cookie, {
      ...ask,
      roomId: room(exk, 2).id,
      from: addDays(from, 1),
      backInService: addDays(to, 2),
    })
    expect(overlap.data.data?.code).toBe('OOO_OVERLAPS')
    const past = await outOfOrder(t, k.gm.cookie, {
      ...ask,
      roomId: room(exk, 2).id,
      from: addDays(DAY, -1),
      backInService: DAY,
    })
    expect(past.data.message).toBe('Out of order can start on 25 Nov 2026 at the earliest.')
    const long = await outOfOrder(t, k.gm.cookie, {
      ...ask,
      roomId: room(dlk, 0).id,
      from: addDays(to, 5),
      backInService: addDays(to, 400),
    })
    expect(long.data.data?.code).toBe('OOO_TOO_LONG')
    const other = await outOfOrder(
      t,
      k.gm.cookie,
      { ...ask, roomId: room(dlk, 0).id, from: addDays(to, 5), backInService: addDays(to, 6) },
      { reason: 'other' },
    )
    expect(other.data.data?.code).toBe('OOO_REASON_REQUIRED')
  })

  it('changes dates, checking only the nights added, and comes back in service or is removed', async () => {
    const [from, to] = nights(2)
    const made = await outOfOrder(t, k.gm.cookie, {
      propertyId: k.vi.id,
      roomId: room(dlk, 1).id,
      from,
      backInService: to,
    })
    const change = (period: OutOfOrderView, extra: Record<string, unknown>) =>
      rpc<OutOfOrderView>(t, k.gm.cookie, 'rooms/outOfOrder/change', {
        idempotencyKey: newId(),
        periodId: period.id,
        version: period.version,
        from: period.from,
        backInService: period.backInService,
        changeReason: 'Part delayed',
        ...extra,
      })
    const longer = await change(made.data, { backInService: addDays(to, 1) })
    expect(longer.status).toBe(200)
    expect(longer.data.version).toBe(2)
    const changed = (await auditFor(t, k.orgId, 'room.out_of_order_changed', room(dlk, 1).id))[0]
    expect(changed?.after).toMatchObject({ nightsAdded: [to], nightsRemoved: [] })
    const stale = await change(made.data, { backInService: addDays(to, 2) })
    expect(stale.data.data?.code).toBe('OOO_CHANGED')
    const removed = await rpc<OutOfOrderView>(t, k.gm.cookie, 'rooms/outOfOrder/end', {
      idempotencyKey: newId(),
      periodId: longer.data.id,
      version: longer.data.version,
      changeReason: 'Fixed early',
    })
    expect(removed.data.status).toBe('removed')

    // A current one: started yesterday, back in service today, the room clean as the GM says.
    const room2 = room(dlk, 2)
    const current = await outOfOrder(t, k.gm.cookie, {
      propertyId: k.vi.id,
      roomId: room2.id,
      from: DAY,
      backInService: addDays(DAY, 3),
    })
    expect(current.status).toBe(200)
    const [dirty] = await t.db
      .select({ status: rooms.housekeepingStatus })
      .from(rooms)
      .where(eq(rooms.id, room2.id))
    expect(dirty?.status).toBe('dirty')
    await setHotel(t, k.vi.id, { businessDate: addDays(DAY, 1) })
    try {
      const back = await rpc<OutOfOrderView>(t, k.gm.cookie, 'rooms/outOfOrder/end', {
        idempotencyKey: newId(),
        periodId: current.data.id,
        version: current.data.version,
        status: 'clean',
        changeReason: 'AC fixed',
      })
      expect(back.data).toMatchObject({ status: 'active', backInService: addDays(DAY, 1) })
      const [clean] = await t.db
        .select({ status: rooms.housekeepingStatus })
        .from(rooms)
        .where(eq(rooms.id, room2.id))
      expect(clean?.status).toBe('clean')
      const ended = await rpc(t, k.gm.cookie, 'rooms/outOfOrder/change', {
        idempotencyKey: newId(),
        periodId: current.data.id,
        version: back.data.version,
        from: DAY,
        backInService: addDays(DAY, 4),
        changeReason: 'Again',
      })
      expect(ended.data.data?.code).toBe('OOO_ENDED')
    } finally {
      await setHotel(t, k.vi.id, { businessDate: DAY })
    }
  })

  it('names the exception on a live hotel and stops archiving a room with a period or a booking', async () => {
    await setHotel(t, k.vi.id, { liveSince: addDays(DAY, -10) })
    try {
      const [from, to] = nights(1)
      const made = await outOfOrder(t, k.gm.cookie, {
        propertyId: k.vi.id,
        roomId: room(dlk, 3).id,
        from,
        backInService: to,
      })
      const event = (await auditFor(t, k.orgId, 'room.out_of_order', room(dlk, 3).id))[0]
      expect(event?.after).toMatchObject({ exception: 'out_of_order', liveProperty: true })
      const archive = await rpc(t, k.owner.cookie, 'rooms/archive', {
        propertyId: k.vi.id,
        ids: [room(dlk, 3).id],
        reason: 'Closing it',
      })
      expect(archive.data.data?.code).toBe('ROOM_OUT_OF_ORDER_PERIOD')
      expect(made.status).toBe(200)
      const [a, b] = nights(1)
      const stay = await bookStay(t, k.frontDesk.cookie, k.vi.id, {
        roomTypeId: k.types.dlk.id,
        ratePlanId: k.bar.id,
        arrival: a,
        departure: b,
      })
      await assign(t, k.frontDesk.cookie, stay.stay, room(dlk, 4).id)
      const moving = await rpc(t, k.owner.cookie, 'rooms/changeType', {
        propertyId: k.vi.id,
        ids: [room(dlk, 4).id],
        roomTypeId: k.types.exk.id,
        reason: 'Refit',
      })
      expect(moving.data.data?.code).toBe('ROOM_HAS_BOOKINGS')
    } finally {
      await setHotel(t, k.vi.id, { liveSince: null })
    }
  })

  it('is for the GM, housekeeping supervisor and maintenance, not the front desk', async () => {
    const [from, to] = nights(1)
    const ask = { propertyId: k.vi.id, roomId: room(dlk, 5).id, from, backInService: to }
    const desk = await outOfOrder(t, k.frontDesk.cookie, ask)
    expect(desk.status).toBe(403)
    expect(desk.data.message).toBe(
      'Only a GM or housekeeping supervisor can put a room out of order. Ask your GM.',
    )
    const supervisor = await person(t, k.orgId, 'Grace Akpan', 'housekeeping_supervisor')
    await limitTo(t, k.owner, supervisor, [k.vi.id])
    expect((await outOfOrder(t, supervisor.cookie, ask)).status).toBe(200)
    const outside = await outOfOrder(t, k.other.cookie, ask)
    expect(outside.status).toBe(404)
  })
})
