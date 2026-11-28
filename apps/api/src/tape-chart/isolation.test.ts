// Organization isolation and property scoping for the room procedures (spec: "Organization
// isolation", "Property scoping"): another group's member and a member limited to Kora Ikeja GRA
// can't read or change Kora Victoria Island's out-of-order periods, room statuses or room options.
import type { ChartRoom } from '@vento/shared'
import { addDays, newId } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { roomOutOfOrder, rooms } from '../db/schema/rooms.ts'
import { bookStay, rpc } from '../reservations/change/testing.ts'
import { DAY, type KoraBooking, koraBooking } from '../reservations/testing.ts'
import { limitTo, type Person, person } from '../tenancy/testing.ts'
import { createTestApp } from '../test/harness.ts'
import { checkOutOfOrder, outOfOrder, roomsOf, setStatus } from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('room procedures stay inside the group and the member’s hotels', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraBooking
  let room: ChartRoom
  let ikejaGm: Person
  let periodId: string
  let stay: { id: string; version: number }

  beforeAll(async () => {
    k = await koraBooking(t)
    const dlk = await roomsOf(t, k.owner.cookie, k.vi.id, k.types.dlk.id)
    const first = dlk[0]
    if (!first) throw new Error('no room')
    room = first
    ikejaGm = await person(t, k.orgId, 'Bola Ikeja', 'general_manager')
    await limitTo(t, k.owner, ikejaGm, [k.ikeja.id])
    const made = await outOfOrder(t, k.gm.cookie, {
      propertyId: k.vi.id,
      roomId: room.id,
      from: addDays(DAY, 60),
      backInService: addDays(DAY, 62),
    })
    periodId = made.data.id
    const booked = await bookStay(t, k.frontDesk.cookie, k.vi.id, {
      roomTypeId: k.types.dlk.id,
      ratePlanId: k.bar.id,
      arrival: addDays(DAY, 70),
      departure: addDays(DAY, 71),
    })
    stay = booked.stay
  })

  const outsiders = () => [
    { who: 'another group', cookie: k.other.cookie },
    { who: 'a GM limited to Ikeja', cookie: ikejaGm.cookie },
  ]

  it('hides out of order: check, create, change and end', async () => {
    for (const { who, cookie } of outsiders()) {
      const ask = {
        propertyId: k.vi.id,
        roomId: room.id,
        from: addDays(DAY, 80),
        backInService: addDays(DAY, 81),
      }
      expect((await checkOutOfOrder(t, cookie, ask)).status, who).toBe(404)
      expect((await outOfOrder(t, cookie, ask)).status, who).toBe(404)
      const change = await rpc(t, cookie, 'rooms/outOfOrder/change', {
        idempotencyKey: newId(),
        periodId,
        version: 1,
        from: addDays(DAY, 60),
        backInService: addDays(DAY, 63),
        changeReason: 'Not mine',
      })
      expect(change.status, who).toBe(404)
      const end = await rpc(t, cookie, 'rooms/outOfOrder/end', {
        idempotencyKey: newId(),
        periodId,
        version: 1,
        changeReason: 'Not mine',
      })
      expect(end.status, who).toBe(404)
    }
    const [period] = await t.db.select().from(roomOutOfOrder).where(eq(roomOutOfOrder.id, periodId))
    expect(period).toMatchObject({ version: 1, status: 'active', backInService: addDays(DAY, 62) })
    const count = await t.db.select().from(roomOutOfOrder).where(eq(roomOutOfOrder.roomId, room.id))
    expect(count).toHaveLength(1)
  })

  it('hides room status and room options', async () => {
    const [before] = await t.db.select().from(rooms).where(eq(rooms.id, room.id))
    for (const { who, cookie } of outsiders()) {
      const status = await setStatus(t, cookie, k.vi.id, room.id, 'dirty')
      expect(status.status, who).toBe(404)
      const options = await rpc(t, cookie, 'stays/roomOptions', {
        stayId: stay.id,
        version: stay.version,
      })
      expect(options.status, who).toBe(404)
    }
    // The Ikeja GM's own hotel with a Victoria Island room: not found either.
    const crossed = await setStatus(t, ikejaGm.cookie, k.ikeja.id, room.id, 'dirty')
    expect(crossed.status).toBe(404)
    const [after] = await t.db.select().from(rooms).where(eq(rooms.id, room.id))
    expect(after?.housekeepingStatus).toBe(before?.housekeepingStatus)
    expect(after?.housekeepingStatusAt).toEqual(before?.housekeepingStatusAt)
  })
})
