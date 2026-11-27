// Reservations: vocabulary and the pure quote maths (spec: stage-1-availability-and-reservations.md).
// The booking sheet and the server price a stay with the same functions, so the summary on the
// device matches what the server books; the server re-computes inside the booking transaction and
// is the authority. Money rules (non-negotiable 5): Decimal throughout, each figure rounded once.
import { z } from 'zod'
import { addDays, type CalendarDate, instantAt } from './dates.ts'
import type { FxCurrency } from './fx.ts'
import { type Decimal, dec, formatMoney, toAmount } from './money.ts'
import type { CancellationPolicy, DepositRule, MealPlan } from './rates.ts'
import { type TaxBreakdown, type TaxRuleInForce, taxLines } from './taxes.ts'

export const RESERVATION_STATUSES = [
  'tentative',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show',
] as const
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]
export const reservationStatusSchema = z.enum(RESERVATION_STATUSES)

export const STAY_STATUSES = [
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show',
] as const
export type StayStatus = (typeof STAY_STATUSES)[number]

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  tentative: 'Tentative',
  confirmed: 'Confirmed',
  checked_in: 'In house',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

export const RESERVATION_SOURCES = [
  'direct',
  'walk_in',
  'phone',
  'email',
  'whatsapp',
  'booking_engine',
  'ota',
  'corporate',
  'travel_agent',
] as const
export type ReservationSource = (typeof RESERVATION_SOURCES)[number]
export const reservationSourceSchema = z.enum(RESERVATION_SOURCES)

// What the desk can pick in this brick; walk-in is brick 8, the others come with their channels.
export const DESK_SOURCES = ['phone', 'whatsapp', 'email', 'direct'] as const
export type DeskSource = (typeof DESK_SOURCES)[number]
export const deskSourceSchema = z.enum(DESK_SOURCES)

export const SOURCE_LABELS: Record<ReservationSource, string> = {
  direct: 'In person',
  walk_in: 'Walk-in',
  phone: 'Phone',
  email: 'Email',
  whatsapp: 'WhatsApp',
  booking_engine: 'Website',
  ota: 'OTA',
  corporate: 'Corporate',
  travel_agent: 'Travel agent',
}

export const GUARANTEES = ['none', 'deposit'] as const
export type Guarantee = (typeof GUARANTEES)[number]

export const DISCOUNT_REASONS = [
  'repeat_guest',
  'corporate_rate_match',
  'long_stay',
  'service_recovery',
  'other',
] as const
export type DiscountReason = (typeof DISCOUNT_REASONS)[number]
export const discountReasonSchema = z.enum(DISCOUNT_REASONS)
export const DISCOUNT_REASON_LABELS: Record<DiscountReason, string> = {
  repeat_guest: 'Repeat guest',
  corporate_rate_match: 'Corporate rate match',
  long_stay: 'Long stay',
  service_recovery: 'Service recovery',
  other: 'Other',
}

// Reservations show a hotel's nights one by one up to this many; longer stays show the lowest.
export const MAX_NIGHT_BADGES = 14
// One room per reservation in the screens; the server takes a list (Decision 6).
export const MAX_STAYS = 10
export const NOTES_MAX = 500

// --- Discounts --------------------------------------------------------------------------------------

const percentValue = z
  .string()
  .trim()
  .regex(/^\d{1,2}(\.\d{1,2})?$/, 'Enter a discount like 10 or 12.5')
  .refine(
    (value) => dec(value).greaterThanOrEqualTo('0.01') && dec(value).lessThanOrEqualTo('99.99'),
    'Use a discount from 0.01% to 99.99%',
  )

const rateValue = z
  .string()
  .trim()
  .transform((value) => value.replaceAll(',', ''))
  .pipe(z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, 'Enter the rate per night, like 151200'))

// A discount as typed: % off the plan price on every night, or one rate per night. Reason
// required (text for Other); the note is optional.
export const discountInputSchema = z
  .object({
    kind: z.enum(['percent', 'rate']),
    value: z.string(),
    reason: discountReasonSchema,
    reasonText: z.string().trim().max(200).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((discount, ctx) => {
    const parsed = (discount.kind === 'percent' ? percentValue : rateValue).safeParse(
      discount.value,
    )
    if (!parsed.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: parsed.error.issues[0]?.message ?? '',
      })
    }
    if (discount.reason === 'other' && !discount.reasonText) {
      ctx.addIssue({ code: 'custom', path: ['reasonText'], message: 'Say why, in a few words' })
    }
  })
  .transform((discount) => ({
    ...discount,
    value:
      discount.kind === 'percent'
        ? dec(discount.value).toString()
        : toAmount(rateValue.parse(discount.value)),
  }))
export type DiscountInput = z.infer<typeof discountInputSchema>

export type DiscountProblem = 'ABOVE_PLAN' | 'ZERO' | 'BELOW_MEAL'

export type PricedNight = {
  date: CalendarDate
  // The plan's room price for the night, without the extra adult charge.
  planPrice: string
  extraAdult: string
  mealAllocation: string
}

export type DiscountedNight = PricedNight & { soldPrice: string }

export type DiscountResult =
  | {
      ok: true
      nights: DiscountedNight[]
      // The largest discount on any night, unrounded, for the limit check.
      percent: Decimal
    }
  | { ok: false; problem: DiscountProblem; date: CalendarDate }

// Applies a discount to the room price of every night (not the extra adult charge). A % keeps the
// sold price as plan × (1 − %), rounded once, half-up, to the kobo; a rate is the same every night
// and its % is measured per night against the plan price.
export function applyDiscount(
  nights: readonly PricedNight[],
  discount: Pick<DiscountInput, 'kind' | 'value'> | null,
): DiscountResult {
  if (!discount) {
    return {
      ok: true,
      nights: nights.map((night) => ({ ...night, soldPrice: toAmount(night.planPrice) })),
      percent: dec('0'),
    }
  }
  const sold: DiscountedNight[] = []
  let percent = dec('0')
  for (const night of nights) {
    const plan = dec(night.planPrice)
    const price =
      discount.kind === 'percent'
        ? dec(toAmount(plan.times(dec('100').minus(discount.value)).dividedBy(100)))
        : dec(discount.value)
    if (price.lessThanOrEqualTo(0)) return { ok: false, problem: 'ZERO', date: night.date }
    if (price.greaterThan(plan)) return { ok: false, problem: 'ABOVE_PLAN', date: night.date }
    if (price.lessThan(night.mealAllocation)) {
      return { ok: false, problem: 'BELOW_MEAL', date: night.date }
    }
    const off =
      discount.kind === 'percent'
        ? dec(discount.value)
        : plan.minus(price).dividedBy(plan).times(100)
    if (off.greaterThan(percent)) percent = off
    sold.push({ ...night, soldPrice: toAmount(price) })
  }
  return { ok: true, nights: sold, percent }
}

// Over the member's limit? `limit` null means no limit (owner, group admin).
export function overLimit(percent: Decimal | string, limit: string | null): boolean {
  return limit !== null && dec(percent).greaterThan(limit)
}

// "12", "12.5", "10.71": a percent as people say it.
export function formatPercent(value: Decimal | string): string {
  return dec(dec(value).toFixed(2)).toString()
}

const naira = (amount: string) => formatMoney({ amount, currency: 'NGN' })

const MEAL_WORDS: Record<MealPlan, string> = {
  room_only: 'meal',
  bed_breakfast: 'breakfast',
  half_board: 'meals',
  full_board: 'meals',
}

export function discountProblemMessage(
  problem: DiscountProblem,
  plan: { name: string; mealPlan: MealPlan; mealAllocation: string | null },
): string {
  if (problem === 'ABOVE_PLAN') return 'To charge more, pick another plan.'
  if (problem === 'ZERO') return 'A free night is a comp. Comps come with folios.'
  return `${plan.name}'s ${MEAL_WORDS[plan.mealPlan]} part is ${naira(plan.mealAllocation ?? '0')} a night, so the rate can't go below it.`
}

export function overLimitMessage(percent: Decimal | string, limit: string): string {
  const shown = formatPercent(limit)
  return `${formatPercent(percent)}% is over your ${shown}% discount limit. A manager with a higher limit can approve it when you book.`
}

// --- Tax lines per night ---------------------------------------------------------------------------

export type NightTaxes = {
  // Room part (price + extra adult − meal allocation) as accommodation, meal allocation as food.
  room: TaxBreakdown
  meal: TaxBreakdown | null
  net: string
  rounding: string
  gross: string
}

// One night's tax lines from the rules in force on that night, inclusive or exclusive per the
// plan's terms.
export function nightTaxes(
  night: { soldPrice: string; extraAdult: string; mealAllocation: string },
  rules: readonly TaxRuleInForce[],
  pricesIncludeTaxes: boolean,
): NightTaxes {
  const pricing = pricesIncludeTaxes ? 'inclusive' : 'exclusive'
  const meal = dec(night.mealAllocation)
  const roomPart = dec(night.soldPrice).plus(night.extraAdult).minus(meal)
  const room = taxLines({
    amount: toAmount(roomPart),
    currency: 'NGN',
    pricing,
    category: 'accommodation',
    rules,
  })
  const food = meal.isZero()
    ? null
    : taxLines({ amount: toAmount(meal), currency: 'NGN', pricing, category: 'food', rules })
  const parts = food ? [room, food] : [room]
  const sum = (pick: (part: TaxBreakdown) => string) =>
    toAmount(parts.reduce((total, part) => total.plus(pick(part)), dec('0')))
  return {
    room,
    meal: food,
    net: sum((part) => part.net),
    rounding: sum((part) => part.rounding),
    gross: sum((part) => part.gross),
  }
}

// A tax line summed across nights: one per tax and rate (a scheduled change shows as two).
export type SummedLine = {
  key: string
  taxId: string
  kind: TaxRuleInForce['kind']
  name: string
  ratePercent: string
  amount: string
}

export function nightLines(taxes: NightTaxes): SummedLine[] {
  const parts = taxes.meal ? [taxes.room, taxes.meal] : [taxes.room]
  const byKey = new Map<string, SummedLine>()
  for (const line of parts.flatMap((part) => part.lines)) {
    const key = `${line.taxId}:${line.ratePercent}`
    const found = byKey.get(key)
    byKey.set(key, {
      key,
      taxId: line.taxId,
      kind: line.kind,
      name: line.name,
      ratePercent: line.ratePercent,
      amount: toAmount(dec(found?.amount ?? '0').plus(line.amount)),
    })
  }
  return [...byKey.values()]
}

const KIND_ORDER = { service_charge: 0, vat: 1, state_tax: 2 } as const

// The stay's totals: net, each tax summed (service charge, VAT, then state taxes), rounding, total.
// Total = Σ nights' gross, to the kobo.
export function stayTotals(nights: readonly NightTaxes[]): {
  net: string
  lines: SummedLine[]
  rounding: string
  total: string
} {
  const byKey = new Map<string, SummedLine>()
  let net = dec('0')
  let rounding = dec('0')
  let total = dec('0')
  for (const night of nights) {
    net = net.plus(night.net)
    rounding = rounding.plus(night.rounding)
    total = total.plus(night.gross)
    for (const line of nightLines(night)) {
      const found = byKey.get(line.key)
      byKey.set(line.key, {
        ...line,
        amount: toAmount(dec(found?.amount ?? '0').plus(line.amount)),
      })
    }
  }
  const lines = [...byKey.values()].sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.name.localeCompare(b.name) ||
      dec(a.ratePercent).comparedTo(b.ratePercent),
  )
  return { net: toAmount(net), lines, rounding: toAmount(rounding), total: toAmount(total) }
}

// --- Deposit and cancellation ----------------------------------------------------------------------

export type HotelClock = { checkInTime: string; timeZone: string }

// The hotel's check-in time on the arrival day, as an instant.
export function checkInOn(arrival: CalendarDate, hotel: HotelClock): Date {
  return instantAt(arrival, hotel.checkInTime, hotel.timeZone)
}

// The deposit the plan's rule asks for, on the gross amounts: first night, N% of the total
// (rounded once) or the total. Due at booking, or N hours after booking, or the hotel's check-in
// time on the arrival day if sooner (never before the booking itself).
export function depositDue(
  rule: DepositRule,
  stay: { arrival: CalendarDate; firstNightGross: string; total: string },
  bookedAt: Date,
  hotel: HotelClock,
): { amount: string; dueAt: Date } | null {
  if (rule.kind === 'none') return null
  const amount =
    rule.kind === 'first_night'
      ? toAmount(stay.firstNightGross)
      : rule.kind === 'full_stay'
        ? toAmount(stay.total)
        : toAmount(dec(stay.total).times(rule.percent).dividedBy(100))
  if (rule.due.kind === 'at_booking') return { amount, dueAt: bookedAt }
  const within = bookedAt.getTime() + rule.due.hours * 3_600_000
  const arrival = checkInOn(stay.arrival, hotel).getTime()
  return { amount, dueAt: new Date(Math.max(bookedAt.getTime(), Math.min(within, arrival))) }
}

export type CancellationTerms =
  | { kind: 'non_refundable'; penalty: string }
  | {
      kind: 'free_until'
      deadline: Date
      penalty: string
      penaltyKind: 'first_night' | 'full_stay' | 'percent_of_stay'
      percent: string | null
    }

// Free until the hotel's check-in time on the arrival day − N hours; after that (or no-show) the
// penalty: first night gross, N% of the total, or the total. Non-refundable: the total.
export function cancellationTerms(
  policy: CancellationPolicy,
  stay: { arrival: CalendarDate; firstNightGross: string; total: string },
  hotel: HotelClock,
): CancellationTerms {
  if (policy.kind === 'non_refundable') {
    return { kind: 'non_refundable', penalty: toAmount(stay.total) }
  }
  const deadline = new Date(checkInOn(stay.arrival, hotel).getTime() - policy.hours * 3_600_000)
  const { penalty } = policy
  const amount =
    penalty.kind === 'first_night'
      ? toAmount(stay.firstNightGross)
      : penalty.kind === 'full_stay'
        ? toAmount(stay.total)
        : toAmount(dec(stay.total).times(penalty.percent).dividedBy(100))
  return {
    kind: 'free_until',
    deadline,
    penalty: amount,
    penaltyKind: penalty.kind,
    percent: penalty.kind === 'percent_of_stay' ? penalty.percent : null,
  }
}

// --- Foreign equivalents ---------------------------------------------------------------------------

// Euro area members (2026, with Bulgaria from 1 Jan 2026).
const EURO_AREA = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PT',
  'SK',
  'SI',
  'ES',
])

// The currency a foreign guest's equivalent is shown in: GBP for British nationals, EUR for the euro
// area, USD for everyone else; none for Nigerians. Display only, never stored.
export function nationalityCurrency(nationality: string): FxCurrency | null {
  if (nationality === 'NG') return null
  if (nationality === 'GB') return 'GBP'
  if (EURO_AREA.has(nationality)) return 'EUR'
  return 'USD'
}

// --- Numbers and prefixes --------------------------------------------------------------------------

export const bookingPrefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,4}$/, 'Use 2 to 4 letters, like VI')

// "2611" for a business date in Nov 2026.
export function periodOf(date: CalendarDate): string {
  return `${date.slice(2, 4)}${date.slice(5, 7)}`
}

// VI-2611-0483: the hotel's prefix, the year and month booked, a sequence per hotel per month.
export function reservationNumber(prefix: string, period: string, sequence: number): string {
  return `${prefix}-${period}-${String(sequence).padStart(4, '0')}`
}

// A prefix suggested from a hotel's name: the first three letters of what follows the brand word
// ("Kora Lekki" → LEK, "Sheraton" → SHE), with a letter added when it's taken (LEKA, LEKB…).
export function suggestBookingPrefix(name: string, taken: readonly string[]): string {
  const words = name
    .normalize('NFD')
    .replace(/[^A-Za-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const distinctive = (words.length > 1 ? words.slice(1) : words).join('').toUpperCase()
  const base = (distinctive.length >= 2 ? distinctive : `${distinctive}HTL`).slice(0, 3)
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (!used.has(`${base}${letter}`)) return `${base}${letter}`
  }
  return base
}

// The nights of a stay, for loops: 9 Dec → 12 Dec gives 9, 10, 11 Dec.
export function stayNights(arrival: CalendarDate, count: number): CalendarDate[] {
  return Array.from({ length: count }, (_, i) => addDays(arrival, i))
}
