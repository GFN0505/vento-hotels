// Availability, new reservations, the list and the detail; guest search (spec:
// docs/specs/stage-1-availability-and-reservations.md). Every procedure needs the front_desk
// feature. availability, quote, create and guests.search need reservation.manage; list and get
// also come with night_audit.run or leakage.view (read-only). No input carries an organizationId.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { endReasonSchema, penaltyKindSchema, penaltyStatusSchema } from '../changes.ts'
import { calendarDateSchema } from '../dates.ts'
import {
  guestCorrectionsSchema,
  guestFieldsSchema,
  guestMatchSchema,
  guestSearchInputSchema,
} from '../guests.ts'
import { idSchema } from '../ids.ts'
import { pageQuerySchema, pageSchema } from '../pagination.ts'
import { cancellationPolicySchema, depositRuleSchema, mealPlanSchema } from '../rates.ts'
import {
  deskSourceSchema,
  discountInputSchema,
  discountReasonSchema,
  MAX_STAYS,
  NOTES_MAX,
  reservationSourceSchema,
  reservationStatusSchema,
} from '../reservations.ts'
import { taxKindSchema } from '../taxes.ts'

// `data.code` on errors from these procedures, so the web app can react. The message is always fit
// to show.
export const RESERVATION_ERROR_CODES = [
  'PROPERTY_NOT_FOUND',
  'PROPERTY_ARCHIVED',
  'FEATURE_OFF',
  'SOLD_OUT', // data: { roomTypeId, roomTypeName, date, left, alternatives }
  'PRICE_CHANGED', // data: { stayIndex, quote }
  'DISCOUNT_OVER_LIMIT', // data: { requested, limit, canAsk }
  'APPROVAL_USED',
  'APPROVAL_EXPIRED',
  'APPROVAL_NOT_MATCHING',
  'APPROVAL_NO_LONGER_VALID',
  'DISCOUNT_ABOVE_PLAN',
  'DISCOUNT_ZERO',
  'DISCOUNT_BELOW_MEAL',
  'RESTRICTION_REASON_REQUIRED', // data: { kind, date }
  'PLAN_CORPORATE_ONLY',
  'TAXES_NOT_SET_UP',
  'PAST_DATE',
  'TOO_FAR_AHEAD',
  'STAY_TOO_LONG',
  'TOO_MANY_GUESTS',
  'PLAN_ARCHIVED',
  'ROOM_TYPE_NOT_FOUND',
  'IDEMPOTENCY_CONFLICT', // data: { id, number }
  'ROOMS_BOOKED', // room count changes (brick 1 paths): data: { date, booked, rooms }
  'BOOKING_PREFIX_LOCKED',
  // Modify, cancel and no-show (brick 6).
  'RESERVATION_CHANGED', // data: { byName, at }
  'NOT_CHANGEABLE',
  'ARRIVAL_PASSED',
  'NOT_ARRIVED_YET',
  'NOTHING_CHANGED',
  'PLAN_DOESNT_SELL_TYPE',
  'CANCEL_REASON_REQUIRED',
  'WAIVER_REASON_REQUIRED',
  'WAIVER_NEEDS_APPROVAL', // data: { canAsk }
  'PENALTY_NOT_OPEN',
] as const
export type ReservationErrorCode = (typeof RESERVATION_ERROR_CODES)[number]

const hotel = { propertyId: idSchema }

const party = {
  adults: z.number().int().min(1, 'At least 1 adult').max(20),
  children: z.number().int().min(0).max(20),
}

const stayDates = {
  arrival: calendarDateSchema,
  departure: calendarDateSchema,
}

const afterArrival = (stay: { arrival: string; departure: string }) => stay.departure > stay.arrival
const departureIssue = { message: 'Departure must be after arrival', path: ['departure'] }

// --- Availability -----------------------------------------------------------------------------------

export const availabilityInputSchema = z
  .object({ ...hotel, ...stayDates, ...party })
  .refine(afterArrival, departureIssue)
export type AvailabilityInput = z.infer<typeof availabilityInputSchema>

export const stayTermsSchema = z.object({
  planName: z.string(),
  planCode: z.string(),
  mealPlan: mealPlanSchema,
  mealAllocation: z.string().nullable(),
  cancellation: cancellationPolicySchema,
  deposit: depositRuleSchema,
  pricesIncludeTaxes: z.boolean(),
})
export type StayTerms = z.infer<typeof stayTermsSchema>

const restrictionBreakSchema = z.object({
  kind: z.enum(['closed', 'closed_to_arrival', 'min_stay']),
  date: calendarDateSchema,
  message: z.string(),
})

export const bookablePlanSchema = z.object({
  ratePlanId: idSchema,
  name: z.string(),
  code: z.string(),
  mealPlan: mealPlanSchema,
  // "BAR + ₦18,000" for derived plans.
  derivedLabel: z.string().nullable(),
  terms: stayTermsSchema,
  // Room price of the first night and the average per night, excl. and incl. taxes.
  perNightExcl: z.string(),
  perNightIncl: z.string(),
  // Nightly prices differ across the stay: the card shows "avg".
  varies: z.boolean(),
  totalIncl: z.string(),
  breaks: z.array(restrictionBreakSchema),
})
export type BookablePlan = z.infer<typeof bookablePlanSchema>

export const availabilityRoomTypeSchema = z.object({
  id: idSchema,
  name: z.string(),
  code: z.string(),
  maxAdults: z.number().int(),
  maxChildren: z.number().int(),
  // Rooms left per night, never below 0 (up to 14 nights; longer stays: `lowest` only).
  nights: z.array(z.object({ date: calendarDateSchema, left: z.number().int() })),
  lowest: z.object({ date: calendarDateSchema, left: z.number().int() }),
  // Nights with nothing bookable (rooms left + overbooking limit < 1).
  soldOut: z.array(calendarDateSchema),
  sellable: z.boolean(),
  reason: z.enum(['sold_out', 'too_many_guests', 'not_priced']).nullable(),
  // Lowest first-night room price excl. taxes across the plans ("from ₦120,000.00").
  from: z.string().nullable(),
  plans: z.array(bookablePlanSchema),
})
export type AvailabilityRoomType = z.infer<typeof availabilityRoomTypeSchema>

export const availabilitySchema = z.object({
  property: z.object({
    id: idSchema,
    name: z.string(),
    businessDate: calendarDateSchema,
    checkInTime: z.string(),
    timeZone: z.string(),
  }),
  // ready, or why Room & rate shows one message instead.
  setup: z.enum(['ready', 'no_rooms', 'no_rates']),
  roomTypes: z.array(availabilityRoomTypeSchema),
  // Every type sold out on some night: the first such night and the free nights around it.
  fullyBooked: z
    .object({
      date: calendarDateSchema,
      freeBefore: calendarDateSchema.nullable(),
      freeFrom: calendarDateSchema.nullable(),
    })
    .nullable(),
  // The member's discount limit in % (null = no limit); canDiscount false = no discounts at all.
  canDiscount: z.boolean(),
  discountLimit: z.string().nullable(),
})
export type Availability = z.infer<typeof availabilitySchema>

// --- Quote --------------------------------------------------------------------------------------------

export const quoteInputSchema = z
  .object({
    ...hotel,
    roomTypeId: idSchema,
    ratePlanId: idSchema,
    ...stayDates,
    ...party,
    discount: discountInputSchema.optional(),
    nationality: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    guestId: idSchema.optional(),
  })
  .refine(afterArrival, departureIssue)
export type StayQuoteInput = z.input<typeof quoteInputSchema>

export const summedLineSchema = z.object({
  key: z.string(),
  taxId: idSchema,
  kind: taxKindSchema,
  name: z.string(),
  ratePercent: z.string(),
  amount: z.string(),
})

export const quotedNightSchema = z.object({
  date: calendarDateSchema,
  planPrice: z.string(),
  soldPrice: z.string(),
  extraAdult: z.string(),
  mealAllocation: z.string(),
  net: z.string(),
  lines: z.array(summedLineSchema),
  rounding: z.string(),
  gross: z.string(),
})
export type QuotedNight = z.infer<typeof quotedNightSchema>

const cancellationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('non_refundable'), penalty: z.string() }),
  z.object({
    kind: z.literal('free_until'),
    deadline: z.iso.datetime(),
    penalty: z.string(),
    penaltyKind: z.enum(['first_night', 'full_stay', 'percent_of_stay']),
    percent: z.string().nullable(),
  }),
])

export const totalsSchema = z.object({
  net: z.string(),
  lines: z.array(summedLineSchema),
  rounding: z.string(),
  total: z.string(),
})

export const stayQuoteSchema = z.object({
  quoteHash: z.string(),
  roomTypeId: idSchema,
  roomTypeName: z.string(),
  ratePlanId: idSchema,
  terms: stayTermsSchema,
  nights: z.array(quotedNightSchema),
  totals: totalsSchema,
  deposit: z.object({ amount: z.string(), dueAt: z.iso.datetime() }).nullable(),
  cancellation: cancellationSchema,
  discount: z
    .object({
      percent: z.string(),
      limit: z.string().nullable(),
      within: z.boolean(),
    })
    .nullable(),
  breaks: z.array(restrictionBreakSchema),
  fx: z.object({ amount: z.string(), currency: z.string(), text: z.string() }).nullable(),
  // The same guest's other confirmed reservations at this hotel overlapping these nights.
  overlaps: z.array(
    z.object({
      id: idSchema,
      number: z.string(),
      arrival: calendarDateSchema,
      departure: calendarDateSchema,
    }),
  ),
})
export type StayQuote = z.infer<typeof stayQuoteSchema>

// --- Create ---------------------------------------------------------------------------------------------

export const guestChoiceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('existing'),
    id: idSchema,
    // The details as confirmed with the guest; a difference updates the record (audited).
    corrections: guestCorrectionsSchema.optional(),
  }),
  z.object({ kind: z.literal('new'), fields: guestFieldsSchema }),
])

export const createReservationSchema = z.object({
  // Made when the sheet opened: pressing twice, or a retry after a timeout, returns the same booking.
  idempotencyKey: z.uuidv7(),
  ...hotel,
  guest: guestChoiceSchema,
  source: deskSourceSchema,
  notes: z.string().trim().max(NOTES_MAX, 'Use 500 characters or fewer').optional(),
  stays: z
    .array(
      z
        .object({
          roomTypeId: idSchema,
          ratePlanId: idSchema,
          ...stayDates,
          ...party,
          quoteHash: z.string().min(1),
          discount: discountInputSchema.optional(),
          restrictionReason: z
            .string()
            .trim()
            .min(3, 'Say why, in a few words')
            .max(300)
            .optional(),
          // An approval for a discount over the member's limit (spec: stage-1-approvals.md).
          approvalId: idSchema.optional(),
          // Booked from a tape chart cell: the room, assigned in the booking's transaction.
          roomId: idSchema.optional(),
        })
        .refine(afterArrival, departureIssue),
    )
    .min(1)
    .max(MAX_STAYS)
    // An approval covers one stay (spec: stage-1-approvals.md).
    .refine(
      (list) => {
        const ids = list.flatMap((stay) => (stay.approvalId ? [stay.approvalId] : []))
        return new Set(ids).size === ids.length
      },
      { message: 'An approval covers one stay. Ask for each stay.' },
    ),
})
export type CreateReservationInput = z.input<typeof createReservationSchema>

export const createdReservationSchema = z.object({ id: idSchema, number: z.string() })

// --- List -------------------------------------------------------------------------------------------

export const RESERVATION_VIEWS = ['upcoming', 'booked_today', 'all'] as const
export type ReservationView = (typeof RESERVATION_VIEWS)[number]

export const listReservationsSchema = pageQuerySchema.extend({
  propertyId: idSchema.optional(),
  view: z.enum(RESERVATION_VIEWS).default('upcoming'),
  q: z.string().trim().max(120).optional(),
  status: reservationStatusSchema.optional(),
  roomTypeId: idSchema.optional(),
  source: reservationSourceSchema.optional(),
  arrivalFrom: calendarDateSchema.optional(),
  arrivalTo: calendarDateSchema.optional(),
  depositDue: z.boolean().optional(),
})
export type ListReservationsInput = z.input<typeof listReservationsSchema>

export const reservationRowSchema = z.object({
  id: idSchema,
  number: z.string(),
  propertyId: idSchema,
  propertyName: z.string(),
  guestName: z.string(),
  foreign: z.boolean(),
  arrival: calendarDateSchema,
  departure: calendarDateSchema,
  roomTypeName: z.string(),
  source: reservationSourceSchema,
  status: reservationStatusSchema,
  depositDue: z.object({ amount: z.string(), dueAt: z.iso.datetime() }).nullable(),
  total: z.string(),
  // Cancelled and no-show rows: the penalty to charge, waived, or none.
  penalty: z.object({ amount: z.string(), waived: z.boolean() }).nullable(),
  bookedAt: z.iso.datetime(),
})
export type ReservationRow = z.infer<typeof reservationRowSchema>

// --- Detail -------------------------------------------------------------------------------------------

export const activityEntrySchema = z.object({
  id: idSchema,
  action: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  actorName: z.string().nullable(),
  at: z.iso.datetime(),
})

// A penalty on the detail's Penalty card (brick 6), with the latest waiver request when one was asked.
export const penaltyViewSchema = z.object({
  id: idSchema,
  kind: penaltyKindSchema,
  amount: z.string(),
  basisLabel: z.string(),
  status: penaltyStatusSchema,
  businessDate: calendarDateSchema,
  waived: z
    .object({
      byName: z.string(),
      at: z.iso.datetime(),
      reason: z.string(),
      approverName: z.string().nullable(),
      method: z.enum(['pin_here', 'inbox']).nullable(),
    })
    .nullable(),
  request: z
    .object({
      approvalId: idSchema,
      status: z.enum(['pending', 'approved', 'declined', 'expired', 'cancelled']),
      approverName: z.string(),
      expiresAt: z.iso.datetime(),
      comment: z.string().nullable(),
      // Asked by the reader (they can ask again or wait).
      mine: z.boolean(),
    })
    .nullable(),
})
export type PenaltyView = z.infer<typeof penaltyViewSchema>

export const reservationDetailSchema = z.object({
  id: idSchema,
  number: z.string(),
  status: reservationStatusSchema,
  source: reservationSourceSchema,
  guarantee: z.enum(['none', 'deposit']),
  notes: z.string().nullable(),
  quotedTotal: z.string(),
  depositDue: z.object({ amount: z.string(), dueAt: z.iso.datetime() }).nullable(),
  bookedAt: z.iso.datetime(),
  bookedOnBusinessDate: calendarDateSchema,
  bookedByName: z.string(),
  property: z.object({
    id: idSchema,
    name: z.string(),
    address: z.string().nullable(),
    checkInTime: z.string(),
    timeZone: z.string(),
    businessDate: calendarDateSchema,
    archived: z.boolean(),
  }),
  guest: z.object({
    id: idSchema,
    title: z.string().nullable(),
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    nationality: z.string(),
  }),
  // Sum of the stays' versions, for cancel and no-show.
  version: z.number().int(),
  // Cancelled or marked no-show: when, by whom, why.
  end: z
    .object({
      kind: z.enum(['cancelled', 'no_show']),
      at: z.iso.datetime(),
      businessDate: calendarDateSchema,
      byName: z.string(),
      reason: endReasonSchema.nullable(),
      reasonText: z.string().nullable(),
      note: z.string().nullable(),
    })
    .nullable(),
  penalties: z.array(penaltyViewSchema),
  // What the reader may do now (the server checks again).
  actions: z.object({
    modify: z.boolean(),
    cancel: z.boolean(),
    noShow: z.boolean(),
    blocked: z.enum(['ended', 'arrival_passed', 'not_arrived', 'in_house']).nullable(),
    canManage: z.boolean(),
    canWaive: z.boolean(),
    // Room move / Assign room (brick 7): room.move and a confirmed stay arriving from today on, or
    // an in-house stay with a night left (brick 8).
    roomMove: z.boolean(),
    // Check in (brick 8): stay.check_in, a confirmed stay arriving on the business date; or why not.
    checkIn: z.boolean(),
    checkInBlocked: z.string().nullable(),
    // Reverse check-in: stay.check_in_reverse, checked in on the business date by someone else.
    reverseCheckIn: z.boolean(),
    printCard: z.boolean(),
  }),
  stays: z.array(
    z.object({
      id: idSchema,
      version: z.number().int(),
      roomTypeId: idSchema,
      roomTypeName: z.string(),
      arrival: calendarDateSchema,
      departure: calendarDateSchema,
      adults: z.number().int(),
      children: z.number().int(),
      terms: stayTermsSchema,
      cancellation: cancellationSchema,
      discount: z
        .object({
          percent: z.string(),
          reason: discountReasonSchema,
          reasonText: z.string().nullable(),
          note: z.string().nullable(),
          byName: z.string(),
          // Who approved a discount over the limit (brick 5), with how.
          approverName: z.string().nullable(),
        })
        .nullable(),
      restrictionOverride: z
        .object({ kind: z.string(), date: calendarDateSchema, reason: z.string() })
        .nullable(),
      // The assigned room, or null (Not assigned).
      room: z.object({ id: idSchema, number: z.string() }).nullable(),
      status: z.enum(['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']),
      // Checked in (brick 8): when, by whom, on which business date; earlier rooms of an in-house
      // stay that moved (decision 0030); the ID photo still to add; the card printed.
      checkIn: z
        .object({
          at: z.iso.datetime(),
          byName: z.string(),
          businessDate: calendarDateSchema,
          cardPrinted: z.boolean(),
          idPhotoMissing: z.boolean(),
        })
        .nullable(),
      earlierRooms: z.array(
        z.object({ number: z.string(), from: calendarDateSchema, to: calendarDateSchema }),
      ),
      // Tax lines recomputed with the rules in force on each night; null lines when the hotel's
      // taxes aren't set up any more.
      nights: z.array(quotedNightSchema),
      totals: totalsSchema,
    }),
  ),
  taxesSetUp: z.boolean(),
  // The hotel's guest transfer account, for the copied confirmation.
  transferAccount: z
    .object({ bankName: z.string(), accountNumber: z.string(), accountName: z.string() })
    .nullable(),
  activity: z.array(activityEntrySchema),
  canAudit: z.boolean(),
})
export type ReservationDetail = z.infer<typeof reservationDetailSchema>

export const reservationsContract = {
  reservations: {
    availability: oc.input(availabilityInputSchema).output(availabilitySchema),
    quote: oc.input(quoteInputSchema).output(stayQuoteSchema),
    create: oc.input(createReservationSchema).output(createdReservationSchema),
    list: oc.input(listReservationsSchema).output(pageSchema(reservationRowSchema)),
    get: oc.input(z.object({ id: idSchema })).output(reservationDetailSchema),
  },
  guests: {
    search: oc.input(guestSearchInputSchema).output(z.array(guestMatchSchema)),
  },
}
