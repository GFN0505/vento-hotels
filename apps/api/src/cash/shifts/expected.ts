// The expected totals seam for brick 10 (spec: "Ready for brick 10"). What a shift should hold, by
// line: the opening float on the naira cash line, plus the shift's payments and cash refunds. Pure
// over its payments, so brick 10 only adds the query in `shiftPayments`; everything else (the
// snapshot at submit, the differences, the blind count) stays as it is.
//
// Nothing may call this for a shift that isn't being submitted: a running total for an open shift
// would end the blind count.
import { dec, toAmount } from '@vento/shared'
import type { Reader } from '../context.ts'

export type LineKey = {
  kind: 'cash' | 'pos_terminal' | 'bank_transfer'
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR'
  posTerminalId: string | null
}

export const keyOf = (line: LineKey) => `${line.kind}:${line.currency}:${line.posTerminalId ?? ''}`

// A payment or refund on the shift, as brick 10 will read it.
export type ShiftPayment = {
  method: 'cash' | 'pos_terminal' | 'bank_transfer'
  // A cash refund paid out of the drawer is 'out'.
  direction: 'in' | 'out'
  currency: LineKey['currency']
  amount: string
  posTerminalId: string | null
}

export type ExpectedLine = LineKey & { expected: string }

// The lines given, each with what it should hold; plus a line for anything a payment used that
// isn't among them (a terminal that isn't at the drawer, a foreign transfer).
export function expectedFromPayments(
  shift: { openingFloat: string },
  lines: readonly LineKey[],
  payments: readonly ShiftPayment[],
): ExpectedLine[] {
  const totals = new Map<string, { line: LineKey; total: ReturnType<typeof dec> }>()
  for (const line of lines) totals.set(keyOf(line), { line, total: dec('0') })
  const cashNgn = keyOf({ kind: 'cash', currency: 'NGN', posTerminalId: null })
  const opening = totals.get(cashNgn)
  if (opening) opening.total = opening.total.plus(shift.openingFloat)
  for (const payment of payments) {
    const line: LineKey = {
      kind: payment.method,
      currency: payment.currency,
      posTerminalId: payment.method === 'pos_terminal' ? payment.posTerminalId : null,
    }
    const key = keyOf(line)
    const entry = totals.get(key) ?? { line, total: dec('0') }
    entry.total =
      payment.direction === 'in'
        ? entry.total.plus(payment.amount)
        : entry.total.minus(payment.amount)
    totals.set(key, entry)
  }
  return [...totals.values()].map(({ line, total }) => ({ ...line, expected: toAmount(total) }))
}

// Brick 10 reads the shift's payments and cash refunds here. Until then a shift takes none.
async function shiftPayments(_db: Reader, _shiftId: string): Promise<ShiftPayment[]> {
  return []
}

export async function expectedFor(
  db: Reader,
  shift: { id: string; openingFloat: string },
  lines: readonly LineKey[],
): Promise<ExpectedLine[]> {
  return expectedFromPayments(shift, lines, await shiftPayments(db, shift.id))
}
