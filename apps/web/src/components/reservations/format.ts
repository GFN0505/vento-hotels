// How reservations read on screen and in the copied confirmation: money, stay ranges, nights,
// deposit and cancellation lines, plan terms in words. Pure, so it's unit-tested.
import {
  type CancellationPolicy,
  type DepositRule,
  formatMoney,
  formatPercent,
  type ReservationStatus,
  STATUS_LABELS,
  type StayTerms,
} from '@vento/shared'
import { MEAL_PLAN_LABELS } from '../rates/format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const naira = (amount: string) => formatMoney({ amount, currency: 'NGN' })

const parts = (date: string) => {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number)
  return { y, m, d, weekday: DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '' }
}

// "25 Nov 2026"; "25 Nov" without the year.
export function dateLabel(date: string, withYear = true): string {
  const { y, m, d } = parts(date)
  return withYear ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`
}

// "Wed 9 Dec"; "Wed 9 Dec 2026" with the year.
export function dayLabel(date: string, withYear = false): string {
  return `${parts(date).weekday} ${dateLabel(date, withYear)}`
}

export function nightsBetweenDates(arrival: string, departure: string): number {
  return Math.round(
    (Date.parse(`${departure}T00:00:00Z`) - Date.parse(`${arrival}T00:00:00Z`)) / 86_400_000,
  )
}

export const nightsLabel = (count: number) => (count === 1 ? '1 night' : `${count} nights`)

// "9–12 Dec 2026", "28 Nov–2 Dec 2026", "30 Dec 2026–2 Jan 2027".
export function stayRange(arrival: string, departure: string): string {
  const a = parts(arrival)
  const b = parts(departure)
  if (a.y !== b.y) return `${dateLabel(arrival)}–${dateLabel(departure)}`
  if (a.m !== b.m) return `${dateLabel(arrival, false)}–${dateLabel(departure)}`
  return `${a.d}–${dateLabel(departure)}`
}

// "9–12 Dec 2026 · 3 nights"
export const stayLine = (arrival: string, departure: string) =>
  `${stayRange(arrival, departure)} · ${nightsLabel(nightsBetweenDates(arrival, departure))}`

// "Wed 9 Dec → Sat 12 Dec 2026 · 3 nights · 1 adult"
export function datesSummary(arrival: string, departure: string, adults: number, children: number) {
  const party = [
    adults === 1 ? '1 adult' : `${adults} adults`,
    children ? (children === 1 ? '1 child' : `${children} children`) : null,
  ]
    .filter(Boolean)
    .join(', ')
  return `${dayLabel(arrival)} → ${dayLabel(departure, true)} · ${nightsLabel(nightsBetweenDates(arrival, departure))} · ${party}`
}

// An instant in the hotel's time zone: "27 Nov 2026, 10:32"; "Mon 7 Dec 2026, 14:00" with the day.
export function instantLabel(iso: string, timeZone: string, withDay = false): string {
  const at = new Date(iso)
  const get = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(at)
  const date = get({ year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/')
    .reverse()
    .join('-')
  const time = get({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${withDay ? dayLabel(date, true) : dateLabel(date)}, ${time}`
}

export const instantDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso))
    .split('/')
    .reverse()
    .join('-')

// "Room only", "Bed & breakfast"…
export const mealLabel = (terms: Pick<StayTerms, 'mealPlan'>) => MEAL_PLAN_LABELS[terms.mealPlan]

// The plan's cancellation line on a Room & rate card: "free cancellation until 7 Dec 14:00" or
// "paid in full at booking", counted from the hotel's check-in time on the arrival day.
export function cancellationShort(
  policy: CancellationPolicy,
  deposit: DepositRule,
  deadline: Date | null,
  timeZone: string,
): string {
  if (policy.kind === 'non_refundable') {
    return deposit.kind === 'full_stay' && deposit.due.kind === 'at_booking'
      ? 'Paid in full at booking'
      : 'Non-refundable'
  }
  if (!deadline) return 'Free cancellation'
  const label = instantLabel(deadline.toISOString(), timeZone).replace(/ \d{4},/, '')
  return `free cancellation until ${label}`
}

type Cancellation =
  | { kind: 'non_refundable'; penalty: string }
  | {
      kind: 'free_until'
      deadline: string
      penalty: string
      penaltyKind: 'first_night' | 'full_stay' | 'percent_of_stay'
      percent: string | null
    }

const penaltyWords = (c: Extract<Cancellation, { kind: 'free_until' }>) =>
  c.penaltyKind === 'first_night'
    ? `first night, ${naira(c.penalty)}`
    : c.penaltyKind === 'full_stay'
      ? `the full stay, ${naira(c.penalty)}`
      : `${formatPercent(c.percent ?? '0')}% of the stay, ${naira(c.penalty)}`

// The summary's line: "Free until Mon 7 Dec 2026, 14:00. After that, or no-show: first night, ₦205,800.00."
export function cancellationLine(c: Cancellation, timeZone: string): string {
  if (c.kind === 'non_refundable') return 'Non-refundable: the full stay is charged if cancelled.'
  return `Free until ${instantLabel(c.deadline, timeZone, true)}. After that, or no-show: ${penaltyWords(c)}.`
}

// The detail's line: "Cancelling now is free until 7 Dec 2026, 14:00. After that: first night, ₦205,800.00."
// Once the deadline has passed, the line says so: "Free cancellation ended 7 Dec 2026, 14:00.
// Cancelling now charges first night, ₦205,800.00."
export function cancellingNowLine(c: Cancellation, timeZone: string, now = new Date()): string {
  if (c.kind === 'non_refundable') return 'Non-refundable: the full stay is charged if cancelled.'
  const deadline = instantLabel(c.deadline, timeZone)
  if (Date.parse(c.deadline) <= now.getTime()) {
    return `Free cancellation ended ${deadline}. Cancelling now charges ${penaltyWords(c)}.`
  }
  return `Cancelling now is free until ${deadline}. After that: ${penaltyWords(c)}.`
}

// A deposit is overdue once its due time has passed (shown in rose with the word, never colour alone).
export const isOverdue = (deposit: { dueAt: string }, now = new Date()) =>
  Date.parse(deposit.dueAt) <= now.getTime()

// "First night incl. taxes, by 27 Nov 2026, 10:32", "Paid in full at booking"…
export function depositBasis(rule: DepositRule, dueAt: string, timeZone: string): string {
  if (rule.kind === 'none') return 'No deposit'
  if (rule.kind === 'full_stay' && rule.due.kind === 'at_booking') return 'Paid in full at booking'
  const what =
    rule.kind === 'first_night'
      ? 'First night incl. taxes'
      : rule.kind === 'full_stay'
        ? 'Full stay incl. taxes'
        : `${formatPercent(rule.percent)}% of the stay incl. taxes`
  return `${what}, by ${instantLabel(dueAt, timeZone)}`
}

// "₦205,800.00 due 27 Nov" for the list.
// "₦205,800.00 due 27 Nov", or "₦205,800.00 overdue" once the due time has passed.
export const depositShort = (
  deposit: { amount: string; dueAt: string },
  timeZone = 'Africa/Lagos',
  now = new Date(),
) =>
  isOverdue(deposit, now)
    ? `${naira(deposit.amount)} overdue`
    : `${naira(deposit.amount)} due ${dateLabel(instantDate(deposit.dueAt, timeZone), false)}`

export function statusTone(
  status: ReservationStatus,
): 'blue' | 'emerald' | 'slate' | 'rose' | 'amber' {
  if (status === 'confirmed') return 'blue'
  if (status === 'checked_in') return 'emerald'
  if (status === 'cancelled' || status === 'no_show') return 'rose'
  if (status === 'tentative') return 'amber'
  return 'slate'
}

export const statusLabel = (status: ReservationStatus) => STATUS_LABELS[status]

// "Service charge 10%", "VAT 7.5%".
export const taxLabel = (line: { name: string; ratePercent: string }) =>
  `${line.name} ${formatPercent(line.ratePercent)}%`

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}
