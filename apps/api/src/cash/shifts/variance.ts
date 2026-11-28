// A cash difference as an approval sees it (kind `cash_variance`): bound to exactly what was
// counted and the reason given, by a hash the server computes at the ask and again at the use.
// - handover: the hotel, drawer, previous shift, the float counted by note, the difference and reason;
// - close: the shift, its submitted count (lines and total difference) and the reason.
// Changing the reason after asking makes a new hash, so the old approval no longer matches.
import { createHash } from 'node:crypto'
import {
  countTotal,
  dec,
  differenceWords,
  NGN_NOTES,
  type NoteCount,
  toAmount,
} from '@vento/shared'

export const CASH_VARIANCE = {
  kind: 'cash_variance' as const,
  permission: 'cashier_shift.variance' as const,
  feature: 'front_desk' as const,
  valueKind: 'amount_ngn' as const,
}

const hash = (parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')

const countParts = (count: NoteCount) => [
  ...NGN_NOTES.map((note) => count[note]),
  toAmount(count.coins),
]

export function handoverBinding(b: {
  propertyId: string
  drawerId: string
  previousShiftId: string | null
  count: NoteCount
  difference: string
  reason: string
}): string {
  return hash([
    CASH_VARIANCE.kind,
    'handover',
    b.propertyId,
    b.drawerId,
    b.previousShiftId,
    countParts(b.count),
    toAmount(b.difference),
    b.reason.trim(),
  ])
}

export type CountedLine = {
  kind: string
  currency: string
  posTerminalId: string | null
  counted: string
  expected: string
}

export function closeBinding(b: {
  shiftId: string
  lines: readonly CountedLine[]
  totalDifference: string
  reason: string
}): string {
  const lines = [...b.lines]
    .map((l) => [l.kind, l.currency, l.posTerminalId, toAmount(l.counted), toAmount(l.expected)])
    .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
  return hash([
    CASH_VARIANCE.kind,
    'close',
    b.shiftId,
    lines,
    toAmount(b.totalDifference),
    b.reason.trim(),
  ])
}

// What the opener counted against what the drawer's last shift kept. Nothing to compare when the
// last shift left nothing (or there was none): the float is whatever she was given.
export function handoverDifference(count: NoteCount, floatLeft: string): string {
  if (dec(floatLeft).isZero()) return '0.00'
  return toAmount(dec(countTotal(count)).minus(floatLeft))
}

// "Cash ₦12,500.00 over", one per line that differs (in naira for foreign lines).
export function differingLines(lines: readonly { label: string; differenceNgn: string }[]) {
  return lines.flatMap((line) => {
    const words = differenceWords(line.differenceNgn)
    return words ? [{ label: line.label, difference: line.differenceNgn, words: words.words }] : []
  })
}
