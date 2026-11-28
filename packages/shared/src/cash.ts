// Cashier shifts (spec: docs/specs/stage-1-cashier-shifts.md): the naira note list, a count by
// note, and the difference rules. Pure, so the web app's live totals and the server's stored ones
// come from the same functions (decimal helpers, never floats).
import { z } from 'zod'
import { FX_SYMBOLS, type FxCurrency } from './fx.ts'
import { dec, formatMoney, toAmount } from './money.ts'

// The notes counted one by one, largest first; everything smaller is one amount ("Smaller notes and
// coins"). A constant, not a setting: check it against the notes the CBN issues before the pilot.
export const NGN_NOTES = ['1000', '500', '200', '100', '50'] as const
export type NgnNote = (typeof NGN_NOTES)[number]

export const MAX_NOTES = 99_999
export const MAX_COINS = '99999.00'
export const MAX_FOREIGN = '999999.99'

export const NOTES_WHOLE = 'Enter a whole number of notes.'
export const NOTES_TOO_MANY = "That's more than 99,999 notes. Check the count."

const notes = z
  .number({ error: NOTES_WHOLE })
  .int(NOTES_WHOLE)
  .min(0, NOTES_WHOLE)
  .max(MAX_NOTES, NOTES_TOO_MANY)

const nonNegative = (max: string, message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount with up to 2 decimal places')
    .refine((value) => dec(value).lessThanOrEqualTo(max), message)
    .transform((value) => toAmount(value))

export const coinsSchema = nonNegative(MAX_COINS, 'Smaller notes and coins go up to ₦99,999.00.')
export const foreignCashSchema = nonNegative(MAX_FOREIGN, 'That is more than 999,999.99. Check it.')
// POS slips and transfers: whatever a shift took, up to numeric(14,2).
export const takingsSchema = nonNegative('999999999999.99', 'Check the amount.')

export const noteCountSchema = z.object({
  '1000': notes,
  '500': notes,
  '200': notes,
  '100': notes,
  '50': notes,
  coins: coinsSchema,
})
export type NoteCount = z.infer<typeof noteCountSchema>

export const EMPTY_COUNT: NoteCount = {
  '1000': 0,
  '500': 0,
  '200': 0,
  '100': 0,
  '50': 0,
  coins: '0.00',
}

// ₦1,000 × 30 → "30000.00"
export function noteTotal(note: NgnNote, count: number): string {
  return toAmount(dec(note).times(count))
}

// The whole count in naira: notes by value plus the smaller notes and coins.
export function countTotal(count: NoteCount): string {
  let total = dec(count.coins)
  for (const note of NGN_NOTES) total = total.plus(dec(note).times(count[note]))
  return toAmount(total)
}

// Counted − expected: negative is short, positive is over.
export function lineDifference(counted: string, expected: string): string {
  return toAmount(dec(counted).minus(expected))
}

// The shift's total difference: the sum of the absolute differences in naira, so a short in cash
// and an over on POS don't cancel out.
export function totalDifference(lines: readonly { differenceNgn: string }[]): string {
  return toAmount(lines.reduce((sum, line) => sum.plus(dec(line.differenceNgn).abs()), dec('0')))
}

// A count as the confirm and the read-only card show it, notes with no count left out.
export function countRows(count: NoteCount) {
  return NGN_NOTES.map((note) => ({
    note,
    count: count[note],
    total: noteTotal(note, count[note]),
  }))
}

export const SHIFT_STATUSES = ['open', 'counted', 'closed'] as const
export type ShiftStatus = (typeof SHIFT_STATUSES)[number]
export const shiftStatusSchema = z.enum(SHIFT_STATUSES)

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  open: 'Open',
  counted: 'Count in, not closed',
  closed: 'Closed',
}

export const COUNT_LINE_KINDS = ['cash', 'pos_terminal', 'bank_transfer'] as const
export type CountLineKind = (typeof COUNT_LINE_KINDS)[number]
export const countLineKindSchema = z.enum(COUNT_LINE_KINDS)

export const CASH_REASON_MIN = 5
export const CASH_REASON_MAX = 200
export const cashReasonSchema = z
  .string()
  .trim()
  .min(CASH_REASON_MIN, 'Add a reason for the difference.')
  .max(CASH_REASON_MAX, 'Use 200 characters or fewer.')

// Safe bags: up to 20 letters, digits and hyphens ("S-2211").
export const bagNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{1,20}$/, 'Enter the safe bag number.')

export const HANDOVER_SUGGESTIONS = [
  'Topped up the float from the safe',
  'Counted wrong at the last close',
] as const
export const CLOSE_SUGGESTIONS = [
  'Change given in error',
  'Paid out from the drawer',
  'Counting error at opening',
] as const

// "₦2,500.00 short", "₦12,500.00 over", "matches"
export function differenceWords(
  difference: string,
): { amount: string; words: 'short' | 'over' } | null {
  const value = dec(difference)
  if (value.isZero()) return null
  return {
    amount: formatMoney({ amount: toAmount(value.abs()), currency: 'NGN' }),
    words: value.isNegative() ? 'short' : 'over',
  }
}

// "$40.00", "£0.00", "₦50,000.00": a count line's amount in its own currency.
export function cashAmount(amount: string, currency: 'NGN' | FxCurrency): string {
  if (currency === 'NGN') return formatMoney({ amount, currency: 'NGN' })
  const [whole = '0', cents = '00'] = toAmount(dec(amount).abs()).split('.')
  const sign = dec(amount).isNegative() ? '−' : ''
  return `${sign}${FX_SYMBOLS[currency]}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`
}

// "Cash US$", "Cash £", "Cash €"
export const FOREIGN_CASH_LABELS: Record<FxCurrency, { label: string; hint: string }> = {
  USD: { label: 'Cash US$', hint: 'Total in dollars' },
  GBP: { label: 'Cash £', hint: 'Total in pounds' },
  EUR: { label: 'Cash €', hint: 'Total in euros' },
}

// The NGN equivalent of a foreign amount at a rate, rounded half-up to the kobo once.
export function nairaAt(amount: string, rate: string): string {
  return toAmount(dec(amount).times(rate))
}
