// Mark clean / Mark dirty against the test database (spec: stage-1-tape-chart.md, "Room status" and
// "Offline behaviour"): who and when, a resent command applied once, an older command superseded
// and kept in history, allowed on a room out of order, and who may.
import type { ChartRoom } from '@vento/shared'
import { addDays, newId } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditFor } from '../../approvals/testing.ts'
import { roomStatusCommands } from '../../db/schema/rooms.ts'
import { switchFeature } from '../../features/switches.ts'
import { DAY, type KoraBooking, koraBooking } from '../../reservations/testing.ts'
import { outOfOrder, roomsOf, setStatus } from '../../tape-chart/testing.ts'
import { limitTo, person } from '../../tenancy/testing.ts'
import { createTestApp } from '../../test/harness.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('room status', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraBooking
  let stq: ChartRoom[]
  const room = (index: number) => {
    const found = stq[index]
    if (!found) throw new Error(`no room ${index}`)
    return found
  }

  beforeAll(async () => {
    k = await koraBooking(t)
    stq = await roomsOf(t, k.owner.cookie, k.vi.id, k.types.stq.id)
  })

  it('marks clean and dirty with who and when, and records the change', async () => {
    const clean = await setStatus(t, k.frontDesk.cookie, k.vi.id, room(0).id, 'clean')
    expect(clean.status).toBe(200)
    expect(clean.data).toMatchObject({ outcome: 'applied', status: 'clean', message: null })
    expect(clean.data.statusBy).toBeTruthy()
    const dirty = await setStatus(t, k.frontDesk.cookie, k.vi.id, room(0).id, 'dirty', {
      source: 'undo',
    })
    expect(dirty.data.status).toBe('dirty')
    const events = await auditFor(t, k.orgId, 'room.status_changed', room(0).id)
    expect(events[0]?.after).toMatchObject({
      housekeepingStatus: 'dirty',
      source: 'undo',
      applied: true,
    })
    expect(events[1]?.before).toMatchObject({ housekeepingStatus: 'dirty' })
  })

  it('applies a resent command once and keeps an older one in history without applying it', async () => {
    const key = newId()
    const at = new Date(Date.now() - 10 * 60_000).toISOString()
    const first = await setStatus(t, k.frontDesk.cookie, k.vi.id, room(1).id, 'clean', {
      idempotencyKey: key,
      occurredAt: at,
    })
    const again = await setStatus(t, k.frontDesk.cookie, k.vi.id, room(1).id, 'clean', {
      idempotencyKey: key,
      occurredAt: at,
    })
    expect(again.data.outcome).toBe(first.data.outcome)
    const receipts = await t.db
      .select()
      .from(roomStatusCommands)
      .where(eq(roomStatusCommands.idempotencyKey, key))
    expect(receipts).toHaveLength(1)
    const mismatch = await setStatus(t, k.frontDesk.cookie, k.vi.id, room(1).id, 'dirty', {
      idempotencyKey: key,
    })
    expect(mismatch.data.data?.code).toBe('IDEMPOTENCY_CONFLICT')
    // An offline change made before the one on the server arrives later: kept as clean.
    const older = await setStatus(t, k.frontDesk.cookie, k.vi.id, room(1).id, 'dirty', {
      occurredAt: new Date(Date.parse(at) - 5 * 60_000).toISOString(),
    })
    expect(older.data).toMatchObject({ outcome: 'superseded', status: 'clean' })
    expect(older.data.message).toMatch(
      new RegExp(
        `^${room(1).number}'s status changed to clean by .+ at \\d\\d:\\d\\d after your change at \\d\\d:\\d\\d\\. Kept as clean\\.$`,
      ),
    )
    const events = await auditFor(t, k.orgId, 'room.status_changed', room(1).id)
    expect(events[0]?.after).toMatchObject({ applied: false, requested: 'dirty' })
  })

  it('works on a room out of order and for housekeeping, not for a cashier', async () => {
    await outOfOrder(t, k.gm.cookie, {
      propertyId: k.vi.id,
      roomId: room(2).id,
      from: addDays(DAY, 40),
      backInService: addDays(DAY, 41),
    })
    const attendant = await person(t, k.orgId, 'Blessing Udo', 'room_attendant')
    await limitTo(t, k.owner, attendant, [k.vi.id])
    expect((await setStatus(t, attendant.cookie, k.vi.id, room(2).id, 'clean')).status).toBe(200)
    const cashier = await setStatus(t, k.cashier.cookie, k.vi.id, room(2).id, 'dirty')
    expect(cashier.status).toBe(403)
    expect(cashier.data.message).toBe(
      'Only front desk, housekeeping and managers can change room status.',
    )
    const outside = await setStatus(t, k.other.cookie, k.vi.id, room(2).id, 'dirty')
    expect(outside.status).toBe(404)
  })

  it('is behind the front desk switch', async () => {
    await switchFeature(t.db, k.orgId, { feature: 'front_desk', to: 'off', reason: 'Test' })
    try {
      const off = await setStatus(t, k.frontDesk.cookie, k.vi.id, room(3).id, 'clean')
      expect(off.data.data?.code).toBe('FEATURE_OFF')
    } finally {
      await switchFeature(t.db, k.orgId, { feature: 'front_desk', to: 'on', reason: 'Test' })
    }
  })
})
