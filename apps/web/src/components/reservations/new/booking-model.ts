// The booking sheet's rules that don't need React: whether each step can continue, the discount
// check on the device (the server checks again inside the booking), the linked Discount / Rate per
// night fields, what goes to the API, and which step a refusal belongs to.
import {
  type ApprovalDetail,
  type ApprovalView,
  type Availability,
  applyDiscount,
  CONTACT_MESSAGE,
  type CreateReservationInput,
  type DiscountInput,
  dec,
  discountProblemMessage,
  guestCorrectionsSchema,
  guestFieldsSchema,
  overLimit,
  overLimitMessage,
  type StayQuote,
  toAmount,
} from '@vento/shared'
import type { ApprovalDraft, DiscountDraft, Draft, GuestDraft } from './booking-draft'

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

// Over the member's limit is no dead end: a manager can approve it at Book (brick 5). Shown in
// amber under the discount; Continue stays enabled.
export function overLimitNotice(
  discount: DiscountDraft | undefined,
  quote: Pick<StayQuote, 'discount'> | undefined,
  limit: { canDiscount: boolean; discountLimit: string | null },
): string | undefined {
  if (!discount || !limit.canDiscount || !quote?.discount) return undefined
  if (!overLimit(quote.discount.percent, limit.discountLimit)) return undefined
  return overLimitMessage(quote.discount.percent, limit.discountLimit ?? '0')
}

export type ApprovalState = 'none' | 'over_limit' | 'waiting' | 'approved' | 'declined' | 'expired'

// Where Review & book stands with the discount: within the limit (none), over it with nothing
// asked yet, or the answer of the request for this exact price.
export function approvalState(
  quote: Pick<StayQuote, 'quoteHash' | 'discount'> | undefined,
  approval: ApprovalDraft | undefined,
): ApprovalState {
  if (!quote?.discount || quote.discount.within) return 'none'
  if (!approval || approval.quoteHash !== quote.quoteHash) return 'over_limit'
  switch (approval.status) {
    case 'pending':
      return 'waiting'
    case 'approved':
      return 'approved'
    case 'declined':
      return 'declined'
    case 'expired':
      return 'expired'
    default:
      return 'over_limit'
  }
}

// Whether a held approval no longer matches the priced stay (dates, room, plan or discount moved).
export const approvalStale = (approval: ApprovalDraft | undefined, quoteHash: string | undefined) =>
  Boolean(approval && quoteHash && approval.quoteHash !== quoteHash)

export function approvalDraftOf(view: ApprovalView, quoteHash: string): ApprovalDraft {
  return {
    id: view.id,
    quoteHash,
    status: view.status,
    approverName: view.approver?.name ?? '',
    requestedAt: view.requestedAt,
    expiresAt: view.expiresAt,
    answeredAt: view.answeredAt,
    comment: view.comment,
  }
}

// "Continue booking": the sheet again at Review, from the booking stored with the request.
export function draftFromRequest(detail: ApprovalDetail, scopeKey: string): Draft | undefined {
  const booking = detail.draft
  const stay = booking?.stays[0]
  if (!booking || !stay) return undefined
  const guest = booking.guest
  const [firstName = '', ...rest] = detail.subject.guestName.split(' ')
  const discount = stay.discount
  return {
    key: booking.idempotencyKey,
    scopeKey,
    hotelId: booking.propertyId,
    step: 4,
    arrival: stay.arrival,
    departure: stay.departure,
    adults: stay.adults,
    children: stay.children,
    roomTypeId: stay.roomTypeId,
    ratePlanId: stay.ratePlanId,
    discount: discount
      ? {
          kind: discount.kind,
          value: discount.kind === 'percent' ? discount.value : discount.value.replace(/\.00$/, ''),
          reason: discount.reason,
          reasonText: discount.reasonText ?? '',
          note: discount.note ?? '',
        }
      : undefined,
    guest:
      guest.kind === 'new'
        ? {
            picked: undefined,
            title: guest.fields.title ?? '',
            firstName: guest.fields.firstName,
            lastName: guest.fields.lastName,
            phone: guest.fields.phone ?? '',
            email: guest.fields.email ?? '',
            nationality: guest.fields.nationality,
          }
        : {
            // The record's contact details stay on the server; corrections typed before are kept.
            picked: {
              id: guest.id,
              title: null,
              firstName,
              lastName: rest.join(' '),
              maskedPhone: 'On file',
              maskedEmail: null,
              nationality: guest.corrections?.nationality ?? 'NG',
            },
            title: guest.corrections?.title ?? '',
            firstName: guest.corrections?.firstName ?? firstName,
            lastName: guest.corrections?.lastName ?? rest.join(' '),
            phone: guest.corrections?.phone ?? '',
            email: guest.corrections?.email ?? '',
            nationality: guest.corrections?.nationality ?? 'NG',
          },
    source: booking.source,
    notes: booking.notes ?? '',
    restrictionReason: stay.restrictionReason ?? '',
    approval: approvalDraftOf(detail, stay.quoteHash),
    savedAt: undefined,
  }
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
  // A picked guest's empty phone or email keeps what the record holds (never sent in full).
  const schema = guest.picked ? guestCorrectionsSchema : guestFieldsSchema
  const result = schema.safeParse(guestInput(guest))
  const problems: Problems = {}
  for (const issue of result.success ? [] : result.error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!problems[key]) problems[key] = issue.message
  }
  const picked = guest.picked
  if (
    picked &&
    !guest.phone.trim() &&
    !guest.email.trim() &&
    !picked.maskedPhone &&
    !picked.maskedEmail
  ) {
    problems.phone = CONTACT_MESSAGE
  }
  return problems
}

// What changed on a picked guest: only fields the agent typed or edited.
export function guestCorrections(guest: GuestDraft) {
  const picked = guest.picked
  if (!picked) return {}
  const out: Record<string, string> = {}
  if (guest.title.trim() !== (picked.title ?? '')) out.title = guest.title.trim()
  if (guest.firstName.trim() !== picked.firstName) out.firstName = guest.firstName.trim()
  if (guest.lastName.trim() !== picked.lastName) out.lastName = guest.lastName.trim()
  if (guest.nationality !== picked.nationality) out.nationality = guest.nationality
  if (guest.phone.trim()) out.phone = guest.phone.trim()
  if (guest.email.trim()) out.email = guest.email.trim()
  return out
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
  const approval =
    draft.approval?.status === 'approved' && draft.approval.quoteHash === quote.quoteHash
      ? draft.approval.id
      : undefined
  return {
    idempotencyKey: draft.key,
    propertyId,
    guest: draft.guest.picked
      ? { kind: 'existing', id: draft.guest.picked.id, corrections: guestCorrections(draft.guest) }
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
        ...(approval ? { approvalId: approval } : {}),
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
