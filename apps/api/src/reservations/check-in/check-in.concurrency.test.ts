// Check-ins and in-house moves racing each other on separate connections (spec: "Availability
// locking", the race tests). A gate holds the room row so both requests are queued on it before
// either can take it; then exactly one may win, and no room ever holds two stays on a night (the
// services check under the room lock; the exclusion constraints are the last line). Real HTTP,
// real Postgres. Kora Lekki has Pair (2 rooms); every round moves the business date forward so
// each starts on free nights.
import type { ChartRoom, Property, RatePlanView, RoomTypeView } from '@vento/shared'
import { addDays, newId } from '@vento/shared'
import { sql } from 'drizzle-orm'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setHotel } from '../../finance/testing.ts'
import { createType, floorRooms } from '../../rooms/testing.ts'
import { assign, outOfOrder, roomsOf } from '../../tape-chart/testing.ts'
import { LAGOS_ADDRESS } from '../../test/addresses.ts'
import { createTestApp } from '../../test/harness.ts'
import { bookStay } from '../change/testing.ts'
import { DAY, type KoraBooking, koraBooking } from '../testing.ts'
import { checkIn } from './testing.ts'

const url = process.env.TEST_DATABASE_URL
const ROUNDS = Number(process.env.RACE_ROUNDS ?? 100)

describe.skipIf(!url)('check-in under concurrency', { timeout: 900_000 }, () => {
  const t = createTestApp(url ?? '', { max: 8 })
  const gate = new pg.Client({ connectionString: url })
  afterAll(async () => {
    await gate.end()
    await t.close()
  })
  let k: KoraBooking
  let lekki: Property
  let pair: RoomTypeView
  let pairRooms: ChartRoom[]
  let bar: RatePlanView
  let day = DAY

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
    pair = await createType(t, k.owner.cookie, lekki.id, { name: 'Pair', code: 'PAIR' })
    await t.rpc(k.owner.cookie, 'rooms/createMany', {
      propertyId: lekki.id,
      batchId: newId(),
      rooms: floorRooms(pair.id, 1, 1, 2),
    })
    const plans = await t.rpc<{ plans: RatePlanView[] }>(k.owner.cookie, 'ratePlans/createFirst', {
      propertyId: lekki.id,
      prices: [{ roomTypeId: pair.id, weekday: '100000' }],
    })
    const first = plans.data.plans[0]
    if (!first) throw new Error('no plan at Lekki')
    bar = first
    pairRooms = await roomsOf(t, k.owner.cookie, lekki.id, pair.id)
  })

  const room = (i: number) => {
    const found = pairRooms[i]
    if (!found) throw new Error(`no room ${i}`)
    return found
  }
  const nextDay = async () => {
    day = addDays(day, 3)
    await setHotel(t, lekki.id, { businessDate: day })
    return day
  }
  const book = (arrival: string, nights = 1) =>
    bookStay(t, k.owner.cookie, lekki.id, {
      roomTypeId: pair.id,
      ratePlanId: bar.id,
      arrival,
      departure: addDays(arrival, nights),
    })

  async function waitForWaiters(n: number) {
    const deadline = Date.now() + 10_000
    for (;;) {
      await gate.query('select pg_stat_clear_snapshot()')
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
  async function throughRoomGate<T>(roomId: string, requests: (() => Promise<T>)[]) {
    await gate.query('begin')
    await gate.query('select id from rooms where id = $1 for update', [roomId])
    const pending: Promise<T>[] = []
    for (const request of requests) {
      pending.push(request())
      await waitForWaiters(pending.length)
    }
    await gate.query('commit')
    return Promise.all(pending)
  }
  // No room holds two confirmed or checked-in stays on a night, counting from each stay's room_from.
  async function doubleBooked() {
    const rows = await t.db.execute<{ n: number }>(sql`
      select count(*)::int as n from stays a join stays b
        on a.room_id = b.room_id and a.id < b.id
       and a.status in ('confirmed', 'checked_in') and b.status in ('confirmed', 'checked_in')
       and daterange(coalesce(a.room_from, a.arrival), a.departure)
           && daterange(coalesce(b.room_from, b.arrival), b.departure)
      where a.property_id = ${lekki.id}::uuid`)
    return rows.rows[0]?.n ?? 0
  }
  const codeOf = (result: { status: number; data: { data?: Record<string, unknown> } }) =>
    result.status === 200 ? 'ok' : String(result.data.data?.code ?? result.status)

  it('two check-ins into the same free room: one wins, the other is told it was taken', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const date = await nextDay()
      const a = await book(date)
      const b = await book(date)
      const target = room(round % 2).id
      const results = await throughRoomGate(target, [
        () => checkIn(t, k.owner.cookie, a.stay, target, { businessDate: date }),
        () => checkIn(t, k.owner.cookie, b.stay, target, { businessDate: date }),
      ])
      expect(results.map(codeOf).sort()).toEqual(['ROOM_TAKEN', 'ok'])
    }
    expect(await doubleBooked()).toBe(0)
  })

  it('an in-house move races an assignment into the same room: one wins', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const date = await nextDay()
      const guest = await book(date, 2)
      const done = await checkIn(t, k.owner.cookie, guest.stay, room(0).id, { businessDate: date })
      expect(done.status).toBe(200)
      const tomorrow = addDays(date, 1)
      await setHotel(t, lekki.id, { businessDate: tomorrow })
      const other = await book(tomorrow, 1)
      const results = await throughRoomGate<{
        status: number
        data: { data?: Record<string, unknown> }
      }>(room(1).id, [
        () =>
          assign(t, k.owner.cookie, { id: guest.stay.id, version: done.data.version }, room(1).id, {
            reason: 'noise',
          }),
        () => assign(t, k.owner.cookie, other.stay, room(1).id),
      ])
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      expect(results.map(codeOf)).toContain('ROOM_TAKEN')
      day = tomorrow
    }
    expect(await doubleBooked()).toBe(0)
  })

  it('a check-in races out of order on its room: one wins', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const date = await nextDay()
      const a = await book(date)
      const target = room(round % 2).id
      const results = await throughRoomGate<{ status: number }>(target, [
        () => checkIn(t, k.owner.cookie, a.stay, target, { businessDate: date }),
        () =>
          outOfOrder(t, k.owner.cookie, {
            propertyId: lekki.id,
            roomId: target,
            from: date,
            backInService: addDays(date, 1),
          }),
      ])
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    }
    const overlap = await t.db.execute<{ n: number }>(sql`
      select count(*)::int as n from stays s join room_out_of_order o
        on o.room_id = s.room_id and o.status = 'active' and s.status = 'checked_in'
       and daterange(s.arrival, s.departure) && daterange(o.from_date, o.back_in_service)
      where s.property_id = ${lekki.id}::uuid`)
    expect(overlap.rows[0]?.n).toBe(0)
  })
})
