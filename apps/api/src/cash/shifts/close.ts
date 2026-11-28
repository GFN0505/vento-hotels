// Close a counted shift (spec: "Close (step 2 of 2)"): a reason for any difference, an approval
// above the person's limit (kind `cash_variance`, stage `close`), the float kept in the drawer
// (naira only, up to the naira counted) and the rest to the safe with a bag number. Lock order: the
// shift FOR UPDATE, then the approval FOR UPDATE.
import {
  type CloseShiftInput,
  closeShiftSchema,
  dec,
  differenceWords,
  formatMoney,
  toAmount,
} from '@vento/shared'
import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import { markApprovalUsed, type UsedApproval, useApproval } from '../../approvals/use.ts'
import { recordAudit } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { cashierShiftCountLines, cashierShifts } from '../../db/schema/cash.ts'
import type { Access } from '../../tenancy/access.ts'
import {
  cashHotel,
  needsApproval,
  type Reader,
  requireOperate,
  type Tx,
  varianceLimit,
} from '../context.ts'
import {
  bagNumberRequired,
  floatMoreThanCash,
  idempotencyConflict,
  overLimit,
  reasonRequired,
  shiftClosed,
  shiftNotCounted,
} from '../errors.ts'
import { lockShift, requireOwn } from './load.ts'
import { CASH_VARIANCE, closeBinding } from './variance.ts'
import { type ShiftRow, toShiftView } from './views.ts'

type ServiceDb = Pick<Database, 'transaction' | 'select' | 'execute'>
type Input = z.output<typeof closeShiftSchema>

export async function countedLinesOf(db: Reader, shiftId: string) {
  return db.select().from(cashierShiftCountLines).where(eq(cashierShiftCountLines.shiftId, shiftId))
}

export async function closeShift(
  db: ServiceDb,
  access: Access,
  raw: CloseShiftInput | Input,
  options: { now?: Date } = {},
) {
  requireOperate(access)
  const input = closeShiftSchema.parse(raw)
  const now = options.now ?? new Date()
  const row = await db.transaction((tx) => closeInTx(tx, access, input, now))
  const hotel = await cashHotel(db, access, row.propertyId)
  return toShiftView(db, row, { timeZone: hotel.timeZone, limit: varianceLimit(access) })
}

const sameClose = (row: ShiftRow, input: Input) =>
  toAmount(row.floatKept ?? '0') === toAmount(input.floatKept) &&
  (row.dropBagNumber ?? null) === (input.bagNumber ?? null)

async function closeInTx(tx: Tx, access: Access, input: Input, now: Date): Promise<ShiftRow> {
  const row = await lockShift(tx, access, input.shiftId)
  requireOwn(access, row)
  const hotel = await cashHotel(tx, access, row.propertyId, { write: true })
  if (row.closeIdempotencyKey === input.idempotencyKey) {
    if (!sameClose(row, input)) throw idempotencyConflict()
    return row
  }
  if (row.status === 'closed' && row.closedAt)
    throw shiftClosed(row.number, row.closedAt, hotel.timeZone)
  if (row.status !== 'counted' || !row.cashCounted || !row.totalDifference) throw shiftNotCounted()
  const total = row.totalDifference
  const reason = input.reason?.trim() || null
  const differs = !dec(total).isZero()
  if (differs && !reason) throw reasonRequired()
  if (dec(input.floatKept).greaterThan(row.cashCounted)) throw floatMoreThanCash(row.cashCounted)
  const lines = await countedLinesOf(tx, row.id)
  const foreign = lines.filter(
    (l) => l.kind === 'cash' && l.currency !== 'NGN' && dec(l.counted).greaterThan(0),
  )
  const dropNgn = toAmount(dec(row.cashCounted).minus(input.floatKept))
  const toSafe = dec(dropNgn).greaterThan(0) || foreign.length > 0
  if (toSafe && !input.bagNumber) throw bagNumberRequired()
  // The limit is checked again now: it may have changed since the count.
  let approval: UsedApproval | null = null
  if (needsApproval(access, total)) {
    if (!input.approvalId) throw overLimit(total, varianceLimit(access), true)
    approval = await useApproval(tx, access, {
      approvalId: input.approvalId,
      kind: CASH_VARIANCE.kind,
      permission: CASH_VARIANCE.permission,
      propertyId: row.propertyId,
      bindingHash: closeBinding({
        shiftId: row.id,
        lines,
        totalDifference: total,
        reason: reason ?? '',
      }),
      businessDate: hotel.businessDate,
      timeZone: hotel.timeZone,
      now,
    })
  }
  const [updated] = await tx
    .update(cashierShifts)
    .set({
      status: 'closed',
      closedAt: now,
      closedBusinessDate: hotel.businessDate,
      closeReason: differs ? reason : null,
      closeApprovalId: approval?.id ?? null,
      floatKept: toAmount(input.floatKept),
      dropNgn,
      dropBagNumber: toSafe ? (input.bagNumber ?? null) : null,
      closeIdempotencyKey: input.idempotencyKey,
      version: row.version + 1,
      updatedAt: now,
    })
    .where(eq(cashierShifts.id, row.id))
    .returning()
  if (!updated) throw new Error('shift update returned nothing')
  if (approval) {
    await markApprovalUsed(tx, approval.id, {
      entity: { type: 'cashier_shift', id: row.id },
      reference: `Shift ${row.number}`,
      at: now,
    })
  }
  await recordAudit(tx, access, {
    action: 'cashier_shift.closed',
    entityType: 'cashier_shift',
    entityId: row.id,
    propertyId: row.propertyId,
    businessDate: hotel.businessDate,
    reason: differs ? reason : null,
    approverMemberId: approval?.approverMemberId ?? null,
    after: {
      shiftId: row.id,
      number: row.number,
      shiftBusinessDate: row.businessDate,
      drawerId: row.drawerId,
      cashierName: row.memberName,
      totalDifference: total,
      lines: lines.map((l) => ({
        kind: l.kind,
        currency: l.currency,
        posTerminalId: l.posTerminalId,
        difference: l.difference,
        differenceNgn: l.differenceNgn,
        words: differenceWords(l.differenceNgn)?.words ?? null,
      })),
      floatKept: toAmount(input.floatKept),
      dropNgn,
      dropForeign: foreign.map((l) => ({ currency: l.currency, amount: l.counted })),
      bagNumber: toSafe ? (input.bagNumber ?? null) : null,
      approval: approval
        ? {
            approvalId: approval.id,
            method: approval.method,
            approverName: approval.approverName,
            deviceName: approval.deviceName,
          }
        : null,
      ...(differs
        ? {
            exception: 'cash_variance',
            stage: 'close',
            liveProperty: hotel.live,
            summary: formatMoney({ amount: total, currency: 'NGN' }),
          }
        : {}),
    },
  })
  return updated
}
