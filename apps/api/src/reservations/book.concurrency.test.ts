// Bookings racing for the same rooms on separate connections (spec: "Availability locking"). The
// gate holds the inventory row so both bookings are queued on it before either can take it; then
// exactly one may win. Real HTTP through the app, real Postgres.
import type { Property, RatePlanView, RoomTypeView } from '@vento/shared'
import { addDays, newId } from '@vento/shared'
import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { roomTypeInventory, stayNights, stays } from '../db/schema/reservations.ts'
import { rooms } from '../db/schema/rooms.ts'
import { setHotel } from '../finance/testing.ts'
import { createType, floorRooms } from '../rooms/testing.ts'
import { LAGOS_ADDRESS } from '../test/addresses.ts'
import { createTestApp } from '../test/harness.ts'
import {
  book,
  COLLINS,
  DAY,
  type KoraBooking,
  koraBooking,
  quote,
  type StayAsk,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL
const ROUNDS = Number(process.env.RACE_ROUNDS ?? 200)

type Result = { status: number; data: { id?: string; data?: { code?: string }; message?: string } }

describe.skipIf(!url)('bookings under concurrency', { timeout: 300_000 }, () => {
  const t = createTestApp(url ?? '', { max: 8 })
  const gate = new pg.Client({ connectionString: url })
  afterAll(async () => {
    await gate.end()
    await t.close()
  })
  let k: KoraBooking
  let lekki: Property
  let solo: RoomTypeView
  let soloPlan: RatePlanView

  beforeAll(async () => {
    await gate.connect()
    k = await koraBooking(t)
    // A fresh hotel with a one-room type, so every round is a race for the last room.
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
    solo = await createType(t, k.owner.cookie, lekki.id, { name: 'Solo', code: 'SOLO' })
    await t.rpc(k.owner.cookie, 'rooms/createMany', {
      propertyId: lekki.id,
      batchId: newId(),
      rooms: floorRooms(solo.id, 1, 1, 1),
    })
    const plans = await t.rpc<{ plans: RatePlanView[] }>(k.owner.cookie, 'ratePlans/createFirst', {
      propertyId: lekki.id,
      prices: [{ roomTypeId: solo.id, weekday: '90000' }],
    })
    const bar = plans.data.plans[0]
    if (!bar) throw new Error('no plan at Lekki')
    soloPlan = bar
  })

  const bookedOn = async (roomTypeId: string, date: string) => {
    const [row] = await t.db
      .select({ booked: roomTypeInventory.booked })
      .from(roomTypeInventory)
      .where(and(eq(roomTypeInventory.roomTypeId, roomTypeId), eq(roomTypeInventory.date, date)))
    return row?.booked ?? 0
  }

  const nightsOn = async (roomTypeId: string, date: string) => {
    const [row] = await t.db
      .select({ value: count() })
      .from(stayNights)
      .innerJoin(stays, eq(stays.id, stayNights.stayId))
      .where(
        and(
          eq(stays.roomTypeId, roomTypeId),
          eq(stayNights.date, date),
          inArray(stays.status, ['confirmed', 'checked_in']),
        ),
      )
    return row?.value ?? 0
  }

  const createWith = (propertyId: string, stays_: StayAsk[], hashes: string[]) =>
    t.rpc(k.owner.cookie, 'reservations/create', {
      idempotencyKey: newId(),
      propertyId,
      guest: COLLINS,
      source: 'phone',
      stays: stays_.map((stay, index) => ({
        adults: 1,
        children: 0,
        ...stay,
        quoteHash: hashes[index],
      })),
    }) as Promise<Result>

  const hashOf = async (propertyId: string, stay: StayAsk) => {
    const result = await quote(t, k.owner.cookie, propertyId, stay)
    if (result.status !== 200) throw new Error(`quote failed: ${result.data.message}`)
    return result.data.quoteHash
  }

  // Holds the night's inventory row, fires the bookings, waits until all of them are queued on it,
  // then lets go: the bookings take the lock one after the other.
  async function throughGate(roomTypeId: string, date: string, requests: () => Promise<Result>[]) {
    await gate.query(
      `insert into room_type_inventory (organization_id, property_id, room_type_id, date)
       select organization_id, property_id, id, $2::date from room_types where id = $1
       on conflict (room_type_id, date) do nothing`,
      [roomTypeId, date],
    )
    await gate.query('begin')
    await gate.query(
      'select booked from room_type_inventory where room_type_id = $1 and date = $2 for update',
      [roomTypeId, date],
    )
    const pending = requests()
    const deadline = Date.now() + 10_000
    for (;;) {
      // pg_stat_activity is a snapshot per transaction: clear it to see the bookings arrive.
      await gate.query('select pg_stat_clear_snapshot()')
      const waiting = await gate.query(
        `select count(*)::int as n from pg_stat_activity
         where wait_event_type = 'Lock' and query like '%room_type_inventory%' and pid <> pg_backend_pid()`,
      )
      if (waiting.rows[0].n >= pending.length) break
      if (Date.now() > deadline) throw new Error('the bookings never reached the lock')
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    await gate.query('commit')
    return Promise.all(pending)
  }

  it('sells the last Junior Suite once when two bookings reach the lock together', async () => {
    const date = addDays(DAY, 15)
    const stay = {
      roomTypeId: k.types.jrs.id,
      ratePlanId: k.bar.id,
      arrival: date,
      departure: addDays(date, 1),
    }
    for (let i = 0; i < 7; i++) {
      const result = await book(t, k.owner.cookie, k.vi.id, [stay])
      expect(result.status).toBe(200)
    }
    const hash = await hashOf(k.vi.id, stay)
    const results = await throughGate(k.types.jrs.id, date, () => [
      createWith(k.vi.id, [stay], [hash]),
      createWith(k.vi.id, [stay], [hash]),
    ])
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    expect(results.filter((r) => r.data.data?.code === 'SOLD_OUT')).toHaveLength(1)
    expect(await bookedOn(k.types.jrs.id, date)).toBe(8)
    expect(await nightsOn(k.types.jrs.id, date)).toBe(8)
  })

  it(`books a one-room type once in each of ${ROUNDS} races`, async () => {
    let wins = 0
    for (let round = 0; round < ROUNDS; round++) {
      const date = addDays(DAY, 1 + round)
      const stay = {
        roomTypeId: solo.id,
        ratePlanId: soloPlan.id,
        arrival: date,
        departure: addDays(date, 1),
      }
      const hash = await hashOf(lekki.id, stay)
      const results = await throughGate(solo.id, date, () => [
        createWith(lekki.id, [stay], [hash]),
        createWith(lekki.id, [stay], [hash]),
      ])
      const won = results.filter((r) => r.status === 200)
      expect(won).toHaveLength(1)
      expect(results.filter((r) => r.data.data?.code === 'SOLD_OUT')).toHaveLength(1)
      wins += won.length
    }
    expect(wins).toBe(ROUNDS)
    const rows = await t.db
      .select({ booked: roomTypeInventory.booked })
      .from(roomTypeInventory)
      .where(eq(roomTypeInventory.roomTypeId, solo.id))
    expect(rows.every((row) => row.booked <= 1)).toBe(true)
  })

  it(`never deadlocks two multi-room bookings that list room types in opposite orders (${ROUNDS} rounds)`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      // Two nights, far enough out not to meet the other tests' dates.
      const date = addDays(DAY, 300 + (round % 300))
      const at = (roomTypeId: string) => ({
        roomTypeId,
        ratePlanId: k.bar.id,
        arrival: date,
        departure: addDays(date, 2),
      })
      const stq = at(k.types.stq.id)
      const dlk = at(k.types.dlk.id)
      const [h1, h2] = [await hashOf(k.vi.id, stq), await hashOf(k.vi.id, dlk)]
      const results = await Promise.all([
        createWith(k.vi.id, [stq, dlk], [h1, h2]),
        createWith(k.vi.id, [dlk, stq], [h2, h1]),
      ])
      for (const result of results) {
        expect([200, 409]).toContain(result.status)
        if (result.status === 409) expect(result.data.data?.code).toBe('SOLD_OUT')
        expect(result.data.message ?? '').not.toMatch(/deadlock/i)
      }
    }
  })

  it('keeps every counter equal to its stays after random concurrent bookings', async () => {
    const start = addDays(DAY, 40)
    let seed = 7
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed / 2_147_483_648
    }
    const asks: StayAsk[] = Array.from({ length: 30 }, () => {
      const arrival = addDays(start, Math.floor(next() * 4))
      return {
        roomTypeId: next() > 0.5 ? k.types.exk.id : k.types.jrs.id,
        ratePlanId: k.bar.id,
        arrival,
        departure: addDays(arrival, 1 + Math.floor(next() * 3)),
      }
    })
    const hashes = await Promise.all(asks.map((ask) => hashOf(k.vi.id, ask)))
    const results = await Promise.all(
      asks.map((ask, i) => createWith(k.vi.id, [ask], [hashes[i] ?? ''])),
    )
    expect(results.every((r) => r.status === 200 || r.data.data?.code === 'SOLD_OUT')).toBe(true)
    expect(results.some((r) => r.data.data?.code === 'SOLD_OUT')).toBe(true)
    const limits = { [k.types.exk.id]: 3, [k.types.jrs.id]: 8 }
    for (const [typeId, roomsInType] of Object.entries(limits)) {
      for (let day = 0; day < 7; day++) {
        const date = addDays(start, day)
        const booked = await bookedOn(typeId, date)
        expect(booked).toBe(await nightsOn(typeId, date))
        expect(booked).toBeLessThanOrEqual(roomsInType)
      }
    }
  })

  describe('room count changes', () => {
    const activeRooms = async (roomTypeId: string) =>
      t.db
        .select({ id: rooms.id })
        .from(rooms)
        .where(and(eq(rooms.roomTypeId, roomTypeId), isNull(rooms.archivedAt)))

    it('refuses to archive a room on a night every room is booked', async () => {
      const date = addDays(DAY, 60)
      const stay = {
        roomTypeId: k.types.dlk.id,
        ratePlanId: k.bar.id,
        arrival: date,
        departure: addDays(date, 1),
      }
      for (let i = 0; i < 6; i++)
        expect((await book(t, k.owner.cookie, k.vi.id, [stay])).status).toBe(200)
      const [room] = await activeRooms(k.types.dlk.id)
      const result = await t.rpc<{ message: string; data?: { code?: string } }>(
        k.owner.cookie,
        'rooms/archive',
        { propertyId: k.vi.id, ids: [room?.id] },
      )
      expect(result.data.data?.code).toBe('ROOMS_BOOKED')
      expect(result.data.message).toMatch(
        /^Deluxe King would be 1 room short on \d+ \w+ \(6 booked, 5 rooms\)/,
      )
      expect(await activeRooms(k.types.dlk.id)).toHaveLength(6)
    })

    it('leaves rooms ≥ booked when an archive races a booking for the last room', async () => {
      for (let round = 0; round < 5; round++) {
        const date = addDays(DAY, 70 + round)
        const stay = {
          roomTypeId: k.types.exk.id,
          ratePlanId: k.bar.id,
          arrival: date,
          departure: addDays(date, 1),
        }
        const before = (await activeRooms(k.types.exk.id)).length
        for (let i = 0; i < before - 1; i++) await book(t, k.owner.cookie, k.vi.id, [stay])
        const hash = await hashOf(k.vi.id, stay)
        const [room] = await activeRooms(k.types.exk.id)
        await Promise.all([
          createWith(k.vi.id, [stay], [hash]),
          t.rpc(k.owner.cookie, 'rooms/archive', { propertyId: k.vi.id, ids: [room?.id] }),
        ])
        const left = (await activeRooms(k.types.exk.id)).length
        expect(left).toBeGreaterThanOrEqual(await bookedOn(k.types.exk.id, date))
        // Put the room back for the next round.
        if (left < before) {
          await t.rpc(k.owner.cookie, 'rooms/restore', { propertyId: k.vi.id, ids: [room?.id] })
        }
      }
    })
  })
})
