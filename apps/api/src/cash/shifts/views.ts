// A shift as the API returns it. The view is built from the status: an open shift gets the open
// schema's fields and nothing else, so no expected or counted figure can leave the server before
// the count is submitted (and the contract's output validation strips anything extra besides).
import {
  type ApprovedBy,
  type CountLineView,
  EMPTY_COUNT,
  FOREIGN_CASH_LABELS,
  type FxCurrency,
  type NoteCount,
  noteCountSchema,
  type ShiftView,
} from '@vento/shared'
import { asc, eq, inArray } from 'drizzle-orm'
import { approvals } from '../../db/schema/approvals.ts'
import { cashDrawers, cashierShiftCountLines, cashierShifts } from '../../db/schema/cash.ts'
import { devices } from '../../db/schema/tenancy.ts'
import type { Reader } from '../context.ts'
import { shiftNotFound } from '../errors.ts'
import { terminalLabels } from './lines.ts'

export type ShiftRow = typeof cashierShifts.$inferSelect
type LineRow = typeof cashierShiftCountLines.$inferSelect

export const parseCount = (value: unknown): NoteCount => {
  const parsed = noteCountSchema.safeParse(value)
  return parsed.success ? parsed.data : EMPTY_COUNT
}

export async function approvedBy(
  db: Reader,
  ids: readonly (string | null)[],
): Promise<Map<string, ApprovedBy>> {
  const wanted = ids.filter((id): id is string => Boolean(id))
  const map = new Map<string, ApprovedBy>()
  if (wanted.length === 0) return map
  const rows = await db
    .select({
      id: approvals.id,
      name: approvals.approverName,
      method: approvals.method,
      deviceName: devices.name,
      answeredAt: approvals.answeredAt,
      requestedAt: approvals.requestedAt,
    })
    .from(approvals)
    .leftJoin(devices, eq(devices.id, approvals.approverDeviceId))
    .where(inArray(approvals.id, wanted))
  for (const row of rows) {
    map.set(row.id, {
      approvalId: row.id,
      name: row.name ?? '',
      method: row.method ?? 'inbox',
      deviceName: row.method === 'pin_here' ? (row.deviceName ?? null) : null,
      at: (row.answeredAt ?? row.requestedAt).toISOString(),
    })
  }
  return map
}

function lineLabel(line: LineRow, terminals: Map<string, { label: string }>): string {
  if (line.kind === 'cash') {
    return line.currency === 'NGN'
      ? 'Cash ₦'
      : FOREIGN_CASH_LABELS[line.currency as FxCurrency].label
  }
  if (line.kind === 'pos_terminal') {
    return `POS · ${terminals.get(line.posTerminalId ?? '')?.label ?? 'Terminal'}`
  }
  return 'Bank transfers'
}

// Naira first, then foreign cash, POS terminals and transfers, as counted.
const ORDER = { cash: 0, pos_terminal: 1, bank_transfer: 2 } as const

function lineViews(
  rows: LineRow[],
  terminals: Map<string, { label: string }>,
  closed: { dropNgn: string } | null,
): CountLineView[] {
  return [...rows]
    .sort(
      (a, b) =>
        ORDER[a.kind] - ORDER[b.kind] ||
        Number(b.currency === 'NGN') - Number(a.currency === 'NGN') ||
        a.currency.localeCompare(b.currency),
    )
    .map((line) => ({
      kind: line.kind,
      currency: line.currency as CountLineView['currency'],
      posTerminalId: line.posTerminalId,
      label: lineLabel(line, terminals),
      notes: line.kind === 'cash' && line.currency === 'NGN' ? parseCount(line.notes) : null,
      counted: line.counted,
      expected: line.expected,
      difference: line.difference,
      fx:
        line.fxRate && line.fxSource && line.fxRateDate
          ? { rate: line.fxRate, source: line.fxSource, date: line.fxRateDate }
          : null,
      countedNgn: line.countedNgn,
      expectedNgn: line.expectedNgn,
      differenceNgn: line.differenceNgn,
      // Foreign cash all goes to the safe; the naira drop is what's above the float kept.
      toSafe:
        closed && line.kind === 'cash'
          ? line.currency === 'NGN'
            ? closed.dropNgn
            : line.counted
          : null,
    }))
}

export async function toShiftView(
  db: Reader,
  row: ShiftRow,
  context: { timeZone: string; limit: string | null },
): Promise<ShiftView> {
  const [[drawer], terminals, approved] = await Promise.all([
    db.select({ name: cashDrawers.name }).from(cashDrawers).where(eq(cashDrawers.id, row.drawerId)),
    terminalLabels(db, row.terminalIds),
    approvedBy(db, [row.handoverApprovalId, row.closeApprovalId]),
  ])
  const previous = row.handoverFromShiftId
    ? (
        await db
          .select({
            id: cashierShifts.id,
            number: cashierShifts.number,
            businessDate: cashierShifts.businessDate,
            memberName: cashierShifts.memberName,
            closedAt: cashierShifts.closedAt,
          })
          .from(cashierShifts)
          .where(eq(cashierShifts.id, row.handoverFromShiftId))
      )[0]
    : undefined
  const base = {
    id: row.id,
    propertyId: row.propertyId,
    number: row.number,
    businessDate: row.businessDate,
    drawer: { id: row.drawerId, name: drawer?.name ?? '' },
    member: { memberId: row.memberId, name: row.memberName },
    deviceName: row.deviceName,
    openedAt: row.openedAt.toISOString(),
    openingFloat: row.openingFloat,
    openingCount: parseCount(row.openingNotes),
    handover: {
      fromShift:
        previous?.closedAt != null
          ? {
              id: previous.id,
              number: previous.number,
              businessDate: previous.businessDate,
              memberName: previous.memberName,
              closedAt: previous.closedAt.toISOString(),
            }
          : null,
      floatLeft: row.handoverExpected,
      difference: row.handoverDifference,
      reason: row.handoverReason,
      approvedBy: row.handoverApprovalId ? (approved.get(row.handoverApprovalId) ?? null) : null,
    },
    terminals: row.terminalIds.map((id) => ({
      id,
      label: terminals.get(id)?.label ?? 'Terminal',
      archived: terminals.get(id)?.archived ?? false,
    })),
    version: row.version,
    timeZone: context.timeZone,
  }
  // The blind count: nothing about takings for an open shift, not even a query for its lines.
  if (row.status === 'open') return { ...base, status: 'open' }
  if (!row.countedAt || !row.countedBusinessDate || !row.cashCounted || !row.totalDifference) {
    throw shiftNotFound()
  }
  const lines = await db
    .select()
    .from(cashierShiftCountLines)
    .where(eq(cashierShiftCountLines.shiftId, row.id))
    .orderBy(asc(cashierShiftCountLines.id))
  const counted = {
    countedAt: row.countedAt.toISOString(),
    countedBusinessDate: row.countedBusinessDate,
    cashCounted: row.cashCounted,
    totalDifference: row.totalDifference,
  }
  if (row.status === 'counted') {
    return {
      ...base,
      ...counted,
      status: 'counted',
      lines: lineViews(lines, terminals, null),
      limit: context.limit,
    }
  }
  if (!row.closedAt || !row.closedBusinessDate || !row.floatKept || !row.dropNgn) {
    throw shiftNotFound()
  }
  return {
    ...base,
    ...counted,
    status: 'closed',
    lines: lineViews(lines, terminals, { dropNgn: row.dropNgn }),
    closedAt: row.closedAt.toISOString(),
    closedBusinessDate: row.closedBusinessDate,
    closeReason: row.closeReason,
    floatKept: row.floatKept,
    dropNgn: row.dropNgn,
    dropBagNumber: row.dropBagNumber,
    closeApproval: row.closeApprovalId ? (approved.get(row.closeApprovalId) ?? null) : null,
  }
}
