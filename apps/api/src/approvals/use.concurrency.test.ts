// Two bookings racing to use one approval (spec: "Availability locking", race test): held at the
// lock until both are queued, then exactly one may use it and the other gets APPROVAL_USED; the
// rooms booked reflect one booking. Also two bookings with approvals on stays listed in opposite
// orders never deadlock with the new lock order.
import { addDays, type CreateReservationInput, createReservationSchema, newId } from '@vento/shared'
import { and, count, eq } from 'drizzle-orm'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { approvals } from '../db/schema/approvals.ts'
import { roomTypeInventory, stays } from '../db/schema/reservations.ts'
import { DAY, quote } from '../reservations/testing.ts'
import { createTestApp } from '../test/harness.ts'
import { stayBinding } from './kinds/stay-discount-rule.ts'
import { draftFor, type KoraApprovals, koraApprovals, withApproval } from './testing.ts'

const url = process.env.TEST_DATABASE_URL
const ROUNDS = Number(process.env.RACE_ROUNDS ?? 200)

type Result = { status: number; data: { id?: string; data?: { code?: string }; message?: string } }

describe.skipIf(!url)('approvals under concurrency', { timeout: 600_000 }, () => {
  const t = createTestApp(url ?? '', { max: 8 })
  const gate = new pg.Client({ connectionString: url })
  afterAll(async () => {
    await gate.end()
    await t.close()
  })
  let k: KoraApprovals

  beforeAll(async () => {
    await gate.connect()
    k = await koraApprovals(t)
  })

  // An approval as Tunde's PIN on FD-VI-01 leaves it, for each stay of the booking.
  async function grant(booking: CreateReservationInput, stayIndex = 0): Promise<string> {
    const parsed = createReservationSchema.parse(booking)
    const stay = parsed.stays[stayIndex]
    if (!stay) throw new Error('no stay')
    const now = new Date()
    const [row] = await t.db
      .insert(approvals)
      .values({
        organizationId: k.orgId,
        propertyId: k.vi.id,
        kind: 'stay_discount',
        permission: 'stay.rate_override',
        value: stay.discount?.value ?? '0',
        valueKind: 'percent',
        status: 'approved',
        method: 'pin_here',
        requesterMemberId: k.frontDesk.memberId,
        requesterName: 'Chiamaka Eze',
        requesterLimit: '12',
        approverMemberId: k.gm.memberId,
        approverName: 'Tunde Bello',
        approverLimit: '50',
        bindingHash: stayBinding(k.vi.id, stay, stay.quoteHash),
        subject: {},
        actionKey: booking.idempotencyKey,
        businessDate: DAY,
        requestedAt: now,
        answeredAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
        approverDeviceId: k.device.id,
        idempotencyKey: newId(),
      })
      .returning({ id: approvals.id })
    return row?.id ?? ''
  }

  const create = (booking: unknown) =>
    t.rpc(k.frontDesk.cookie, 'reservations/create', booking) as Promise<Result>

  async function throughGate(approvalId: string, requests: () => Promise<Result>[]) {
    await gate.query('begin')
    await gate.query('select id from approvals where id = $1 for update', [approvalId])
    const pending = requests()
    const deadline = Date.now() + 10_000
    for (;;) {
      await gate.query('select pg_stat_clear_snapshot()')
      const waiting = await gate.query(
        `select count(*)::int as n from pg_stat_activity
         where wait_event_type = 'Lock' and datname = current_database() and pid <> pg_backend_pid()`,
      )
      if (waiting.rows[0].n >= pending.length) break
      if (Date.now() > deadline) throw new Error('the bookings never reached the lock')
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    await gate.query('commit')
    return Promise.all(pending)
  }

  it(`uses one approval once in each of ${ROUNDS} races`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const arrival = addDays(DAY, 30 + round)
      const booking = await draftFor(t, k, k.frontDesk, arrival, addDays(arrival, 1))
      const approvalId = await grant(booking)
      const one = withApproval(booking, approvalId)
      const results = await throughGate(approvalId, () => [
        create(one),
        create({ ...one, idempotencyKey: newId() }),
      ])
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      expect(results.filter((r) => r.data.data?.code === 'APPROVAL_USED')).toHaveLength(1)
      const [booked] = await t.db
        .select({ booked: roomTypeInventory.booked })
        .from(roomTypeInventory)
        .where(
          and(
            eq(roomTypeInventory.roomTypeId, k.types.dlk.id),
            eq(roomTypeInventory.date, arrival),
          ),
        )
      expect(booked?.booked).toBe(1)
      const [stayCount] = await t.db
        .select({ value: count() })
        .from(stays)
        .where(and(eq(stays.roomTypeId, k.types.dlk.id), eq(stays.arrival, arrival)))
      expect(stayCount?.value).toBe(1)
    }
  })

  it('never deadlocks two bookings with approved stays listed in opposite orders', async () => {
    const rounds = Math.min(ROUNDS, 50)
    for (let round = 0; round < rounds; round++) {
      const arrival = addDays(DAY, 250 + round * 2)
      const departure = addDays(arrival, 2)
      const discount = { kind: 'percent', value: '15', reason: 'repeat_guest' } as const
      const stayOf = async (roomTypeId: string) => {
        const ask = { roomTypeId, ratePlanId: k.bb.id, arrival, departure, discount }
        const quoted = await quote(t, k.frontDesk.cookie, k.vi.id, ask)
        return { ...ask, adults: 1, children: 0, quoteHash: quoted.data.quoteHash }
      }
      const [stq, dlk] = [await stayOf(k.types.stq.id), await stayOf(k.types.dlk.id)]
      const bookingOf = async (first: typeof stq, second: typeof stq) => {
        const booking = (await draftFor(
          t,
          k,
          k.frontDesk,
          arrival,
          departure,
        )) as CreateReservationInput
        const both = { ...booking, stays: [first, second] }
        const ids = [await grant(both, 0), await grant(both, 1)]
        return { ...both, stays: both.stays.map((s, i) => ({ ...s, approvalId: ids[i] })) }
      }
      const a = await bookingOf(stq, dlk)
      const b = await bookingOf(dlk, stq)
      const results = await Promise.all([create(a), create(b)])
      for (const result of results) {
        expect(result.status).toBe(200)
        expect(result.data.message ?? '').not.toMatch(/deadlock/i)
      }
    }
  })
})
