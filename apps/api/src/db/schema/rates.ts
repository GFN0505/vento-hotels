// Rate plans and rates, per property (spec: docs/specs/stage-1-rate-plans.md). A derived plan's
// prices are never stored: they're computed from its parent with the shared maths, so they can't
// drift. Money is numeric(14,2) with its currency; percentages numeric(7,4).
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { amount, archivedAt, calendarDate, currency, id, timestamps } from '../columns.ts'
import { organizations } from './auth.ts'
import { roomTypes } from './rooms.ts'
import { properties } from './tenancy.ts'

export const ratePricingEnum = pgEnum('rate_pricing', ['own', 'derived'])
export const mealPlanEnum = pgEnum('meal_plan', [
  'room_only',
  'bed_breakfast',
  'half_board',
  'full_board',
])
export const rateBookableByEnum = pgEnum('rate_bookable_by', ['anyone', 'corporate_only'])
export const cancellationKindEnum = pgEnum('cancellation_kind', ['free_until', 'non_refundable'])
export const cancellationPenaltyEnum = pgEnum('cancellation_penalty', [
  'first_night',
  'percent_of_stay',
  'full_stay',
])
export const depositKindEnum = pgEnum('deposit_kind', [
  'none',
  'first_night',
  'percent_of_stay',
  'full_stay',
])
export const depositDueEnum = pgEnum('deposit_due', ['at_booking', 'within_hours'])

const organizationId = () =>
  uuid()
    .notNull()
    .references(() => organizations.id, { onDelete: 'restrict' })
const inProperty = (name: string, t: { organizationId: AnyPgColumn; propertyId: AnyPgColumn }) =>
  foreignKey({
    name,
    columns: [t.organizationId, t.propertyId],
    foreignColumns: [properties.organizationId, properties.id],
  }).onDelete('restrict')
const percent = () => numeric({ precision: 7, scale: 4, mode: 'string' })

export const ratePlans = pgTable(
  'rate_plans',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid().notNull(),
    name: text().notNull(),
    // Used by imports, reports and later channel mapping; stays reserved after archiving.
    code: text().notNull(),
    pricing: ratePricingEnum().notNull(),
    // Derived plans: the parent (own prices, same hotel) and exactly one adjustment.
    parentId: uuid(),
    adjustmentPercent: percent(),
    adjustmentAmount: amount(),
    mealPlan: mealPlanEnum().notNull().default('room_only'),
    mealAllocation: amount(),
    cancellationKind: cancellationKindEnum().notNull(),
    cancellationHours: smallint(),
    cancellationPenalty: cancellationPenaltyEnum(),
    cancellationPercent: percent(),
    depositKind: depositKindEnum().notNull(),
    depositPercent: percent(),
    depositDue: depositDueEnum(),
    depositDueHours: smallint(),
    minStay: smallint().notNull().default(1),
    extraAdult: amount(),
    bookableBy: rateBookableByEnum().notNull().default('anyone'),
    pricesIncludeTaxes: boolean().notNull().default(false),
    // Every amount on the plan and its dates is in this currency (NGN only in v1).
    currency: currency(),
    sortOrder: integer().notNull().default(0),
    archivedAt: archivedAt(),
    // Bumped by every save of the plan; a save names the version it started from.
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [
    inProperty('rate_plans_property_fk', t),
    index().on(t.organizationId),
    index().on(t.organizationId, t.propertyId, t.sortOrder),
    index('rate_plans_parent_id_index').on(t.parentId).where(sql`${t.parentId} is not null`),
    // Target of the composite keys below, so a parent or a price row can't name another hotel's plan.
    unique('rate_plans_property_id_id_unique').on(t.propertyId, t.id),
    foreignKey({
      name: 'rate_plans_parent_fk',
      columns: [t.propertyId, t.parentId],
      foreignColumns: [t.propertyId, t.id],
    }).onDelete('restrict'),
    // Codes stay reserved after archiving; names only among active plans.
    unique('rate_plans_property_id_code_unique').on(t.propertyId, t.code),
    uniqueIndex('rate_plans_active_name_unique')
      .on(t.propertyId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    check('rate_plans_code_format', sql`${t.code} ~ '^[A-Z0-9-]{2,10}$'`),
    check('rate_plans_name_length', sql`char_length(${t.name}) between 1 and 60`),
    check('rate_plans_currency_ngn', sql`${t.currency} = 'NGN'`),
    check(
      'rate_plans_pricing',
      sql`(${t.pricing} = 'own' and ${t.parentId} is null and ${t.adjustmentPercent} is null and ${t.adjustmentAmount} is null)
        or (${t.pricing} = 'derived' and ${t.parentId} is not null and ${t.parentId} <> ${t.id}
          and (${t.adjustmentPercent} is null) <> (${t.adjustmentAmount} is null) and ${t.extraAdult} is null)`,
    ),
    check(
      'rate_plans_adjustment_range',
      sql`(${t.adjustmentPercent} is null or ${t.adjustmentPercent} between -90 and 100)
        and (${t.adjustmentAmount} is null or (${t.adjustmentAmount} = trunc(${t.adjustmentAmount}) and abs(${t.adjustmentAmount}) <= 100000000))`,
    ),
    check(
      'rate_plans_meal_allocation',
      sql`(${t.mealPlan} = 'room_only') = (${t.mealAllocation} is null)
        and (${t.mealAllocation} is null or ${t.mealAllocation} > 0)`,
    ),
    check(
      'rate_plans_cancellation',
      sql`(${t.cancellationKind} = 'non_refundable' and ${t.cancellationHours} is null and ${t.cancellationPenalty} is null and ${t.cancellationPercent} is null)
        or (${t.cancellationKind} = 'free_until' and ${t.cancellationHours} between 0 and 720 and ${t.cancellationPenalty} is not null
          and (${t.cancellationPenalty} = 'percent_of_stay') = (${t.cancellationPercent} is not null))`,
    ),
    check(
      'rate_plans_deposit',
      sql`(${t.depositKind} = 'none' and ${t.depositDue} is null and ${t.depositPercent} is null and ${t.depositDueHours} is null)
        or (${t.depositKind} <> 'none' and ${t.depositDue} is not null
          and (${t.depositKind} = 'percent_of_stay') = (${t.depositPercent} is not null)
          and (${t.depositDue} = 'within_hours') = (${t.depositDueHours} is not null))`,
    ),
    check(
      'rate_plans_percent_range',
      sql`(${t.cancellationPercent} is null or ${t.cancellationPercent} between 0.01 and 100)
        and (${t.depositPercent} is null or ${t.depositPercent} between 0.01 and 100)`,
    ),
    check('rate_plans_min_stay', sql`${t.minStay} between 1 and 30`),
    check('rate_plans_extra_adult', sql`${t.extraAdult} is null or ${t.extraAdult} > 0`),
  ],
)

// The room types a plan sells. Own-price plans carry the standard price here: weekday (Sun–Thu
// nights) and optionally Fri and Sat; derived plans leave both null.
export const ratePlanRoomTypes = pgTable(
  'rate_plan_room_types',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid().notNull(),
    ratePlanId: uuid().notNull(),
    roomTypeId: uuid().notNull(),
    weekdayPrice: amount(),
    weekendPrice: amount(),
    currency: currency(),
    ...timestamps,
  },
  (t) => [
    inProperty('rate_plan_room_types_property_fk', t),
    index().on(t.organizationId),
    index().on(t.roomTypeId),
    unique('rate_plan_room_types_plan_type_unique').on(t.ratePlanId, t.roomTypeId),
    // Target of the date rows' key, so a date row can't outlive its plan's room type.
    unique('rate_plan_room_types_property_plan_type_unique').on(
      t.propertyId,
      t.ratePlanId,
      t.roomTypeId,
    ),
    foreignKey({
      name: 'rate_plan_room_types_plan_fk',
      columns: [t.propertyId, t.ratePlanId],
      foreignColumns: [ratePlans.propertyId, ratePlans.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'rate_plan_room_types_room_type_fk',
      columns: [t.propertyId, t.roomTypeId],
      foreignColumns: [roomTypes.propertyId, roomTypes.id],
    }).onDelete('restrict'),
    check('rate_plan_room_types_currency_ngn', sql`${t.currency} = 'NGN'`),
    check(
      'rate_plan_room_types_prices',
      sql`(${t.weekdayPrice} is null or (${t.weekdayPrice} > 0 and ${t.weekdayPrice} <= 100000000 and ${t.weekdayPrice} = trunc(${t.weekdayPrice})))
        and (${t.weekendPrice} is null or (${t.weekdayPrice} is not null and ${t.weekendPrice} > 0 and ${t.weekendPrice} <= 100000000 and ${t.weekendPrice} = trunc(${t.weekendPrice})))`,
    ),
  ],
)

// What an own-price plan holds for one room type on one night: a date price (null = the standard
// price), restrictions, and a season name. A row with nothing set is deleted, not kept.
export const rateDates = pgTable(
  'rate_dates',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid().notNull(),
    ratePlanId: uuid().notNull(),
    roomTypeId: uuid().notNull(),
    // The night: 5 Dec is the night from 5 to 6 Dec.
    date: calendarDate().notNull(),
    price: amount(),
    currency: currency(),
    closed: boolean().notNull().default(false),
    closedToArrival: boolean().notNull().default(false),
    minStay: smallint(),
    seasonName: text(),
    ...timestamps,
  },
  (t) => [
    inProperty('rate_dates_property_fk', t),
    index().on(t.organizationId),
    index().on(t.organizationId, t.propertyId, t.date),
    unique('rate_dates_plan_type_date_unique').on(t.ratePlanId, t.roomTypeId, t.date),
    foreignKey({
      name: 'rate_dates_plan_room_type_fk',
      columns: [t.propertyId, t.ratePlanId, t.roomTypeId],
      foreignColumns: [
        ratePlanRoomTypes.propertyId,
        ratePlanRoomTypes.ratePlanId,
        ratePlanRoomTypes.roomTypeId,
      ],
    }).onDelete('cascade'),
    check('rate_dates_currency_ngn', sql`${t.currency} = 'NGN'`),
    check(
      'rate_dates_price',
      sql`${t.price} is null or (${t.price} > 0 and ${t.price} <= 100000000 and ${t.price} = trunc(${t.price}))`,
    ),
    check('rate_dates_min_stay', sql`${t.minStay} is null or ${t.minStay} between 1 and 30`),
    check(
      'rate_dates_season_name',
      sql`${t.seasonName} is null or char_length(${t.seasonName}) between 1 and 40`,
    ),
    check(
      'rate_dates_not_empty',
      sql`${t.price} is not null or ${t.closed} or ${t.closedToArrival} or ${t.minStay} is not null or ${t.seasonName} is not null`,
    ),
  ],
)
