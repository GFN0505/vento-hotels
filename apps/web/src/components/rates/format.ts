// Words and numbers for rates screens (spec: stage-1-rate-plans, "UI copy"). Money goes through the
// shared decimal helpers (formatNaira), never a float. Every price shown says whether it includes
// taxes and service charge: all-in by default, before taxes on plans marked so (decision 0032).
import {
  type CalendarDate,
  type CancellationPolicy,
  type DepositRule,
  dec,
  formatNaira,
  formatRateDate,
  type MealPlan,
  type RateAdjustment,
} from '@vento/shared'

export const INCL = 'incl. taxes and service charge'
export const EXCL = 'excl. taxes and service charge'

// The plan's basis: "incl. taxes and service charge" or "excl. …".
export const basis = (inclusive: boolean) => (inclusive ? INCL : EXCL)

// A page header over many plans: all-in unless some plans are marked "excl. taxes".
export function perNight(plans: { exclusive: number; total: number }): string {
  if (plans.total > 0 && plans.exclusive === plans.total) return `₦ per night ${EXCL}`
  if (plans.exclusive > 0) return `₦ per night ${INCL} unless marked excl.`
  return `₦ per night ${INCL}`
}
export const NEEDS_CONNECTION = 'Needs a connection'
export const CHANGE_DENIED =
  'Only a revenue manager, GM or the owner can change rates. Ask your GM.'

// Read-only members, under the page title.
export const CHANGE_DENIED_SHORT = 'Only a revenue manager, GM or the owner can change rates.'

export { formatNaira }

// "165,000": the calendar's cells, where the header already says ₦.
export function nairaDigits(amount: string): string {
  return formatNaira(amount).replace('₦', '')
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

// "Bed & breakfast and Non-refundable", "A, B and C".
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

export const MEAL_PLAN_LABELS: Record<MealPlan, string> = {
  room_only: 'Room only',
  bed_breakfast: 'Breakfast included',
  half_board: 'Half board',
  full_board: 'Full board',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function dayName(date: CalendarDate): string {
  return DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? ''
}

// "Fri 27 Nov".
export function shortDate(date: CalendarDate): string {
  return `${dayName(date)} ${formatRateDate(date, false)}`
}

export { formatRateDate }

// "25 Nov – 8 Dec 2026", "28 Dec 2026 – 10 Jan 2027".
export function dateRange(from: CalendarDate, to: CalendarDate): string {
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${formatRateDate(from)} – ${formatRateDate(to)}`
  return `${formatRateDate(from, false)} – ${formatRateDate(to)}`
}

// "−10", "5.5": a percentage without trailing zeros, with a true minus sign.
function percentText(value: string): string {
  return dec(value).abs().toString()
}

// "Best available + ₦18,000", "BAR − 10%".
export function adjustmentLabel(parent: string, adjustment: RateAdjustment): string {
  const negative = dec(adjustment.value).isNegative()
  const sign = negative ? '−' : '+'
  const size =
    adjustment.kind === 'percent'
      ? `${percentText(adjustment.value)}%`
      : formatNaira(dec(adjustment.value).abs().toString())
  return `${parent} ${sign} ${size}`
}

const PENALTY: Record<string, string> = {
  first_night: 'the first night',
  full_stay: 'the full stay',
}

export function cancellationLabel(policy: CancellationPolicy): string {
  if (policy.kind === 'non_refundable') return 'Non-refundable'
  const then =
    policy.penalty.kind === 'percent_of_stay'
      ? `${percentText(policy.penalty.percent)}% of the stay`
      : PENALTY[policy.penalty.kind]
  if (policy.hours === 0) return `Free until arrival, then ${then}`
  return `Free until ${plural(policy.hours, 'hour')} before arrival, then ${then}`
}

export function depositLabel(rule: DepositRule): string {
  if (rule.kind === 'none') return 'No deposit'
  const what =
    rule.kind === 'first_night'
      ? 'First night'
      : rule.kind === 'full_stay'
        ? 'Full stay'
        : `${percentText(rule.percent)}% of the stay`
  const when =
    rule.due.kind === 'at_booking' ? 'at booking' : `within ${plural(rule.due.hours, 'hour')}`
  return `${what}, ${when}`
}
