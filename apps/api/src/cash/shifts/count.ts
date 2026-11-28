// The blind count (spec: "Count blind (step 1 of 2)"). The lines to count carry no amounts; the
// submit is the one moment expected figures are worked out (`expectedFor`), stored beside the
// count as a snapshot that nothing changes afterwards (the lines are append-only in the database),
// and returned for the first time. Only the shift's own person counts it, once.
import {
  type CountLine,
  countTotal,
  dec,
  FX_CURRENCIES,
  type FxCurrency,
  lineDifference,
  nairaAt,
  type SubmitCountInput,
  submitCountSchema,
  toAmount,
  totalDifference,
} from '@vento/shared'
import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import { recordAudit } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { isUniqueViolation } from '../../db/errors.ts'
import { cashierShiftCountLines, cashierShifts } from '../../db/schema/cash.ts'
import { fxRateFor } from '../../finance/fx-rates.ts'
import type { Access } from '../../tenancy/access.ts'
import { cashHotel, type Reader, requireOperate, type Tx, varianceLimit } from '../context.ts'
import {
  countAlreadySubmitted,
  countLinesChanged,
  countTooLarge,
  fxRateMissing,
  idempotencyConflict,
  shiftClosed,
  shiftNotOpen,
} from '../errors.ts'
import { expectedFor, keyOf, type LineKey } from './expected.ts'
import { linesFor } from './lines.ts'
import { findShift, lockShift, requireOwn } from './load.ts'
import { type ShiftRow, toShiftView } from './views.ts'

type ServiceDb = Pick<Database, 'transaction' | 'select' | 'execute'>
type Input = z.output<typeof submitCountSchema>

export async function countLines(
  db: Reader,
  access: Access,
  input: { shiftId: string },
): Promise<{ lines: CountLine[] }> {
  requireOperate(access)
  const row = await findShift(db, access, input.shiftId)
  requireOwn(access, row)
  const hotel = await cashHotel(db, access, row.propertyId)
  if (row.status === 'closed' && row.closedAt)
    throw shiftClosed(row.number, row.closedAt, hotel.timeZone)
  if (row.status === 'counted' && row.countedAt) {
    throw countAlreadySubmitted(row.countedAt, hotel.timeZone)
  }
  return { lines: await linesFor(db, row) }
}

// What was typed, matched to the shift's lines: every line exactly once, nothing extra.
function countedByLine(lines: readonly CountLine[], input: Input): Map<string, string> {
  const counted = new Map<string, string>()
  const put = (key: LineKey, amount: string) => {
    const k = keyOf(key)
    if (counted.has(k)) throw countLinesChanged()
    counted.set(k, amount)
  }
  put({ kind: 'cash', currency: 'NGN', posTerminalId: null }, countTotal(input.cash))
  for (const line of input.foreign) {
    put({ kind: 'cash', currency: line.currency, posTerminalId: null }, line.amount)
  }
  for (const line of input.pos) {
    put({ kind: 'pos_terminal', currency: 'NGN', posTerminalId: line.posTerminalId }, line.amount)
  }
  if (input.transfers !== null) {
    put({ kind: 'bank_transfer', currency: 'NGN', posTerminalId: null }, input.transfers)
  }
  const wanted = new Set(lines.map(keyOf))
  if (counted.size !== wanted.size || [...counted.keys()].some((k) => !wanted.has(k))) {
    throw countLinesChanged()
  }
  return counted
}

const isForeign = (currency: string): currency is FxCurrency =>
  (FX_CURRENCIES as readonly string[]).includes(currency)

// A replay with the same key: the stored result when it is the same count, else a conflict.
async function sameCount(db: Reader, row: ShiftRow, input: Input) {
  const stored = await db
    .select()
    .from(cashierShiftCountLines)
    .where(eq(cashierShiftCountLines.shiftId, row.id))
  const lines = stored.map((line) => ({
    kind: line.kind,
    currency: line.currency as LineKey['currency'],
    posTerminalId: line.posTerminalId,
    label: '',
    hint: '',
    required: false,
  }))
  try {
    const typed = countedByLine(lines, input)
    return stored.every(
      (line) =>
        typed.get(keyOf({ ...line, currency: line.currency as LineKey['currency'] })) ===
        line.counted,
    )
  } catch {
    return false
  }
}

export async function submitCount(
  db: ServiceDb,
  access: Access,
  raw: SubmitCountInput | Input,
  options: { now?: Date } = {},
) {
  requireOperate(access)
  const input = submitCountSchema.parse(raw)
  const now = options.now ?? new Date()
  const run = () => db.transaction((tx) => submitInTx(tx, access, input, now))
  let row: ShiftRow
  try {
    row = await run()
  } catch (error) {
    // The same key from a second tab at the same moment: the first one's result.
    if (!isUniqueViolation(error)) throw error
    row = await run()
  }
  const hotel = await cashHotel(db, access, row.propertyId)
  return toShiftView(db, row, { timeZone: hotel.timeZone, limit: varianceLimit(access) })
}

async function submitInTx(tx: Tx, access: Access, input: Input, now: Date): Promise<ShiftRow> {
  const row = await lockShift(tx, access, input.shiftId)
  requireOwn(access, row)
  const hotel = await cashHotel(tx, access, row.propertyId, { write: true })
  if (row.countIdempotencyKey === input.idempotencyKey) {
    if (!(await sameCount(tx, row, input))) throw idempotencyConflict()
    return row
  }
  if (row.status === 'closed' && row.closedAt)
    throw shiftClosed(row.number, row.closedAt, hotel.timeZone)
  if (row.status === 'counted' && row.countedAt) {
    throw countAlreadySubmitted(row.countedAt, hotel.timeZone)
  }
  if (row.status !== 'open') throw shiftNotOpen()
  const lines = await linesFor(tx, row)
  const counted = countedByLine(lines, input)
  const expected = await expectedFor(tx, row, lines)
  const rates = new Map<FxCurrency, Awaited<ReturnType<typeof fxRateFor>>>()
  for (const line of expected) {
    if (isForeign(line.currency) && !rates.has(line.currency)) {
      rates.set(
        line.currency,
        await fxRateFor(tx, access.organizationId, line.currency, hotel.businessDate),
      )
    }
  }
  const values = expected.map((line) => {
    const count = counted.get(keyOf(line)) ?? '0.00'
    const difference = lineDifference(count, line.expected)
    const fx = isForeign(line.currency) ? (rates.get(line.currency) ?? null) : null
    if (
      isForeign(line.currency) &&
      !fx &&
      (dec(count).greaterThan(0) || dec(line.expected).greaterThan(0))
    ) {
      throw fxRateMissing(line.currency)
    }
    const toNgn = (amount: string) =>
      fx ? nairaAt(amount, fx.rate) : isForeign(line.currency) ? '0.00' : toAmount(amount)
    return {
      organizationId: access.organizationId,
      propertyId: row.propertyId,
      shiftId: row.id,
      kind: line.kind,
      currency: line.currency,
      posTerminalId: line.posTerminalId,
      notes: line.kind === 'cash' && line.currency === 'NGN' ? input.cash : null,
      counted: count,
      expected: line.expected,
      difference,
      fxRate: fx ? toAmount4(fx.rate) : null,
      fxSource: fx?.source ?? null,
      fxRateDate: fx?.date ?? null,
      countedNgn: toNgn(count),
      expectedNgn: toNgn(line.expected),
      differenceNgn: toNgn(difference),
    }
  })
  const cashCounted =
    counted.get(keyOf({ kind: 'cash', currency: 'NGN', posTerminalId: null })) ?? '0.00'
  const total = totalDifference(values)
  // numeric(14,2) holds up to ₦999,999,999,999.99 a line; the total of absolutes must fit too.
  if (dec(total).greaterThan('999999999999.99')) throw countTooLarge()
  await tx.insert(cashierShiftCountLines).values(values)
  const [updated] = await tx
    .update(cashierShifts)
    .set({
      status: 'counted',
      countedAt: now,
      countedBusinessDate: hotel.businessDate,
      cashCounted,
      totalDifference: total,
      countIdempotencyKey: input.idempotencyKey,
      version: row.version + 1,
      updatedAt: now,
    })
    .where(eq(cashierShifts.id, row.id))
    .returning()
  if (!updated) throw new Error('shift update returned nothing')
  await recordAudit(tx, access, {
    action: 'cashier_shift.count_submitted',
    entityType: 'cashier_shift',
    entityId: row.id,
    propertyId: row.propertyId,
    businessDate: hotel.businessDate,
    after: {
      shiftId: row.id,
      number: row.number,
      lines: values.map((v) => ({
        kind: v.kind,
        currency: v.currency,
        posTerminalId: v.posTerminalId,
        counted: v.counted,
        expected: v.expected,
        difference: v.difference,
        fxRate: v.fxRate,
        fxSource: v.fxSource,
        fxRateDate: v.fxRateDate,
        countedNgn: v.countedNgn,
        expectedNgn: v.expectedNgn,
        differenceNgn: v.differenceNgn,
      })),
      cashCounted,
      totalDifference: total,
    },
  })
  return updated
}

// FX rates keep 4 decimals (numeric(14,4)).
const toAmount4 = (rate: string) => dec(rate).toFixed(4)
