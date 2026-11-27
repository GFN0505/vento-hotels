// Availability, guests and reservations (spec: docs/specs/stage-1-availability-and-reservations.md).
// `room_type_inventory` holds one row per room type per night with the rooms booked; it is changed
// only under SELECT … FOR UPDATE in the order room type, then date (reservations/locks.ts). Rooms in
// a type are never stored here: they are counted live from active rooms after the lock, so
// availability can't drift from the physical hotel.
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { amount, archivedAt, calendarDate, currency, id, timestamps } from '../columns.ts'
import { members, organizations } from './auth.ts'
import { ratePlans } from './rates.ts'
import { rooms, roomTypes } from './rooms.ts'
import { devices, properties } from './tenancy.ts'

export const reservationStatusEnum = pgEnum('reservation_status', [
  'tentative',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show',
])
export const stayStatusEnum = pgEnum('stay_status', [
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show',
])
export const reservationSourceEnum = pgEnum('reservation_source', [
  'direct',
  'walk_in',
  'phone',
  'email',
  'whatsapp',
  'booking_engine',
  'ota',
  'corporate',
  'travel_agent',
])
export const reservationGuaranteeEnum = pgEnum('reservation_guarantee', ['none', 'deposit'])
export const discountReasonEnum = pgEnum('discount_reason', [
  'repeat_guest',
  'corporate_rate_match',
  'long_stay',
  'service_recovery',
  'other',
])
export const nightPriceFromEnum = pgEnum('night_price_from', ['date_price', 'standard_price'])

const organizationId = () =>
  uuid()
    .notNull()
    .references(() => organizations.id, { onDelete: 'restrict' })
const propertyId = () => uuid().notNull()
const inProperty = (name: string, t: { organizationId: AnyPgColumn; propertyId: AnyPgColumn }) =>
  foreignKey({
    name,
    columns: [t.organizationId, t.propertyId],
    foreignColumns: [properties.organizationId, properties.id],
  }).onDelete('restrict')
const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' })

export const roomTypeInventory = pgTable(
  'room_type_inventory',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: propertyId(),
    roomTypeId: uuid().notNull(),
    date: calendarDate().notNull(),
    booked: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    inProperty('room_type_inventory_property_fk', t),
    foreignKey({
      name: 'room_type_inventory_room_type_fk',
      columns: [t.propertyId, t.roomTypeId],
      foreignColumns: [roomTypes.propertyId, roomTypes.id],
    }).onDelete('restrict'),
    unique('room_type_inventory_type_date_unique').on(t.roomTypeId, t.date),
    index().on(t.organizationId, t.propertyId, t.date),
    check('room_type_inventory_booked', sql`${t.booked} >= 0`),
  ],
)

// Group-wide (no property): one profile across the group's hotels.
export const guests = pgTable(
  'guests',
  {
    id: id(),
    organizationId: organizationId(),
    title: text(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    // E.164.
    phone: text(),
    email: text(),
    // ISO 3166-1 alpha-2.
    nationality: char({ length: 2 }).notNull().default('NG'),
    // For search: names, phone digits and email in one lower-case string (trigram index).
    search: text()
      .notNull()
      .generatedAlwaysAs(
        sql`lower(first_name || ' ' || last_name || ' ' || coalesce(phone, '') || ' ' || coalesce(email, ''))`,
      ),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.organizationId, t.phone),
    index('guests_organization_id_lower_email_index').on(t.organizationId, sql`lower(${t.email})`),
    index('guests_search_trgm_index').using('gin', sql`${t.search} gin_trgm_ops`),
    unique('guests_organization_id_id_unique').on(t.organizationId, t.id),
    check('guests_contact', sql`${t.phone} is not null or ${t.email} is not null`),
    check('guests_phone_e164', sql`${t.phone} is null or ${t.phone} ~ '^\\+[1-9][0-9]{7,14}$'`),
    check(
      'guests_names',
      sql`char_length(${t.firstName}) between 1 and 60 and char_length(${t.lastName}) between 1 and 60`,
    ),
  ],
)

export const reservations = pgTable(
  'reservations',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: propertyId(),
    number: text().notNull(),
    status: reservationStatusEnum().notNull(),
    source: reservationSourceEnum().notNull(),
    guestId: uuid().notNull(),
    guarantee: reservationGuaranteeEnum().notNull(),
    depositDue: amount(),
    depositDueAt: timestamptz(),
    // Incl. taxes, for reference: folios are the bill from brick 10.
    quotedTotal: amount().notNull(),
    currency: currency(),
    notes: text(),
    bookedByMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    bookedByName: text().notNull(),
    deviceId: uuid().references(() => devices.id, { onDelete: 'set null' }),
    bookedAt: timestamptz().notNull().defaultNow(),
    bookedOnBusinessDate: calendarDate().notNull(),
    // First arrival and last departure of its stays.
    arrival: calendarDate().notNull(),
    departure: calendarDate().notNull(),
    idempotencyKey: uuid().notNull(),
    // A hash of the request, so a reused key with a different booking is refused.
    requestHash: text().notNull(),
    ...timestamps,
  },
  (t) => [
    inProperty('reservations_property_fk', t),
    foreignKey({
      name: 'reservations_guest_fk',
      columns: [t.organizationId, t.guestId],
      foreignColumns: [guests.organizationId, guests.id],
    }).onDelete('restrict'),
    unique('reservations_organization_id_number_unique').on(t.organizationId, t.number),
    unique('reservations_organization_id_idempotency_key_unique').on(
      t.organizationId,
      t.idempotencyKey,
    ),
    unique('reservations_property_id_id_unique').on(t.propertyId, t.id),
    index().on(t.organizationId, t.propertyId, t.arrival),
    index().on(t.organizationId, t.propertyId, t.bookedOnBusinessDate),
    index().on(t.organizationId, t.propertyId, t.status),
    index().on(t.guestId),
    index('reservations_number_trgm_index').using('gin', sql`${t.number} gin_trgm_ops`),
    check('reservations_dates', sql`${t.departure} > ${t.arrival}`),
    check(
      'reservations_deposit_complete',
      sql`(${t.depositDue} is null) = (${t.depositDueAt} is null)`,
    ),
    check('reservations_notes_length', sql`${t.notes} is null or char_length(${t.notes}) <= 500`),
  ],
)

export const stays = pgTable(
  'stays',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: propertyId(),
    reservationId: uuid().notNull(),
    guestId: uuid().notNull(),
    roomTypeId: uuid().notNull(),
    ratePlanId: uuid().notNull(),
    ratePlanVersion: integer().notNull(),
    arrival: calendarDate().notNull(),
    departure: calendarDate().notNull(),
    adults: smallint().notNull(),
    children: smallint().notNull().default(0),
    // Assigned with bricks 7 and 8.
    roomId: uuid(),
    status: stayStatusEnum().notNull(),
    quoteHash: text().notNull(),
    // The plan's terms as sold (name, code, meal plan and allocation, cancellation, deposit rule,
    // inclusive or exclusive) plus the penalty amount. Rate and plan changes never alter it.
    terms: jsonb().notNull(),
    cancellationDeadline: timestamptz(),
    quotedTotal: amount().notNull(),
    currency: currency(),
    discountPercent: numeric({ precision: 7, scale: 4, mode: 'string' }),
    // A typed rate per night, when the discount was given as a rate.
    discountRate: amount(),
    discountReason: discountReasonEnum(),
    discountReasonText: text(),
    discountNote: text(),
    discountByMemberId: uuid().references(() => members.id, { onDelete: 'restrict' }),
    discountByName: text(),
    // { kind, date, reason }: a restriction the desk booked through.
    restrictionOverride: jsonb(),
    ...timestamps,
  },
  (t) => [
    inProperty('stays_property_fk', t),
    foreignKey({
      name: 'stays_reservation_fk',
      columns: [t.propertyId, t.reservationId],
      foreignColumns: [reservations.propertyId, reservations.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'stays_guest_fk',
      columns: [t.organizationId, t.guestId],
      foreignColumns: [guests.organizationId, guests.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'stays_room_type_fk',
      columns: [t.propertyId, t.roomTypeId],
      foreignColumns: [roomTypes.propertyId, roomTypes.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'stays_rate_plan_fk',
      columns: [t.propertyId, t.ratePlanId],
      foreignColumns: [ratePlans.propertyId, ratePlans.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'stays_room_fk',
      columns: [t.propertyId, t.roomId],
      foreignColumns: [rooms.propertyId, rooms.id],
    }).onDelete('restrict'),
    unique('stays_property_id_id_unique').on(t.propertyId, t.id),
    index().on(t.organizationId, t.propertyId, t.arrival),
    index().on(t.organizationId, t.propertyId, t.departure),
    index().on(t.reservationId),
    index().on(t.guestId),
    index().on(t.ratePlanId),
    index().on(t.roomTypeId),
    index().on(t.roomId).where(sql`${t.roomId} is not null`),
    check('stays_dates', sql`${t.departure} > ${t.arrival}`),
    check('stays_party', sql`${t.adults} >= 1 and ${t.children} >= 0`),
    check(
      'stays_discount_percent',
      sql`${t.discountPercent} is null or (${t.discountPercent} > 0 and ${t.discountPercent} < 100)`,
    ),
    check(
      'stays_discount_reason',
      sql`(${t.discountPercent} is null) = (${t.discountReason} is null)`,
    ),
  ],
)

// One row per night of a stay: the plan price and the sold price, as booked.
export const stayNights = pgTable(
  'stay_nights',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: propertyId(),
    stayId: uuid().notNull(),
    date: calendarDate().notNull(),
    planPrice: amount().notNull(),
    soldPrice: amount().notNull(),
    extraAdult: amount().notNull(),
    mealAllocation: amount().notNull(),
    priceFrom: nightPriceFromEnum().notNull(),
    currency: currency(),
    ...timestamps,
  },
  (t) => [
    inProperty('stay_nights_property_fk', t),
    foreignKey({
      name: 'stay_nights_stay_fk',
      columns: [t.propertyId, t.stayId],
      foreignColumns: [stays.propertyId, stays.id],
    }).onDelete('restrict'),
    unique('stay_nights_stay_date_unique').on(t.stayId, t.date),
    index().on(t.organizationId, t.propertyId, t.date),
    check(
      'stay_nights_prices',
      sql`${t.soldPrice} > 0 and ${t.soldPrice} <= ${t.planPrice} and ${t.soldPrice} >= ${t.mealAllocation}`,
    ),
  ],
)

// The next reservation number per hotel per month (YYMM).
export const reservationCounters = pgTable(
  'reservation_counters',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: propertyId(),
    period: char({ length: 4 }).notNull(),
    last: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    inProperty('reservation_counters_property_fk', t),
    unique('reservation_counters_property_period_unique').on(t.propertyId, t.period),
    index().on(t.organizationId),
  ],
)
