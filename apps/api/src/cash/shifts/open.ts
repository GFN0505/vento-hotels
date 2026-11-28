// Open a shift (spec: "Open a shift"): a free drawer, a float counted by note, compared with what
// the drawer's last shift kept (the hand-over). A difference needs a reason, and above the opener's
// limit an approval (kind `cash_variance`, stage `handover`), used in this transaction.
//
// Lock order: the hotel FOR SHARE, the person (one shift at a time across the group), the drawer
// FOR UPDATE, the approval FOR UPDATE, then the hotel's shift numbers. The partial unique indexes
// (one shift not closed per drawer and per person) back the checks up.
import { countTotal, dec, type OpenShiftInput, openShiftInputSchema, toAmount } from '@vento/shared'
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { markApprovalUsed, type UsedApproval, useApproval } from '../../approvals/use.ts'
import { recordAudit } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { isUniqueViolation, violatedConstraint } from '../../db/errors.ts'
import { cashDrawers, cashDrawerTerminals, cashierShifts } from '../../db/schema/cash.ts'
import { posTerminals } from '../../db/schema/finance.ts'
import { properties } from '../../db/schema/tenancy.ts'
import type { Access } from '../../tenancy/access.ts'
import {
  type CashHotel,
  cashHotel,
  lockKey,
  needsApproval,
  type Reader,
  requireOperate,
  type Tx,
  varianceLimit,
} from '../context.ts'
import {
  drawerArchived,
  drawerBusy,
  drawerNotFound,
  handoverChanged,
  idempotencyConflict,
  overLimit,
  reasonRequired,
  shiftAlreadyOpen,
} from '../errors.ts'
import { CASH_VARIANCE, handoverBinding, handoverDifference } from './variance.ts'
import { type ShiftRow, toShiftView } from './views.ts'

type ServiceDb = Pick<Database, 'transaction' | 'select' | 'execute'>
type Input = z.output<typeof openShiftInputSchema>
export type ShiftDevice = { id: string; name: string; propertyId: string } | null

// The person's shift that isn't closed, anywhere in the group.
export async function myOpenShift(db: Reader, access: Access) {
  const [row] = await db
    .select({
      id: cashierShifts.id,
      propertyId: cashierShifts.propertyId,
      number: cashierShifts.number,
      hotelName: properties.name,
      drawerName: cashDrawers.name,
    })
    .from(cashierShifts)
    .innerJoin(properties, eq(properties.id, cashierShifts.propertyId))
    .innerJoin(cashDrawers, eq(cashDrawers.id, cashierShifts.drawerId))
    .where(
      and(
        eq(cashierShifts.organizationId, access.organizationId),
        eq(cashierShifts.memberId, access.memberId),
        ne(cashierShifts.status, 'closed'),
      ),
    )
  return row
}

// The drawer's most recent shift (closed, when the drawer is free): whose float is handed over.
export async function lastShiftOn(db: Reader, drawerId: string) {
  const [row] = await db
    .select()
    .from(cashierShifts)
    .where(eq(cashierShifts.drawerId, drawerId))
    .orderBy(desc(cashierShifts.openedAt), desc(cashierShifts.id))
    .limit(1)
  return row
}

async function lockDrawer(tx: Tx, access: Access, hotel: CashHotel, id: string) {
  const [row] = await tx
    .select()
    .from(cashDrawers)
    .where(
      and(
        eq(cashDrawers.id, id),
        eq(cashDrawers.organizationId, access.organizationId),
        eq(cashDrawers.propertyId, hotel.id),
      ),
    )
    .for('update')
  if (!row) throw drawerNotFound()
  if (row.archivedAt) throw drawerArchived(row.name)
  return row
}

async function activeTerminalIds(tx: Tx, drawerId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: cashDrawerTerminals.posTerminalId })
    .from(cashDrawerTerminals)
    .innerJoin(posTerminals, eq(posTerminals.id, cashDrawerTerminals.posTerminalId))
    .where(and(eq(cashDrawerTerminals.drawerId, drawerId), isNull(posTerminals.archivedAt)))
    .orderBy(posTerminals.provider, posTerminals.name)
  return rows.map((row) => row.id)
}

async function nextNumber(tx: Tx, hotel: CashHotel): Promise<number> {
  await lockKey(tx, `cash-shift-number:${hotel.id}`)
  const [row] = await tx
    .select({ value: sql<number>`coalesce(max(${cashierShifts.number}), 0)::int` })
    .from(cashierShifts)
    .where(
      and(
        eq(cashierShifts.propertyId, hotel.id),
        eq(cashierShifts.businessDate, hotel.businessDate),
      ),
    )
  return (row?.value ?? 0) + 1
}

const sameOpen = (row: ShiftRow, input: Input) =>
  row.id === input.id &&
  row.drawerId === input.drawerId &&
  row.propertyId === input.propertyId &&
  toAmount(row.openingFloat) === countTotal(input.count)

async function replay(db: Reader, access: Access, input: Input) {
  const [row] = await db
    .select()
    .from(cashierShifts)
    .where(
      and(
        eq(cashierShifts.organizationId, access.organizationId),
        eq(cashierShifts.openIdempotencyKey, input.idempotencyKey),
      ),
    )
  if (!row) return undefined
  if (!sameOpen(row, input) || row.memberId !== access.memberId) throw idempotencyConflict()
  return row
}

async function viewOf(db: Reader, access: Access, row: ShiftRow) {
  const hotel = await cashHotel(db, access, row.propertyId)
  return toShiftView(db, row, { timeZone: hotel.timeZone, limit: varianceLimit(access) })
}

export async function openShift(
  db: ServiceDb,
  access: Access,
  raw: OpenShiftInput | Input,
  options: { device?: ShiftDevice; now?: Date } = {},
) {
  requireOperate(access)
  const input = openShiftInputSchema.parse(raw)
  const replayed = await replay(db, access, input)
  if (replayed) return viewOf(db, access, replayed)
  const now = options.now ?? new Date()
  try {
    const row = await db.transaction((tx) =>
      openInTx(tx, access, input, options.device ?? null, now),
    )
    return viewOf(db, access, row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      const constraint = violatedConstraint(error)
      if (constraint === 'cashier_shifts_open_key_unique') {
        const again = await replay(db, access, input)
        if (again) return viewOf(db, access, again)
      }
      if (constraint === 'cashier_shifts_one_per_member') {
        const mine = await myOpenShift(db, access)
        if (mine) throw shiftAlreadyOpen(mine.number, mine.hotelName, mine.drawerName)
      }
      if (constraint === 'cashier_shifts_one_per_drawer') {
        const last = await lastShiftOn(db, input.drawerId)
        throw drawerBusy('This drawer', last?.memberName ?? 'someone else')
      }
    }
    throw error
  }
}

async function openInTx(
  tx: Tx,
  access: Access,
  input: Input,
  device: ShiftDevice,
  now: Date,
): Promise<ShiftRow> {
  const hotel = await cashHotel(tx, access, input.propertyId, { write: true, hold: true })
  await lockKey(tx, `cash-member:${access.memberId}`)
  const mine = await myOpenShift(tx, access)
  if (mine) throw shiftAlreadyOpen(mine.number, mine.hotelName, mine.drawerName)
  const drawer = await lockDrawer(tx, access, hotel, input.drawerId)
  const previous = await lastShiftOn(tx, drawer.id)
  if (previous && previous.status !== 'closed') throw drawerBusy(drawer.name, previous.memberName)
  if ((previous?.id ?? null) !== input.handoverFromShiftId) {
    throw handoverChanged(
      drawer.name,
      previous?.memberName ?? null,
      previous?.closedAt ?? null,
      hotel.timeZone,
    )
  }
  const floatLeft = previous?.floatKept ?? '0.00'
  const counted = countTotal(input.count)
  const difference = handoverDifference(input.count, floatLeft)
  const value = toAmount(dec(difference).abs())
  const reason = input.reason?.trim() || null
  if (!dec(difference).isZero() && !reason) throw reasonRequired()
  let approval: UsedApproval | null = null
  if (needsApproval(access, value)) {
    if (!input.approvalId) throw overLimit(value, varianceLimit(access), true)
    approval = await useApproval(tx, access, {
      approvalId: input.approvalId,
      kind: CASH_VARIANCE.kind,
      permission: CASH_VARIANCE.permission,
      propertyId: hotel.id,
      bindingHash: handoverBinding({
        propertyId: hotel.id,
        drawerId: drawer.id,
        previousShiftId: previous?.id ?? null,
        count: input.count,
        difference,
        reason: reason ?? '',
      }),
      businessDate: hotel.businessDate,
      timeZone: hotel.timeZone,
      now,
    })
  }
  const number = await nextNumber(tx, hotel)
  const terminalIds = await activeTerminalIds(tx, drawer.id)
  const here = device?.propertyId === hotel.id ? device : null
  const [row] = await tx
    .insert(cashierShifts)
    .values({
      id: input.id,
      organizationId: access.organizationId,
      propertyId: hotel.id,
      drawerId: drawer.id,
      number,
      businessDate: hotel.businessDate,
      memberId: access.memberId,
      memberName: access.userName,
      deviceId: here?.id ?? access.deviceId,
      deviceName: here?.name ?? null,
      status: 'open',
      openedAt: now,
      openingFloat: counted,
      openingNotes: input.count,
      handoverFromShiftId: previous?.id ?? null,
      handoverFromName: previous?.memberName ?? null,
      handoverExpected: floatLeft,
      handoverDifference: difference,
      handoverReason: dec(difference).isZero() ? null : reason,
      handoverApprovalId: approval?.id ?? null,
      terminalIds,
      openIdempotencyKey: input.idempotencyKey,
    })
    .returning()
  if (!row) throw new Error('shift insert returned nothing')
  if (approval) {
    await markApprovalUsed(tx, approval.id, {
      entity: { type: 'cashier_shift', id: row.id },
      reference: `Shift ${number}`,
      at: now,
    })
  }
  const exception = !dec(difference).isZero()
  await recordAudit(tx, access, {
    action: 'cashier_shift.opened',
    entityType: 'cashier_shift',
    entityId: row.id,
    propertyId: hotel.id,
    businessDate: hotel.businessDate,
    reason: exception ? reason : null,
    approverMemberId: approval?.approverMemberId ?? null,
    ...(here ? { deviceId: here.id } : {}),
    after: {
      shiftId: row.id,
      number,
      drawerId: drawer.id,
      drawerName: drawer.name,
      cashierName: access.userName,
      openingFloat: counted,
      count: input.count,
      currency: 'NGN',
      handover: {
        previousShiftId: previous?.id ?? null,
        previousShiftNumber: previous?.number ?? null,
        previousCashierName: previous?.memberName ?? null,
        floatHandedOver: floatLeft,
        difference,
        reason: exception ? reason : null,
      },
      approval: approval
        ? {
            approvalId: approval.id,
            method: approval.method,
            approverName: approval.approverName,
            deviceName: approval.deviceName,
          }
        : null,
      ...(exception
        ? { exception: 'cash_variance', stage: 'handover', liveProperty: hotel.live }
        : {}),
    },
  })
  return row
}
