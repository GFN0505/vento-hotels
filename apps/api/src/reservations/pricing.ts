// The one place a stay's price for a booking is worked out, for the quote and inside the booking
// transaction alike: the plan's nightly prices (quoteStay), the discount, the tax lines per night
// with the rules in force that night, totals, the deposit due and the cancellation terms. The hash
// covers everything the guest is told, so the booking can tell whether it is still the price.
import { createHash } from 'node:crypto'
import {
  applyDiscount,
  type CancellationTerms,
  cancellationTerms,
  type Decimal,
  type DiscountInput,
  type DiscountProblem,
  depositDue,
  discountProblemMessage,
  formatMoney,
  formatPercent,
  type NightTaxes,
  nightLines,
  nightTaxes,
  overLimit,
  type StayQuote as StayQuoteView,
  type StayTerms,
  stayTotals,
  type TaxRuleInForce,
} from '@vento/shared'
import type { StayQuote } from '../rates/quote.ts'
import { type Access, ApprovalRequiredError, can, requireWithinLimit } from '../tenancy/access.ts'
import type { BookingHotel } from './context.ts'
import { discountOverLimit, discountProblem, noPermission } from './errors.ts'

export type PricedNight = {
  date: string
  planPrice: string
  soldPrice: string
  extraAdult: string
  mealAllocation: string
  from: 'date' | 'standard'
}

export type PricedStay = {
  quote: StayQuote
  nights: PricedNight[]
  taxes: NightTaxes[]
  totals: ReturnType<typeof stayTotals>
  deposit: { amount: string; dueAt: Date } | null
  cancellation: CancellationTerms
  discount: { input: DiscountInput; percent: Decimal } | null
  terms: StayTerms
  hash: string
}

const PROBLEM_CODES: Record<DiscountProblem, Parameters<typeof discountProblem>[0]> = {
  ABOVE_PLAN: 'DISCOUNT_ABOVE_PLAN',
  ZERO: 'DISCOUNT_ZERO',
  BELOW_MEAL: 'DISCOUNT_BELOW_MEAL',
}

export function termsSnapshot(quote: StayQuote): StayTerms {
  return {
    planName: quote.planName,
    planCode: quote.planCode,
    mealPlan: quote.terms.mealPlan,
    mealAllocation: quote.terms.mealAllocation,
    cancellation: quote.terms.cancellation,
    deposit: quote.terms.deposit,
    pricesIncludeTaxes: quote.terms.pricesIncludeTaxes,
  }
}

export function priceStay(
  quote: StayQuote,
  discount: DiscountInput | undefined,
  rules: ReadonlyMap<string, TaxRuleInForce[]>,
  hotel: Pick<BookingHotel, 'checkInTime' | 'timeZone'>,
  bookedAt: Date,
): PricedStay {
  const planned = quote.nights.map((line) => ({
    date: line.date,
    planPrice: line.price,
    extraAdult: line.extraAdult,
    mealAllocation: line.mealAllocation,
  }))
  const applied = applyDiscount(planned, discount ?? null)
  if (!applied.ok) {
    throw discountProblem(
      PROBLEM_CODES[applied.problem],
      discountProblemMessage(applied.problem, {
        name: quote.planName,
        mealPlan: quote.terms.mealPlan,
        mealAllocation: quote.terms.mealAllocation,
      }),
    )
  }
  const nights = applied.nights.map((night, index) => ({
    ...night,
    from: quote.nights[index]?.from ?? 'standard',
  }))
  const taxes = nights.map((night) =>
    nightTaxes(night, rules.get(night.date) ?? [], quote.terms.pricesIncludeTaxes),
  )
  const totals = stayTotals(taxes)
  const stay = {
    arrival: nights[0]?.date ?? '',
    firstNightGross: taxes[0]?.gross ?? '0',
    total: totals.total,
  }
  const deposit = depositDue(quote.terms.deposit, stay, bookedAt, hotel)
  const cancellation = cancellationTerms(quote.terms.cancellation, stay, hotel)
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        rates: quote.quoteHash,
        discount: discount ? { kind: discount.kind, value: discount.value } : null,
        sold: nights.map((night) => night.soldPrice),
        nights: taxes.map((night) => nightLines(night).map((line) => [line.key, line.amount])),
        totals,
        deposit: deposit?.amount ?? null,
        cancellation:
          cancellation.kind === 'free_until'
            ? [cancellation.deadline.toISOString(), cancellation.penalty]
            : cancellation.penalty,
      }),
    )
    .digest('hex')
  return {
    quote,
    nights,
    taxes,
    totals,
    deposit,
    cancellation,
    discount: discount ? { input: discount, percent: applied.percent } : null,
    terms: termsSnapshot(quote),
    hash,
  }
}

export const discountLimitOf = (access: Access) => access.rules['stay.rate_override'].limit

// Inside the booking: the discount must be within the member's limit, measured per night against
// the plan price. Over it is refused here (brick 5 adds approval).
export function requireDiscountAllowed(access: Access, priced: PricedStay): void {
  if (!priced.discount) return
  if (!can(access, 'stay.rate_override')) {
    throw noPermission("You can't give discounts. Ask a manager to make this booking.")
  }
  try {
    requireWithinLimit(access, 'stay.rate_override', priced.discount.percent.toString())
  } catch (error) {
    if (error instanceof ApprovalRequiredError) {
      throw discountOverLimit(priced.discount.percent.toString(), discountLimitOf(access) ?? '0')
    }
    throw error
  }
}

export function discountCheck(access: Access, priced: PricedStay): StayQuoteView['discount'] {
  if (!priced.discount) return null
  const limit = can(access, 'stay.rate_override') ? discountLimitOf(access) : '0'
  return {
    percent: formatPercent(priced.discount.percent),
    limit,
    within: can(access, 'stay.rate_override') && !overLimit(priced.discount.percent, limit),
  }
}

// "The price changed since you quoted it: Bed & breakfast is now ₦175,000.00 a night. Check the new
// total with the guest and book again."
export function priceChangedMessage(priced: PricedStay): string {
  const first = priced.nights[0]?.soldPrice ?? '0'
  const varies = priced.nights.some((night) => night.soldPrice !== first)
  const price = formatMoney({ amount: first, currency: 'NGN' })
  return `The price changed since you quoted it: ${priced.quote.planName} is now ${varies ? 'from ' : ''}${price} a night. Check the new total with the guest and book again.`
}

// The quote as the API returns it.
export function quoteView(
  priced: PricedStay,
  extras: Pick<StayQuoteView, 'discount' | 'fx' | 'overlaps'>,
): StayQuoteView {
  return {
    quoteHash: priced.hash,
    roomTypeId: priced.quote.roomTypeId,
    roomTypeName: priced.quote.roomTypeName,
    ratePlanId: priced.quote.ratePlanId,
    terms: priced.terms,
    nights: priced.nights.map((night, index) => {
      const taxes = priced.taxes[index]
      return {
        date: night.date,
        planPrice: night.planPrice,
        soldPrice: night.soldPrice,
        extraAdult: night.extraAdult,
        mealAllocation: night.mealAllocation,
        net: taxes?.net ?? '0.00',
        lines: taxes ? nightLines(taxes) : [],
        rounding: taxes?.rounding ?? '0.00',
        gross: taxes?.gross ?? '0.00',
      }
    }),
    totals: priced.totals,
    deposit: priced.deposit
      ? { amount: priced.deposit.amount, dueAt: priced.deposit.dueAt.toISOString() }
      : null,
    cancellation:
      priced.cancellation.kind === 'free_until'
        ? { ...priced.cancellation, deadline: priced.cancellation.deadline.toISOString() }
        : priced.cancellation,
    breaks: priced.quote.breaks,
    ...extras,
  }
}
