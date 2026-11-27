// Approvals against the test database through the real HTTP flow (spec: stage-1-approvals.md,
// "Tests"): who can approve, approve here by PIN on a registered device, the inbox, expiry, use at
// Book, organization isolation and property scoping, and background polls on a PIN session.
import type {
  ApprovalDetail,
  ApprovalView,
  Approvers,
  Page,
  ReservationDetail,
} from '@vento/shared'
import { addDays, newId } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { approvals } from '../db/schema/approvals.ts'
import { sessions } from '../db/schema/auth.ts'
import { memberPins } from '../db/schema/tenancy.ts'
import { DAY, type Problem } from '../reservations/testing.ts'
import { limitTo, person } from '../tenancy/testing.ts'
import { createTestApp } from '../test/harness.ts'
import { expireApprovals, storedStatus } from './expire.ts'
import {
  at,
  auditFor,
  clearPin,
  draftFor,
  type KoraApprovals,
  koraApprovals,
  PINS,
  withApproval,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL

type Result<T> = { status: number; data: T & Problem & { data?: Record<string, unknown> } }

describe.skipIf(!url)('approvals', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraApprovals
  // Each test books its own nights, so Deluxe King never sells out under another test.
  let day = 0
  const nights = (n = 3) => {
    const arrival = addDays(DAY, 20 + day)
    day += n + 1
    return [arrival, addDays(arrival, n)] as const
  }
  const rpc = <T>(cookie: string, path: string, input: unknown) =>
    t.rpc(cookie, path, input) as Promise<Result<T>>
  const draft = async (percent = '15', who = k.frontDesk) => {
    const [arrival, departure] = nights()
    return draftFor(t, k, who, arrival, departure, percent)
  }
  const action = (booking: unknown) => ({ kind: 'stay_discount', booking, stayIndex: 0 })
  const deskHere = () => at(k.frontDesk, k.deviceCookie)
  const approveHere = (booking: unknown, approver: { memberId: string }, pin: string) =>
    rpc<ApprovalView>(deskHere(), 'approvals/approveHere', {
      ...action(booking),
      approverMemberId: approver.memberId,
      pin,
    })
  const ask = (booking: unknown, approver: { memberId: string }, key = newId()) =>
    rpc<ApprovalView>(k.frontDesk.cookie, 'approvals/request', {
      ...action(booking),
      idempotencyKey: key,
      approverMemberId: approver.memberId,
    })
  const create = (cookie: string, booking: unknown) =>
    rpc<{ id: string; number: string }>(cookie, 'reservations/create', booking)

  beforeAll(async () => {
    k = await koraApprovals(t)
  })

  describe('who can approve', () => {
    it('lists managers at the hotel whose limit covers it, lowest limit first, never the requester', async () => {
      const list = await rpc<Approvers>(
        k.frontDesk.cookie,
        'approvals/approvers',
        action(await draft()),
      )
      expect(list.status).toBe(200)
      expect(list.data.approvers.map((a) => [a.name, a.limit])).toEqual([
        ['Sade Bakare', '25.00'],
        ['Tunde Bello', '50.00'],
        ['Adaeze Okafor', null],
      ])
      expect(list.data.approvers.map((a) => a.memberId)).not.toContain(k.frontDesk.memberId)
      expect(list.data.canApproveHere).toBe(false)
      expect(list.data.subject).toMatchObject({
        guestName: 'Sarah Collins',
        planPrice: '168000.00',
        newPrice: '142800.00',
        percent: '15',
        discountTotal: '75600.00',
        totalBefore: '617400.00',
        totalAfter: '524790.00',
        requesterLimit: '12',
      })
      const thirty = await rpc<Approvers>(
        k.frontDesk.cookie,
        'approvals/approvers',
        action(await draft('30')),
      )
      expect(thirty.data.approvers.map((a) => a.name)).toEqual(['Tunde Bello', 'Adaeze Okafor'])
    })

    it('offers approve-here only on a registered device of the hotel', async () => {
      const list = await rpc<Approvers>(deskHere(), 'approvals/approvers', action(await draft()))
      expect(list.data.canApproveHere).toBe(true)
      expect(list.data.subject.deviceName).toBe('FD-VI-01')
    })

    it('names people with a high enough limit who have no PIN yet', async () => {
      const bola = await person(t, k.orgId, 'Bola Ade', 'general_manager')
      await limitTo(t, k.owner, bola, [k.vi.id])
      const list = await rpc<Approvers>(
        k.frontDesk.cookie,
        'approvals/approvers',
        action(await draft()),
      )
      expect(list.data.withoutPin).toEqual(['Bola Ade'])
      expect(list.data.approvers.map((a) => a.name)).not.toContain('Bola Ade')
    })

    it('says a discount within the limit needs no approval', async () => {
      const list = await rpc(k.frontDesk.cookie, 'approvals/approvers', action(await draft('10')))
      expect(list.data.data?.code).toBe('APPROVAL_NOT_NEEDED')
    })

    it('refuses self-approval in every procedure, whatever ids are sent', async () => {
      const booking = await draft()
      const here = await approveHere(booking, k.frontDesk, PINS.chiamaka)
      expect(here.data.data?.code).toBe('SELF_APPROVAL')
      const inbox = await ask(booking, k.frontDesk)
      expect(inbox.data.data?.code).toBe('SELF_APPROVAL')
      const asked = await ask(booking, k.gm)
      const own = await rpc(k.frontDesk.cookie, 'approvals/approve', {
        id: asked.data.id,
        pin: PINS.chiamaka,
      })
      expect(own.data.data?.code).toBe('SELF_APPROVAL')
      await rpc(k.frontDesk.cookie, 'approvals/cancel', { id: asked.data.id, reason: 'discarded' })
    })

    it("refuses an approver who doesn't work at the hotel or isn't in the group", async () => {
      const ikejaGm = await person(t, k.orgId, 'Kemi Adeyemi', 'general_manager')
      await limitTo(t, k.owner, ikejaGm, [k.ikeja.id])
      const booking = await draft()
      const elsewhere = await ask(booking, ikejaGm)
      expect(elsewhere.data.data?.code).toBe('APPROVER_NOT_ELIGIBLE')
      const outsider = await ask(booking, k.other)
      expect(outsider.data.data?.code).toBe('APPROVER_NOT_ELIGIBLE')
      expect(outsider.data.message).not.toContain('Other Owner')
      // Sade's 25% doesn't cover 30%.
      const over = await ask(await draft('30'), k.sade)
      expect(over.data.message).toBe("Sade Bakare can't approve 30% at Kora Victoria Island.")
    })
  })

  describe('approve here, by PIN', () => {
    it('needs a registered device of the hotel', async () => {
      const result = await rpc(k.frontDesk.cookie, 'approvals/approveHere', {
        ...action(await draft()),
        approverMemberId: k.gm.memberId,
        pin: PINS.tunde,
      })
      expect(result.data.data?.code).toBe('PIN_HERE_NEEDS_DEVICE')
    })

    it('approves with the right PIN, then books once with the approver on the audit event', async () => {
      const booking = await draft()
      const wrong = await approveHere(booking, k.gm, '1111')
      expect(wrong.data.data).toMatchObject({ code: 'WRONG_PIN', triesLeft: 4 })
      expect(wrong.data.message).toBe("That PIN didn't match. 4 tries left.")
      const granted = await approveHere(booking, k.gm, PINS.tunde)
      expect(granted.status).toBe(200)
      expect(granted.data).toMatchObject({
        status: 'approved',
        method: 'pin_here',
        approver: { name: 'Tunde Bello' },
      })
      const [pin] = await t.db
        .select({ tries: memberPins.failedAttempts })
        .from(memberPins)
        .where(eq(memberPins.memberId, k.gm.memberId))
      expect(pin?.tries).toBe(0)

      const withIt = withApproval(booking, granted.data.id)
      const booked = await create(deskHere(), withIt)
      expect(booked.status).toBe(200)
      const [event] = await auditFor(t, k.orgId, 'stay.discount_applied', booked.data.id)
      expect(event?.approverMemberId).toBe(k.gm.memberId)
      expect(event?.after).toMatchObject({
        approvalId: granted.data.id,
        approverName: 'Tunde Bello',
        approverLimit: '50.00',
        approvalMethod: 'pin_here',
        approvalDevice: 'FD-VI-01',
        approverMemberId: k.gm.memberId,
      })
      const [grantEvent] = await auditFor(t, k.orgId, 'approval.granted', granted.data.id)
      expect(grantEvent?.approverMemberId).toBe(k.gm.memberId)
      expect(grantEvent?.actorMemberId).toBe(k.frontDesk.memberId)
      expect(JSON.stringify(grantEvent?.after)).not.toMatch(/\+44|@/)

      const view = await rpc<ReservationDetail>(k.owner.cookie, 'reservations/get', {
        id: booked.data.id,
      })
      expect(view.data.stays[0]?.discount).toMatchObject({
        percent: '15',
        byName: 'Chiamaka Eze',
        approverName: 'Tunde Bello',
      })
      expect(view.data.activity.find((a) => a.action === 'stay.discount_applied')?.detail).toMatch(
        /Approved by Tunde Bello \(PIN on FD-VI-01\)$/,
      )

      // A retry of the same booking returns it; a second booking can't reuse the approval.
      const replay = await create(deskHere(), withIt)
      expect(replay.data.id).toBe(booked.data.id)
      const again = await create(deskHere(), { ...withIt, idempotencyKey: newId() })
      expect(again.data.data?.code).toBe('APPROVAL_USED')
      expect(again.data.message).toBe(
        `This approval was already used for ${booked.data.number}. Ask again for a new booking.`,
      )
      const used = await rpc<ApprovalDetail>(k.frontDesk.cookie, 'approvals/get', {
        id: granted.data.id,
      })
      expect(used.data).toMatchObject({ usedFor: booked.data.number, draft: null })
    })

    it('counts wrong tries with the lock screen: 3 there and 2 here lock the PIN', async () => {
      await clearPin(t, k.sade.memberId)
      for (let i = 0; i < 3; i++) {
        const response = await t.call('/api/auth/device/pin-sign-in', {
          cookie: k.deviceCookie,
          body: { memberId: k.sade.memberId, pin: '0000' },
        })
        expect(response.status).toBe(401)
      }
      const booking = await draft()
      const fourth = await approveHere(booking, k.sade, '0000')
      expect(fourth.data.data).toMatchObject({ code: 'WRONG_PIN', triesLeft: 1 })
      const fifth = await approveHere(booking, k.sade, '0000')
      expect(fifth.data.data?.code).toBe('PIN_LOCKED')
      expect(fifth.data.message).toMatch(
        /^Too many tries\. Sade's PIN is locked until \d\d:\d\d\. Pick another manager or send it to an inbox\.$/,
      )
      const [locked] = await auditFor(t, k.orgId, 'pin.locked', k.sade.memberId)
      expect(locked?.actorName).toBe('Approvals')
      expect(locked?.deviceId).toBe(k.device.id)
      // The right PIN doesn't help while locked.
      expect((await approveHere(booking, k.sade, PINS.sade)).data.data?.code).toBe('PIN_LOCKED')
    })

    it('needs a manager reset after the third lockout', async () => {
      await t.db
        .update(memberPins)
        .set({ failedAttempts: 4, lockedUntil: null, lockCount: 2 })
        .where(eq(memberPins.memberId, k.sade.memberId))
      const result = await approveHere(await draft(), k.sade, '0000')
      expect(result.data.data?.code).toBe('PIN_NEEDS_RESET')
      expect(result.data.message).toBe("Sade's PIN needs a reset by a manager.")
      const list = await rpc<Approvers>(
        k.frontDesk.cookie,
        'approvals/approvers',
        action(await draft()),
      )
      expect(list.data.approvers.map((a) => a.name)).not.toContain('Sade Bakare')
      await clearPin(t, k.sade.memberId)
    })
  })

  describe('the inbox', () => {
    it('asks once per key, shows the request to the addressed approver only, and books after approval', async () => {
      const booking = await draft()
      const key = newId()
      const first = await ask(booking, k.gm, key)
      expect(first.status).toBe(200)
      expect(first.data.status).toBe('pending')
      const twice = await ask(booking, k.gm, key)
      expect(twice.data.id).toBe(first.data.id)

      const count = await rpc<{ waiting: number }>(k.gm.cookie, 'approvals/count', {
        propertyId: k.vi.id,
      })
      expect(count.data.waiting).toBeGreaterThanOrEqual(1)
      const waiting = await rpc<Page<ApprovalView>>(k.gm.cookie, 'approvals/list', {
        view: 'waiting',
      })
      expect(waiting.data.items.map((item) => item.id)).toContain(first.data.id)

      const asApprover = await rpc<ApprovalDetail>(k.gm.cookie, 'approvals/get', {
        id: first.data.id,
      })
      expect(asApprover.data.draft).toBeNull()
      const asRequester = await rpc<ApprovalDetail>(k.frontDesk.cookie, 'approvals/get', {
        id: first.data.id,
      })
      expect(asRequester.data.draft?.idempotencyKey).toBe(booking.idempotencyKey)
      const sade = await rpc(k.sade.cookie, 'approvals/get', { id: first.data.id })
      expect(sade.status).toBe(404)
      const [requested] = await auditFor(t, k.orgId, 'approval.requested', first.data.id)
      expect(JSON.stringify(requested?.after)).not.toMatch(/\+44|7700|@/)

      const wrong = await rpc(k.gm.cookie, 'approvals/approve', { id: first.data.id, pin: '1111' })
      expect(wrong.data.data?.code).toBe('WRONG_PIN')
      const approved = await rpc<ApprovalView>(k.gm.cookie, 'approvals/approve', {
        id: first.data.id,
        pin: PINS.tunde,
      })
      expect(approved.data).toMatchObject({ status: 'approved', method: 'inbox' })
      const again = await rpc(k.gm.cookie, 'approvals/approve', {
        id: first.data.id,
        pin: PINS.tunde,
      })
      expect(again.data.message).toMatch(/^You already approved this request at \d\d:\d\d\.$/)

      const booked = await create(k.frontDesk.cookie, withApproval(booking, first.data.id))
      expect(booked.status).toBe(200)
      const [event] = await auditFor(t, k.orgId, 'stay.discount_applied', booked.data.id)
      expect(event?.after).toMatchObject({ approvalMethod: 'inbox', approverName: 'Tunde Bello' })
    })

    it('needs a comment to decline, and clears the draft', async () => {
      const asked = await ask(await draft('18'), k.gm)
      const bare = await rpc(k.gm.cookie, 'approvals/decline', { id: asked.data.id, comment: ' ' })
      expect(bare.data.data?.code).toBe('COMMENT_REQUIRED')
      expect(bare.data.message).toBe('Add a comment so Chiamaka knows why.')
      expect(await auditFor(t, k.orgId, 'approval.declined', asked.data.id)).toHaveLength(0)
      const declined = await rpc<ApprovalView>(k.gm.cookie, 'approvals/decline', {
        id: asked.data.id,
        comment: 'Max 12% this week',
      })
      expect(declined.data).toMatchObject({ status: 'declined', comment: 'Max 12% this week' })
      expect((await storedStatus(t.db, asked.data.id))?.draft).toBeNull()
      const [event] = await auditFor(t, k.orgId, 'approval.declined', asked.data.id)
      expect(event?.reason).toBe('Max 12% this week')
    })

    it('lets only the requester cancel, and then the approver is told', async () => {
      const asked = await ask(await draft(), k.gm)
      const byGm = await rpc(k.gm.cookie, 'approvals/cancel', {
        id: asked.data.id,
        reason: 'discarded',
      })
      expect(byGm.status).toBe(404)
      const cancelled = await rpc<ApprovalView>(k.frontDesk.cookie, 'approvals/cancel', {
        id: asked.data.id,
        reason: 'by_requester',
      })
      expect(cancelled.data.status).toBe('cancelled')
      const late = await rpc(k.gm.cookie, 'approvals/approve', {
        id: asked.data.id,
        pin: PINS.tunde,
      })
      expect(late.data.message).toMatch(/^Chiamaka cancelled this request at \d\d:\d\d\.$/)
    })

    it('asking again for the same booking cancels the earlier request', async () => {
      const booking = await draft()
      const first = await ask(booking, k.gm)
      const second = await ask(booking, k.owner)
      expect(second.status).toBe(200)
      expect((await storedStatus(t.db, first.data.id))?.status).toBe('cancelled')
    })

    it('lets exactly one of approve and cancel win when they race', async () => {
      for (let round = 0; round < 10; round++) {
        const asked = await ask(await draft(), k.owner)
        const [approve, cancel] = await Promise.all([
          rpc(k.owner.cookie, 'approvals/approve', { id: asked.data.id, pin: PINS.owner }),
          rpc(k.frontDesk.cookie, 'approvals/cancel', {
            id: asked.data.id,
            reason: 'by_requester',
          }),
        ])
        expect([approve.status, cancel.status].filter((s) => s === 200)).toHaveLength(1)
      }
    })

    it('refuses a request from someone who no longer works at the hotel', async () => {
      const ibrahim = await person(t, k.orgId, 'Ibrahim Musa', 'front_desk')
      await limitTo(t, k.owner, ibrahim, [k.vi.id])
      const [arrival, departure] = nights()
      const booking = await draftFor(t, k, ibrahim, arrival, departure, '15')
      const asked = await rpc<ApprovalView>(ibrahim.cookie, 'approvals/request', {
        ...action(booking),
        idempotencyKey: newId(),
        approverMemberId: k.gm.memberId,
      })
      expect(asked.status).toBe(200)
      await limitTo(t, k.owner, ibrahim, [k.ikeja.id])
      const result = await rpc(k.gm.cookie, 'approvals/approve', {
        id: asked.data.id,
        pin: PINS.tunde,
      })
      expect(result.data.message).toBe('Ibrahim Musa no longer works at Kora Victoria Island.')
    })
  })

  describe('expiry', () => {
    it('reads as expired once the time passes, and the job stores it once with its event', async () => {
      const asked = await ask(await draft(), k.gm)
      await t.db
        .update(approvals)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(approvals.id, asked.data.id))
      const read = await rpc<ApprovalDetail>(k.frontDesk.cookie, 'approvals/get', {
        id: asked.data.id,
      })
      expect(read.data).toMatchObject({ status: 'expired', draft: null })
      const late = await rpc(k.gm.cookie, 'approvals/approve', {
        id: asked.data.id,
        pin: PINS.tunde,
      })
      expect(late.data.message).toMatch(/^This request expired at \d\d:\d\d\.$/)
      expect(await expireApprovals(t.db)).toBeGreaterThanOrEqual(1)
      expect(await storedStatus(t.db, asked.data.id)).toEqual({ status: 'expired', draft: null })
      await expireApprovals(t.db)
      const events = await auditFor(t, k.orgId, 'approval.expired', asked.data.id)
      expect(events).toHaveLength(1)
      expect(events[0]?.after).toMatchObject({ was: 'pending' })
    })

    it('refuses an approval past its time or from an earlier business date at Book', async () => {
      const booking = await draft()
      const granted = await approveHere(booking, k.gm, PINS.tunde)
      await t.db
        .update(approvals)
        .set({ businessDate: addDays(DAY, -1) })
        .where(eq(approvals.id, granted.data.id))
      const old = await create(deskHere(), withApproval(booking, granted.data.id))
      expect(old.data.data?.code).toBe('APPROVAL_EXPIRED')
      await t.db
        .update(approvals)
        .set({ businessDate: DAY, expiresAt: new Date(Date.now() - 1000) })
        .where(eq(approvals.id, granted.data.id))
      const late = await create(deskHere(), withApproval(booking, granted.data.id))
      expect(late.data.message).toMatch(/^Tunde's approval expired at \d\d:\d\d\. Ask again\.$/)
    })
  })

  describe('using an approval at Book', () => {
    it('refuses over the limit without one, and says it can be asked', async () => {
      const result = await create(k.frontDesk.cookie, await draft())
      expect(result.status).toBe(403)
      expect(result.data.data).toMatchObject({ code: 'DISCOUNT_OVER_LIMIT', canAsk: true })
    })

    it('refuses another stay, another requester and another hotel', async () => {
      const booking = await draft()
      const granted = await approveHere(booking, k.gm, PINS.tunde)
      const other = await draft()
      const moved = await create(deskHere(), withApproval(other, granted.data.id))
      expect(moved.data.data?.code).toBe('APPROVAL_NOT_MATCHING')
      expect(moved.data.message).toBe('The booking changed after Tunde approved it. Ask again.')
      const [arrival, departure] = [
        booking.stays[0]?.arrival ?? '',
        booking.stays[0]?.departure ?? '',
      ]
      const byOwner = await draftFor(t, k, k.owner, arrival, departure)
      const someoneElse = await create(k.owner.cookie, withApproval(byOwner, granted.data.id))
      expect(someoneElse.status).toBe(404)
      const outsider = await create(k.other.cookie, {
        ...withApproval(booking, granted.data.id),
        propertyId: k.otherHotel.id,
      })
      expect(outsider.status).toBe(404)
      // Still usable for the stay it was given for.
      expect((await create(deskHere(), withApproval(booking, granted.data.id))).status).toBe(200)
    })

    it("refuses an approval whose approver can't approve that much any more", async () => {
      const booking = await draft()
      const granted = await approveHere(booking, k.gm, PINS.tunde)
      await t.rpc(k.owner.cookie, 'permissions/set', {
        role: 'general_manager',
        permission: 'stay.rate_override',
        allowed: true,
        limit: '10',
        reason: 'Tighter this week',
      })
      const result = await create(deskHere(), withApproval(booking, granted.data.id))
      expect(result.data.data?.code).toBe('APPROVAL_NO_LONGER_VALID')
      expect(result.data.message).toBe(
        'Tunde Bello can no longer approve 15%. Ask another manager.',
      )
      await t.rpc(k.owner.cookie, 'permissions/set', {
        role: 'general_manager',
        permission: 'stay.rate_override',
        allowed: true,
        limit: '50',
        reason: 'Back to normal',
      })
    })
  })

  describe('organization isolation and property scoping', () => {
    let id: string
    beforeAll(async () => {
      id = (await ask(await draft(), k.owner)).data.id
    })

    it("answers another group's member with not found everywhere", async () => {
      expect((await rpc(k.other.cookie, 'approvals/get', { id })).status).toBe(404)
      expect((await rpc(k.other.cookie, 'approvals/approve', { id, pin: '1234' })).status).toBe(404)
      expect((await rpc(k.other.cookie, 'approvals/decline', { id, comment: 'No' })).status).toBe(
        404,
      )
      expect(
        (await rpc(k.other.cookie, 'approvals/cancel', { id, reason: 'discarded' })).status,
      ).toBe(404)
      const list = await rpc<Page<ApprovalView>>(k.other.cookie, 'approvals/list', {
        view: 'waiting',
      })
      expect(list.data.total).toBe(0)
      const theirs = await rpc(k.other.cookie, 'approvals/list', { propertyId: k.vi.id })
      expect(theirs.data.data?.code).toBe('PROPERTY_NOT_FOUND')
    })

    it('follows the hotel switch: one hotel, or every hotel the member sees', async () => {
      const vi = await rpc<Page<ApprovalView>>(k.owner.cookie, 'approvals/list', {
        view: 'waiting',
        propertyId: k.vi.id,
      })
      expect(vi.data.items.map((item) => item.id)).toContain(id)
      const ikeja = await rpc<Page<ApprovalView>>(k.owner.cookie, 'approvals/list', {
        view: 'waiting',
        propertyId: k.ikeja.id,
      })
      expect(ikeja.data.items).toHaveLength(0)
      const all = await rpc<Page<ApprovalView>>(k.owner.cookie, 'approvals/list', {
        view: 'waiting',
      })
      expect(all.data.items.map((item) => item.id)).toContain(id)
      expect(all.data).toMatchObject({ page: 1, pageSize: 50 })
      const notHers = await rpc(k.frontDesk.cookie, 'approvals/list', {
        view: 'asked',
        propertyId: k.ikeja.id,
      })
      expect(notHers.data.data?.code).toBe('PROPERTY_NOT_FOUND')
    })
  })

  describe('a PIN session on the shared PC', () => {
    it("doesn't count background polls as activity", async () => {
      const signIn = await t.call('/api/auth/device/pin-sign-in', {
        cookie: k.deviceCookie,
        body: { memberId: k.frontDesk.memberId, pin: PINS.chiamaka },
      })
      expect(signIn.status).toBe(200)
      const session = signIn.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ')
      const cookie = `${session}; ${k.deviceCookie}`
      const [row] = await t.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.deviceId, k.device.id))
      const past = new Date(Date.now() - 60_000)
      await t.db
        .update(sessions)
        .set({ deviceActiveAt: past })
        .where(eq(sessions.id, row?.id ?? ''))
      const activeAt = async () =>
        (
          await t.db
            .select({ at: sessions.deviceActiveAt })
            .from(sessions)
            .where(eq(sessions.id, row?.id ?? ''))
        )[0]?.at?.getTime()
      expect((await t.rpc(cookie, 'approvals/count', {})).status).toBe(200)
      expect(await activeAt()).toBe(past.getTime())
      // A PIN session sees only the device's hotel.
      const ikeja = await t.rpc<Problem>(cookie, 'approvals/count', { propertyId: k.ikeja.id })
      expect(ikeja.status).toBe(404)
      await t.rpc(cookie, 'organization/current')
      expect(await activeAt()).toBeGreaterThan(past.getTime())
    })
  })
})
