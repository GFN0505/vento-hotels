// Modify, cancel, no-show and penalty waivers (spec: docs/specs/stage-1-modify-cancel.md). Every
// procedure needs the front_desk feature and reservation.manage; waiving needs penalty.waive or an
// approval (kind penalty_waiver), a discount over the saver's limit an approval (modify_discount).
// The server prices every change itself; the client sends the hash of the figures it showed.
// No input carries an organizationId.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import {
  END_NOTE_MAX,
  END_REASON_TEXT_MAX,
  endReasonSchema,
  penaltyKindSchema,
  WAIVER_REASON_MAX,
} from '../changes.ts'
import { calendarDateSchema } from '../dates.ts'
import { idSchema } from '../ids.ts'
import { discountInputSchema, reservationStatusSchema } from '../reservations.ts'
import { penaltyViewSchema, quotedNightSchema, totalsSchema } from './reservations.ts'

const restrictionBreakSchema = z.object({
  kind: z.enum(['closed', 'closed_to_arrival', 'min_stay']),
  date: calendarDateSchema,
  message: z.string(),
})

// The discount on the changed stay: carry the stay's % to new nights (keep), price new nights
// without it (kept_only), remove it from every night, or set a new one on every night.
export const changeDiscountSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('keep') }),
  z.object({ mode: z.literal('kept_only') }),
  z.object({ mode: z.literal('remove') }),
  z.object({ mode: z.literal('set'), discount: discountInputSchema }),
])
export type ChangeDiscount = z.input<typeof changeDiscountSchema>

const afterArrival = (stay: { arrival: string; departure: string }) => stay.departure > stay.arrival
const departureIssue = { message: 'Departure must be after arrival', path: ['departure'] }

// The stay as it should be after the change.
export const changeFieldsSchema = z.object({
  reservationId: idSchema,
  stayId: idSchema,
  // The stay's version the dialog opened with.
  version: z.number().int().min(1),
  arrival: calendarDateSchema,
  departure: calendarDateSchema,
  roomTypeId: idSchema,
  adults: z.number().int().min(1, 'At least 1 adult').max(20),
  children: z.number().int().min(0).max(20),
  discount: changeDiscountSchema.default({ mode: 'keep' }),
  // The room (brick 7): a room id moves the stay into it (checked free every night, under its
  // lock); null removes it; left out, the stay keeps its room when it is free on every night and
  // of the same type, else it is unassigned.
  roomId: idSchema.nullable().optional(),
  // A move to a better room type at the booked price: each night keeps its sold price, and the
  // difference to the new type's plan price is a discount with reason Upgrade.
  keepBookedPrice: z
    .object({ note: z.string().trim().max(200, 'Use 200 characters or fewer').optional() })
    .optional(),
})

export const quoteChangeInputSchema = changeFieldsSchema.refine(afterArrival, departureIssue)
export type QuoteChangeInput = z.input<typeof quoteChangeInputSchema>

const reasonText = (message: string) =>
  z.string().trim().min(1, message).max(WAIVER_REASON_MAX, 'Use 500 characters or fewer')

export const waiveInputSchema = z.object({
  reason: reasonText("Say why you're waiving the penalty."),
  // An approval from someone with penalty.waive (kind penalty_waiver), when the saver lacks it.
  approvalId: idSchema.optional(),
})
export type WaiveInput = z.input<typeof waiveInputSchema>

export const modifyInputSchema = changeFieldsSchema
  .extend({
    // Made when the dialog opened: a double press or a retry returns the first result.
    idempotencyKey: z.uuidv7(),
    changeHash: z.string().min(1),
    restrictionReason: z.string().trim().min(3, 'Say why, in a few words').max(300).optional(),
    // An approval for a discount over the saver's limit (kind modify_discount).
    approvalId: idSchema.optional(),
    // Waive a late-change penalty.
    waive: waiveInputSchema.optional(),
    // Where it was made, for the audit trail.
    source: z.enum(['dialog', 'tape_chart']).default('dialog'),
  })
  .refine(afterArrival, departureIssue)
export type ModifyInput = z.input<typeof modifyInputSchema>

const moneyAt = z.object({ amount: z.string(), dueAt: z.iso.datetime() })

export const changeQuoteSchema = z.object({
  // Covers every figure shown; Save sends it back.
  changeHash: z.string(),
  changed: z.boolean(),
  reservationId: idSchema,
  number: z.string(),
  stayId: idSchema,
  version: z.number().int(),
  guestName: z.string(),
  planName: z.string(),
  roomTypeId: idSchema,
  roomTypeName: z.string(),
  nightsBefore: z.number().int(),
  nights: z.array(quotedNightSchema.extend({ kept: z.boolean() })),
  totals: totalsSchema,
  before: z.object({
    total: z.string(),
    deposit: moneyAt.nullable(),
    deadline: z.iso.datetime().nullable(),
    penalty: z.string(),
  }),
  after: z.object({
    deposit: moneyAt.nullable(),
    // The deposit due time stays unless the amount goes up.
    depositChanged: z.boolean(),
    deadline: z.iso.datetime().nullable(),
    penalty: z.string(),
  }),
  difference: z.object({
    sign: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
    amount: z.string(),
  }),
  // After the deadline, a change that lowers the total.
  latePenalty: z
    .object({
      amount: z.string(),
      drop: z.string(),
      deadline: z.iso.datetime().nullable(),
      nonRefundable: z.boolean(),
    })
    .nullable(),
  // Rooms left on each new night of the new room type (never below 0); bookable < 1 = sold out.
  newNights: z.array(
    z.object({ date: calendarDateSchema, left: z.number().int(), bookable: z.boolean() }),
  ),
  // Room types the stay's plan sells, for the Room type field.
  roomTypes: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      maxAdults: z.number().int(),
      maxChildren: z.number().int(),
      fits: z.boolean(),
      // The first new night it is sold out on, if any.
      soldOutOn: calendarDateSchema.nullable(),
    }),
  ),
  breaks: z.array(restrictionBreakSchema),
  // The same restriction on the same date was already booked through with a reason.
  breakAlreadyAllowed: z.boolean(),
  // The discount on the changed stay, checked against the saver's limit (null: none).
  discount: z
    .object({
      percent: z.string(),
      limit: z.string().nullable(),
      within: z.boolean(),
      // On new nights only (carried), or on every night (set).
      scope: z.enum(['new_nights', 'all_nights']),
    })
    .nullable(),
  // The stay's discount as booked, for "Price new nights without the discount".
  existingDiscount: z.object({ percent: z.string() }).nullable(),
  fx: z.object({ amount: z.string(), currency: z.string(), text: z.string() }).nullable(),
  canWaive: z.boolean(),
  // The room after the change (brick 7): kept, moved, or unassigned because it isn't free.
  room: z
    .object({
      id: idSchema,
      number: z.string(),
      free: z.boolean(),
      // The first night it isn't free and why ("Kalu E.", or out of order).
      blockedOn: calendarDateSchema.nullable(),
      blockedBy: z.string().nullable(),
      // Asked for (roomId given): saving is refused when not free. Kept: unassigned instead.
      asked: z.boolean(),
    })
    .nullable(),
  // The room the stay has now, when the change leaves it unassigned or moves it.
  roomBefore: z.object({ id: idSchema, number: z.string() }).nullable(),
  // Keeping the booked price on a better type: the old type's name, for "Keeping the Deluxe King
  // price is a 26.32% discount on Executive King".
  keptPrice: z.object({ fromRoomTypeName: z.string(), perNight: z.string() }).nullable(),
})
export type ChangeQuote = z.infer<typeof changeQuoteSchema>

// --- Cancel and no-show --------------------------------------------------------------------------------

export const END_MODES = ['cancel', 'no_show'] as const
export type EndMode = (typeof END_MODES)[number]

export const endQuoteInputSchema = z.object({
  reservationId: idSchema,
  mode: z.enum(END_MODES),
})

export const endQuoteSchema = z.object({
  reservationId: idSchema,
  number: z.string(),
  guestName: z.string(),
  mode: z.enum(END_MODES),
  // Sum of the stays' versions: a cancel sent on an older one is refused.
  version: z.number().int(),
  allowed: z.boolean(),
  // Why not ("Arrival was 24 Nov 2026. Mark it as a no-show.").
  blocked: z.string().nullable(),
  arrival: calendarDateSchema,
  departure: calendarDateSchema,
  roomTypeName: z.string(),
  policy: z.string(),
  deadline: z.iso.datetime().nullable(),
  nonRefundable: z.boolean(),
  penalty: z
    .object({
      kind: penaltyKindSchema,
      amount: z.string(),
      basisLabel: z.string(),
    })
    .nullable(),
  // Why there is none: free (before the deadline), unguaranteed, or a 0% policy.
  noPenalty: z.enum(['free', 'unguaranteed', 'zero']).nullable(),
  released: z.array(calendarDateSchema),
  canWaive: z.boolean(),
  fx: z.object({ amount: z.string(), currency: z.string(), text: z.string() }).nullable(),
})
export type EndQuote = z.infer<typeof endQuoteSchema>

const note = z.string().trim().max(END_NOTE_MAX, 'Use 500 characters or fewer').optional()

export const cancelInputSchema = z
  .object({
    idempotencyKey: z.uuidv7(),
    reservationId: idSchema,
    version: z.number().int().min(1),
    reason: endReasonSchema,
    reasonText: z
      .string()
      .trim()
      .max(END_REASON_TEXT_MAX, 'Use 200 characters or fewer')
      .optional(),
    note,
    waive: waiveInputSchema.optional(),
  })
  .refine((input) => input.reason !== 'other' || Boolean(input.reasonText), {
    message: 'Say why, in a few words',
    path: ['reasonText'],
  })
export type CancelInput = z.input<typeof cancelInputSchema>

export const markNoShowInputSchema = z.object({
  idempotencyKey: z.uuidv7(),
  reservationId: idSchema,
  version: z.number().int().min(1),
  note,
  waive: waiveInputSchema.optional(),
})
export type MarkNoShowInput = z.input<typeof markNoShowInputSchema>

export const changedReservationSchema = z.object({
  id: idSchema,
  number: z.string(),
  status: reservationStatusSchema,
  penalties: z.array(z.object({ id: idSchema, amount: z.string(), status: z.string() })),
})
export type ChangedReservation = z.infer<typeof changedReservationSchema>

export const waivePenaltyInputSchema = z.object({
  idempotencyKey: z.uuidv7(),
  penaltyId: idSchema,
  reason: reasonText("Say why you're waiving the penalty."),
  approvalId: idSchema.optional(),
})
export type WaivePenaltyInput = z.input<typeof waivePenaltyInputSchema>

export const changesContract = {
  reservations: {
    quoteChange: oc.input(quoteChangeInputSchema).output(changeQuoteSchema),
    modify: oc.input(modifyInputSchema).output(changedReservationSchema),
    endQuote: oc.input(endQuoteInputSchema).output(endQuoteSchema),
    cancel: oc.input(cancelInputSchema).output(changedReservationSchema),
    markNoShow: oc.input(markNoShowInputSchema).output(changedReservationSchema),
  },
  penalties: {
    waive: oc.input(waivePenaltyInputSchema).output(penaltyViewSchema),
  },
}
