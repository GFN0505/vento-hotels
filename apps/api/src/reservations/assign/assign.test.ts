// Assigning and moving rooms, a modify with a room, an upgrade at the booked price and a booking
// from a chart cell, against the test database through the real HTTP flow (spec:
// stage-1-tape-chart.md, "Tests"). Kora Victoria Island, business date 25 Nov 2026: Deluxe King
// (6 rooms) Bed & breakfast ₦168,000.00, Executive King (3 rooms) Bed & breakfast ₦228,000.00.
import type { ApprovalView, ChartRoom, RoomOptions } from '@vento/shared'
import { addDays, calendarDateIn, newId } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { at, auditFor, type KoraApprovals, koraApprovals, PINS } from '../../approvals/testing.ts'
import { reservationChanges, roomTypeInventory, stays } from '../../db/schema/reservations.ts'
import { setHotel } from '../../finance/testing.ts'
import { assign, chartOf, outOfOrder, roomsOf } from '../../tape-chart/testing.ts'
import { person } from '../../tenancy/testing.ts'
import { createTestApp } from '../../test/harness.ts'
import {
  bookStay,
  cancel,
  detailOf,
  fieldsOf,
  modify,
  quoteChange,
  rpc,
} from '../change/testing.ts'
import { COLLINS, DAY, quote } from '../testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('room assignment and moves', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraApprovals
  let dlk: ChartRoom[]
  let exk: ChartRoom[]
  const today = calendarDateIn('Africa/Lagos')
  const base = [today, DAY].sort().at(-1) ?? DAY
  let day = 0
  // Nights far enough ahead that free cancellation hasn't ended, whatever today is.
  const nights = (n = 2) => {
    const arrival = addDays(base, 20 + day)
    day += n + 1
    return [arrival, addDays(arrival, n)] as const
  }
  const dlkBB = (arrival: string, departure: string) => ({
    roomTypeId: k.types.dlk.id,
    ratePlanId: k.bb.id,
    arrival,
    departure,
  })
  const booked = async (roomTypeId: string, date: string) => {
    const [row] = await t.db
      .select({ booked: roomTypeInventory.booked })
      .from(roomTypeInventory)
      .where(and(eq(roomTypeInventory.roomTypeId, roomTypeId), eq(roomTypeInventory.date, date)))
    return row?.booked ?? 0
  }
  const roomIdOf = async (stayId: string) =>
    (await t.db.select({ roomId: stays.roomId }).from(stays).where(eq(stays.id, stayId)))[0]
      ?.roomId ?? null
  const room = (list: ChartRoom[], index: number) => {
    const found = list[index]
    if (!found) throw new Error(`no room ${index}`)
    return found
  }

  // Books and assigns every Deluxe King room not listed, for the nights given.
  const fillDeluxeKing = async (arrival: string, departure: string, skip: string[]) => {
    for (const r of dlk) {
      if (skip.includes(r.id)) continue
      const filler = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const done = await assign(t, k.frontDesk.cookie, filler.stay, r.id)
      if (done.status !== 200) throw new Error(`fill failed: ${done.data.message}`)
    }
  }

  beforeAll(async () => {
    k = await koraApprovals(t)
    dlk = await roomsOf(t, k.owner.cookie, k.vi.id, k.types.dlk.id)
    exk = await roomsOf(t, k.owner.cookie, k.vi.id, k.types.exk.id)
  })

  describe('within the room type', () => {
    it('assigns, moves and removes a room without touching inventory, with Undo-able events', async () => {
      const [arrival, departure] = nights()
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const before = await booked(k.types.dlk.id, arrival)
      const first = await assign(t, k.frontDesk.cookie, b.stay, room(dlk, 0).id, {
        source: 'chart_drag',
      })
      expect(first.status).toBe(200)
      expect(first.data.room?.number).toBe(room(dlk, 0).number)
      expect(first.data.version).toBe(b.stay.version + 1)
      expect(await booked(k.types.dlk.id, arrival)).toBe(before)
      const moved = await assign(
        t,
        k.frontDesk.cookie,
        { id: b.stay.id, version: first.data.version },
        room(dlk, 1).id,
        { reason: 'guest_request' },
      )
      expect(moved.data.previous?.number).toBe(room(dlk, 0).number)
      const detail = await detailOf(t, k.frontDesk.cookie, b.id)
      expect(detail.stays[0]?.room?.number).toBe(room(dlk, 1).number)
      expect(detail.actions.roomMove).toBe(true)
      expect(detail.activity.map((line) => line.title)).toEqual(
        expect.arrayContaining([
          `Room ${room(dlk, 0).number} assigned`,
          `Room ${room(dlk, 0).number} → ${room(dlk, 1).number}`,
        ]),
      )
      expect(detail.activity.find((line) => line.title.includes('→'))?.detail).toBe('Guest request')
      const removed = await assign(
        t,
        k.frontDesk.cookie,
        { id: b.stay.id, version: moved.data.version },
        null,
      )
      expect(removed.data.room).toBeNull()
      expect(await roomIdOf(b.stay.id)).toBeNull()
      const events = await auditFor(t, k.orgId, 'stay.room_moved', b.id)
      expect(events[0]?.after).toMatchObject({ source: 'dialog', moveReason: 'guest_request' })
      expect((await auditFor(t, k.orgId, 'stay.room_unassigned', b.id)).length).toBe(1)
      expect(await booked(k.types.dlk.id, arrival)).toBe(before)
    })

    it('refuses a room taken on any night, out of order, of another type, or a stale version', async () => {
      const [arrival, departure] = nights(3)
      const a = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const b = await bookStay(
        t,
        k.frontDesk.cookie,
        k.vi.id,
        dlkBB(addDays(arrival, 2), addDays(departure, 2)),
      )
      expect((await assign(t, k.frontDesk.cookie, a.stay, room(dlk, 2).id)).status).toBe(200)
      const taken = await assign(t, k.frontDesk.cookie, b.stay, room(dlk, 2).id)
      expect(taken.data.data?.code).toBe('ROOM_TAKEN')
      expect(taken.data.message).toMatch(new RegExp(`^${room(dlk, 2).number} was just taken for `))
      const wrongType = await assign(t, k.frontDesk.cookie, b.stay, room(exk, 0).id)
      expect(wrongType.data.data?.code).toBe('ROOM_WRONG_TYPE')
      const off = await outOfOrder(t, k.gm.cookie, {
        propertyId: k.vi.id,
        roomId: room(dlk, 3).id,
        from: addDays(arrival, 3),
        backInService: addDays(arrival, 4),
      })
      expect(off.status).toBe(200)
      const ooo = await assign(t, k.frontDesk.cookie, b.stay, room(dlk, 3).id)
      expect(ooo.data.data?.code).toBe('ROOM_OUT_OF_ORDER')
      const stale = await assign(t, k.frontDesk.cookie, { ...a.stay, version: 1 }, room(dlk, 4).id)
      expect(stale.data.data?.code).toBe('RESERVATION_CHANGED')
    })

    it('replays a resent assignment once and refuses the key for another room', async () => {
      const [arrival, departure] = nights()
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const key = newId()
      const first = await assign(t, k.frontDesk.cookie, b.stay, room(dlk, 0).id, {
        idempotencyKey: key,
      })
      const again = await assign(t, k.frontDesk.cookie, b.stay, room(dlk, 0).id, {
        idempotencyKey: key,
      })
      expect(again.data).toEqual(first.data)
      const other = await assign(t, k.frontDesk.cookie, b.stay, room(dlk, 1).id, {
        idempotencyKey: key,
      })
      expect(other.data.data?.code).toBe('IDEMPOTENCY_CONFLICT')
      const rows = await t.db
        .select()
        .from(reservationChanges)
        .where(eq(reservationChanges.idempotencyKey, key))
      expect(rows).toHaveLength(1)
    })

    it('says who has the old room when Undo finds it taken', async () => {
      const [arrival, departure] = nights()
      const a = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const first = await assign(t, k.frontDesk.cookie, a.stay, room(dlk, 0).id)
      const moved = await assign(
        t,
        k.frontDesk.cookie,
        { id: a.stay.id, version: first.data.version },
        room(dlk, 1).id,
      )
      await assign(t, k.frontDesk.cookie, b.stay, room(dlk, 0).id)
      const undo = await assign(
        t,
        k.frontDesk.cookie,
        { id: a.stay.id, version: moved.data.version },
        room(dlk, 0).id,
        { source: 'undo' },
      )
      expect(undo.data.message).toBe(
        `${room(dlk, 0).number} was just taken, so Sarah Collins stays in ${room(dlk, 1).number}.`,
      )
    })

    it('refuses a stay whose arrival has passed, and frees the room on cancel', async () => {
      const arrival = DAY
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, addDays(arrival, 1)))
      await setHotel(t, k.vi.id, { businessDate: addDays(DAY, 1) })
      try {
        const late = await assign(t, k.frontDesk.cookie, b.stay, room(dlk, 5).id)
        expect(late.data.data?.code).toBe('NOT_MOVABLE')
        expect(late.data.message).toBe('Arrival was 25 Nov 2026. Mark it as a no-show.')
      } finally {
        await setHotel(t, k.vi.id, { businessDate: DAY })
      }
      const [from, to] = nights()
      const c = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(from, to))
      const d = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(from, to))
      await assign(t, k.frontDesk.cookie, c.stay, room(dlk, 5).id)
      expect((await cancel(t, k.frontDesk.cookie, c.id)).status).toBe(200)
      expect((await assign(t, k.frontDesk.cookie, d.stay, room(dlk, 5).id)).status).toBe(200)
    })

    it('offers only the booked type while it has a free room, other types once it is full', async () => {
      const [arrival, departure] = nights()
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const other = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      await assign(t, k.frontDesk.cookie, other.stay, room(dlk, 0).id)
      const options = await rpc<RoomOptions>(t, k.frontDesk.cookie, 'stays/roomOptions', {
        stayId: b.stay.id,
        version: b.stay.version,
      })
      expect(options.status).toBe(200)
      expect(options.data.sameType.map((r) => r.number)).not.toContain(room(dlk, 0).number)
      expect(options.data.sameType.length).toBe(dlk.length - 1)
      expect(options.data.otherTypes).toEqual([])
      expect(options.data.stay.soldPerNight).toBe('168000.00')
      expect(options.data.discountLimit).toBe('12.00')
      // Every other Deluxe King taken: Executive King shows as an upgrade with the difference.
      const mine = await assign(t, k.frontDesk.cookie, b.stay, room(dlk, 1).id)
      await fillDeluxeKing(arrival, departure, [room(dlk, 0).id, room(dlk, 1).id])
      const full = await rpc<RoomOptions>(t, k.frontDesk.cookie, 'stays/roomOptions', {
        stayId: b.stay.id,
        version: mine.data.version,
      })
      expect(full.data.sameType).toEqual([])
      expect(
        full.data.otherTypes.find((type) => type.roomTypeId === k.types.exk.id)?.difference,
      ).toBe('60000.00')
    })
  })

  describe('a modify with a room', () => {
    it('keeps the room when it is free on the new nights and drops it when not', async () => {
      const [arrival, departure] = nights(2)
      const a = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const assigned = await assign(t, k.frontDesk.cookie, a.stay, room(dlk, 1).id)
      const fields = {
        ...fieldsOf(a, { departure: addDays(departure, 1) }),
        version: assigned.data.version,
      }
      const quoted = await quoteChange(t, k.frontDesk.cookie, fields)
      expect(quoted.data.room).toMatchObject({
        number: room(dlk, 1).number,
        free: true,
        asked: false,
      })
      expect((await modify(t, k.frontDesk.cookie, fields)).status).toBe(200)
      expect(await roomIdOf(a.stay.id)).toBe(room(dlk, 1).id)
      // Someone takes the room on the night after; extending again drops the room.
      const next = addDays(departure, 1)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(next, addDays(next, 1)))
      await assign(t, k.frontDesk.cookie, b.stay, room(dlk, 1).id)
      const again = { ...fields, departure: addDays(next, 1), version: fields.version + 1 }
      const blocked = await quoteChange(t, k.frontDesk.cookie, again)
      expect(blocked.data.room).toMatchObject({
        free: false,
        blockedOn: next,
        blockedBy: 'Collins S.',
      })
      // Asked for (a drag that keeps the room): refused.
      const asked = await modify(t, k.frontDesk.cookie, { ...again, roomId: room(dlk, 1).id })
      expect(asked.data.data?.code).toBe('ROOM_TAKEN')
      // Left out (Modify): saved, unassigned.
      expect((await modify(t, k.frontDesk.cookie, again)).status).toBe(200)
      expect(await roomIdOf(a.stay.id)).toBeNull()
      const modified = await auditFor(t, k.orgId, 'reservation.modified', a.id)
      expect(modified[0]?.after).toMatchObject({ roomId: null, roomUnassigned: 'modify_not_free' })
    })

    it('refuses a move to another type while a room of the booked type is free', async () => {
      const [arrival, departure] = nights(2)
      const a = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const fields = fieldsOf(a, { roomTypeId: k.types.exk.id, roomId: room(exk, 1).id })
      const quoted = await quoteChange(t, k.frontDesk.cookie, fields)
      expect(quoted.data.data?.code).toBe('BOOKED_TYPE_FREE')
      expect(quoted.data.message).toBe(
        'A Deluxe King room is free for these nights. Assign one of those: other room types are for when Deluxe King is full.',
      )
      const saved = await rpc(t, k.frontDesk.cookie, 'reservations/modify', {
        idempotencyKey: newId(),
        ...fields,
        changeHash: 'any',
      })
      expect(saved.data.data?.code).toBe('BOOKED_TYPE_FREE')
      // Modify's own room type change (no room) is a booking change and stays allowed.
      const quotedType = await quoteChange(
        t,
        k.frontDesk.cookie,
        fieldsOf(a, { roomTypeId: k.types.exk.id }),
      )
      expect(quotedType.status).toBe(200)
    })

    it('moves to another type re-priced, or at the booked price as an Upgrade discount with approval', async () => {
      const [arrival, departure] = nights(2)
      const guest = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      // Deluxe King is full in rooms for these nights, so the upgrade path opens.
      const inRoom = await assign(t, k.frontDesk.cookie, guest.stay, room(dlk, 0).id)
      await fillDeluxeKing(arrival, departure, [room(dlk, 0).id])
      const a = { ...guest, stay: { ...guest.stay, version: inRoom.data.version } }
      const charge = fieldsOf(a, { roomTypeId: k.types.exk.id, roomId: room(exk, 0).id })
      const priced = await quoteChange(t, k.frontDesk.cookie, charge)
      expect(priced.status).toBe(200)
      expect(priced.data.nights[0]?.soldPrice).toBe('228000.00')
      expect(priced.data.room).toMatchObject({
        number: room(exk, 0).number,
        free: true,
        asked: true,
      })
      const keep = { ...charge, keepBookedPrice: { note: 'Service recovery, last stay AC' } }
      const kept = await quoteChange(t, k.frontDesk.cookie, keep)
      expect(kept.data.nights.map((n) => n.soldPrice)).toEqual(['168000.00', '168000.00'])
      expect(kept.data.discount).toMatchObject({ percent: '26.32', within: false, limit: '12.00' })
      expect(kept.data.keptPrice).toEqual({
        fromRoomTypeName: 'Deluxe King',
        perNight: '168000.00',
      })
      const exkBefore = await booked(k.types.exk.id, arrival)
      const dlkBefore = await booked(k.types.dlk.id, arrival)
      const over = await modify(t, k.frontDesk.cookie, keep, { source: 'tape_chart' })
      expect(over.data.data?.code).toBe('DISCOUNT_OVER_LIMIT')
      const key = newId()
      const approval = await rpc<ApprovalView>(
        t,
        at(k.frontDesk, k.deviceCookie),
        'approvals/approveHere',
        {
          kind: 'modify_discount',
          change: { ...keep, idempotencyKey: key },
          idempotencyKey: newId(),
          approverMemberId: k.gm.memberId,
          pin: PINS.tunde,
        },
      )
      expect(approval.status).toBe(200)
      expect(approval.data.subject).toMatchObject({
        fromRoomTypeName: 'Deluxe King',
        reason: 'upgrade',
      })
      const saved = await rpc(t, k.frontDesk.cookie, 'reservations/modify', {
        ...keep,
        idempotencyKey: key,
        changeHash: kept.data.changeHash,
        approvalId: approval.data.id,
        source: 'tape_chart',
      })
      expect(saved.status).toBe(200)
      expect(await roomIdOf(a.stay.id)).toBe(room(exk, 0).id)
      expect(await booked(k.types.exk.id, arrival)).toBe(exkBefore + 1)
      expect(await booked(k.types.dlk.id, arrival)).toBe(dlkBefore - 1)
      const discount = await auditFor(t, k.orgId, 'stay.discount_applied', a.id)
      expect(discount[0]?.after).toMatchObject({
        discountReason: 'upgrade',
        approverName: 'Tunde Bello',
        exception: 'discount',
      })
      const moved = await auditFor(t, k.orgId, 'stay.room_moved', a.id)
      expect(moved[0]?.after).toMatchObject({ keptBookedPrice: true, approverName: 'Tunde Bello' })
      const detail = await detailOf(t, k.frontDesk.cookie, a.id)
      expect(detail.stays[0]?.discount?.reason).toBe('upgrade')
    })

    it('needs room.move to name a room', async () => {
      const [arrival, departure] = nights(1)
      const a = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const fields = fieldsOf(a, { roomId: room(dlk, 2).id })
      await t.rpc(k.owner.cookie, 'permissions/set', {
        role: 'front_desk',
        permission: 'room.move',
        allowed: false,
        reason: 'Test',
      })
      try {
        const refused = await quoteChange(t, k.frontDesk.cookie, fields)
        expect(refused.status).toBe(403)
      } finally {
        await t.rpc(k.owner.cookie, 'permissions/set', {
          role: 'front_desk',
          permission: 'room.move',
          allowed: true,
          reason: 'Test',
        })
      }
    })
  })

  describe('a booking from a chart cell', () => {
    it('assigns the room in the booking, and refuses one taken meanwhile', async () => {
      const [arrival, departure] = nights(1)
      const stay = { ...dlkBB(arrival, departure), adults: 1, children: 0 }
      const quoted = await quote(t, k.frontDesk.cookie, k.vi.id, stay)
      const create = (roomId: string) =>
        rpc<{ id: string }>(t, k.frontDesk.cookie, 'reservations/create', {
          idempotencyKey: newId(),
          propertyId: k.vi.id,
          guest: COLLINS,
          source: 'direct',
          stays: [{ ...stay, quoteHash: quoted.data.quoteHash, roomId }],
        })
      const made = await create(room(dlk, 3).id)
      expect(made.status).toBe(200)
      const detail = await detailOf(t, k.frontDesk.cookie, made.data.id)
      expect(detail.stays[0]?.room?.number).toBe(room(dlk, 3).number)
      expect(
        (await auditFor(t, k.orgId, 'stay.room_assigned', made.data.id))[0]?.after,
      ).toMatchObject({ source: 'booking' })
      const taken = await create(room(dlk, 3).id)
      expect(taken.data.data).toMatchObject({ code: 'ROOM_TAKEN', bookWithoutRoom: true })
      expect(taken.data.message).toMatch(
        /^Room \S+ was just taken for .+ Book without a room, or pick another\.$/,
      )
    })
  })

  describe('a booking from a chart cell, on a night the room isn’t free', () => {
    it('refuses a booking whose nights cover the room out of order or taken', async () => {
      const [arrival, departure] = nights(3)
      await outOfOrder(t, k.gm.cookie, {
        propertyId: k.vi.id,
        roomId: room(dlk, 4).id,
        from: addDays(arrival, 2),
        backInService: departure,
      })
      const stay = { ...dlkBB(arrival, departure), adults: 1, children: 0 }
      const quoted = await quote(t, k.frontDesk.cookie, k.vi.id, stay)
      const made = await rpc<{ id: string }>(t, k.frontDesk.cookie, 'reservations/create', {
        idempotencyKey: newId(),
        propertyId: k.vi.id,
        guest: COLLINS,
        source: 'direct',
        stays: [{ ...stay, quoteHash: quoted.data.quoteHash, roomId: room(dlk, 4).id }],
      })
      expect(made.data.data?.code).toBe('ROOM_OUT_OF_ORDER')
      expect(made.data.message).toMatch(new RegExp(`^${room(dlk, 4).number} is out of order `))
    })
  })

  describe('isolation and permissions', () => {
    it('keeps rooms and stays inside the group and needs room.move', async () => {
      const [arrival, departure] = nights(1)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const outside = await assign(t, k.other.cookie, b.stay, room(dlk, 0).id)
      expect(outside.status).toBe(404)
      const cashier = await assign(t, k.cashier.cookie, b.stay, room(dlk, 0).id)
      expect(cashier.status).toBe(403)
      expect(cashier.data.message).toBe(
        'Only front desk, revenue managers, GMs and the owner can move rooms. Ask your GM.',
      )
      const attendant = await person(t, k.orgId, 'Blessing Udo', 'room_attendant')
      expect((await assign(t, attendant.cookie, b.stay, room(dlk, 0).id)).status).toBe(403)
      const chart = await chartOf(t, k.other.cookie, k.vi.id)
      expect(chart.data.data?.code).toBe('PROPERTY_NOT_FOUND')
      expect(await roomIdOf(b.stay.id)).toBeNull()
    })
  })
})
