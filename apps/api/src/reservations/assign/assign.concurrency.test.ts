// Room moves and out of order racing each other and bookings on separate connections (spec:
// stage-1-tape-chart.md, "Availability locking", "Tests"). A gate holds a room row (or an inventory
// row) so both requests are queued on it before either can take it; then exactly one may win. Real
// HTTP through the app, real Postgres. Kora Lekki has Solo (1 room), Pair (4 rooms), Up (1 room),
// Trio (3) and Duo (2);
// every race stays within the two years a booking can be made ahead.
import type { ChartRoom, Property, RatePlanView, RoomTypeView } from '@vento/shared'
import { addDays, newId } from '@vento/shared'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { roomTypeInventory, stayNights, stays } from '../../db/schema/reservations.ts'
import { roomOutOfOrder, rooms } from '../../db/schema/rooms.ts'
import { setHotel } from '../../finance/testing.ts'
import { createType, floorRooms } from '../../rooms/testing.ts'
import { assign, outOfOrder, roomsOf } from '../../tape-chart/testing.ts'
import { LAGOS_ADDRESS } from '../../test/addresses.ts'
import { createTestApp } from '../../test/harness.ts'
import { bookStay, fieldsOf, quoteChange, type Result, rpc } from '../change/testing.ts'
import { DAY, type KoraBooking, koraBooking } from '../testing.ts'

const url = process.env.TEST_DATABASE_URL
const ROUNDS = Number(process.env.RACE_ROUNDS ?? 200)
type Key = 'solo' | 'pair' | 'up' | 'trio' | 'duo'

describe.skipIf(!url)('room moves under concurrency', { timeout: 900_000 }, () => {
  const t = createTestApp(url ?? '', { max: 8 })
  const gate = new pg.Client({ connectionString: url })
  afterAll(async () => {
    await gate.end()
    await t.close()
  })
  let k: KoraBooking
  let lekki: Property
  const types = {} as Record<Key, RoomTypeView>
  const roomsOfType = {} as Record<Key, ChartRoom[]>
  let bar: RatePlanView

  const room = (type: Key, index = 0) => {
    const found = roomsOfType[type][index]
    if (!found) throw new Error(`no ${type} room ${index}`)
    return found
  }

  beforeAll(async () => {
    await gate.connect()
    k = await koraBooking(t)
    lekki = (
      await t.rpc<Property>(k.owner.cookie, 'properties/create', {
        entityId: k.hospitality.id,
        name: 'Kora Lekki',
        ...LAGOS_ADDRESS,
        area: 'Lekki Phase 1',
      })
    ).data
    await setHotel(t, lekki.id, { businessDate: DAY })
    await t.rpc(k.finance.cookie, 'taxes/setUp', { propertyId: lekki.id })
    const counts = { solo: 1, pair: 4, up: 1, trio: 3, duo: 2 } as const
    let floor = 1
    for (const key of ['solo', 'pair', 'up', 'trio', 'duo'] as const) {
      types[key] = await createType(t, k.owner.cookie, lekki.id, {
        name: key[0]?.toUpperCase() + key.slice(1),
        code: key.toUpperCase(),
      })
      await t.rpc(k.owner.cookie, 'rooms/createMany', {
        propertyId: lekki.id,
        batchId: newId(),
        rooms: floorRooms(types[key].id, floor++, 1, counts[key]),
      })
    }
    const plans = await t.rpc<{ plans: RatePlanView[] }>(k.owner.cookie, 'ratePlans/createFirst', {
      propertyId: lekki.id,
      prices: [
        { roomTypeId: types.solo.id, weekday: '90000' },
        { roomTypeId: types.pair.id, weekday: '100000' },
        { roomTypeId: types.up.id, weekday: '150000' },
        { roomTypeId: types.trio.id, weekday: '110000' },
        { roomTypeId: types.duo.id, weekday: '120000' },
      ],
    })
    const first = plans.data.plans[0]
    if (!first) throw new Error('no plan at Lekki')
    bar = first
    for (const key of ['solo', 'pair', 'up', 'trio', 'duo'] as const) {
      roomsOfType[key] = await roomsOf(t, k.owner.cookie, lekki.id, types[key].id)
    }
  })

  const stayOf = (key: Key, arrival: string, nights = 1) => ({
    roomTypeId: types[key].id,
    ratePlanId: bar.id,
    arrival,
    departure: addDays(arrival, nights),
  })
  const book = (key: Key, arrival: string, nights = 1) =>
    bookStay(t, k.owner.cookie, lekki.id, stayOf(key, arrival, nights))

  async function waitForWaiters(n: number) {
    const deadline = Date.now() + 10_000
    for (;;) {
      await gate.query('select pg_stat_clear_snapshot()')
      // Only backends queued behind the gate count: other test files run at the same time against
      // the same database and wait on their own locks.
      const waiting = await gate.query(
        `with recursive queued as (
           select pid from pg_stat_activity where pg_backend_pid() = any(pg_blocking_pids(pid))
           union
           select a.pid from pg_stat_activity a join queued q on q.pid = any(pg_blocking_pids(a.pid))
         )
         select count(*)::int as n from queued`,
      )
      if (waiting.rows[0].n >= n) return
      if (Date.now() > deadline) throw new Error('the requests never reached the lock')
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
  }

  // Holds a row (a room, or a night's inventory), fires the requests one after another (each queued
  // before the next starts), then lets go.
  async function throughGate<T>(
    lock: { sql: string; params: unknown[] },
    requests: (() => Promise<T>)[],
  ) {
    await gate.query('begin')
    await gate.query(lock.sql, lock.params)
    const pending: Promise<T>[] = []
    for (const request of requests) {
      pending.push(request())
      await waitForWaiters(pending.length)
    }
    await gate.query('commit')
    return Promise.all(pending)
  }
  const roomGate = (roomId: string) => ({
    sql: 'select id from rooms where id = $1 for update',
    params: [roomId],
  })
  async function inventoryGate(roomTypeId: string, date: string) {
    await gate.query(
      `insert into room_type_inventory (organization_id, property_id, room_type_id, date)
       select organization_id, property_id, id, $2::date from room_types where id = $1
       on conflict (room_type_id, date) do nothing`,
      [roomTypeId, date],
    )
    return {
      sql: 'select booked from room_type_inventory where room_type_id = $1 and date = $2 for update',
      params: [roomTypeId, date],
    }
  }
  const staysIn = async (roomId: string, date: string) =>
    (
      await t.db
        .select({ value: count() })
        .from(stays)
        .where(
          and(
            eq(stays.roomId, roomId),
            inArray(stays.status, ['confirmed', 'checked_in']),
            sql`${stays.arrival} <= ${date} and ${stays.departure} > ${date}`,
          ),
        )
    )[0]?.value ?? 0
  const periodsOn = async (roomId: string, date: string) =>
    (
      await t.db
        .select({ value: count() })
        .from(roomOutOfOrder)
        .where(
          and(
            eq(roomOutOfOrder.roomId, roomId),
            eq(roomOutOfOrder.status, 'active'),
            sql`${roomOutOfOrder.fromDate} <= ${date} and ${roomOutOfOrder.backInService} > ${date}`,
          ),
        )
    )[0]?.value ?? 0

  it(`gives the last free room to one of two assignments, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const night = addDays(DAY, 1 + round)
      const a = await book('pair', night)
      const b = await book('pair', night)
      const target = room('pair', round % 2)
      const results = (await throughGate(roomGate(target.id), [
        () => assign(t, k.owner.cookie, a.stay, target.id),
        () => assign(t, k.owner.cookie, b.stay, target.id),
      ])) as Result<unknown>[]
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      expect(results.find((r) => r.status !== 200)?.data.data?.code).toBe('ROOM_TAKEN')
      expect(await staysIn(target.id, night)).toBe(1)
    }
  })

  it(`lets one of an out-of-order and a booking of the last room win, ${ROUNDS} rounds`, async () => {
    let periods = 0
    for (let round = 0; round < ROUNDS; round++) {
      const night = addDays(DAY, 1 + round)
      const quoted = await t.rpc<{ quoteHash: string }>(k.owner.cookie, 'reservations/quote', {
        propertyId: lekki.id,
        adults: 1,
        children: 0,
        ...stayOf('solo', night),
      })
      const create = () =>
        rpc(t, k.owner.cookie, 'reservations/create', {
          idempotencyKey: newId(),
          propertyId: lekki.id,
          guest: {
            kind: 'new',
            fields: {
              firstName: 'Ada',
              lastName: 'Race',
              phone: '+2348030000000',
              nationality: 'NG',
            },
          },
          source: 'phone',
          stays: [
            { adults: 1, children: 0, ...stayOf('solo', night), quoteHash: quoted.data.quoteHash },
          ],
        })
      const off = () =>
        outOfOrder(t, k.owner.cookie, {
          propertyId: lekki.id,
          roomId: room('solo').id,
          from: night,
          backInService: addDays(night, 1),
        })
      const order = round % 2 === 0 ? [create, off] : [off, create]
      const results = (await throughGate(
        await inventoryGate(types.solo.id, night),
        order,
      )) as Result<unknown>[]
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      const loser = results.find((r) => r.status !== 200)?.data.data?.code
      expect(['SOLD_OUT', 'OOO_WOULD_OVERBOOK']).toContain(loser)
      if (loser === 'SOLD_OUT') periods++
    }
    expect(periods).toBeGreaterThan(0)
  })

  it(`lets one of an out-of-order and an assignment to the same room win, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      // The first race's nights: two Pair rooms are taken, room 3 is free.
      const night = addDays(DAY, 1 + round)
      const a = await book('pair', night)
      const target = room('pair', 2)
      const order: (() => Promise<Result<unknown>>)[] = [
        () => assign(t, k.owner.cookie, a.stay, target.id),
        () =>
          outOfOrder(t, k.owner.cookie, {
            propertyId: lekki.id,
            roomId: target.id,
            from: night,
            backInService: addDays(night, 1),
          }),
      ]
      const results = (await throughGate(
        roomGate(target.id),
        round % 2 === 0 ? order : order.reverse(),
      )) as Result<unknown>[]
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      const loser = results.find((r) => r.status !== 200)?.data.data?.code
      expect(['ROOM_OUT_OF_ORDER', 'OOO_ROOM_HAS_BOOKINGS']).toContain(loser)
      expect((await staysIn(target.id, night)) + (await periodsOn(target.id, night))).toBe(1)
    }
  })

  it(`lets one of a drag-extend and an assignment take a room's new night, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const night = addDays(DAY, 201 + round * 2)
      const next = addDays(night, 1)
      const target = room('pair', 0)
      const a = await book('pair', night)
      const assigned = await assign(t, k.owner.cookie, a.stay, target.id)
      const fields = {
        ...fieldsOf(a, { departure: addDays(next, 1), roomId: target.id }),
        version: assigned.data.version,
      }
      const quoted = await quoteChange(t, k.owner.cookie, fields)
      expect(quoted.data.room?.free).toBe(true)
      const b = await book('pair', next)
      const extend = () =>
        rpc(t, k.owner.cookie, 'reservations/modify', {
          idempotencyKey: newId(),
          ...fields,
          changeHash: quoted.data.changeHash,
          source: 'tape_chart',
        })
      const take = () => assign(t, k.owner.cookie, b.stay, target.id)
      const results = (await throughGate(
        roomGate(target.id),
        round % 2 === 0 ? [extend, take] : [take, extend],
      )) as Result<unknown>[]
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      expect(results.find((r) => r.status !== 200)?.data.data?.code).toBe('ROOM_TAKEN')
      expect(await staysIn(target.id, next)).toBe(1)
    }
  })

  it('never deadlocks when moves cross room types', async () => {
    for (let round = 0; round < Math.min(ROUNDS, 50); round++) {
      const night = addDays(DAY, 610 + round)
      // Each in the only room of its type, so a move to another type is allowed (the booked type
      // is full).
      const solo = await book('solo', night)
      const y = await book('up', night)
      const xIn = await assign(t, k.owner.cookie, solo.stay, room('solo').id)
      const yIn = await assign(t, k.owner.cookie, y.stay, room('up').id)
      const x = { ...solo, stay: { ...solo.stay, version: xIn.data.version } }
      y.stay = { ...y.stay, version: yIn.data.version }
      const xTo = fieldsOf(x, { roomTypeId: types.up.id, roomId: room('up').id })
      const yTo = fieldsOf(y, { roomTypeId: types.pair.id, roomId: room('pair', 3).id })
      const [qx, qy] = await Promise.all([
        quoteChange(t, k.owner.cookie, xTo),
        quoteChange(t, k.owner.cookie, yTo),
      ])
      const results = await Promise.all([
        rpc(t, k.owner.cookie, 'reservations/modify', {
          idempotencyKey: newId(),
          ...xTo,
          changeHash: qx.data.changeHash,
        }),
        rpc(t, k.owner.cookie, 'reservations/modify', {
          idempotencyKey: newId(),
          ...yTo,
          changeHash: qy.data.changeHash,
        }),
      ])
      for (const r of results) {
        expect(r.data.message ?? '').not.toMatch(/deadlock/i)
        expect([200, 409]).toContain(r.status)
      }
    }
  })

  it('keeps every counter equal to its stays and no room double-booked after random races', async () => {
    const start = addDays(DAY, 670)
    let seed = 7
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed / 2_147_483_648
    }
    const made = []
    for (let i = 0; i < 6; i++) {
      try {
        made.push(
          await book(
            'pair',
            addDays(start, Math.floor(random() * 3)),
            1 + Math.floor(random() * 2),
          ),
        )
      } catch {
        // Sold out: fine.
      }
    }
    const work = made.map(async (b, i) => {
      const target = room('pair', i % 2)
      if (i % 3 === 0) return assign(t, k.owner.cookie, b.stay, target.id)
      if (i % 3 === 1) {
        const fields = fieldsOf(b, { departure: addDays(b.stay.departure, 1) })
        const quoted = await quoteChange(t, k.owner.cookie, fields)
        return rpc(t, k.owner.cookie, 'reservations/modify', {
          idempotencyKey: newId(),
          ...fields,
          changeHash: quoted.data.changeHash,
        })
      }
      return rpc(t, k.owner.cookie, 'reservations/cancel', {
        idempotencyKey: newId(),
        reservationId: b.id,
        version: b.stay.version,
        reason: 'guest_request',
      })
    })
    const off = [0, 1].map((i) =>
      outOfOrder(t, k.owner.cookie, {
        propertyId: lekki.id,
        roomId: room('pair', i).id,
        from: addDays(start, 1 + i),
        backInService: addDays(start, 2 + i),
      }),
    )
    const results = await Promise.all([...work, ...off])
    for (const r of results) expect(r.data.message ?? '').not.toMatch(/deadlock/i)
    for (let d = 0; d < 5; d++) {
      const date = addDays(start, d)
      const [row] = await t.db
        .select({ booked: roomTypeInventory.booked })
        .from(roomTypeInventory)
        .where(
          and(eq(roomTypeInventory.roomTypeId, types.pair.id), eq(roomTypeInventory.date, date)),
        )
      const [nights] = await t.db
        .select({ value: count() })
        .from(stayNights)
        .innerJoin(stays, eq(stays.id, stayNights.stayId))
        .where(
          and(
            eq(stays.roomTypeId, types.pair.id),
            eq(stayNights.date, date),
            inArray(stays.status, ['confirmed', 'checked_in']),
          ),
        )
      const booked = row?.booked ?? 0
      expect(booked).toBe(nights?.value ?? 0)
      const off0 = await periodsOn(room('pair', 0).id, date)
      const off1 = await periodsOn(room('pair', 1).id, date)
      expect(booked).toBeLessThanOrEqual(4 - off0 - off1)
      for (const index of [0, 1]) {
        expect(
          (await staysIn(room('pair', index).id, date)) + (index ? off1 : off0),
        ).toBeLessThanOrEqual(1)
      }
    }
  })

  // Creates the night's inventory row if needed and returns the gate on it.
  const createBooking = async (key: Key, night: string) => {
    const quoted = await t.rpc<{ quoteHash: string }>(k.owner.cookie, 'reservations/quote', {
      propertyId: lekki.id,
      adults: 1,
      children: 0,
      ...stayOf(key, night),
    })
    return () =>
      rpc(t, k.owner.cookie, 'reservations/create', {
        idempotencyKey: newId(),
        propertyId: lekki.id,
        guest: {
          kind: 'new',
          fields: {
            firstName: 'Ada',
            lastName: 'Race',
            phone: '+2348030000000',
            nationality: 'NG',
          },
        },
        source: 'phone',
        stays: [
          { adults: 1, children: 0, ...stayOf(key, night), quoteHash: quoted.data.quoteHash },
        ],
      })
  }

  it(`lets one of two out-of-orders take the type's only spare room, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const night = addDays(DAY, 1 + round)
      await book('trio', night)
      await book('trio', night)
      const off = (index: number) => () =>
        outOfOrder(t, k.owner.cookie, {
          propertyId: lekki.id,
          roomId: room('trio', index).id,
          from: night,
          backInService: addDays(night, 1),
        })
      const results = (await throughGate(await inventoryGate(types.trio.id, night), [
        off(round % 2),
        off(1 - (round % 2)),
      ])) as Result<unknown>[]
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      expect(results.find((r) => r.status !== 200)?.data.data?.code).toBe('OOO_WOULD_OVERBOOK')
      expect(
        (await periodsOn(room('trio', 0).id, night)) + (await periodsOn(room('trio', 1).id, night)),
      ).toBe(1)
    }
  })

  it(`lets one of an out-of-order extension and a booking take the last room, ${ROUNDS} rounds`, async () => {
    let extended = 0
    for (let round = 0; round < ROUNDS; round++) {
      const night = addDays(DAY, 1 + round * 3)
      const next = addDays(night, 1)
      await book('duo', next)
      const made = await outOfOrder(t, k.owner.cookie, {
        propertyId: lekki.id,
        roomId: room('duo', 0).id,
        from: night,
        backInService: next,
      })
      expect(made.status).toBe(200)
      const extend = () =>
        rpc(t, k.owner.cookie, 'rooms/outOfOrder/change', {
          idempotencyKey: newId(),
          periodId: made.data.id,
          version: made.data.version,
          from: night,
          backInService: addDays(next, 1),
          changeReason: 'Part delayed',
        })
      const create = await createBooking('duo', next)
      const order = round % 2 === 0 ? [extend, create] : [create, extend]
      const results = (await throughGate(
        await inventoryGate(types.duo.id, next),
        order,
      )) as Result<unknown>[]
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      const loser = results.find((r) => r.status !== 200)?.data.data?.code
      expect(['OOO_WOULD_OVERBOOK', 'SOLD_OUT']).toContain(loser)
      if (loser === 'SOLD_OUT') extended++
    }
    expect(extended).toBeGreaterThan(0)
  })

  it(`keeps the later device time when two status changes race on one room, ${ROUNDS} rounds`, async () => {
    const target = room('up')
    const base = Date.now() - 60 * 60_000
    for (let round = 0; round < ROUNDS; round++) {
      const earlier = new Date(base + round * 2_000).toISOString()
      const later = new Date(base + round * 2_000 + 1_000).toISOString()
      const finalStatus = round % 2 === 0 ? 'dirty' : 'clean'
      const other = finalStatus === 'dirty' ? 'clean' : 'dirty'
      const send = (status: string, occurredAt: string) => () =>
        rpc<{ outcome: string; status: string }>(t, k.owner.cookie, 'rooms/setStatus', {
          idempotencyKey: newId(),
          propertyId: lekki.id,
          roomId: target.id,
          status,
          occurredAt,
        })
      const late = send(finalStatus, later)
      const early = send(other, earlier)
      const results = (await throughGate(
        roomGate(target.id),
        round % 4 < 2 ? [late, early] : [early, late],
      )) as Result<{
        outcome: string
        status: string
      }>[]
      for (const r of results) expect(r.status).toBe(200)
      const [row] = await t.db
        .select({ status: rooms.housekeepingStatus })
        .from(rooms)
        .where(eq(rooms.id, target.id))
      expect(row?.status).toBe(finalStatus)
    }
  })
})
