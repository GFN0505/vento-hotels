// Modify, cancel, no-show and waivers against the test database through the real HTTP flow (spec:
// stage-1-modify-cancel.md, "Tests"). Kora Victoria Island, business date 25 Nov 2026; Deluxe King
// Bed & breakfast ₦168,000.00 a night (₦205,800.00 incl. taxes), Best available ₦150,000.00
// (₦183,750.00); every plan free until 48 h before arrival, then the first night; deposit the first
// night (so every stay is guaranteed). Each test books its own nights.
import type { ApprovalView, Approvers, Page, PenaltyView, ReservationRow } from '@vento/shared'
import { addDays, calendarDateIn, newId } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  at,
  auditFor,
  clearPin,
  type KoraApprovals,
  koraApprovals,
  PINS,
} from '../../approvals/testing.ts'
import { resetWrongTries } from '../../approvals/wrong-tries.ts'
import { approvals } from '../../db/schema/approvals.ts'
import {
  penalties,
  reservationChanges,
  reservations,
  roomTypeInventory,
  stayNights,
} from '../../db/schema/reservations.ts'
import { properties } from '../../db/schema/tenancy.ts'
import { switchFeature } from '../../features/switches.ts'
import { setHotel } from '../../finance/testing.ts'
import { limitTo, person } from '../../tenancy/testing.ts'
import { createTestApp } from '../../test/harness.ts'
import { DAY } from '../testing.ts'
import {
  type Booked,
  bookStay,
  cancel,
  detailOf,
  endQuote,
  fieldsOf,
  modify,
  noShow,
  quoteChange,
  rpc,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('modify, cancel and no-show', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraApprovals
  // Nights far enough ahead that free cancellation hasn't ended, whatever today is.
  const today = calendarDateIn('Africa/Lagos')
  const base = [today, DAY].sort().at(-1) ?? DAY
  let day = 0
  const freeNights = (n = 3) => {
    const arrival = addDays(base, 20 + day)
    day += n + 1
    return [arrival, addDays(arrival, n)] as const
  }
  const booked = async (roomTypeId: string, date: string) => {
    const [row] = await t.db
      .select({ booked: roomTypeInventory.booked })
      .from(roomTypeInventory)
      .where(and(eq(roomTypeInventory.roomTypeId, roomTypeId), eq(roomTypeInventory.date, date)))
    return row?.booked ?? 0
  }
  const dlkBB = (arrival: string, departure: string, extra: Record<string, unknown> = {}) => ({
    roomTypeId: k.types.dlk.id,
    ratePlanId: k.bb.id,
    arrival,
    departure,
    ...extra,
  })
  // Arriving tomorrow on the business date: free cancellation ended 24 Nov, 14:00.
  let lateDay = 0
  const lateStay = (nights = 2) => {
    // Arriving tomorrow or the day after: free cancellation ended whatever today is (from 27 Nov).
    // Spread over the room types so none fills up.
    const types = [k.types.stq, k.types.jrs, k.types.exk, k.types.dlk]
    const type = types[lateDay % types.length]
    const arrival = addDays(DAY, 1 + (Math.floor(lateDay / types.length) % 2))
    lateDay++
    return {
      roomTypeId: type?.id ?? k.types.stq.id,
      ratePlanId: k.bar.id,
      arrival,
      departure: addDays(arrival, nights),
    }
  }

  beforeAll(async () => {
    k = await koraApprovals(t)
  })

  describe('modify', () => {
    it('extends a stay by a night: kept nights untouched, the new night at today’s rate', async () => {
      const [arrival, departure] = freeNights(3)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const fields = fieldsOf(b, { departure: addDays(departure, 1) })
      const quoted = await quoteChange(t, k.frontDesk.cookie, fields)
      expect(quoted.status).toBe(200)
      expect(quoted.data.nights.map((n) => n.kept)).toEqual([true, true, true, false])
      expect(quoted.data.before.total).toBe('617400.00')
      expect(quoted.data.totals.total).toBe('823200.00')
      expect(quoted.data.difference).toEqual({ sign: 1, amount: '205800.00' })
      expect(quoted.data.newNights).toEqual([{ date: departure, left: 6, bookable: true }])
      expect(quoted.data.latePenalty).toBeNull()
      const before = await booked(k.types.dlk.id, departure)
      const saved = await modify(t, k.frontDesk.cookie, fields)
      expect(saved.status).toBe(200)
      expect(await booked(k.types.dlk.id, departure)).toBe(before + 1)
      const detail = await detailOf(t, k.frontDesk.cookie, b.id)
      expect(detail.quotedTotal).toBe('823200.00')
      expect(detail.stays[0]?.version).toBe(2)
      expect(detail.activity[0]).toMatchObject({ title: 'Changed' })
      expect(detail.activity[0]?.detail).toContain('₦617,400.00 → ₦823,200.00')
      const [event] = await auditFor(t, k.orgId, 'reservation.modified', b.id)
      expect(event?.after).toMatchObject({ version: 2, total: '823200.00' })
    })

    it('keeps the agreed price on unchanged nights after the rate changed', async () => {
      const [arrival, departure] = freeNights(2)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      // The guest agreed ₦160,000.00 (the plan has since gone up to ₦168,000.00).
      await t.db
        .update(stayNights)
        .set({ planPrice: '160000.00', soldPrice: '160000.00' })
        .where(eq(stayNights.stayId, b.stay.id))
      const fields = fieldsOf(b, { departure: addDays(departure, 1) })
      const quoted = await quoteChange(t, k.frontDesk.cookie, fields)
      expect(quoted.data.nights.map((n) => n.soldPrice)).toEqual([
        '160000.00',
        '160000.00',
        '168000.00',
      ])
      expect((await modify(t, k.frontDesk.cookie, fields)).status).toBe(200)
    })

    it('re-prices every night when the room type changes and moves the rooms', async () => {
      const [arrival, departure] = freeNights(2)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const dlkBefore = await booked(k.types.dlk.id, arrival)
      const exkBefore = await booked(k.types.exk.id, arrival)
      const fields = fieldsOf(b, { roomTypeId: k.types.exk.id })
      const quoted = await quoteChange(t, k.frontDesk.cookie, fields)
      expect(quoted.data.nights.every((n) => !n.kept)).toBe(true)
      expect(quoted.data.nights[0]?.planPrice).toBe('228000.00')
      expect(quoted.data.roomTypes.map((type) => type.name)).toContain('Executive King')
      expect((await modify(t, k.frontDesk.cookie, fields)).status).toBe(200)
      expect(await booked(k.types.dlk.id, arrival)).toBe(dlkBefore - 1)
      expect(await booked(k.types.exk.id, arrival)).toBe(exkBefore + 1)
    })

    it('keeps the terms snapshot and keeps a passed deadline passed', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(2))
      const deadline = b.stay.cancellation.kind === 'free_until' ? b.stay.cancellation.deadline : ''
      const [arrival, departure] = freeNights(2)
      const fields = fieldsOf(b, { arrival, departure })
      expect((await modify(t, k.frontDesk.cookie, fields)).status).toBe(200)
      const detail = await detailOf(t, k.frontDesk.cookie, b.id)
      const after = detail.stays[0]?.cancellation
      expect(after?.kind === 'free_until' ? after.deadline : '').toBe(deadline)
      expect(detail.stays[0]?.terms.planName).toBe(b.stay.terms.planName)
    })

    it('records a late-change penalty on the drop after the deadline', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(3))
      const fields = fieldsOf(b, { departure: addDays(b.stay.departure, -1) })
      const quoted = await quoteChange(t, k.frontDesk.cookie, fields)
      const firstNight = b.stay.nights[0]?.gross ?? ''
      expect(quoted.data.latePenalty).toMatchObject({ amount: firstNight, drop: firstNight })
      const saved = await modify(t, k.frontDesk.cookie, fields)
      expect(saved.status).toBe(200)
      expect(saved.data.penalties).toEqual([
        expect.objectContaining({ amount: firstNight, status: 'to_charge' }),
      ])
      const [event] = await auditFor(t, k.orgId, 'penalty.recorded', b.id)
      expect(event?.after).toMatchObject({ kind: 'late_change' })
    })

    it('carries a discount within the saver’s limit, and over it only with an approval', async () => {
      const [arrival, departure] = freeNights(2)
      const ten = await bookStay(t, k.frontDesk.cookie, k.vi.id, {
        ...dlkBB(arrival, departure),
        discount: { kind: 'percent', value: '10', reason: 'repeat_guest' },
      })
      const extend = (b: Booked) => fieldsOf(b, { departure: addDays(b.stay.departure, 1) })
      const carried = await quoteChange(t, k.frontDesk.cookie, extend(ten))
      expect(carried.data.discount).toMatchObject({
        percent: '10',
        within: true,
        scope: 'new_nights',
      })
      expect(carried.data.nights.at(-1)?.soldPrice).toBe('151200.00')
      expect((await modify(t, k.frontDesk.cookie, extend(ten))).status).toBe(200)
      const [applied] = await auditFor(t, k.orgId, 'stay.discount_applied', ten.id)
      expect(applied?.after).toMatchObject({ scope: 'new_nights', exception: 'discount' })

      const [a2, d2] = freeNights(2)
      const fifteen = await bookStay(t, k.owner.cookie, k.vi.id, {
        ...dlkBB(a2, d2),
        discount: { kind: 'percent', value: '15', reason: 'long_stay' },
      })
      const over = await modify(t, k.frontDesk.cookie, extend(fifteen))
      expect(over.status).toBe(403)
      expect(over.data.data?.code).toBe('DISCOUNT_OVER_LIMIT')
      expect(over.data.message).toBe(
        '15% is over your 12% discount limit. A manager with a higher limit can approve it, or price the new night without the discount.',
      )
      // Approved by Tunde's PIN on the desk, then saved with it.
      const change = { ...extend(fifteen), idempotencyKey: newId() }
      resetWrongTries()
      const approval = await rpc<ApprovalView>(
        t,
        at(k.frontDesk, k.deviceCookie),
        'approvals/approveHere',
        {
          kind: 'modify_discount',
          change,
          idempotencyKey: newId(),
          approverMemberId: k.gm.memberId,
          pin: PINS.tunde,
        },
      )
      expect(approval.status).toBe(200)
      const quoted = await quoteChange(t, k.frontDesk.cookie, extend(fifteen))
      const saved = await rpc(t, k.frontDesk.cookie, 'reservations/modify', {
        ...change,
        changeHash: quoted.data.changeHash,
        approvalId: approval.data.id,
      })
      expect(saved.status).toBe(200)
      const [used] = await t.db.select().from(approvals).where(eq(approvals.id, approval.data.id))
      expect(used?.usedEntityType).toBe('reservation_change')

      // Or the new nights priced without the discount.
      const [a3, d3] = freeNights(2)
      const again = await bookStay(t, k.owner.cookie, k.vi.id, {
        ...dlkBB(a3, d3),
        discount: { kind: 'percent', value: '15', reason: 'long_stay' },
      })
      const plain = await modify(t, k.frontDesk.cookie, {
        ...extend(again),
        discount: { mode: 'kept_only' },
      })
      expect(plain.status).toBe(200)
    })

    it('refuses a stale version, a changed price and an empty change', async () => {
      const [arrival, departure] = freeNights(2)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const empty = await modify(t, k.frontDesk.cookie, fieldsOf(b))
      expect(empty.data.data?.code).toBe('NOTHING_CHANGED')
      const fields = fieldsOf(b, { departure: addDays(departure, 1) })
      const wrongHash = await rpc(t, k.frontDesk.cookie, 'reservations/modify', {
        idempotencyKey: newId(),
        ...fields,
        changeHash: 'stale',
      })
      expect(wrongHash.data.data?.code).toBe('PRICE_CHANGED')
      expect((await modify(t, k.sade.cookie, fields)).status).toBe(200)
      const stale = await modify(t, k.frontDesk.cookie, fieldsOf(b, { adults: 2 }))
      expect(stale.data.data?.code).toBe('RESERVATION_CHANGED')
      expect(stale.data.message).toMatch(/^Sade Bakare changed this booking at \d\d:\d\d\./)
    })

    it('returns the first result for a retried key and refuses a different change on it', async () => {
      const [arrival, departure] = freeNights(2)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const fields = fieldsOf(b, { departure: addDays(departure, 1) })
      const quoted = await quoteChange(t, k.frontDesk.cookie, fields)
      const body = { idempotencyKey: newId(), ...fields, changeHash: quoted.data.changeHash }
      const first = await rpc(t, k.frontDesk.cookie, 'reservations/modify', body)
      const second = await rpc(t, k.frontDesk.cookie, 'reservations/modify', body)
      expect(second.status).toBe(200)
      expect(second.data).toEqual(first.data)
      const other = await rpc(t, k.frontDesk.cookie, 'reservations/modify', {
        ...body,
        adults: 2,
      })
      expect(other.data.data?.code).toBe('IDEMPOTENCY_CONFLICT')
      expect(other.data.message).toBe('This change was already saved.')
    })
  })

  describe('cancel and no-show', () => {
    it('cancels free before the deadline and releases every night', async () => {
      const [arrival, departure] = freeNights(2)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const quoted = await endQuote(t, k.frontDesk.cookie, b.id, 'cancel')
      expect(quoted.data).toMatchObject({ allowed: true, penalty: null, noPenalty: 'free' })
      expect(quoted.data.released).toEqual([arrival, addDays(arrival, 1)])
      const before = await booked(k.types.dlk.id, arrival)
      const done = await cancel(t, k.frontDesk.cookie, b.id, { note: 'Meeting moved' })
      expect(done.status).toBe(200)
      expect(done.data).toMatchObject({ status: 'cancelled', penalties: [] })
      expect(await booked(k.types.dlk.id, arrival)).toBe(before - 1)
      const detail = await detailOf(t, k.frontDesk.cookie, b.id)
      expect(detail.end).toMatchObject({ kind: 'cancelled', byName: 'Chiamaka Eze' })
      expect(detail.actions).toMatchObject({ modify: false, cancel: false, blocked: 'ended' })
      const again = await cancel(t, k.frontDesk.cookie, b.id)
      expect(again.data.data?.code).toBe('NOT_CHANGEABLE')
    })

    it('records the first-night penalty to charge after the deadline', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(2))
      const quoted = await endQuote(t, k.frontDesk.cookie, b.id, 'cancel')
      const firstNight = b.stay.nights[0]?.gross ?? ''
      expect(quoted.data.penalty).toEqual({
        kind: 'late_cancellation',
        amount: firstNight,
        basisLabel: 'First night',
      })
      const done = await cancel(t, k.frontDesk.cookie, b.id)
      expect(done.data.penalties).toEqual([
        expect.objectContaining({ amount: firstNight, status: 'to_charge' }),
      ])
      const [event] = await auditFor(t, k.orgId, 'reservation.cancelled', b.id)
      expect(event?.reason).toBe('Guest request')
      const list = await rpc<Page<ReservationRow>>(t, k.frontDesk.cookie, 'reservations/list', {
        propertyId: k.vi.id,
        view: 'all',
        q: b.number,
      })
      expect(list.data.items[0]?.penalty).toEqual({ amount: firstNight, waived: false })
    })

    it('releases an unguaranteed stay without a penalty', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(1))
      await t.db
        .update(reservations)
        .set({ guarantee: 'none', depositDue: null, depositDueAt: null })
        .where(eq(reservations.id, b.id))
      const quoted = await endQuote(t, k.frontDesk.cookie, b.id, 'cancel')
      expect(quoted.data.noPenalty).toBe('unguaranteed')
      expect((await cancel(t, k.frontDesk.cookie, b.id)).data.penalties).toEqual([])
    })

    it('marks a no-show from the arrival business date, and not before', async () => {
      const today = {
        roomTypeId: k.types.stq.id,
        ratePlanId: k.bar.id,
        arrival: DAY,
        departure: addDays(DAY, 2),
      }
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, today)
      const before = await booked(k.types.stq.id, DAY)
      const done = await noShow(t, k.frontDesk.cookie, b.id, { note: 'Phone off' })
      expect(done.data.status).toBe('no_show')
      expect(done.data.penalties[0]).toMatchObject({ amount: '147000.00', status: 'to_charge' })
      expect(await booked(k.types.stq.id, DAY)).toBe(before - 1)
      const future = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(1))
      const early = await noShow(t, k.frontDesk.cookie, future.id)
      expect(early.data.data?.code).toBe('NOT_ARRIVED_YET')
      expect(early.data.message).toMatch(/can't be a no-show yet\.$/)
    })

    it('can’t cancel once the arrival has passed, only mark a no-show', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, {
        roomTypeId: k.types.jrs.id,
        ratePlanId: k.bar.id,
        arrival: DAY,
        departure: addDays(DAY, 3),
      })
      await setHotel(t, k.vi.id, { businessDate: addDays(DAY, 1) })
      try {
        const late = await cancel(t, k.frontDesk.cookie, b.id)
        expect(late.data.data?.code).toBe('ARRIVAL_PASSED')
        expect(late.data.message).toBe('Arrival was 25 Nov 2026. Mark it as a no-show.')
        expect((await noShow(t, k.frontDesk.cookie, b.id)).status).toBe(200)
      } finally {
        await setHotel(t, k.vi.id, { businessDate: DAY })
      }
    })

    it('needs a reason in words for Other, and answers a retried cancel once', async () => {
      const [arrival, departure] = freeNights(1)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const other = await cancel(t, k.frontDesk.cookie, b.id, { reason: 'other' })
      expect(other.status).toBe(400)
      const quoted = await endQuote(t, k.frontDesk.cookie, b.id, 'cancel')
      const body = {
        idempotencyKey: newId(),
        reservationId: b.id,
        version: quoted.data.version,
        reason: 'duplicate',
      }
      const [one, two] = await Promise.all([
        rpc(t, k.frontDesk.cookie, 'reservations/cancel', body),
        rpc(t, k.frontDesk.cookie, 'reservations/cancel', body),
      ])
      expect(one.status).toBe(200)
      expect(two.data).toEqual(one.data)
      const rows = await t.db
        .select()
        .from(reservationChanges)
        .where(eq(reservationChanges.reservationId, b.id))
      expect(rows).toHaveLength(1)
    })
  })

  it('answers a retried cancel with its result even after the hotel was archived', async () => {
    const [arrival, departure] = freeNights(1)
    const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
    const version = (await endQuote(t, k.frontDesk.cookie, b.id, 'cancel')).data.version
    const body = {
      idempotencyKey: newId(),
      reservationId: b.id,
      version,
      reason: 'guest_request',
    }
    const first = await rpc(t, k.frontDesk.cookie, 'reservations/cancel', body)
    expect(first.status).toBe(200)
    await t.db.update(properties).set({ archivedAt: new Date() }).where(eq(properties.id, k.vi.id))
    try {
      const retried = await rpc(t, k.frontDesk.cookie, 'reservations/cancel', body)
      expect(retried.status).toBe(200)
      expect(retried.data).toEqual(first.data)
      const fresh = await rpc(t, k.frontDesk.cookie, 'reservations/cancel', {
        ...body,
        idempotencyKey: newId(),
      })
      expect(fresh.data.data?.code).toBe('PROPERTY_ARCHIVED')
    } finally {
      await t.db.update(properties).set({ archivedAt: null }).where(eq(properties.id, k.vi.id))
    }
  })

  describe('waivers', () => {
    const waiverAction = (b: Booked, version: number, reason = 'Regular guest') => ({
      kind: 'penalty_waiver',
      waiver: { target: 'cancel', reservationId: b.id, version, actionKey: newId(), reason },
    })

    it('refuses a front desk waiver without an approval', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(1))
      const done = await cancel(t, k.frontDesk.cookie, b.id, { waive: { reason: 'Regular' } })
      expect(done.status).toBe(403)
      expect(done.data.data).toMatchObject({ code: 'WAIVER_NEEDS_APPROVAL', canAsk: true })
      expect((await detailOf(t, k.frontDesk.cookie, b.id)).status).toBe('confirmed')
    })

    it('lets the GM waive directly, as an exception for the owner', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(1))
      const done = await cancel(t, k.gm.cookie, b.id, {
        waive: { reason: "Hotel's error: wrong dates taken by phone" },
      })
      expect(done.data.penalties[0]?.status).toBe('waived')
      const [event] = await auditFor(t, k.orgId, 'reservation.penalty_waived', b.id)
      expect(event?.actorName).toBe('Tunde Bello')
      expect(event?.after).toMatchObject({ exception: 'penalty_waived', approverMemberId: null })
      const detail = await detailOf(t, k.frontDesk.cookie, b.id)
      expect(detail.penalties[0]?.waived).toMatchObject({
        byName: 'Tunde Bello',
        approverName: null,
      })
    })

    it('asks revenue manager, GM, then owner, and cancels and waives with a PIN at the desk', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(1))
      const quoted = await endQuote(t, k.frontDesk.cookie, b.id, 'cancel')
      const action = waiverAction(b, quoted.data.version, 'Regular guest, rebooking for January')
      const list = await rpc<Approvers>(
        t,
        at(k.frontDesk, k.deviceCookie),
        'approvals/approvers',
        action,
      )
      expect(list.status).toBe(200)
      expect(list.data.approvers.map((a) => a.name)).toEqual([
        'Sade Bakare',
        'Tunde Bello',
        'Adaeze Okafor',
      ])
      resetWrongTries()
      const approval = await rpc<ApprovalView>(
        t,
        at(k.frontDesk, k.deviceCookie),
        'approvals/approveHere',
        {
          ...action,
          idempotencyKey: newId(),
          approverMemberId: k.gm.memberId,
          pin: PINS.tunde,
        },
      )
      expect(approval.status).toBe(200)
      const done = await rpc<{ penalties: { status: string }[] }>(
        t,
        k.frontDesk.cookie,
        'reservations/cancel',
        {
          idempotencyKey: action.waiver.actionKey,
          reservationId: b.id,
          version: quoted.data.version,
          reason: 'guest_request',
          waive: { reason: 'Regular guest, rebooking for January', approvalId: approval.data.id },
        },
      )
      expect(done.status).toBe(200)
      expect(done.data.penalties[0]?.status).toBe('waived')
      const [event] = await auditFor(t, k.orgId, 'reservation.penalty_waived', b.id)
      expect(event?.actorName).toBe('Chiamaka Eze')
      expect(event?.approverMemberId).toBe(k.gm.memberId)
      expect(event?.after).toMatchObject({ approvalMethod: 'pin_here', approvalDevice: 'FD-VI-01' })
      // A different reason doesn't match the approval.
      const other = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(1))
      const q2 = await endQuote(t, k.frontDesk.cookie, other.id, 'cancel')
      const a2 = waiverAction(other, q2.data.version, 'Asked for this')
      await clearPin(t, k.gm.memberId)
      const given = await rpc<ApprovalView>(
        t,
        at(k.frontDesk, k.deviceCookie),
        'approvals/approveHere',
        {
          ...a2,
          idempotencyKey: newId(),
          approverMemberId: k.gm.memberId,
          pin: PINS.tunde,
        },
      )
      const mismatch = await cancel(t, k.frontDesk.cookie, other.id, {
        waive: { reason: 'Something else', approvalId: given.data.id },
      })
      expect(mismatch.data.data?.code).toBe('APPROVAL_NOT_MATCHING')
    })

    it('applies an inbox waiver when the approver approves, naming both', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(1))
      const done = await noShowOrCancel(b)
      const penaltyId = done.penalties[0]?.id ?? ''
      const inboxOnCancel = await rpc(t, k.frontDesk.cookie, 'approvals/request', {
        ...waiverAction(b, 1),
        idempotencyKey: newId(),
        approverMemberId: k.gm.memberId,
      })
      expect(inboxOnCancel.data.data?.code).toBe('APPROVAL_NOT_NEEDED')
      const request = await rpc<ApprovalView>(t, k.frontDesk.cookie, 'approvals/request', {
        kind: 'penalty_waiver',
        waiver: { target: 'penalty', penaltyId, reason: 'Flight cancelled, guest called 21:30' },
        idempotencyKey: newId(),
        approverMemberId: k.gm.memberId,
      })
      expect(request.status).toBe(200)
      let detail = await detailOf(t, k.frontDesk.cookie, b.id)
      expect(detail.penalties[0]?.request).toMatchObject({
        status: 'pending',
        approverName: 'Tunde Bello',
      })
      await clearPin(t, k.gm.memberId)
      const approved = await rpc<ApprovalView>(t, k.gm.cookie, 'approvals/approve', {
        id: request.data.id,
        pin: PINS.tunde,
      })
      expect(approved.status).toBe(200)
      expect(approved.data.usedAt).not.toBeNull()
      detail = await detailOf(t, k.frontDesk.cookie, b.id)
      expect(detail.penalties[0]).toMatchObject({ status: 'waived', request: null })
      expect(detail.penalties[0]?.waived).toMatchObject({
        byName: 'Chiamaka Eze',
        approverName: 'Tunde Bello',
        method: 'inbox',
      })
      const [event] = await auditFor(t, k.orgId, 'reservation.penalty_waived', b.id)
      expect(event?.actorName).toBe('Tunde Bello')
      expect(event?.after).toMatchObject({
        requestedBy: { name: 'Chiamaka Eze' },
        exception: 'penalty_waived',
      })
      // Already waived: nothing left to waive.
      const twice = await rpc(t, k.gm.cookie, 'penalties/waive', {
        idempotencyKey: newId(),
        penaltyId,
        reason: 'Again',
      })
      expect(twice.data.data?.code).toBe('PENALTY_NOT_OPEN')
      expect(twice.data.message).toMatch(/^This penalty was already waived by Chiamaka Eze at/)
    })

    it('leaves a declined waiver to charge, with the answer on the Penalty card', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(1))
      const done = await noShowOrCancel(b)
      const penaltyId = done.penalties[0]?.id ?? ''
      const request = await rpc<ApprovalView>(t, k.frontDesk.cookie, 'approvals/request', {
        kind: 'penalty_waiver',
        waiver: { target: 'penalty', penaltyId, reason: 'Please' },
        idempotencyKey: newId(),
        approverMemberId: k.gm.memberId,
      })
      await rpc(t, k.gm.cookie, 'approvals/decline', {
        id: request.data.id,
        comment: 'Policy applies for this rate',
      })
      const detail = await detailOf(t, k.frontDesk.cookie, b.id)
      expect(detail.penalties[0]).toMatchObject({
        status: 'to_charge',
        request: { status: 'declined', comment: 'Policy applies for this rate' },
      })
      expect(detail.activity.map((a) => a.title)).toContain('Tunde Bello declined the waiver')
      // A manager can still waive it from the card.
      const waived = await rpc<PenaltyView>(t, k.sade.cookie, 'penalties/waive', {
        idempotencyKey: newId(),
        penaltyId,
        reason: 'Corporate goodwill',
      })
      expect(waived.data.status).toBe('waived')
    })

    it('refuses a waiver asked of yourself, and of a manager who can waive it themselves', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(1))
      const penaltyId = (await noShowOrCancel(b)).penalties[0]?.id ?? ''
      const ask = (cookie: string, approverMemberId: string) =>
        rpc(t, cookie, 'approvals/request', {
          kind: 'penalty_waiver',
          waiver: { target: 'penalty', penaltyId, reason: 'Please' },
          idempotencyKey: newId(),
          approverMemberId,
        })
      const self = await ask(k.frontDesk.cookie, k.frontDesk.memberId)
      expect(self.data.data?.code).toBe('SELF_APPROVAL')
      const manager = await ask(k.gm.cookie, k.owner.memberId)
      expect(manager.data.data?.code).toBe('APPROVAL_NOT_NEEDED')
    })

    it('refuses an inbox approval for a penalty waived meanwhile, and leaves the approval unused', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(1))
      const penaltyId = (await noShowOrCancel(b)).penalties[0]?.id ?? ''
      const request = await rpc<ApprovalView>(t, k.frontDesk.cookie, 'approvals/request', {
        kind: 'penalty_waiver',
        waiver: { target: 'penalty', penaltyId, reason: 'Flight cancelled' },
        idempotencyKey: newId(),
        approverMemberId: k.gm.memberId,
      })
      const direct = await rpc(t, k.sade.cookie, 'penalties/waive', {
        idempotencyKey: newId(),
        penaltyId,
        reason: 'Corporate goodwill',
      })
      expect(direct.status).toBe(200)
      await clearPin(t, k.gm.memberId)
      const late = await rpc(t, k.gm.cookie, 'approvals/approve', {
        id: request.data.id,
        pin: PINS.tunde,
      })
      expect(late.data.data?.code).toBe('PENALTY_NOT_OPEN')
      expect(late.data.message).toMatch(/^This penalty was already waived by Sade Bakare at/)
      const [row] = await t.db.select().from(approvals).where(eq(approvals.id, request.data.id))
      expect(row).toMatchObject({ status: 'pending', usedAt: null })
      const detail = await detailOf(t, k.frontDesk.cookie, b.id)
      expect(detail.penalties[0]?.waived).toMatchObject({
        byName: 'Sade Bakare',
        approverName: null,
      })
    })

    it('won’t let a manager limited to another hotel waive this hotel’s penalty', async () => {
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, lateStay(1))
      const penaltyId = (await noShowOrCancel(b)).penalties[0]?.id ?? ''
      const elsewhere = await person(t, k.orgId, 'Ngozi Ikeja', 'general_manager')
      await limitTo(t, k.owner, elsewhere, [k.ikeja.id])
      const refused = await rpc(t, elsewhere.cookie, 'penalties/waive', {
        idempotencyKey: newId(),
        penaltyId,
        reason: 'Not my hotel',
      })
      expect(refused.status).toBe(404)
      const [row] = await t.db.select().from(penalties).where(eq(penalties.id, penaltyId))
      expect(row?.status).toBe('to_charge')
    })

    async function noShowOrCancel(b: Booked) {
      const done = await cancel(t, k.frontDesk.cookie, b.id)
      if (done.status !== 200) throw new Error(done.data.message)
      return done.data
    }
  })

  describe('isolation and permissions', () => {
    it('hides another group’s reservation and another hotel’s from a member without it', async () => {
      const [arrival, departure] = freeNights(1)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      const outside = await quoteChange(t, k.other.cookie, fieldsOf(b))
      expect(outside.status).toBe(404)
      const outsideCancel = await rpc(t, k.other.cookie, 'reservations/cancel', {
        idempotencyKey: newId(),
        reservationId: b.id,
        version: 1,
        reason: 'guest_request',
      })
      expect(outsideCancel.status).toBe(404)
      const ph = await person(t, k.orgId, 'Ngozi Ph', 'front_desk')
      await limitTo(t, k.owner, ph, [k.ph.id])
      const scoped = await endQuote(t, ph.cookie, b.id, 'cancel')
      expect(scoped.data.data?.code).toBe('PROPERTY_NOT_FOUND')
      const cashier = await endQuote(t, k.cashier.cookie, b.id, 'cancel')
      expect(cashier.status).toBe(403)
      expect(cashier.data.message).toBe(
        'Only front desk, revenue managers, GMs and the owner can change reservations. Ask your GM.',
      )
      expect(
        (await t.db.select().from(penalties).where(eq(penalties.reservationId, b.id))).length,
      ).toBe(0)
    })

    it('is behind the front desk switch', async () => {
      const [arrival, departure] = freeNights(1)
      const b = await bookStay(t, k.frontDesk.cookie, k.vi.id, dlkBB(arrival, departure))
      await switchFeature(t.db, k.orgId, { feature: 'front_desk', to: 'off', reason: 'Test' })
      try {
        const off = await endQuote(t, k.frontDesk.cookie, b.id, 'cancel')
        expect(off.data.data?.code).toBe('FEATURE_OFF')
      } finally {
        await switchFeature(t.db, k.orgId, { feature: 'front_desk', to: 'on', reason: 'Test' })
      }
    })
  })
})
