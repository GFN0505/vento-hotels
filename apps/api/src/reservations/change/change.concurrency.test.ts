// Changes racing bookings and each other on separate connections (spec: "Availability locking",
// "Tests"). A gate holds an inventory row so both requests are queued on it before either can take
// it; then exactly one may win. Real HTTP through the app, real Postgres.
import type { ApprovalView, Property, RatePlanView, RoomTypeView } from '@vento/shared'
import { addDays, newId } from '@vento/shared'
import { and, count, eq, inArray } from 'drizzle-orm'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clearPin, type KoraApprovals, koraApprovals, PINS } from '../../approvals/testing.ts'
import { roomTypeInventory, stayNights, stays } from '../../db/schema/reservations.ts'
import { setHotel } from '../../finance/testing.ts'
import { createType, floorRooms } from '../../rooms/testing.ts'
import { LAGOS_ADDRESS } from '../../test/addresses.ts'
import { createTestApp } from '../../test/harness.ts'
import { DAY, type StayAsk } from '../testing.ts'
import {
  bookStay,
  cancel,
  endQuote,
  fieldsOf,
  modify,
  noShow,
  quoteChange,
  type Result,
  rpc,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL
const ROUNDS = Number(process.env.RACE_ROUNDS ?? 200)

describe.skipIf(!url)('changes under concurrency', { timeout: 600_000 }, () => {
  const t = createTestApp(url ?? '', { max: 8 })
  const gate = new pg.Client({ connectionString: url })
  afterAll(async () => {
    await gate.end()
    await t.close()
  })
  let k: KoraApprovals
  let lekki: Property
  let solo: RoomTypeView
  let soloPlan: RatePlanView

  beforeAll(async () => {
    await gate.connect()
    k = await koraApprovals(t)
    // A hotel with a one-room type, so every round is a race for the last room.
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
  // Nights of stays that hold rooms: confirmed (and checked in, from brick 8).
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

  const createAt = async (propertyId: string, stay: StayAsk) => {
    const quoted = await t.rpc<{ quoteHash: string }>(k.owner.cookie, 'reservations/quote', {
      propertyId,
      adults: 1,
      children: 0,
      ...stay,
    })
    return () =>
      t.rpc(k.owner.cookie, 'reservations/create', {
        idempotencyKey: newId(),
        propertyId,
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
        stays: [{ adults: 1, children: 0, ...stay, quoteHash: quoted.data.quoteHash }],
      }) as Promise<Result<{ id: string }>>
  }

  async function waitForWaiters(n: number) {
    const deadline = Date.now() + 10_000
    for (;;) {
      await gate.query('select pg_stat_clear_snapshot()')
      const waiting = await gate.query(
        `select count(*)::int as n from pg_stat_activity
         where wait_event_type = 'Lock' and query like '%room_type_inventory%' and pid <> pg_backend_pid()`,
      )
      if (waiting.rows[0].n >= n) return
      if (Date.now() > deadline) throw new Error('the requests never reached the lock')
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
  }

  // Holds the night's inventory row, fires the requests one after another (each queued before the
  // next starts), then lets go.
  async function throughGate<T>(roomTypeId: string, date: string, requests: (() => Promise<T>)[]) {
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
    const pending: Promise<T>[] = []
    for (const request of requests) {
      pending.push(request())
      await waitForWaiters(pending.length)
    }
    await gate.query('commit')
    return Promise.all(pending)
  }

  it(`sells the last room once when an extension races a booking, ${ROUNDS} rounds`, async () => {
    let modifies = 0
    for (let round = 0; round < ROUNDS; round++) {
      const night = addDays(DAY, 1 + round * 2)
      const next = addDays(night, 1)
      const stay = { roomTypeId: solo.id, ratePlanId: soloPlan.id, arrival: night, departure: next }
      const held = await bookStay(t, k.owner.cookie, lekki.id, stay)
      const fields = fieldsOf(held, { departure: addDays(next, 1) })
      const quoted = await quoteChange(t, k.owner.cookie, fields)
      const create = await createAt(lekki.id, {
        ...stay,
        arrival: next,
        departure: addDays(next, 1),
      })
      const extend = () =>
        rpc(t, k.owner.cookie, 'reservations/modify', {
          idempotencyKey: newId(),
          ...fields,
          changeHash: quoted.data.changeHash,
        })
      const order = round % 2 === 0 ? [extend, create] : [create, extend]
      const results = (await throughGate(solo.id, next, order)) as Result<unknown>[]
      const wins = results.filter((r) => r.status === 200)
      expect(wins).toHaveLength(1)
      expect(results.find((r) => r.status !== 200)?.data.data?.code).toBe('SOLD_OUT')
      if ((round % 2 === 0 ? results[0] : results[1])?.status === 200) modifies++
      expect(await bookedOn(solo.id, next)).toBe(1)
      expect(await nightsOn(solo.id, next)).toBe(1)
    }
    expect(modifies).toBeGreaterThan(0)
  })

  it('lets one of a cancel and a change of the same booking win', async () => {
    for (let round = 0; round < 20; round++) {
      const arrival = addDays(DAY, 30 + round)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, {
        roomTypeId: k.types.jrs.id,
        ratePlanId: k.bar.id,
        arrival,
        departure: addDays(arrival, 1),
      })
      const fields = fieldsOf(b, { departure: addDays(arrival, 2) })
      const quoted = await quoteChange(t, k.frontDesk.cookie, fields)
      const version = (await endQuote(t, k.frontDesk.cookie, b.id, 'cancel')).data.version
      const results = await Promise.all([
        rpc(t, k.frontDesk.cookie, 'reservations/cancel', {
          idempotencyKey: newId(),
          reservationId: b.id,
          version,
          reason: 'guest_request',
        }),
        rpc(t, k.gm.cookie, 'reservations/modify', {
          idempotencyKey: newId(),
          ...fields,
          changeHash: quoted.data.changeHash,
        }),
      ])
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      const loser = results.find((r) => r.status !== 200)
      expect(loser?.data.data?.code).toBe('RESERVATION_CHANGED')
    }
  })

  it('lets a booking waiting on the lock take the room a cancel releases', async () => {
    for (let round = 0; round < 10; round++) {
      const night = addDays(DAY, 450 + round)
      const stay = {
        roomTypeId: solo.id,
        ratePlanId: soloPlan.id,
        arrival: night,
        departure: addDays(night, 1),
      }
      const held = await bookStay(t, k.owner.cookie, lekki.id, stay)
      const version = (await endQuote(t, k.owner.cookie, held.id, 'cancel')).data.version
      const create = await createAt(lekki.id, stay)
      const [cancelled, booked] = (await throughGate(solo.id, night, [
        () =>
          rpc(t, k.owner.cookie, 'reservations/cancel', {
            idempotencyKey: newId(),
            reservationId: held.id,
            version,
            reason: 'guest_request',
          }),
        create,
      ])) as Result<unknown>[]
      expect(cancelled?.status).toBe(200)
      expect(booked?.status).toBe(200)
      expect(await bookedOn(solo.id, night)).toBe(1)
    }
  })

  it('never deadlocks when a change and a booking cross room types', async () => {
    for (let round = 0; round < 20; round++) {
      const arrival = addDays(DAY, 120 + round * 3)
      const departure = addDays(arrival, 2)
      const b = await bookStay(t, k.owner.cookie, k.vi.id, {
        roomTypeId: k.types.dlk.id,
        ratePlanId: k.bar.id,
        arrival,
        departure,
      })
      const fields = fieldsOf(b, { roomTypeId: k.types.stq.id })
      const quoted = await quoteChange(t, k.owner.cookie, fields)
      const hashes = await Promise.all(
        [k.types.stq.id, k.types.dlk.id].map(async (roomTypeId) => {
          const q = await t.rpc<{ quoteHash: string }>(k.owner.cookie, 'reservations/quote', {
            propertyId: k.vi.id,
            roomTypeId,
            ratePlanId: k.bar.id,
            arrival,
            departure,
            adults: 1,
            children: 0,
          })
          return q.data.quoteHash
        }),
      )
      const results = await Promise.all([
        rpc(t, k.owner.cookie, 'reservations/modify', {
          idempotencyKey: newId(),
          ...fields,
          changeHash: quoted.data.changeHash,
        }),
        rpc(t, k.owner.cookie, 'reservations/create', {
          idempotencyKey: newId(),
          propertyId: k.vi.id,
          guest: {
            kind: 'new',
            fields: {
              firstName: 'Cross',
              lastName: 'Over',
              phone: '+2348030000001',
              nationality: 'NG',
            },
          },
          source: 'phone',
          stays: [k.types.stq.id, k.types.dlk.id].map((roomTypeId, i) => ({
            roomTypeId,
            ratePlanId: k.bar.id,
            arrival,
            departure,
            adults: 1,
            children: 0,
            quoteHash: hashes[i],
          })),
        }),
      ])
      for (const result of results) {
        expect([200, 409]).toContain(result.status)
        expect(result.data.message ?? '').not.toMatch(/deadlock/i)
      }
    }
  })

  it('never deadlocks when an inbox waiver is answered as the booking is cancelled', async () => {
    for (let round = 0; round < 8; round++) {
      // A late change leaves a penalty on a booking that can still be cancelled.
      const arrival = addDays(DAY, 1)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, {
        roomTypeId: k.types.jrs.id,
        ratePlanId: k.bar.id,
        arrival,
        departure: addDays(arrival, 3),
      })
      const shortened = await modify(
        t,
        k.frontDesk.cookie,
        fieldsOf(b, { departure: addDays(arrival, 2) }),
      )
      const penaltyId = shortened.data.penalties[0]?.id ?? ''
      const request = await rpc<ApprovalView>(t, k.frontDesk.cookie, 'approvals/request', {
        kind: 'penalty_waiver',
        waiver: { target: 'penalty', penaltyId, reason: 'Booked the wrong dates' },
        idempotencyKey: newId(),
        approverMemberId: k.gm.memberId,
      })
      await clearPin(t, k.gm.memberId)
      const [approved, cancelled] = await Promise.all([
        rpc(t, k.gm.cookie, 'approvals/approve', { id: request.data.id, pin: PINS.tunde }),
        cancel(t, k.frontDesk.cookie, b.id),
      ])
      expect(approved.status).toBe(200)
      expect(cancelled.status).toBe(200)
    }
  })

  it('keeps every counter equal to its stays after random concurrent changes', async () => {
    const start = addDays(DAY, 200)
    let seed = 11
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed / 2_147_483_648
    }
    const types = [k.types.exk.id, k.types.jrs.id]
    const made = []
    for (let i = 0; i < 14; i++) {
      const arrival = addDays(start, Math.floor(random() * 4))
      try {
        made.push(
          await bookStay(t, k.owner.cookie, k.vi.id, {
            roomTypeId: types[i % 2] ?? k.types.exk.id,
            ratePlanId: k.bar.id,
            arrival,
            departure: addDays(arrival, 1 + Math.floor(random() * 2)),
          }),
        )
      } catch {
        // Sold out: fine, the race below is what matters.
      }
    }
    // And two arrivals today, to be marked no-show in the race.
    const today = []
    for (let i = 0; i < 2; i++) {
      today.push(
        await bookStay(t, k.owner.cookie, k.vi.id, {
          roomTypeId: k.types.exk.id,
          ratePlanId: k.bar.id,
          arrival: DAY,
          departure: addDays(DAY, 2),
        }),
      )
    }
    const work = made.map(async (b, i) => {
      const pick = i % 3
      if (pick === 0) return cancel(t, k.owner.cookie, b.id)
      const shift = Math.floor(random() * 3)
      const fields = fieldsOf(b, {
        arrival: addDays(b.stay.arrival, shift),
        departure: addDays(b.stay.departure, shift + (pick === 1 ? 1 : 0)),
        roomTypeId: pick === 2 ? (types[(i + 1) % 2] ?? k.types.exk.id) : b.stay.roomTypeId,
      })
      return modify(t, k.owner.cookie, fields)
    })
    const extra = Array.from({ length: 6 }, async () => {
      const arrival = addDays(start, Math.floor(random() * 4))
      const create = await createAt(k.vi.id, {
        roomTypeId: types[Math.floor(random() * 2)] ?? k.types.exk.id,
        ratePlanId: k.bar.id,
        arrival,
        departure: addDays(arrival, 1),
      })
      return create()
    })
    const results = await Promise.all([
      ...work,
      ...extra,
      ...today.map((b) => noShow(t, k.owner.cookie, b.id)),
    ])
    for (const r of results) expect(r.data.message ?? '').not.toMatch(/deadlock/i)
    const limits = { [k.types.exk.id]: 3, [k.types.jrs.id]: 8 }
    const dates = [DAY, addDays(DAY, 1), ...Array.from({ length: 8 }, (_, d) => addDays(start, d))]
    for (const [typeId, rooms] of Object.entries(limits)) {
      for (const date of dates) {
        const booked = await bookedOn(typeId, date)
        expect(booked).toBe(await nightsOn(typeId, date))
        expect(booked).toBeLessThanOrEqual(rooms)
      }
    }
  })
})
