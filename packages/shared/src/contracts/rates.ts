// Rate plans and rates, per hotel (spec: docs/specs/stage-1-rate-plans.md). Every procedure needs
// the front_desk feature. Reading needs rates.edit, rooms.setup or reservation.manage (read-only for
// the last two); every write needs rates.edit. No input carries an organizationId: the API takes
// it from the session. Prices are whole naira, NGN, excl. taxes and service charge unless the plan
// says otherwise.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { calendarDateSchema } from '../dates.ts'
import { idSchema } from '../ids.ts'
import { dec } from '../money.ts'
import { MAX_PAGE_SIZE, pageQuerySchema, pageSchema } from '../pagination.ts'
import {
  ALL_WEEKDAYS,
  bookableBySchema,
  cancellationPolicySchema,
  depositRuleSchema,
  MAX_DATES_PER_APPLY,
  mealPlanSchema,
  minStaySchema,
  rateAdjustmentSchema,
  ratePlanCodeSchema,
  ratePlanNameSchema,
  ratePriceSchema,
  ratePricingSchema,
  weekdaySchema,
} from '../rates.ts'

// `data.code` on errors from these procedures, so the web app can react (put a message under the
// right field, offer Reload). The message is always fit to show.
export const RATE_ERROR_CODES = [
  'PROPERTY_NOT_FOUND',
  'PROPERTY_ARCHIVED',
  'FEATURE_OFF',
  'PLAN_NAME_TAKEN',
  'PLAN_CODE_TAKEN', // data.archived: boolean
  'PLAN_ARCHIVED',
  'PLAN_DERIVED', // dates and restrictions are set on the parent
  'PARENT_NOT_OWN', // a derived plan can't be a parent (one level only)
  'PARENT_ARCHIVED',
  'HAS_DERIVED_PLANS', // data.plans: string[]
  'ROOM_TYPE_NOT_ON_PARENT', // data.roomTypes: string[]
  'ROOM_TYPE_NOT_ON_PLAN',
  'ROOM_TYPE_ARCHIVED',
  'NO_ROOM_TYPES', // set up rooms first
  'DERIVED_NOT_POSITIVE', // data: { plan, roomType, date }
  'MEAL_ALLOCATION_ABOVE_PRICE', // data: { plan, roomType, date }
  'PAST_DATE',
  'TOO_FAR_AHEAD', // data.lastDate
  'NO_DATES',
  'STALE_VERSION', // data: { changedBy, changedAt }
  'REASON_REQUIRED', // data.lowered: LoweredTonight[]
  'NOT_ARCHIVED',
  'HAS_HISTORY',
  'LIST_CHANGED',
  'PLANS_EXIST',
  'UNDO_NOT_FOUND',
  'ALREADY_UNDONE',
  'UNDO_EXPIRED', // night audit has run since the change
  'TOO_MANY_GUESTS',
] as const
export type RateErrorCode = (typeof RATE_ERROR_CODES)[number]

// After go-live, a change that lowers tonight's price needs one (REASON_REQUIRED otherwise).
const reason = z.string().trim().min(3, 'Say why, in a few words').max(500).optional()

// --- Views ----------------------------------------------------------------------------------------

export const planRoomTypeSchema = z.object({
  roomTypeId: idSchema,
  // Own-price plans only (null on derived plans).
  weekday: z.string().nullable(),
  // Null = same as the weekday price.
  weekend: z.string().nullable(),
})
export type PlanRoomType = z.infer<typeof planRoomTypeSchema>

export const ratePlanViewSchema = z.object({
  id: idSchema,
  propertyId: idSchema,
  name: z.string(),
  code: z.string(),
  pricing: ratePricingSchema,
  parent: z.object({ id: idSchema, name: z.string(), code: z.string() }).nullable(),
  adjustment: rateAdjustmentSchema.nullable(),
  // The hotel's active room types this plan sells, in room type order (archived types are kept on
  // the plan but not shown; they come back when restored).
  roomTypes: z.array(planRoomTypeSchema),
  mealPlan: mealPlanSchema,
  // Food part of the nightly price, ₦ per room per night; null for room only.
  mealAllocation: z.string().nullable(),
  cancellation: cancellationPolicySchema,
  deposit: depositRuleSchema,
  minStay: z.number().int(),
  // Own-price plans only: ₦ per night for each adult above the room type's base occupancy.
  extraAdult: z.string().nullable(),
  bookableBy: bookableBySchema,
  pricesIncludeTaxes: z.boolean(),
  currency: z.literal('NGN'),
  sortOrder: z.number().int(),
  archivedAt: z.iso.datetime().nullable(),
  // Each save sends the version it started from (STALE_VERSION otherwise).
  version: z.number().int(),
  // Active plans derived from this one ("Bed & breakfast and Non-refundable follow Best available").
  followers: z.array(z.object({ id: idSchema, name: z.string() })),
  // Date cells (prices or restrictions) from the business date on: the count in the "Switch to
  // derived" confirm, which removes them.
  datedFromBusinessDate: z.number().int(),
  // Archived, never used on a booking, and nothing derives from it.
  canDelete: z.boolean(),
})
export type RatePlanView = z.infer<typeof ratePlanViewSchema>

export const listRatePlansSchema = pageQuerySchema.extend({
  propertyId: idSchema,
  // true: archived plans only; otherwise active plans only.
  archived: z.boolean().default(false),
  // Corporate-only plans are listed unless this is false.
  includeCorporate: z.boolean().default(true),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(MAX_PAGE_SIZE),
})

export const ratesOverviewSchema = z.object({
  property: z.object({
    id: idSchema,
    name: z.string(),
    businessDate: calendarDateSchema,
    // The last night a price can be set for (2 years after the business date).
    lastRateDate: calendarDateSchema,
    // Live: lowering tonight's price asks for a reason.
    live: z.boolean(),
    checkInTime: z.string(),
  }),
  // Active room types in sort order, for the first-rate table, the editor and the calendar filter.
  roomTypes: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      code: z.string(),
      roomCount: z.number().int(),
      baseOccupancy: z.number().int(),
      maxAdults: z.number().int(),
      maxChildren: z.number().int(),
    }),
  ),
  activePlans: z.number().int(),
  archivedPlans: z.number().int(),
  // Active room types on no active plan ("Executive Suite isn't priced on any plan").
  unpricedRoomTypes: z.array(z.object({ id: idSchema, name: z.string() })),
  // The plan behind the Rooms page's Base rate column and "Add to Best available": the first plan
  // in sort order with own prices, open to anyone.
  basePlan: z.object({ id: idSchema, name: z.string() }).nullable(),
  // Whether the caller may change rates (rates.edit).
  canEdit: z.boolean(),
})
export type RatesOverview = z.infer<typeof ratesOverviewSchema>

export const ratePlanHistorySchema = z.object({
  items: z.array(
    z.object({
      id: idSchema,
      action: z.string(),
      actorName: z.string().nullable(),
      createdAt: z.iso.datetime(),
      reason: z.string().nullable(),
    }),
  ),
})

// --- Plan writes ----------------------------------------------------------------------------------

const planRoomTypeInput = z.object({
  roomTypeId: idSchema,
  weekday: ratePriceSchema.optional(),
  weekend: ratePriceSchema.nullable().optional(),
})

const planFields = z.object({
  name: ratePlanNameSchema,
  code: ratePlanCodeSchema,
  pricing: ratePricingSchema,
  parentId: idSchema.nullable().default(null),
  adjustment: rateAdjustmentSchema.nullable().default(null),
  // The active room types it sells; own-price plans give a weekday price for each.
  roomTypes: z.array(planRoomTypeInput).min(1, 'Choose at least one room type').max(100),
  mealPlan: mealPlanSchema.default('room_only'),
  mealAllocation: ratePriceSchema.nullable().default(null),
  cancellation: cancellationPolicySchema,
  deposit: depositRuleSchema,
  minStay: minStaySchema.default(1),
  extraAdult: ratePriceSchema.nullable().default(null),
  bookableBy: bookableBySchema.default('anyone'),
  pricesIncludeTaxes: z.boolean().default(false),
})
type PlanFieldsIn = z.output<typeof planFields>

function checkPlanFields(v: PlanFieldsIn, ctx: z.RefinementCtx): void {
  const ids = v.roomTypes.map((r) => r.roomTypeId)
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['roomTypes'], message: 'Each room type once' })
  }
  if (v.pricing === 'own') {
    if (v.parentId !== null || v.adjustment !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['parentId'],
        message: 'A plan with its own prices has no parent',
      })
    }
    for (const [index, row] of v.roomTypes.entries()) {
      if (!row.weekday) {
        ctx.addIssue({
          code: 'custom',
          path: ['roomTypes', index, 'weekday'],
          message: 'Enter a weekday price',
        })
      }
    }
  } else {
    if (v.parentId === null) {
      ctx.addIssue({ code: 'custom', path: ['parentId'], message: 'Choose a parent plan' })
    }
    if (v.adjustment === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['adjustment'],
        message: 'Enter an offset or a percentage',
      })
    }
    if (v.extraAdult !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['extraAdult'],
        message: "A derived plan charges its parent's extra adult price",
      })
    }
    for (const [index, row] of v.roomTypes.entries()) {
      if (row.weekday || row.weekend) {
        ctx.addIssue({
          code: 'custom',
          path: ['roomTypes', index, 'weekday'],
          message: 'A derived plan follows its parent’s prices',
        })
      }
    }
  }
}

// Room only has no allocation; a derived plan with an amount offset and a meal plan defaults its
// allocation to the offset (B&B = Best available + ₦18,000, all of it food).
function withAllocation<T extends PlanFieldsIn>(v: T): T {
  if (v.mealPlan === 'room_only') return { ...v, mealAllocation: null }
  const offset = v.adjustment?.kind === 'amount' ? v.adjustment.value : null
  if (v.mealAllocation === null && offset !== null && dec(offset).greaterThan(0)) {
    return { ...v, mealAllocation: offset }
  }
  return v
}

const allocationGiven = {
  check: (v: PlanFieldsIn) => v.mealPlan === 'room_only' || v.mealAllocation !== null,
  issue: {
    path: ['mealAllocation'],
    message: 'Enter the meal allocation: the part of the price that is food revenue',
  },
}

export const createRatePlanSchema = planFields
  .extend({ propertyId: idSchema })
  .superRefine(checkPlanFields)
  .transform(withAllocation)
  .refine(allocationGiven.check, allocationGiven.issue)
export type CreateRatePlanInput = z.output<typeof createRatePlanSchema>

// The whole form, as saved from the editor. Room types left out are removed from the plan (and
// from the plans that derive from it); archived room types are kept.
export const updateRatePlanSchema = planFields
  .extend({ id: idSchema, version: z.number().int().min(1), reason })
  .superRefine(checkPlanFields)
  .transform(withAllocation)
  .refine(allocationGiven.check, allocationGiven.issue)
export type UpdateRatePlanInput = z.output<typeof updateRatePlanSchema>

// The first-rate table: Best available (BAR) with these prices and the recommended terms, and
// optionally Bed & breakfast (BB) at + ₦18,000.
export const createFirstRatePlansSchema = z.object({
  propertyId: idSchema,
  prices: z
    .array(
      z.object({
        roomTypeId: idSchema,
        weekday: ratePriceSchema,
        weekend: ratePriceSchema.nullable().default(null),
      }),
    )
    .min(1, 'Enter a price for each room type')
    .max(100),
  withBreakfast: z.boolean().default(true),
})

// --- Calendar -------------------------------------------------------------------------------------

export const calendarInputSchema = z.object({
  propertyId: idSchema,
  // Defaults to the business date.
  from: calendarDateSchema.optional(),
  nights: z.number().int().min(1).max(31).default(14),
  roomTypeId: idSchema.optional(),
  // Corporate plans are hidden by default.
  includeCorporate: z.boolean().default(false),
})

export const calendarCellSchema = z.object({
  date: calendarDateSchema,
  // The price for the night (derived plans: computed from the parent), whole naira.
  price: z.string(),
  // Whether it came from a date price or the standard price (the parent's, for derived plans).
  from: z.enum(['date', 'standard']),
  closed: z.boolean(),
  closedToArrival: z.boolean(),
  // Effective min stay for an arrival that night (plan floor and date min stay).
  minStay: z.number().int(),
  // What is set on the date itself (own plans; the parent's for derived plans), for editing.
  datePrice: z.string().nullable(),
  dateMinStay: z.number().int().nullable(),
  seasonName: z.string().nullable(),
})
export type CalendarCell = z.infer<typeof calendarCellSchema>

export const calendarRowSchema = z.object({
  ratePlanId: idSchema,
  name: z.string(),
  code: z.string(),
  pricing: ratePricingSchema,
  parent: z.object({ id: idSchema, name: z.string() }).nullable(),
  bookableBy: bookableBySchema,
  pricesIncludeTaxes: z.boolean(),
  cells: z.array(calendarCellSchema),
})

export const rateCalendarSchema = z.object({
  propertyId: idSchema,
  propertyName: z.string(),
  businessDate: calendarDateSchema,
  lastRateDate: calendarDateSchema,
  live: z.boolean(),
  canEdit: z.boolean(),
  dates: z.array(z.object({ date: calendarDateSchema, weekend: z.boolean(), past: z.boolean() })),
  // Bands over the dates: runs of dates whose own-price cells carry the same season name.
  seasons: z.array(
    z.object({ name: z.string(), from: calendarDateSchema, to: calendarDateSchema }),
  ),
  roomTypes: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      code: z.string(),
      rows: z.array(calendarRowSchema),
    }),
  ),
})
export type RateCalendar = z.infer<typeof rateCalendarSchema>

// --- Date changes ---------------------------------------------------------------------------------

// Change dates (and the inline cell edit, with from = to and one room type). Each field left out
// keeps what the dates have ("Keep as they are").
export const setRateDatesSchema = z
  .object({
    ratePlanId: idSchema,
    // A UUID v7 from the browser, on the audit event; sending the same batch again answers with
    // the original result. Undo names it.
    batchId: idSchema,
    roomTypeIds: z.array(idSchema).min(1, 'Choose at least one room type').max(100),
    from: calendarDateSchema,
    to: calendarDateSchema,
    days: z
      .array(weekdaySchema)
      .min(1, 'Choose at least one day')
      .max(7)
      .default([...ALL_WEEKDAYS]),
    // A price per room type (any of roomTypeIds); room types without one keep their price.
    prices: z
      .array(z.object({ roomTypeId: idSchema, price: ratePriceSchema }))
      .max(100)
      .optional(),
    // "Back to standard price": clears date prices (and their season name, unless one is given).
    backToStandard: z.boolean().optional(),
    // A label on the dates; null clears it.
    seasonName: z.string().trim().min(1).max(40).nullable().optional(),
    closed: z.boolean().optional(),
    closedToArrival: z.boolean().optional(),
    // null turns the date min stay off.
    minStay: minStaySchema.nullable().optional(),
    reason,
  })
  .superRefine((v, ctx) => {
    if (v.to < v.from) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'The end date is before the start' })
    }
    const span = (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 + 1
    if (span > MAX_DATES_PER_APPLY) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Up to ${MAX_DATES_PER_APPLY} dates at a time`,
      })
    }
    if (v.prices?.length && v.backToStandard) {
      ctx.addIssue({
        code: 'custom',
        path: ['backToStandard'],
        message: 'Choose new prices or the standard price, not both',
      })
    }
    for (const [index, row] of (v.prices ?? []).entries()) {
      if (!v.roomTypeIds.includes(row.roomTypeId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['prices', index, 'roomTypeId'],
          message: 'Choose this room type too',
        })
      }
    }
    const nothing =
      !v.prices?.length &&
      !v.backToStandard &&
      v.seasonName === undefined &&
      v.closed === undefined &&
      v.closedToArrival === undefined &&
      v.minStay === undefined
    if (nothing) {
      ctx.addIssue({
        code: 'custom',
        path: ['prices'],
        message: 'Choose a price or a restriction to change',
      })
    }
  })
export type SetRateDatesInput = z.output<typeof setRateDatesSchema>

export const setRateDatesResultSchema = z.object({
  batchId: idSchema,
  // Dates and room types the apply covered, and cells that actually changed.
  dates: z.number().int(),
  roomTypes: z.number().int(),
  changed: z.number().int(),
  // Active plans that follow this one, by name ("Bed & breakfast and Non-refundable follow").
  followers: z.array(z.string()),
})

export const undoRateDatesResultSchema = z.object({
  // Cells put back, and dates left as they were because someone changed them since (or they are
  // now before the business date).
  restored: z.number().int(),
  skippedDates: z.number().int(),
  // "2 dates were changed by Sade since, so they were left as they are."
  message: z.string().nullable(),
})

// One price lowered for tonight (the business date), in REASON_REQUIRED's data and the audit event.
export const loweredTonightSchema = z.object({
  ratePlanId: idSchema,
  planName: z.string(),
  roomTypeId: idSchema,
  roomTypeName: z.string(),
  before: z.string(),
  after: z.string(),
})
export type LoweredTonight = z.infer<typeof loweredTonightSchema>

const ok = z.object({ ok: z.literal(true) })
const byId = z.object({ id: idSchema })

export const ratesContract = {
  ratePlans: {
    list: oc.input(listRatePlansSchema).output(pageSchema(ratePlanViewSchema)),
    overview: oc.input(z.object({ propertyId: idSchema })).output(ratesOverviewSchema),
    get: oc.input(byId).output(ratePlanViewSchema),
    // The last 3 events on the plan, for the editor's Change history card (rates.edit).
    history: oc.input(byId).output(ratePlanHistorySchema),
    create: oc.input(createRatePlanSchema).output(ratePlanViewSchema),
    // Only while the hotel has no active plans (PLANS_EXIST otherwise).
    createFirst: oc
      .input(createFirstRatePlansSchema)
      .output(z.object({ plans: z.array(ratePlanViewSchema) })),
    update: oc.input(updateRatePlanSchema).output(ratePlanViewSchema),
    // Refused while active plans derive from it (HAS_DERIVED_PLANS).
    archive: oc.input(byId).output(ratePlanViewSchema),
    restore: oc.input(byId).output(ratePlanViewSchema),
    // Archived plans never used on a booking only.
    delete: oc.input(byId).output(ok),
    // `ids` is every active plan of the hotel, in the new order (LIST_CHANGED otherwise).
    reorder: oc
      .input(z.object({ propertyId: idSchema, ids: z.array(idSchema).min(1).max(MAX_PAGE_SIZE) }))
      .output(ok),
  },
  rates: {
    calendar: oc.input(calendarInputSchema).output(rateCalendarSchema),
    setDates: oc.input(setRateDatesSchema).output(setRateDatesResultSchema),
    // Until night audit moves the business date past the change's (UNDO_EXPIRED after), once.
    undoDates: oc
      .input(z.object({ ratePlanId: idSchema, batchId: idSchema, reason }))
      .output(undoRateDatesResultSchema),
  },
}
