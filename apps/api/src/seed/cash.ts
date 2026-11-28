// The demo group's cash drawers and cashier shifts (spec: stage-1-cashier-shifts.md, "Demo seed"),
// through the shift services on their own business dates (D is the seed's business date):
// - drawers: Desk 1 and Desk 2 at Kora Victoria Island (Moniepoint · Desk 1 at both), Desk 1 with
//   its Moniepoint terminal at every other hotel;
// - D−1, Desk 1: Chiamaka's shift 1, ₦2,500.00 short (taxi paid from the drawer); Tunde's shift 2
//   takes over ₦2,500.00 more after a top-up and closes balanced;
// - D−1 to D, Desk 2: Ibrahim's night shift 3, ₦12,500.00 over (late check-out fee from the old
//   system), approved by Tunde in his inbox, ₦12,500.00 to the safe in bag S-2210;
// - D, Desk 1: Chiamaka's shift 1 open with ₦50,000.00. Desk 2 is free with ₦20,000.00.
import {
  APPROVAL_MINUTES,
  addDays,
  EMPTY_COUNT,
  instantAt,
  type NoteCount,
  newId,
} from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import { CASH_VARIANCE, evaluateCashVariance } from '../approvals/kinds/cash-variance.ts'
import { type Actor, recordAudit } from '../audit/record.ts'
import { closeShift } from '../cash/shifts/close.ts'
import { submitCount } from '../cash/shifts/count.ts'
import { linesFor } from '../cash/shifts/lines.ts'
import { openShift } from '../cash/shifts/open.ts'
import type { Database } from '../db/client.ts'
import { approvals } from '../db/schema/approvals.ts'
import { cashDrawers, cashDrawerTerminals } from '../db/schema/cash.ts'
import { posTerminals } from '../db/schema/finance.ts'
import { properties } from '../db/schema/tenancy.ts'
import type { Access } from '../tenancy/access.ts'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export type CashSeedContext = {
  organizationId: string
  businessDate: string
  hotels: Record<'vi' | 'ikeja' | 'abuja' | 'ph', string>
  finance: Actor
  access: { chiamaka: Access; tunde: Access; ibrahim: Access }
}

const TZ = 'Africa/Lagos'
const MINUTE = 60 * 1000

const FLOAT_50K: NoteCount = { ...EMPTY_COUNT, '1000': 30, '500': 30, '200': 20, '100': 10 }
const SHORT_47_5K: NoteCount = { ...EMPTY_COUNT, '1000': 27, '500': 30, '200': 20, '100': 15 }
const FLOAT_20K: NoteCount = { ...EMPTY_COUNT, '1000': 10, '500': 16, '200': 10 }
const OVER_32_5K: NoteCount = { ...EMPTY_COUNT, '1000': 20, '500': 21, '200': 10 }

const NIGHT_REASON =
  'Late check-out fee taken in cash on the old system during the parallel run; receipt in the bag'

async function drawer(
  tx: Tx,
  context: CashSeedContext,
  propertyId: string,
  name: string,
  terminalId: string | undefined,
) {
  const id = newId()
  await tx
    .insert(cashDrawers)
    .values({ id, organizationId: context.organizationId, propertyId, name })
  if (terminalId) {
    await tx.insert(cashDrawerTerminals).values({
      organizationId: context.organizationId,
      propertyId,
      drawerId: id,
      posTerminalId: terminalId,
    })
  }
  await recordAudit(tx, context.finance, {
    action: 'cash_drawer.created',
    entityType: 'cash_drawer',
    entityId: id,
    propertyId,
    businessDate: addDays(context.businessDate, -13),
    after: { name, terminals: terminalId ? ['Moniepoint · Desk 1'] : [], liveProperty: false },
  })
  return id
}

// Each hotel's Moniepoint · Desk 1 terminal.
async function deskTerminal(tx: Tx, propertyId: string) {
  const [row] = await tx
    .select({ id: posTerminals.id })
    .from(posTerminals)
    .where(and(eq(posTerminals.propertyId, propertyId), eq(posTerminals.name, 'Desk 1')))
  return row?.id
}

async function setBusinessDate(tx: Tx, propertyId: string, businessDate: string) {
  await tx.update(properties).set({ businessDate }).where(eq(properties.id, propertyId))
}

// The count for every line of a shift: naira as given, 0 on every other line.
async function countFor(
  tx: Tx,
  shift: { id: string; version: number; propertyId: string; terminals: { id: string }[] },
  cash: NoteCount,
) {
  const lines = await linesFor(tx, {
    propertyId: shift.propertyId,
    terminalIds: shift.terminals.map((t) => t.id),
  })
  return {
    idempotencyKey: newId(),
    shiftId: shift.id,
    version: shift.version,
    cash,
    foreign: lines
      .filter((l) => l.kind === 'cash' && l.currency !== 'NGN')
      .map((l) => ({ currency: l.currency as 'USD' | 'GBP' | 'EUR', amount: '0' })),
    pos: lines
      .filter((l) => l.kind === 'pos_terminal' && l.posTerminalId)
      .map((l) => ({ posTerminalId: l.posTerminalId as string, amount: '0' })),
    transfers: lines.some((l) => l.kind === 'bank_transfer') ? '0' : null,
  }
}

export async function seedCash(tx: Tx, context: CashSeedContext): Promise<string[]> {
  const D = context.businessDate
  const before = addDays(D, -1)
  const { vi } = context.hotels
  const viTerminal = await deskTerminal(tx, vi)
  const desk1 = await drawer(tx, context, vi, 'Desk 1', viTerminal)
  const desk2 = await drawer(tx, context, vi, 'Desk 2', viTerminal)
  for (const hotel of ['ikeja', 'abuja', 'ph'] as const) {
    const id = context.hotels[hotel]
    await drawer(tx, context, id, 'Desk 1', await deskTerminal(tx, id))
  }
  const { chiamaka, tunde, ibrahim } = context.access
  const at = (date: string, time: string) => instantAt(date, time, TZ)
  const open = (
    who: Access,
    drawerId: string,
    count: NoteCount,
    when: Date,
    handoverFromShiftId: string | null,
    reason?: string,
  ) =>
    openShift(
      tx,
      who,
      {
        idempotencyKey: newId(),
        id: newId(),
        propertyId: vi,
        drawerId,
        count,
        handoverFromShiftId,
        ...(reason ? { reason } : {}),
      },
      { now: when },
    )

  // D−1: the morning and afternoon on Desk 1, and the night on Desk 2.
  await setBusinessDate(tx, vi, before)
  const morning = await open(chiamaka, desk1, FLOAT_50K, at(before, '06:55'), null)
  const morningCount = await submitCount(tx, chiamaka, await countFor(tx, morning, SHORT_47_5K), {
    now: at(before, '14:48'),
  })
  await closeShift(
    tx,
    chiamaka,
    {
      idempotencyKey: newId(),
      shiftId: morningCount.id,
      version: morningCount.version,
      floatKept: '47500.00',
      reason: "Paid a guest's taxi from the drawer; receipt with the GM",
    },
    { now: at(before, '14:50') },
  )
  const afternoon = await open(
    tunde,
    desk1,
    FLOAT_50K,
    at(before, '15:00'),
    morning.id,
    'Topped up the float from the safe',
  )
  const afternoonCount = await submitCount(tx, tunde, await countFor(tx, afternoon, FLOAT_50K), {
    now: at(before, '22:48'),
  })
  await closeShift(
    tx,
    tunde,
    {
      idempotencyKey: newId(),
      shiftId: afternoonCount.id,
      version: afternoonCount.version,
      floatKept: '50000.00',
    },
    { now: at(before, '22:50') },
  )
  const night = await open(ibrahim, desk2, FLOAT_20K, at(before, '22:55'), null)

  // The night audit rolled the date; Ibrahim counts after it, and Tunde approves from his inbox.
  await setBusinessDate(tx, vi, D)
  const nightCount = await submitCount(tx, ibrahim, await countFor(tx, night, OVER_32_5K), {
    now: at(D, '06:44'),
  })
  const askedAt = at(D, '06:46')
  const answeredAt = at(D, '06:48')
  const target = { stage: 'close' as const, shiftId: nightCount.id, reason: NIGHT_REASON }
  const evaluated = await evaluateCashVariance(tx, ibrahim, target, {
    now: askedAt,
    deviceName: null,
  })
  const approvalId = newId()
  const tundeActor: Actor = {
    organizationId: context.organizationId,
    userId: tunde.userId,
    memberId: tunde.memberId,
    userName: tunde.userName,
  }
  await tx.insert(approvals).values({
    id: approvalId,
    organizationId: context.organizationId,
    propertyId: vi,
    kind: CASH_VARIANCE.kind,
    permission: CASH_VARIANCE.permission,
    value: evaluated.value,
    valueKind: CASH_VARIANCE.valueKind,
    status: 'approved',
    method: 'inbox',
    requesterMemberId: ibrahim.memberId,
    requesterName: ibrahim.userName,
    requesterLimit: evaluated.subject.requesterLimit,
    approverMemberId: tunde.memberId,
    approverName: tunde.userName,
    approverLimit: '100000.00',
    bindingHash: evaluated.bindingHash,
    subject: evaluated.subject,
    actionKey: evaluated.actionKey,
    businessDate: D,
    requestedAt: askedAt,
    answeredAt,
    expiresAt: new Date(answeredAt.getTime() + APPROVAL_MINUTES * MINUTE),
    idempotencyKey: newId(),
  })
  const common = {
    approvalId,
    kind: CASH_VARIANCE.kind,
    value: evaluated.value,
    requesterName: ibrahim.userName,
    approverName: tunde.userName,
    subject: evaluated.subject,
  }
  const event = { entityType: 'approval', entityId: approvalId, propertyId: vi, businessDate: D }
  await recordAudit(tx, ibrahim, { action: 'approval.requested', ...event, after: common })
  await recordAudit(tx, tundeActor, {
    action: 'approval.granted',
    ...event,
    approverMemberId: tunde.memberId,
    after: { ...common, method: 'inbox', approverLimit: '100000.00' },
  })
  await closeShift(
    tx,
    ibrahim,
    {
      idempotencyKey: newId(),
      shiftId: nightCount.id,
      version: nightCount.version,
      floatKept: '20000.00',
      reason: NIGHT_REASON,
      bagNumber: 'S-2210',
      approvalId,
    },
    { now: at(D, '06:49') },
  )

  // D: Chiamaka takes over Desk 1 from Tunde's shift 2; it matches.
  await open(chiamaka, desk1, FLOAT_50K, at(D, '06:55'), afternoon.id)

  return [
    "Cash: Chiamaka's shift 1 is open on Desk 1 with ₦50,000.00 (no takings shown until she counts); Desk 2 is free with ₦20,000.00",
    "As Tunde: Cash › Shifts shows yesterday's three differences, his approval of Ibrahim's ₦12,500.00 over and bag S-2210",
  ]
}
