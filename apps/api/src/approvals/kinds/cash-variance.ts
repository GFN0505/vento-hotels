// Brick 9's approval kind: a cash difference on a cashier shift over the person's
// `cashier_shift.variance` limit, at the hand-over when a shift opens or on the count when it
// closes. Evaluated from the drawer or the stored count (the client sends only what was typed and
// the reason); the value is the total difference in naira. Bound by the hashes in
// cash/shifts/variance.ts, checked again when the open or close uses the approval.
import {
  type CashVarianceSubject,
  type CashVarianceTarget,
  countTotal,
  dec,
  FOREIGN_CASH_LABELS,
  type FxCurrency,
  handoverDifference,
  roleLabel,
  toAmount,
} from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import { cashHotel, requireOperate, varianceLimit } from '../../cash/context.ts'
import {
  drawerArchived,
  drawerBusy,
  drawerNotFound,
  handoverChanged,
  noDifference,
  shiftClosed,
  shiftNotCounted,
} from '../../cash/errors.ts'
import { countedLinesOf } from '../../cash/shifts/close.ts'
import { findShift, requireOwn } from '../../cash/shifts/load.ts'
import { lastShiftOn } from '../../cash/shifts/open.ts'
import {
  CASH_VARIANCE,
  closeBinding,
  differingLines,
  handoverBinding,
} from '../../cash/shifts/variance.ts'
import type { Database } from '../../db/client.ts'
import { cashDrawers } from '../../db/schema/cash.ts'
import type { Access } from '../../tenancy/access.ts'

type Reader = Pick<Database, 'select' | 'execute'>
type Context = { now: Date; deviceName: string | null }

export { CASH_VARIANCE }

export type EvaluatedCash = {
  hotel: { id: string; name: string; businessDate: string; timeZone: string }
  value: string
  bindingHash: string
  subject: CashVarianceSubject
  actionKey: string
}

// What is asked of the approver, in the cashier's words ("Cash ₦12,500.00 over").
const LINE_LABELS: Record<string, string> = {
  cash: 'Cash',
  pos_terminal: 'POS',
  bank_transfer: 'Transfers',
}

export async function evaluateCashVariance(
  db: Reader,
  access: Access,
  target: CashVarianceTarget,
  context: Context,
): Promise<EvaluatedCash> {
  requireOperate(access)
  const requester = {
    requesterName: access.userName,
    requesterRole: roleLabel(access.role).toLowerCase(),
    requesterLimit: varianceLimit(access),
    deviceName: context.deviceName,
  }
  if (target.stage === 'handover') {
    const hotel = await cashHotel(db, access, target.propertyId, { write: true })
    const [drawer] = await db
      .select()
      .from(cashDrawers)
      .where(
        and(
          eq(cashDrawers.id, target.drawerId),
          eq(cashDrawers.organizationId, access.organizationId),
          eq(cashDrawers.propertyId, hotel.id),
        ),
      )
    if (!drawer) throw drawerNotFound()
    if (drawer.archivedAt) throw drawerArchived(drawer.name)
    const previous = await lastShiftOn(db, drawer.id)
    if (previous && previous.status !== 'closed') throw drawerBusy(drawer.name, previous.memberName)
    if ((previous?.id ?? null) !== target.handoverFromShiftId) {
      throw handoverChanged(
        drawer.name,
        previous?.memberName ?? null,
        previous?.closedAt ?? null,
        hotel.timeZone,
      )
    }
    const floatLeft = previous?.floatKept ?? '0.00'
    const difference = handoverDifference(countTotal(target.count), floatLeft)
    if (dec(difference).isZero()) throw noDifference()
    const reason = target.reason.trim()
    return {
      hotel,
      value: toAmount(dec(difference).abs()),
      bindingHash: handoverBinding({
        propertyId: hotel.id,
        drawerId: drawer.id,
        previousShiftId: previous?.id ?? null,
        count: target.count,
        difference,
        reason,
      }),
      subject: {
        stage: 'handover',
        hotelName: hotel.name,
        drawerName: drawer.name,
        shiftNumber: null,
        shiftBusinessDate: hotel.businessDate,
        difference: toAmount(dec(difference).abs()),
        lines: differingLines([{ label: 'Float', differenceNgn: difference }]),
        handover: {
          fromName: previous?.memberName ?? null,
          floatLeft,
          counted: countTotal(target.count),
        },
        reason,
        ...requester,
      },
      // The open's own client id: one open request per shift about to open.
      actionKey: target.shiftId,
    }
  }
  const row = await findShift(db, access, target.shiftId)
  requireOwn(access, row)
  const hotel = await cashHotel(db, access, row.propertyId, { write: true })
  if (row.status === 'closed' && row.closedAt)
    throw shiftClosed(row.number, row.closedAt, hotel.timeZone)
  if (row.status !== 'counted' || !row.totalDifference) throw shiftNotCounted()
  if (dec(row.totalDifference).isZero()) throw noDifference()
  const [drawer] = await db
    .select({ name: cashDrawers.name })
    .from(cashDrawers)
    .where(eq(cashDrawers.id, row.drawerId))
  const lines = await countedLinesOf(db, row.id)
  const reason = target.reason.trim()
  return {
    hotel,
    value: row.totalDifference,
    bindingHash: closeBinding({
      shiftId: row.id,
      lines,
      totalDifference: row.totalDifference,
      reason,
    }),
    subject: {
      stage: 'close',
      hotelName: hotel.name,
      drawerName: drawer?.name ?? '',
      shiftNumber: row.number,
      shiftBusinessDate: row.businessDate,
      difference: row.totalDifference,
      lines: differingLines(
        lines.map((line) => ({
          label:
            line.kind === 'cash'
              ? line.currency === 'NGN'
                ? 'Cash'
                : (FOREIGN_CASH_LABELS[line.currency as FxCurrency]?.label ?? 'Cash')
              : (LINE_LABELS[line.kind] ?? line.kind),
          differenceNgn: line.differenceNgn,
        })),
      ),
      handover: null,
      reason,
      ...requester,
    },
    actionKey: row.id,
  }
}
