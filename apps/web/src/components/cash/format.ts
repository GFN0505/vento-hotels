// Words and figures for cashier shifts, as the spec writes them ("UI copy"). Pure, so they are
// tested without a browser.
import {
  type CountLineView,
  cashAmount,
  clockAt,
  dec,
  differenceWords,
  formatMoney,
  fxEquivalent,
  type ShiftRow,
  toAmount,
} from '@vento/shared'

export const naira = (amount: string) => formatMoney({ amount, currency: 'NGN' })

// "25 Nov 2026", "24 Nov"
export function dateLabel(date: string, withYear = true): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

// "Shift 3 · 24 Nov"
export const shiftLabel = (shift: { number: number; businessDate: string }) =>
  `Shift ${shift.number} · ${dateLabel(shift.businessDate, false)}`

// "matches", "₦2,000.00 short", "₦2,000.00 over"
export function compareWords(difference: string): { text: string; tone: 'emerald' | 'rose' } {
  const words = differenceWords(difference)
  if (!words) return { text: 'matches', tone: 'emerald' }
  return { text: `${words.amount} ${words.words}`, tone: 'rose' }
}

// The hand-over: what the opener counted against what the last shift kept. Nothing to compare when
// it left nothing (or there was none).
export function handoverDifference(counted: string, floatLeft: string): string {
  if (dec(floatLeft).isZero()) return '0.00'
  return toAmount(dec(counted).minus(floatLeft))
}

// Above the limit a manager signs: null = any; '0.00' = every difference.
export function overLimit(value: string, limit: string | null): boolean {
  if (dec(value).isZero()) return false
  return limit !== null && dec(value).abs().greaterThan(limit)
}

export function limitLine(value: string, limit: string | null): string {
  if (limit === null) return 'Within your limit'
  if (overLimit(value, limit)) {
    return dec(limit).isZero()
      ? 'A manager approves any difference for you. A manager can approve it here.'
      : `Over your ${naira(limit)} limit. A manager can approve it here.`
  }
  return `Within your ${naira(limit)} limit`
}

// "−₦2,500.00", "+₦12,500.00", "₦0.00": a line's difference in its own currency.
export function signedAmount(amount: string, currency: CountLineView['currency']): string {
  const value = dec(amount)
  const shown = cashAmount(toAmount(value.abs()), currency)
  if (value.isZero()) return shown
  return `${value.isNegative() ? '−' : '+'}${shown}`
}

// Where each line's counted figure came from, as the takings table says it.
export function sourceOf(line: CountLineView): string {
  if (line.kind === 'pos_terminal') return 'Your merchant slips'
  if (line.kind === 'bank_transfer') return 'Your transfer log'
  if (line.currency === 'NGN' || !line.fx) return 'Drawer count'
  const quote = {
    currency: line.currency,
    rate: line.fx.rate,
    source: line.fx.source,
    date: line.fx.date,
  }
  const at = fxEquivalent('0', quote).text.replace(/^≈ \S+ /, '')
  return `Drawer count · ≈ ${naira(line.countedNgn)} ${at}`
}

// "Cash ₦2,500.00 short" or "Total difference ₦5,000.00 · cash ₦2,500.00 short, POS ₦2,500.00 over"
export function differenceLine(lines: readonly CountLineView[], total: string): string {
  const differing = lines.filter((line) => !dec(line.differenceNgn).isZero())
  const words = (line: CountLineView) => {
    const w = differenceWords(line.differenceNgn)
    return w ? `${w.amount} ${w.words}` : ''
  }
  const name = (line: CountLineView) =>
    line.kind === 'cash'
      ? line.currency === 'NGN'
        ? 'Cash'
        : line.label
      : line.kind === 'pos_terminal'
        ? 'POS'
        : 'Transfers'
  if (differing.length === 0) return 'Balanced'
  const [only] = differing
  if (differing.length === 1 && only) return `${name(only)} ${words(only)}`
  return `Total difference ${naira(total)} · ${differing
    .map((line, i) => `${i === 0 ? name(line).toLowerCase() : name(line)} ${words(line)}`)
    .join(', ')}`
}

// The close panel's badge: Balanced, Short or Over (amber), never colour alone.
export function closeBadge(lines: readonly CountLineView[]): {
  label: 'Balanced' | 'Short' | 'Over'
  tone: 'emerald' | 'amber'
} {
  const sum = lines.reduce((total, line) => total.plus(line.differenceNgn), dec('0'))
  const differs = lines.some((line) => !dec(line.differenceNgn).isZero())
  if (!differs) return { label: 'Balanced', tone: 'emerald' }
  return { label: sum.isNegative() ? 'Short' : 'Over', tone: 'amber' }
}

// To the safe: naira cash counted − the float kept; foreign cash always goes too.
export function toSafe(cashCounted: string, floatKept: string): string {
  return toAmount(dec(cashCounted).minus(floatKept))
}

export function closeLabel(dropNgn: string): string {
  return dec(dropNgn).greaterThan(0)
    ? `Close shift · drop ${naira(dropNgn)} to safe`
    : 'Close shift'
}

// "Submit your count? Cash ₦50,000.00 · US$0.00 · £0.00 · POS ₦0.00 · Transfers ₦0.00. You can't
// change it after you submit."
export function confirmLine(parts: string[]): string {
  return `Submit your count? ${parts.join(' · ')}. You can't change it after you submit.`
}

// "US$0.00", "£0.00", "€0.00": foreign cash as the confirm says it.
export function foreignShort(amount: string, currency: string): string {
  const shown = cashAmount(amount, currency as 'USD' | 'GBP' | 'EUR')
  return currency === 'USD' ? `US${shown}` : shown
}

// The list's Difference column.
export function rowDifference(row: ShiftRow): string {
  if (row.totalDifference === null) return 'Counted at close'
  const parts: string[] = []
  if (dec(row.totalDifference).isZero()) parts.push('Balanced')
  else if (row.cashDifference && dec(row.cashDifference).abs().equals(row.totalDifference)) {
    const words = differenceWords(row.cashDifference)
    parts.push(words ? `${words.amount} ${words.words}` : naira(row.totalDifference))
  } else parts.push(`${naira(row.totalDifference)} difference`)
  const handover = differenceWords(row.handoverDifference)
  if (handover) parts.push(`${handover.amount} ${handover.words} at hand-over`)
  return parts.join(' · ')
}

// "06:55–14:50", or "22:55 24 Nov – 06:45 25 Nov" when it crossed midnight.
export function openedClosed(row: Pick<ShiftRow, 'openedAt' | 'closedAt' | 'timeZone'>): string {
  const opened = clockAt(row.openedAt, row.timeZone)
  if (!row.closedAt) return `opened ${opened}`
  const day = (at: string) =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: row.timeZone,
    }).format(new Date(at))
  const closed = clockAt(row.closedAt, row.timeZone)
  return day(row.openedAt) === day(row.closedAt)
    ? `${opened}–${closed}`
    : `${opened} ${day(row.openedAt)} – ${closed} ${day(row.closedAt)}`
}

export const STATUS_TONE = { open: 'blue', counted: 'amber', closed: 'slate' } as const
