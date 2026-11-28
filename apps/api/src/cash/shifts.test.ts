// Cashier shifts and cash drawers against the test database through the real HTTP flow (spec:
// stage-1-cashier-shifts.md, "Tests"): drawers, opening with a hand-over, the blind count across
// every procedure, submit (snapshot, FX, immutability), close (reason, float, bag, limit and
// approval), permissions, organization isolation and property scoping.

import type { ShiftRow, ShiftView } from '@vento/shared'
import { type ApprovalView, EMPTY_COUNT, newId, type Page, type ShiftDetail } from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cashierShiftCountLines, cashierShifts } from '../db/schema/cash.ts'
import { auditEvents } from '../db/schema/governance.ts'
import { switchFeature } from '../features/switches.ts'
import { limitTo, type Problem, person } from '../tenancy/testing.ts'
import { createTestApp } from '../test/harness.ts'
import {
  approvalRow,
  at,
  close,
  countOf,
  type KoraCash,
  koraCash,
  myShift,
  open,
  PINS,
  submit,
  thousands,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL

type Result<T> = { status: number; data: T & Problem & { data?: Record<string, unknown> } }

// No expected or counted figure, anywhere in the response (the blind count).
const BLIND =
  /"(expected|expectedNgn|counted|countedNgn|lines|totalDifference|cashCounted|differenceNgn|cashDifference)"\s*:\s*(?!null)/

function blind(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(BLIND)
}

describe.skipIf(!url)('cashier shifts', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraCash
  const rpc = <T>(cookie: string, path: string, input: unknown) =>
    t.rpc(cookie, path, input) as Promise<Result<T>>
  const events = (entityId: string, action: string) =>
    t.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, entityId), eq(auditEvents.action, action)))

  let first: ShiftView

  beforeAll(async () => {
    k = await koraCash(t)
  }, 60_000)

  describe('drawers', () => {
    it('gives every hotel Desk 1 when it is created', async () => {
      for (const hotel of [k.ikeja, k.ph]) {
        const list = await rpc<Page<{ name: string }>>(k.finance.cookie, 'cash/drawers/list', {
          propertyId: hotel.id,
        })
        expect(list.data.items.map((d) => d.name)).toEqual(['Desk 1'])
      }
      expect(k.desk1.terminals.map((t) => t.label)).toEqual(['Moniepoint · Desk 1'])
      expect(k.desk2.now).toEqual({ kind: 'free', floatLeft: '0.00' })
    })

    it('refuses a name already used at the hotel, a terminal of another hotel, and the front desk', async () => {
      const taken = await rpc(k.finance.cookie, 'cash/drawers/create', {
        propertyId: k.vi.id,
        name: 'desk 1',
        posTerminalIds: [],
        reason: 'Second till',
      })
      expect(taken.data.message).toBe('Kora Victoria Island already has a drawer called desk 1.')
      const wrong = await rpc(k.finance.cookie, 'cash/drawers/create', {
        propertyId: k.ikeja.id,
        name: 'Desk 2',
        posTerminalIds: [k.terminal.id],
      })
      expect(wrong.data.data?.code).toBe('DRAWER_WRONG_HOTEL')
      const desk = await rpc(k.frontDesk.cookie, 'cash/drawers/create', {
        propertyId: k.vi.id,
        name: 'Desk 3',
        posTerminalIds: [],
      })
      expect(desk.status).toBe(403)
    })

    it("refuses archiving a hotel's last active drawer", async () => {
      const [desk] = (
        await rpc<Page<{ id: string }>>(k.finance.cookie, 'cash/drawers/list', {
          propertyId: k.ph.id,
        })
      ).data.items
      const last = await rpc(k.finance.cookie, 'cash/drawers/archive', {
        propertyId: k.ph.id,
        id: desk?.id,
      })
      expect(last.data.message).toBe('A hotel needs at least one cash drawer.')
    })
  })

  describe('open', () => {
    it('opens a first shift on Desk 1 with a float counted by note', async () => {
      const mine = await myShift(t, k.frontDesk, k.vi.id)
      expect(mine.data.shift).toBeNull()
      expect(mine.data.limit).toBe('5000.00')
      expect(mine.data.drawers.map((d) => [d.name, d.busy, d.lastClose])).toEqual([
        ['Desk 1', null, null],
        ['Desk 2', null, null],
      ])
      const count = { ...EMPTY_COUNT, '1000': 30, '500': 30, '200': 20, '100': 10 }
      const key = newId()
      const id = newId()
      const opened = await open(t, k.frontDesk, k.vi.id, k.desk1.id, count, { key, id })
      expect(opened.status).toBe(200)
      expect(opened.data).toMatchObject({
        id,
        status: 'open',
        number: 1,
        businessDate: '2026-11-25',
        openingFloat: '50000.00',
        drawer: { name: 'Desk 1' },
        member: { name: 'Chiamaka Eze' },
        handover: { fromShift: null, floatLeft: '0.00', difference: '0.00' },
        terminals: [{ label: 'Moniepoint · Desk 1' }],
      })
      blind(opened.data)
      first = opened.data
      // A double click returns the same shift; the same key with other figures is refused.
      const again = await open(t, k.frontDesk, k.vi.id, k.desk1.id, count, { key, id })
      expect(again.data.id).toBe(id)
      const other = await open(t, k.frontDesk, k.vi.id, k.desk1.id, thousands(1), { key, id })
      expect(other.data.data?.code).toBe('IDEMPOTENCY_CONFLICT')
      const [event] = await events(id, 'cashier_shift.opened')
      expect(event?.after).toMatchObject({ openingFloat: '50000.00', number: 1 })
      expect(event?.after).not.toHaveProperty('exception')
    })

    it('keeps one shift per person and one per drawer', async () => {
      const second = await open(t, k.frontDesk, k.vi.id, k.desk2.id, thousands(20))
      expect(second.data.message).toBe(
        'Your shift 1 is still open at Kora Victoria Island (Desk 1). Close it first.',
      )
      const busy = await t.rpc<Problem & { data?: { code?: string } }>(
        k.ibrahim.cookie,
        'cash/open',
        {
          idempotencyKey: newId(),
          id: newId(),
          propertyId: k.vi.id,
          drawerId: k.desk1.id,
          count: thousands(50),
          handoverFromShiftId: null,
        },
      )
      expect(busy.data.message).toBe('Desk 1 was just opened by Chiamaka Eze. Pick another drawer.')
      const mine = await myShift(t, k.ibrahim, k.vi.id)
      expect(mine.data.drawers[0]?.busy).toEqual({
        memberName: 'Chiamaka Eze',
        number: 1,
        mine: false,
      })
    })

    it('refuses archiving a drawer with a shift open', async () => {
      const refused = await rpc(k.finance.cookie, 'cash/drawers/archive', {
        propertyId: k.vi.id,
        id: k.desk1.id,
        reason: 'Moving the till',
      })
      expect(refused.data.message).toBe(
        "Desk 1 has Chiamaka Eze's shift open. Archive it after the shift closes.",
      )
    })
  })

  describe('the blind count', () => {
    it('returns no expected or counted figure for an open shift, to anyone, from any procedure', async () => {
      for (const who of [k.frontDesk, k.gm, k.owner]) {
        const list = await rpc<Page<ShiftRow>>(who.cookie, 'cash/shifts/list', {
          propertyId: k.vi.id,
        })
        expect(list.data.items.find((row) => row.id === first.id)).toMatchObject({
          status: 'open',
          totalDifference: null,
        })
        blind(list.data)
        const detail = await rpc<ShiftDetail>(who.cookie, 'cash/shifts/get', { id: first.id })
        expect(detail.data.shift.status).toBe('open')
        blind(detail.data)
      }
      const mine = await myShift(t, k.frontDesk, k.vi.id)
      expect(mine.data.shift?.status).toBe('open')
      blind(mine.data)
      const lines = await rpc<{ lines: unknown[] }>(k.frontDesk.cookie, 'cash/countLines', {
        shiftId: first.id,
      })
      expect(lines.data.lines).toEqual([
        expect.objectContaining({ kind: 'cash', currency: 'NGN', required: false }),
        expect.objectContaining({
          kind: 'pos_terminal',
          label: 'POS terminal · Moniepoint · Desk 1',
          hint: 'Total of your merchant slips this shift',
          required: true,
        }),
        expect.objectContaining({ kind: 'bank_transfer', label: 'Bank transfers', required: true }),
      ])
      blind(lines.data.lines)
      // Errors are as blind as the shift.
      const notYours = await submit(t, k.gm, countOf(first, thousands(50)))
      expect(notYours.data.message).toBe('Only Chiamaka Eze can count and close this shift.')
      blind(notYours.data)
      const early = await close(t, k.frontDesk, first, { floatKept: '0' })
      expect(early.data.data?.code).toBe('SHIFT_NOT_OPEN')
      blind(early.data)
      const gmLines = await rpc(k.gm.cookie, 'cash/countLines', { shiftId: first.id })
      expect(gmLines.data.data?.code).toBe('NOT_YOUR_SHIFT')
    })
  })

  describe('submit and close', () => {
    let counted: ShiftView

    it('refuses lines that are not the shift lines and a required line left out', async () => {
      const missing = await submit(t, k.frontDesk, {
        ...countOf(first, thousands(47)),
        transfers: null,
      })
      expect(missing.data.data?.code).toBe('COUNT_LINES_CHANGED')
      const extra = await submit(t, k.frontDesk, {
        ...countOf(first, thousands(47)),
        foreign: [{ currency: 'USD', amount: '10' }],
      })
      expect(extra.data.data?.code).toBe('COUNT_LINES_CHANGED')
    })

    it('snapshots expected at submit, works out the difference, and locks the count', async () => {
      const body = countOf(first, { ...thousands(47), '500': 1 })
      const done = await submit(t, k.frontDesk, body)
      expect(done.status).toBe(200)
      if (done.data.status !== 'counted') throw new Error('not counted')
      counted = done.data
      expect(done.data.totalDifference).toBe('2500.00')
      expect(done.data.cashCounted).toBe('47500.00')
      expect(done.data.lines.find((l) => l.kind === 'cash')).toMatchObject({
        expected: '50000.00',
        counted: '47500.00',
        difference: '-2500.00',
        notes: { '1000': 47, '500': 1 },
      })
      // The same key returns the stored result; another submit is refused.
      const replay = await submit(t, k.frontDesk, body)
      expect(replay.data.id).toBe(first.id)
      const second = await submit(t, k.frontDesk, { ...body, idempotencyKey: newId() })
      expect(second.data.data?.code).toBe('COUNT_ALREADY_SUBMITTED')
      expect(second.data.message).toMatch(
        /^This count was submitted at \d\d:\d\d and can't be changed\.$/,
      )
      // Nobody can change a submitted count, not even straight in the database.
      await expect(
        t.db
          .update(cashierShiftCountLines)
          .set({ counted: '50000.00' })
          .where(eq(cashierShiftCountLines.shiftId, first.id)),
      ).rejects.toMatchObject({ cause: { code: '23001' } })
      await expect(
        t.db.delete(cashierShiftCountLines).where(eq(cashierShiftCountLines.shiftId, first.id)),
      ).rejects.toMatchObject({ cause: { code: '23001' } })
      await expect(
        t.db.update(cashierShifts).set({ status: 'open' }).where(eq(cashierShifts.id, first.id)),
      ).rejects.toMatchObject({ cause: { code: '23001' } })
      const [event] = await events(first.id, 'cashier_shift.count_submitted')
      expect(event?.after).toMatchObject({ totalDifference: '2500.00' })
    })

    it('needs a reason, a float within the cash counted, and a bag when cash goes to the safe', async () => {
      const noReason = await close(t, k.frontDesk, counted, { floatKept: '47500' })
      expect(noReason.data.message).toBe('Add a reason for the difference.')
      const tooMuch = await close(t, k.frontDesk, counted, {
        floatKept: '50000',
        reason: 'Paid a guest taxi from the drawer',
      })
      expect(tooMuch.data.message).toBe("The float can't be more than the ₦47,500.00 counted.")
      const noBag = await close(t, k.frontDesk, counted, {
        floatKept: '40000',
        reason: 'Paid a guest taxi from the drawer',
      })
      expect(noBag.data.message).toBe('Enter the safe bag number.')
      // A failed close writes nothing.
      expect(await events(first.id, 'cashier_shift.closed')).toHaveLength(0)
    })

    it('closes within the limit with a reason, and records the cash variance for the owner', async () => {
      const closed = await close(t, k.frontDesk, counted, {
        floatKept: '47500',
        reason: "Paid a guest's taxi from the drawer; receipt with the GM",
      })
      expect(closed.status).toBe(200)
      expect(closed.data).toMatchObject({
        status: 'closed',
        floatKept: '47500.00',
        dropNgn: '0.00',
        dropBagNumber: null,
        closeApproval: null,
      })
      const [event] = await events(first.id, 'cashier_shift.closed')
      expect(event?.reason).toBe("Paid a guest's taxi from the drawer; receipt with the GM")
      expect(event?.after).toMatchObject({
        exception: 'cash_variance',
        stage: 'close',
        liveProperty: true,
        totalDifference: '2500.00',
        cashierName: 'Chiamaka Eze',
      })
    })
  })

  describe('hand-over', () => {
    let tundeShift: ShiftView

    it('compares the opening count with the float left, and needs a reason for a difference', async () => {
      const mine = await myShift(t, k.gm, k.vi.id)
      const desk1 = mine.data.drawers.find((d) => d.id === k.desk1.id)
      expect(desk1?.lastClose).toMatchObject({
        number: 1,
        memberName: 'Chiamaka Eze',
        floatKept: '47500.00',
      })
      const noReason = await open(t, k.gm, k.vi.id, k.desk1.id, thousands(50))
      expect(noReason.data.message).toBe('Add a reason for the difference.')
      // A stale hand-over is refused.
      const stale = await t.rpc<Problem & { data?: { code?: string } }>(k.gm.cookie, 'cash/open', {
        idempotencyKey: newId(),
        id: newId(),
        propertyId: k.vi.id,
        drawerId: k.desk1.id,
        count: thousands(50),
        handoverFromShiftId: null,
        reason: 'Topped up the float from the safe',
      })
      expect(stale.data.data?.code).toBe('HANDOVER_CHANGED')
      expect(stale.data.message).toMatch(
        /^Desk 1 was just closed by Chiamaka Eze at \d\d:\d\d\. Check the hand-over\.$/,
      )
      const opened = await open(t, k.gm, k.vi.id, k.desk1.id, thousands(50), {
        reason: 'Topped up the float from the safe',
      })
      expect(opened.data).toMatchObject({
        number: 2,
        handover: {
          fromShift: { memberName: 'Chiamaka Eze', number: 1 },
          floatLeft: '47500.00',
          difference: '2500.00',
          reason: 'Topped up the float from the safe',
        },
      })
      tundeShift = opened.data
      const [event] = await events(opened.data.id, 'cashier_shift.opened')
      expect(event?.after).toMatchObject({
        exception: 'cash_variance',
        stage: 'handover',
        liveProperty: true,
      })
    })

    it('closes a balanced shift without a reason', async () => {
      const done = await submit(t, k.gm, countOf(tundeShift, thousands(50)))
      if (done.data.status !== 'counted') throw new Error(done.data.message)
      expect(done.data.totalDifference).toBe('0.00')
      const closed = await close(t, k.gm, done.data, { floatKept: '50000' })
      expect(closed.data.status).toBe('closed')
      const [event] = await events(tundeShift.id, 'cashier_shift.closed')
      expect(event?.after).not.toHaveProperty('exception')
    })
  })

  describe('over the limit', () => {
    let night: ShiftView
    const reason = 'Late check-out fee taken in cash on the old system; receipt in the bag'

    it('needs an approval, never from the requester, bound to the count and the reason', async () => {
      const opened = await open(t, k.ibrahim, k.vi.id, k.desk2.id, thousands(20))
      expect(opened.data.handover.fromShift).toBeNull()
      const done = await submit(t, k.ibrahim, countOf(opened.data, { ...thousands(32), '500': 1 }))
      if (done.data.status !== 'counted') throw new Error(done.data.message)
      night = done.data
      expect(done.data.totalDifference).toBe('12500.00')
      const refused = await close(t, k.ibrahim, night, {
        floatKept: '20000',
        reason,
        bagNumber: 's-2210',
      })
      expect(refused.data.data).toMatchObject({ code: 'DIFFERENCE_OVER_LIMIT', canAsk: true })
      expect(refused.data.message).toBe(
        '₦12,500.00 is over your ₦5,000.00 limit. A manager can approve it here.',
      )
      const action = {
        kind: 'cash_variance',
        variance: { stage: 'close', shiftId: night.id, reason },
      }
      const who = await rpc<{
        approvers: { name: string; limit: string | null }[]
        subject: unknown
      }>(k.ibrahim.cookie, 'approvals/approvers', action)
      expect(who.data.approvers.map((a) => [a.name, a.limit])).toEqual([
        ['Tunde Bello', '100000.00'],
        ['Adaeze Okafor', null],
        ['Kunle Ade', null],
      ])
      expect(who.data.subject).toMatchObject({
        stage: 'close',
        drawerName: 'Desk 2',
        shiftNumber: 3,
        difference: '12500.00',
        lines: [{ label: 'Cash', words: 'over' }],
        requesterLimit: '5000.00',
      })
      const self = await rpc(k.ibrahim.cookie, 'approvals/request', {
        ...action,
        idempotencyKey: newId(),
        approverMemberId: k.ibrahim.memberId,
      })
      expect(self.data.data?.code).toBe('SELF_APPROVAL')
      const asked = await rpc<ApprovalView>(k.ibrahim.cookie, 'approvals/request', {
        ...action,
        idempotencyKey: newId(),
        approverMemberId: k.gm.memberId,
      })
      expect(asked.data.status).toBe('pending')
      const approved = await rpc<ApprovalView>(k.gm.cookie, 'approvals/approve', {
        id: asked.data.id,
        pin: PINS.tunde,
      })
      expect(approved.data.status).toBe('approved')
      // Another reason doesn't match what was approved.
      const changed = await close(t, k.ibrahim, night, {
        floatKept: '20000',
        reason: 'Something else entirely',
        bagNumber: 'S-2210',
        approvalId: asked.data.id,
      })
      expect(changed.data.data?.code).toBe('APPROVAL_NOT_MATCHING')
      const closed = await close(t, k.ibrahim, night, {
        floatKept: '20000',
        reason,
        bagNumber: 's-2210',
        approvalId: asked.data.id,
      })
      expect(closed.data).toMatchObject({
        status: 'closed',
        dropNgn: '12500.00',
        dropBagNumber: 'S-2210',
        closeApproval: { name: 'Tunde Bello', method: 'inbox' },
      })
      expect((await approvalRow(t, asked.data.id))?.usedReference).toBe('Shift 3')
      const [event] = await events(night.id, 'cashier_shift.closed')
      expect(event?.approverMemberId).toBe(k.gm.memberId)
    })

    it('approves an over-limit hand-over with the PIN here on a registered device', async () => {
      const id = newId()
      const mine = await myShift(t, k.ibrahim, k.vi.id)
      const desk2 = mine.data.drawers.find((d) => d.id === k.desk2.id)
      expect(desk2?.lastClose).toMatchObject({ floatKept: '20000.00', memberName: 'Ibrahim Musa' })
      const variance = {
        stage: 'handover',
        propertyId: k.vi.id,
        drawerId: k.desk2.id,
        shiftId: id,
        handoverFromShiftId: desk2?.lastClose?.shiftId ?? null,
        count: thousands(12),
        reason: 'Counted twice, the float is short',
      }
      const over = await open(t, k.ibrahim, k.vi.id, k.desk2.id, thousands(12), {
        id,
        reason: variance.reason,
      })
      expect(over.data.data?.code).toBe('DIFFERENCE_OVER_LIMIT')
      const here = await rpc<ApprovalView>(at(k.ibrahim, k.deviceCookie), 'approvals/approveHere', {
        kind: 'cash_variance',
        variance,
        idempotencyKey: newId(),
        approverMemberId: k.gm.memberId,
        pin: PINS.tunde,
      })
      expect(here.data).toMatchObject({ status: 'approved', method: 'pin_here' })
      const opened = await open(t, k.ibrahim, k.vi.id, k.desk2.id, thousands(12), {
        id,
        reason: variance.reason,
        approvalId: here.data.id,
        cookie: at(k.ibrahim, k.deviceCookie),
      })
      expect(opened.data).toMatchObject({
        status: 'open',
        deviceName: 'FD-VI-01',
        handover: {
          difference: '-8000.00',
          approvedBy: { name: 'Tunde Bello', deviceName: 'FD-VI-01' },
        },
      })
      // Balanced against the float he accepted.
      const done = await submit(t, k.ibrahim, countOf(opened.data, thousands(12)))
      if (done.data.status !== 'counted') throw new Error(done.data.message)
      expect(done.data.totalDifference).toBe('0.00')
      expect((await close(t, k.ibrahim, done.data, { floatKept: '12000' })).data.status).toBe(
        'closed',
      )
    })
  })

  describe('foreign cash', () => {
    it('counts each currency the hotel takes, stores the rate used and refuses without one', async () => {
      await rpc(k.finance.cookie, 'paymentMethods/set', {
        propertyId: k.vi.id,
        method: 'cash',
        enabled: true,
        foreignCurrencies: ['USD', 'GBP'],
        reason: 'Foreign guests',
      })
      await rpc(k.finance.cookie, 'fxRates/enter', {
        rateDate: '2026-11-24',
        rates: [{ currency: 'USD', rate: '1620' }],
      })
      const opened = await open(t, k.halima, k.vi.id, k.desk2.id, thousands(12))
      expect(opened.status).toBe(200)
      const lines = await rpc<{ lines: { label: string }[] }>(k.halima.cookie, 'cash/countLines', {
        shiftId: opened.data.id,
      })
      expect(lines.data.lines.map((l) => l.label)).toContain('Cash US$')
      expect(lines.data.lines.map((l) => l.label)).toContain('Cash £')
      const noPound = await submit(
        t,
        k.halima,
        countOf(opened.data, thousands(12), {
          foreign: [
            { currency: 'USD', amount: '40' },
            { currency: 'GBP', amount: '5' },
          ],
        }),
      )
      expect(noPound.data.message).toBe(
        "There's no £ rate yet. Ask your GM to enter today's FX rates, then submit.",
      )
      const done = await submit(
        t,
        k.halima,
        countOf(opened.data, thousands(12), {
          foreign: [
            { currency: 'USD', amount: '40' },
            { currency: 'GBP', amount: '0' },
          ],
        }),
      )
      if (done.data.status !== 'counted') throw new Error(done.data.message)
      expect(done.data.lines.find((l) => l.currency === 'USD')).toMatchObject({
        counted: '40.00',
        expected: '0.00',
        difference: '40.00',
        fx: { rate: '1620.0000', source: 'cbn', date: '2026-11-24' },
        countedNgn: '64800.00',
        differenceNgn: '64800.00',
      })
      expect(done.data.lines.find((l) => l.currency === 'GBP')?.fx).toBeNull()
      expect(done.data.totalDifference).toBe('64800.00')
    })
  })

  describe('who sees what', () => {
    it('refuses people who run no shift, and shows others only their own', async () => {
      const waiter = await myShift(t, k.waiter, k.vi.id)
      expect(waiter.data.message).toBe(
        'Only front desk, cashiers and managers can run a cashier shift. Ask your GM.',
      )
      const own = await rpc<Page<ShiftRow>>(k.frontDesk.cookie, 'cash/shifts/list', {
        propertyId: k.vi.id,
      })
      expect(new Set(own.data.items.map((row) => row.memberName))).toEqual(
        new Set(['Chiamaka Eze']),
      )
      const all = await rpc<Page<ShiftRow>>(k.gm.cookie, 'cash/shifts/list', {
        propertyId: k.vi.id,
      })
      expect(all.data.items.map((row) => `${row.number} ${row.memberName}`)).toEqual([
        '5 Halima Yusuf',
        '4 Ibrahim Musa',
        '3 Ibrahim Musa',
        '2 Tunde Bello',
        '1 Chiamaka Eze',
      ])
      expect(all.data.items.find((r) => r.number === 1)).toMatchObject({
        totalDifference: '2500.00',
        cashDifference: '-2500.00',
      })
      expect(all.data.items.find((r) => r.number === 3)?.approvedBy).toBe('Tunde Bello')
      const differs = await rpc<Page<ShiftRow>>(k.gm.cookie, 'cash/shifts/list', {
        propertyId: k.vi.id,
        segment: 'difference',
      })
      expect(differs.data.items.map((row) => row.number)).toEqual([5, 4, 3, 2, 1])
      const someoneElse = await rpc(k.frontDesk.cookie, 'cash/shifts/get', {
        id: all.data.items[1]?.id,
      })
      expect(someoneElse.status).toBe(404)
      const detail = await rpc<ShiftDetail>(k.gm.cookie, 'cash/shifts/get', {
        id: all.data.items[2]?.id,
      })
      expect(detail.data.events.map((e) => e.action)).toEqual(
        expect.arrayContaining([
          'cashier_shift.opened',
          'cashier_shift.count_submitted',
          'cashier_shift.closed',
          'approval.requested',
          'approval.granted',
        ]),
      )
    })

    it('keeps other groups and other hotels out', async () => {
      const outsider = await rpc(k.other.cookie, 'cash/shifts/get', { id: first.id })
      expect(outsider.status).toBe(404)
      const hotel = await rpc(k.other.cookie, 'cash/myShift', { propertyId: k.vi.id })
      expect(hotel.data.data?.code).toBe('PROPERTY_NOT_FOUND')
      const elsewhere = await rpc(k.frontDesk.cookie, 'cash/myShift', { propertyId: k.ikeja.id })
      expect(elsewhere.data.data?.code).toBe('PROPERTY_NOT_FOUND')
      const viFinance = await rpc<Page<ShiftRow>>(k.viFinance.cookie, 'cash/shifts/list', {
        propertyId: k.ikeja.id,
      })
      expect(viFinance.status).toBe(404)
    })

    it('shows a shift open at another hotel and points there', async () => {
      const sade = await person(t, k.orgId, 'Femi Adeyemi', 'fnb_manager')
      await limitTo(t, k.owner, sade, [k.vi.id, k.ikeja.id])
      const opened = await open(t, sade, k.vi.id, k.desk1.id, thousands(50), {
        reason: 'Counted twice, all there',
      })
      expect(opened.status).toBe(200)
      const there = await myShift(t, sade, k.ikeja.id)
      expect(there.data.shift).toBeNull()
      expect(there.data.elsewhere).toEqual({
        propertyId: k.vi.id,
        hotelName: 'Kora Victoria Island',
        number: 6,
        drawerName: 'Desk 1',
      })
      // A hotel with a shift open can't be archived.
      const preview = await rpc<{ blockers: { code: string; label: string }[] }>(
        k.owner.cookie,
        'properties/archivePreview',
        { id: k.vi.id },
      )
      expect(preview.data.blockers).toContainEqual(
        expect.objectContaining({ code: 'OPEN_SHIFTS', label: '2 cashier shifts open' }),
      )
    })

    it('answers FEATURE_OFF when the front desk is switched off', async () => {
      await switchFeature(t.db, k.orgId, { feature: 'front_desk', to: 'off', reason: 'Test' })
      const off = await rpc(k.frontDesk.cookie, 'cash/myShift', { propertyId: k.vi.id })
      expect(off.data.data?.code).toBe('FEATURE_OFF')
      await switchFeature(t.db, k.orgId, { feature: 'front_desk', to: 'on', reason: 'Test' })
    })
  })

  it('keeps shift numbers per hotel per business date', async () => {
    const [row] = await t.db
      .select({ value: sql<number>`count(*)::int` })
      .from(cashierShifts)
      .where(eq(cashierShifts.propertyId, k.vi.id))
    expect(row?.value).toBe(6)
  })

  it('checks the limit again at close, and a replayed close returns the same shift', async () => {
    const mine = await myShift(t, k.halima, k.vi.id)
    const counted = mine.data.shift
    if (counted?.status !== 'counted') throw new Error('Halima has no counted shift')
    const reason = 'US dollars from a walk-in, kept in the drawer'
    const refused = await close(t, k.halima, counted, {
      floatKept: '12000',
      reason,
      bagNumber: 'S-2301',
    })
    expect(refused.data.data?.code).toBe('DIFFERENCE_OVER_LIMIT')
    // The owner raises cashiers' limit after the count: the close measures against it now.
    const raised = await rpc(k.owner.cookie, 'permissions/set', {
      role: 'cashier',
      permission: 'cashier_shift.variance',
      allowed: true,
      limit: '100000',
      reason: 'Cashiers take foreign cash at the bar',
    })
    expect(raised.status).toBe(200)
    const key = newId()
    const closed = await close(t, k.halima, counted, {
      floatKept: '12000',
      reason,
      bagNumber: 'S-2301',
      key,
    })
    expect(closed.data).toMatchObject({ status: 'closed', dropBagNumber: 'S-2301' })
    const again = await close(t, k.halima, counted, {
      floatKept: '12000',
      reason,
      bagNumber: 'S-2301',
      key,
    })
    expect(again.status).toBe(200)
    expect(again.data).toMatchObject({ id: counted.id, status: 'closed' })
    expect(await events(counted.id, 'cashier_shift.closed')).toHaveLength(1)
    const other = await close(t, k.halima, counted, {
      floatKept: '0',
      bagNumber: 'S-2301',
      reason,
      key,
    })
    expect(other.data.data?.code).toBe('IDEMPOTENCY_CONFLICT')
  })
})
