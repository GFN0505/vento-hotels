// Rate plans and rates: field rules and the pure pricing maths (spec:
// docs/specs/stage-1-rate-plans.md). The plan editor's preview and the API use the same functions,
// so a derived price is computed one way everywhere; the server re-computes on every save and
// quote and is the authority.
//
// Money rules (non-negotiable 5): prices are whole naira as decimal strings ("120000.00"), maths in
// Decimal, rounded once, half-up, to the whole naira.
import { z } from 'zod'
import { addDays, type CalendarDate, nightsBetween } from './dates.ts'
import { Decimal, dec, type FxRate, toAmount } from './money.ts'

export const MAX_RATE_PRICE = '100000000'
// One Change dates apply covers at most this many nights.
export const MAX_DATES_PER_APPLY = 366
// Prices and restrictions can be set up to this many years after the business date.
export const RATE_YEARS_AHEAD = 2
export const MAX_MIN_STAY = 30
export const MAX_CANCELLATION_HOURS = 720

export const MEAL_PLANS = ['room_only', 'bed_breakfast', 'half_board', 'full_board'] as const
export const mealPlanSchema = z.enum(MEAL_PLANS)
export type MealPlan = z.infer<typeof mealPlanSchema>

export const BOOKABLE_BY = ['anyone', 'corporate_only'] as const
export const bookableBySchema = z.enum(BOOKABLE_BY)
export type BookableBy = z.infer<typeof bookableBySchema>

export const RATE_PRICING = ['own', 'derived'] as const
export const ratePricingSchema = z.enum(RATE_PRICING)
export type RatePricing = z.infer<typeof ratePricingSchema>

// --- Field rules ----------------------------------------------------------------------------------

// A price typed by staff: whole naira above ₦0, up to ₦100,000,000. "120000", "120,000" and
// "120000.00" are the same price; kobo are refused (Open question 2).
export const ratePriceSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/,/g, ''))
  .pipe(
    z
      .string()
      .regex(/^\d{1,12}(\.0{1,2})?$/, { message: 'Enter whole naira, without kobo', abort: true })
      .refine((value) => dec(value).greaterThan(0), {
        message: 'Enter a price above ₦0. For a free night, comp it on the stay.',
      })
      .refine((value) => dec(value).lessThanOrEqualTo(MAX_RATE_PRICE), {
        message: 'Enter a price up to ₦100,000,000',
      }),
  )
  .transform((value) => toAmount(value))

export const ratePlanCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{2,10}$/, 'Use 2 to 10 capital letters, digits or hyphens, like NRF')

export const ratePlanNameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Enter a name').max(60, 'Keep the name under 60 characters'))

const percentPattern = /^[+-]?\d{1,3}(\.\d{1,2})?$/

// A derived plan's adjustment: a percentage (−90% to +100%, up to 2 decimals) or an amount per
// night (± whole naira). One or the other, never both: the shape makes that impossible.
export const rateAdjustmentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('percent'),
    value: z
      .string()
      .trim()
      .regex(percentPattern, {
        message: 'Enter a percentage with up to 2 decimals, like -10',
        abort: true,
      })
      .refine((v) => dec(v).greaterThanOrEqualTo(-90) && dec(v).lessThanOrEqualTo(100), {
        message: 'Use a percentage from -90% to +100%',
      })
      .transform((v) => dec(v).toFixed(2)),
  }),
  z.object({
    kind: z.literal('amount'),
    value: z
      .string()
      .trim()
      .transform((v) => v.replace(/,/g, ''))
      .pipe(
        z
          .string()
          .regex(/^[+-]?\d{1,9}(\.0{1,2})?$/, {
            message: 'Enter whole naira, like 18000 or -5000',
            abort: true,
          })
          .refine((v) => dec(v).abs().lessThanOrEqualTo(MAX_RATE_PRICE), {
            message: 'Keep the offset within ₦100,000,000',
          }),
      )
      .transform((v) => toAmount(v)),
  }),
])
export type RateAdjustment = z.infer<typeof rateAdjustmentSchema>

const wholePercent = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, {
    message: 'Enter a percentage with up to 2 decimals',
    abort: true,
  })
  .refine((v) => dec(v).greaterThan(0) && dec(v).lessThanOrEqualTo(100), {
    message: 'Use a percentage from 1% to 100%',
  })
  .transform((v) => dec(v).toFixed(2))

// "Free until N hours before arrival, then {first night · N% of the stay · the full stay}", or
// non-refundable (the full stay). Counted back from the hotel's check-in time on the arrival day.
// The no-show penalty is the late-cancellation penalty.
export const cancellationPolicySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('non_refundable') }),
  z.object({
    kind: z.literal('free_until'),
    hours: z
      .number()
      .int('Enter whole hours')
      .min(0, 'Use 0 hours or more')
      .max(MAX_CANCELLATION_HOURS, 'Use up to 720 hours (30 days)'),
    penalty: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('first_night') }),
      z.object({ kind: z.literal('full_stay') }),
      z.object({ kind: z.literal('percent_of_stay'), percent: wholePercent }),
    ]),
  }),
])
export type CancellationPolicy = z.infer<typeof cancellationPolicySchema>

const depositDue = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('at_booking') }),
  z.object({
    kind: z.literal('within_hours'),
    hours: z.number().int('Enter whole hours').min(1, 'Use 1 hour or more').max(720),
  }),
])

// None · First night · N% of the stay · Full stay; due at booking or within N hours of booking (or
// by arrival, if sooner). The amount includes the tax lines on those nights (brick 3).
export const depositRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('first_night'), due: depositDue }),
  z.object({ kind: z.literal('full_stay'), due: depositDue }),
  z.object({ kind: z.literal('percent_of_stay'), percent: wholePercent, due: depositDue }),
])
export type DepositRule = z.infer<typeof depositRuleSchema>

export const minStaySchema = z
  .number()
  .int('Enter whole nights')
  .min(1, 'At least 1 night')
  .max(MAX_MIN_STAY, 'Up to 30 nights')

// The recommended defaults (Open questions 9 and 10).
export const DEFAULT_CANCELLATION: CancellationPolicy = {
  kind: 'free_until',
  hours: 48,
  penalty: { kind: 'first_night' },
}
export const DEFAULT_DEPOSIT: DepositRule = {
  kind: 'first_night',
  due: { kind: 'within_hours', hours: 48 },
}
// The first-rate table's optional Bed & breakfast plan: Best available + ₦18,000, all of it food.
export const BREAKFAST_SUPPLEMENT = '18000.00'

// A code suggestion from a plan's name: the initials, or the first three letters of a one-word
// name. Non-refundable → NR, Bed & breakfast → BB, Corporate → COR.
export function suggestPlanCode(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
  if (words.length === 0) return ''
  const initials = words.map((word) => word[0]).join('')
  return (initials.length >= 2 ? initials : (words[0] ?? '').slice(0, 3)).slice(0, 10)
}

// --- Dates ----------------------------------------------------------------------------------------

// 0 = Sunday … 6 = Saturday, for the night starting on `date`.
export const weekdaySchema = z.number().int().min(0).max(6)
export type Weekday = z.infer<typeof weekdaySchema>
export const ALL_WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6]

export function weekdayOf(date: CalendarDate): Weekday {
  return new Date(`${date}T00:00:00Z`).getUTCDay() as Weekday
}

// Friday and Saturday nights get the Fri and Sat price (Open question 6: fixed, not a setting).
export function isWeekendNight(date: CalendarDate): boolean {
  const day = weekdayOf(date)
  return day === 5 || day === 6
}

// The same day `years` later; 29 Feb becomes 28 Feb.
export function addYears(date: CalendarDate, years: number): CalendarDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const target = new Date(Date.UTC(y + years, m - 1, d))
  if (target.getUTCMonth() !== m - 1) return addDays(target.toISOString().slice(0, 10), -1)
  return target.toISOString().slice(0, 10)
}

// The last night a price or restriction can be set for, from a business date.
export function lastRateDate(businessDate: CalendarDate): CalendarDate {
  return addYears(businessDate, RATE_YEARS_AHEAD)
}

// Every night from `from` to `to` (both included) on the given days of the week.
export function selectDates(
  from: CalendarDate,
  to: CalendarDate,
  days: readonly Weekday[] = ALL_WEEKDAYS,
): CalendarDate[] {
  const wanted = new Set(days)
  const dates: CalendarDate[] = []
  const nights = nightsBetween(from, to)
  for (let i = 0; i <= nights; i++) {
    const date = addDays(from, i)
    if (wanted.has(weekdayOf(date))) dates.push(date)
  }
  return dates
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
]

// "12 Jan 2027" (no Intl: its short month names differ between ICU versions).
export function formatRateDate(date: CalendarDate, withYear = true): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return withYear ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`
}

function formatRange(from: CalendarDate, to: CalendarDate): string {
  const [fy, fm] = from.split('-')
  const [ty, tm] = to.split('-')
  if (fy !== ty) return `${formatRateDate(from)} and ${formatRateDate(to)}`
  if (fm !== tm) return `${formatRateDate(from, false)} and ${formatRateDate(to, false)}`
  return `${Number(from.slice(8))} and ${formatRateDate(to, false)}`
}

function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`
}

// "No Fridays between 7 and 10 Dec."
export function noDatesMessage(
  from: CalendarDate,
  to: CalendarDate,
  days: readonly Weekday[],
): string {
  const names = [...new Set(days)].sort().map((day) => DAY_NAMES[day] ?? '')
  return `No ${listWords(names)} between ${formatRange(from, to)}.`
}

// --- Prices ---------------------------------------------------------------------------------------

// A plan's everyday price for one room type: weekday (Sun–Thu nights) and optionally Fri and Sat.
export type StandardPrice = { weekday: string; weekend: string | null }

// What one own-price plan holds for one room type and date (missing = nothing set).
export type DateCell = {
  price: string | null
  closed: boolean
  closedToArrival: boolean
  minStay: number | null
}

// Everything needed to price one room type on an own-price plan: its standard price, its date
// cells, and its extra adult amount. A derived plan is priced from its parent's source.
export type PriceSource = {
  standard: StandardPrice
  dates: ReadonlyMap<CalendarDate, DateCell>
  extraAdult: string | null
}

export type PriceFrom = 'date' | 'standard'

// Rounds once, half-up, to the whole naira, and returns the canonical amount ("155250.00").
export function roundToNaira(value: Decimal): string {
  return toAmount(value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP))
}

// A derived plan's price from its parent's: parent × (1 + %) or parent + amount, rounded once.
// May be zero or negative; callers refuse saves that would make it so.
export function derivePrice(parentPrice: string, adjustment: RateAdjustment): string {
  const parent = dec(parentPrice)
  const value =
    adjustment.kind === 'percent'
      ? parent.times(dec('100').plus(adjustment.value)).dividedBy(100)
      : parent.plus(adjustment.value)
  return roundToNaira(value)
}

export function standardPriceOn(standard: StandardPrice, date: CalendarDate): string {
  return isWeekendNight(date) && standard.weekend !== null ? standard.weekend : standard.weekday
}

// An own-price plan's price for a night: its date price if set, else its standard price.
export function ownPriceOn(
  source: Pick<PriceSource, 'standard' | 'dates'>,
  date: CalendarDate,
): { price: string; from: PriceFrom } {
  const cell = source.dates.get(date)
  if (cell?.price) return { price: cell.price, from: 'date' }
  return { price: standardPriceOn(source.standard, date), from: 'standard' }
}

export type Night = {
  date: CalendarDate
  price: string
  from: PriceFrom
  closed: boolean
  closedToArrival: boolean
  // The effective min stay for an arrival on this date: the larger of the plan's own and the
  // date's (the parent's date, for a derived plan).
  minStay: number
}

// One night of a plan: own (adjustment null) or derived (source is the parent's).
export function nightOf(
  source: Pick<PriceSource, 'standard' | 'dates'>,
  adjustment: RateAdjustment | null,
  planMinStay: number,
  date: CalendarDate,
): Night {
  const own = ownPriceOn(source, date)
  const cell = source.dates.get(date)
  return {
    date,
    price: adjustment ? derivePrice(own.price, adjustment) : own.price,
    from: own.from,
    closed: cell?.closed ?? false,
    closedToArrival: cell?.closedToArrival ?? false,
    minStay: Math.max(planMinStay, cell?.minStay ?? 1),
  }
}

// The first night from `from` to `to` (both included) on which a derived plan would cost ₦0 or
// less, or null. Saves that would make one are refused (spec, Rates).
export function firstNonPositiveNight(
  source: Pick<PriceSource, 'standard' | 'dates'>,
  adjustment: RateAdjustment,
  from: CalendarDate,
  to: CalendarDate,
): CalendarDate | null {
  if (to < from) return null
  // Only the standard prices and the dated prices in range can produce a night's price.
  const candidates: { date: CalendarDate; price: string }[] = []
  const nights = nightsBetween(from, to)
  // Standard prices: the first weekday and the first weekend night in range not covered by a date
  // price are the earliest nights each could apply.
  let weekday: CalendarDate | null = null
  let weekend: CalendarDate | null = null
  for (let i = 0; i <= nights && (weekday === null || weekend === null); i++) {
    const date = addDays(from, i)
    if (source.dates.get(date)?.price) continue
    if (isWeekendNight(date)) weekend ??= date
    else weekday ??= date
  }
  if (weekday) candidates.push({ date: weekday, price: source.standard.weekday })
  if (weekend) candidates.push({ date: weekend, price: standardPriceOn(source.standard, weekend) })
  for (const [date, cell] of source.dates) {
    if (cell.price && date >= from && date <= to) candidates.push({ date, price: cell.price })
  }
  const bad = candidates
    .filter((c) => !dec(derivePrice(c.price, adjustment)).greaterThan(0))
    .map((c) => c.date)
    .sort()
  return bad[0] ?? null
}

// --- Restrictions and quotes ----------------------------------------------------------------------

export const RESTRICTION_KINDS = ['closed', 'closed_to_arrival', 'min_stay'] as const
export type RestrictionKind = (typeof RESTRICTION_KINDS)[number]
export type RestrictionBreak = { kind: RestrictionKind; date: CalendarDate; message: string }

// Which of the plan's restrictions a stay breaks: closed on any night, closed to arrival on the
// arrival date, or fewer nights than the min stay that applies on the arrival date.
export function restrictionBreaks(nights: readonly Night[], planName: string): RestrictionBreak[] {
  const breaks: RestrictionBreak[] = []
  const [first] = nights
  if (!first) return breaks
  if (first.closedToArrival) {
    breaks.push({
      kind: 'closed_to_arrival',
      date: first.date,
      message: `${planName} is closed to arrivals on ${formatRateDate(first.date)}.`,
    })
  }
  if (nights.length < first.minStay) {
    breaks.push({
      kind: 'min_stay',
      date: first.date,
      message: `${planName} needs a stay of at least ${first.minStay} nights from ${formatRateDate(first.date)}.`,
    })
  }
  for (const night of nights) {
    if (night.closed) {
      breaks.push({
        kind: 'closed',
        date: night.date,
        message: `${planName} is closed on ${formatRateDate(night.date)}.`,
      })
    }
  }
  return breaks
}

export type QuoteLine = {
  date: CalendarDate
  // The room price for the night (derived plans: computed), excluding the extra adult charge.
  price: string
  from: PriceFrom
  extraAdult: string
  // price + extraAdult.
  total: string
  // The food part of `price` for meal plans, per room per night; '0.00' for room only.
  mealAllocation: string
}

export type QuoteInput = {
  source: PriceSource
  adjustment: RateAdjustment | null
  planName: string
  planMinStay: number
  mealAllocation: string | null
  baseOccupancy: number
  adults: number
  arrival: CalendarDate
  departure: CalendarDate
}

// Prices a stay night by night. Children are free (within the room type's max children); each
// adult above base occupancy pays the plan's extra adult amount (a derived plan's parent's,
// unadjusted). Each line is already whole naira, so the total needs no rounding.
export function quoteNights(input: QuoteInput): {
  lines: QuoteLine[]
  total: string
  breaks: RestrictionBreak[]
} {
  const count = nightsBetween(input.arrival, input.departure)
  const extraAdults = Math.max(0, input.adults - input.baseOccupancy)
  const extraAdult = dec(input.source.extraAdult ?? '0').times(extraAdults)
  const nights = Array.from({ length: count }, (_, i) =>
    nightOf(input.source, input.adjustment, input.planMinStay, addDays(input.arrival, i)),
  )
  let total = dec('0')
  const lines = nights.map((night) => {
    const lineTotal = dec(night.price).plus(extraAdult)
    total = total.plus(lineTotal)
    return {
      date: night.date,
      price: night.price,
      from: night.from,
      extraAdult: toAmount(extraAdult),
      total: toAmount(lineTotal),
      mealAllocation: toAmount(input.mealAllocation ?? '0'),
    }
  })
  return { lines, total: toAmount(total), breaks: restrictionBreaks(nights, input.planName) }
}

// --- Foreign equivalents (the seam for brick 3) ---------------------------------------------------

const FX_SOURCES: Record<FxRate['source'], string> = {
  cbn_official: 'CBN',
  bank: 'bank rate',
  manual: 'set by the hotel',
}
const SYMBOLS: Record<string, string> = { USD: '$', GBP: '£', EUR: '€' }

// An NGN price shown in a foreign currency for a guest, never stored on rates:
// "≈ $105.26 at ₦1,425/$, CBN, 25 Nov 2026". `fx.rate` is NGN per 1 unit of `currency`.
export function foreignEquivalent(
  ngnAmount: string,
  currency: 'USD' | 'GBP' | 'EUR',
  fx: FxRate,
): { amount: string; currency: 'USD' | 'GBP' | 'EUR'; label: string } {
  const amount = toAmount(dec(ngnAmount).dividedBy(fx.rate))
  const symbol = SYMBOLS[currency] ?? ''
  const shown = new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount as unknown as number)
  const rate = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 6 }).format(
    fx.rate as unknown as number,
  )
  return {
    amount,
    currency,
    label: `≈ ${symbol}${shown} at ₦${rate}/${symbol}, ${FX_SOURCES[fx.source]}, ${formatRateDate(fx.date)}`,
  }
}

// "₦165,000" for messages about whole-naira prices.
export function formatNaira(amount: string): string {
  return `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(
    dec(amount).toFixed(dec(amount).isInteger() ? 0 : 2) as unknown as number,
  )}`
}
