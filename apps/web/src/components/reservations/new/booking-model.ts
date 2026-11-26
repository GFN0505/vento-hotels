// The booking sheet's rules that don't need React: whether each step can continue, the discount
// check on the device (the server checks again inside the booking), the linked Discount / Rate per
// night fields, what goes to the API, and which step a refusal belongs to.
import {
  type Availability,
  applyDiscount,
  type CreateReservationInput,
  type DiscountInput,
  dec,
  discountProblemMessage,
  guestFieldsSchema,
  overLimit,
  overLimitMessage,
  type StayQuote,
  toAmount,
} from '@vento/shared'
import type { DiscountDraft, Draft, GuestDraft } from './booking-draft'

export const STEPS = ['Dates & guests', 'Room & rate', 'Guest', 'Review & book'] as const

export type Problems = Partial<Record<string, string>>

export function datesProblems(draft: Draft, businessDate: string | undefined, needsHotel: boolean) {
  const problems: Problems = {}
  if (needsHotel && !draft.hotelId) problems.hotel = 'Which hotel?'
  if (!draft.arrival) problems.arrival = 'Pick the arrival date'
  else if (businessDate && draft.arrival < businessDate) {
    problems.arrival = 'Pick a date from the business date on'
  }
  if (!draft.departure) problems.departure = 'Pick the departure date'
  else if (draft.arrival && draft.departure <= draft.arrival) {
    problems.departure = 'Departure must be after arrival'
  }
  if (draft.adults < 1) problems.adults = 'At least 1 adult'
  if (draft.children < 0) problems.children = 'Use 0 or more'
  return problems
}

// The discount as the API takes it, or undefined while it's incomplete.
export function discountInput(discount: DiscountDraft | undefined): DiscountInput | undefined {
  if (!discount?.value.trim() || !discount.reason) return undefined
  if (discount.reason === 'other' && !discount.reasonText.trim()) return undefined
  const value = discount.value.replaceAll(',', '').trim()
  if (discount.kind === 'percent' && !/^\d{1,2}(\.\d{1,2})?$/.test(value)) return undefined
  if (discount.kind === 'rate' && !/^\d{1,9}(\.\d{1,2})?$/.test(value)) return undefined
  return {
    kind: discount.kind,
    value: discount.kind === 'percent' ? dec(value).toString() : toAmount(value),
    reason: discount.reason,
    ...(discount.reasonText.trim() ? { reasonText: discount.reasonText.trim() } : {}),
    ...(discount.note.trim() ? { note: discount.note.trim() } : {}),
  }
}

// What's wrong with the discount on the device: its value against the plan prices and the
// member's limit, then the reason. Undefined when it can be booked.
export function discountProblems(
  discount: DiscountDraft | undefined,
  quote: Pick<StayQuote, 'nights' | 'terms'> | undefined,
  limit: { canDiscount: boolean; discountLimit: string | null },
): Problems {
  if (!discount) return {}
  const problems: Problems = {}
  const value = discount.value.replaceAll(',', '').trim()
  if (!value) {
    problems.value = discount.kind === 'percent' ? 'Enter the discount' : 'Enter the rate per night'
  } else if (discount.kind === 'percent' && !/^\d{1,2}(\.\d{1,2})?$/.test(value)) {
    problems.value = 'Enter a discount like 10 or 12.5'
  } else if (discount.kind === 'rate' && !/^\d{1,9}(\.\d{1,2})?$/.test(value)) {
    problems.value = 'Enter the rate per night, like 151200'
  } else if (!limit.canDiscount) {
    problems.value = "You can't give discounts. Ask a manager to make this booking."
  } else if (quote) {
    const result = applyDiscount(
      quote.nights.map((night) => ({
        date: night.date,
        planPrice: night.planPrice,
        extraAdult: night.extraAdult,
        mealAllocation: night.mealAllocation,
      })),
      { kind: discount.kind, value },
    )
    if (!result.ok) {
      problems.value = discountProblemMessage(result.problem, {
        name: quote.terms.planName,
        mealPlan: quote.terms.mealPlan,
        mealAllocation: quote.terms.mealAllocation,
      })
    } else if (overLimit(result.percent, limit.discountLimit)) {
      problems.value = overLimitMessage(result.percent, limit.discountLimit ?? '0')
    } else if (result.percent.isZero()) {
      problems.value = 'That is the plan price. Remove the discount instead.'
    }
  }
  if (!discount.reason) problems.reason = 'Pick a reason'
  else if (discount.reason === 'other' && !discount.reasonText.trim()) {
    problems.reasonText = 'Say why, in a few words'
  }
  return problems
}

// Discount and Rate per night are linked through the first night's plan price.
export function rateFromPercent(percent: string, planPrice: string): string {
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(percent.trim())) return ''
  return toAmount(dec(planPrice).times(dec('100').minus(percent.trim())).dividedBy(100))
}

export function percentFromRate(rate: string, planPrice: string): string {
  const value = rate.replaceAll(',', '').trim()
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value) || dec(planPrice).isZero()) return ''
  const off = dec(planPrice).minus(value).dividedBy(planPrice).times(100)
  return off.isNegative() ? '' : dec(off.toFixed(2)).toString()
}

export function guestInput(guest: GuestDraft) {
  return {
    title: guest.title,
    firstName: guest.firstName,
    lastName: guest.lastName,
    phone: guest.phone,
    email: guest.email,
    nationality: guest.nationality,
  }
}

export function guestProblems(guest: GuestDraft): Problems {
  const result = guestFieldsSchema.safeParse(guestInput(guest))
  if (result.success) return {}
  const problems: Problems = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!problems[key]) problems[key] = issue.message
  }
  return problems
}

// The plan chosen in the availability, if it can still be booked.
export function chosenPlan(availability: Availability | undefined, draft: Draft) {
  const type = availability?.roomTypes.find((t) => t.id === draft.roomTypeId)
  const plan = type?.plans.find((p) => p.ratePlanId === draft.ratePlanId)
  return type && plan && type.sellable ? { type, plan } : undefined
}

export function createInput(
  draft: Draft,
  propertyId: string,
  quote: Pick<StayQuote, 'quoteHash' | 'breaks'>,
): CreateReservationInput {
  const guest = guestInput(draft.guest)
  const discount = discountInput(draft.discount)
  return {
    idempotencyKey: draft.key,
    propertyId,
    guest: draft.guest.picked
      ? { kind: 'existing', id: draft.guest.picked.id, corrections: guest }
      : { kind: 'new', fields: guest },
    source: draft.source,
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    stays: [
      {
        roomTypeId: draft.roomTypeId ?? '',
        ratePlanId: draft.ratePlanId ?? '',
        arrival: draft.arrival,
        departure: draft.departure,
        adults: draft.adults,
        children: draft.children,
        quoteHash: quote.quoteHash,
        ...(discount ? { discount } : {}),
        ...(quote.breaks.length > 0 && draft.restrictionReason.trim()
          ? { restrictionReason: draft.restrictionReason.trim() }
          : {}),
      },
    ],
  }
}

// Which step shows a refusal from Book.
export function stepFor(code: string | undefined): Draft['step'] {
  switch (code) {
    case 'PAST_DATE':
    case 'TOO_FAR_AHEAD':
    case 'STAY_TOO_LONG':
    case 'PROPERTY_NOT_FOUND':
    case 'PROPERTY_ARCHIVED':
      return 1
    case 'SOLD_OUT':
    case 'TOO_MANY_GUESTS':
    case 'PLAN_ARCHIVED':
    case 'ROOM_TYPE_NOT_FOUND':
    case 'PLAN_CORPORATE_ONLY':
    case 'DISCOUNT_OVER_LIMIT':
    case 'DISCOUNT_ABOVE_PLAN':
    case 'DISCOUNT_ZERO':
    case 'DISCOUNT_BELOW_MEAL':
    case 'TAXES_NOT_SET_UP':
      return 2
    default:
      return 4
  }
}

const RESTRICTION_WORDS = {
  closed: 'the closure',
  closed_to_arrival: 'the closed-to-arrival day',
  min_stay: 'the min stay',
} as const

// "Reason for booking through the min stay"
export function restrictionLabel(kind: keyof typeof RESTRICTION_WORDS): string {
  return `Reason for booking through ${RESTRICTION_WORDS[kind]}`
}
