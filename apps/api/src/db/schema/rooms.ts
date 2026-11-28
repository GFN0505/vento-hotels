// Room types and rooms, per property (spec: docs/specs/stage-1-room-types-and-rooms.md). The
// number of rooms in a type is never stored: it is counted from active rooms, so availability
// (brick 4) can't drift from the physical hotel.
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
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { archivedAt, calendarDate, id, timestamps } from '../columns.ts'
import { members, organizations } from './auth.ts'
import { devices, properties } from './tenancy.ts'

export const roomBedEnum = pgEnum('room_bed', ['king', 'queen', 'double', 'twin', 'single'])
export const roomFrontOfficeStatusEnum = pgEnum('room_front_office_status', ['vacant', 'occupied'])
// Only clean, inspected and dirty are stored (a check below): out of order is a dated period
// (room_out_of_order), and out_of_service waits for Stage 2.
export const roomHousekeepingStatusEnum = pgEnum('room_housekeeping_status', [
  'clean',
  'inspected',
  'dirty',
  'out_of_order',
  'out_of_service',
])

const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' })

const organizationId = () =>
  uuid()
    .notNull()
    .references(() => organizations.id, { onDelete: 'restrict' })
// The property is referenced together with the organization (composite foreign key below), so a
// row can never name another group's hotel, even through a hand-written query.
const propertyId = () => uuid().notNull()
const inProperty = (name: string, t: { organizationId: AnyPgColumn; propertyId: AnyPgColumn }) =>
  foreignKey({
    name,
    columns: [t.organizationId, t.propertyId],
    foreignColumns: [properties.organizationId, properties.id],
  }).onDelete('restrict')

export const roomTypes = pgTable(
  'room_types',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: propertyId(),
    // Stable key for imports and, later, channel mapping.
    code: text().notNull(),
    name: text().notNull(),
    bed: roomBedEnum().notNull(),
    sofaBed: boolean().notNull().default(false),
    baseOccupancy: smallint().notNull().default(2),
    maxAdults: smallint().notNull().default(2),
    maxChildren: smallint().notNull().default(0),
    sizeSqm: numeric({ precision: 6, scale: 1, mode: 'string' }),
    amenities: text().array().notNull().default(sql`'{}'::text[]`),
    sortOrder: integer().notNull().default(0),
    // How many rooms past rooms left the desk may sell (decision 0007). 0 for every type in Stage 1,
    // not editable until channels (Stage 4).
    overbookingLimit: smallint().notNull().default(0),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [
    inProperty('room_types_property_fk', t),
    index().on(t.organizationId),
    index().on(t.organizationId, t.propertyId, t.sortOrder),
    // Codes stay reserved after archiving; names only among active types.
    unique('room_types_property_id_code_unique').on(t.propertyId, t.code),
    uniqueIndex('room_types_active_name_unique')
      .on(t.propertyId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    // Target of the composite foreign key from rooms, so a room can't use another hotel's type.
    unique('room_types_property_id_id_unique').on(t.propertyId, t.id),
    check('room_types_code_format', sql`${t.code} ~ '^[A-Z0-9]{2,6}$'`),
    check('room_types_name_length', sql`char_length(${t.name}) between 1 and 60`),
    check(
      'room_types_occupancy',
      sql`${t.maxAdults} >= 1 and ${t.maxChildren} >= 0 and ${t.baseOccupancy} between 1 and ${t.maxAdults} + ${t.maxChildren}`,
    ),
    check('room_types_overbooking_limit', sql`${t.overbookingLimit} >= 0`),
    check('room_types_size_positive', sql`${t.sizeSqm} is null or ${t.sizeSqm} > 0`),
  ],
)

export const rooms = pgTable(
  'rooms',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: propertyId(),
    roomTypeId: uuid().notNull(),
    number: text().notNull(),
    floor: smallint().notNull(),
    features: text().array().notNull().default(sql`'{}'::text[]`),
    accessible: boolean().notNull().default(false),
    frontOfficeStatus: roomFrontOfficeStatusEnum().notNull().default('vacant'),
    // Nobody sells a room nobody has checked.
    housekeepingStatus: roomHousekeepingStatusEnum().notNull().default('dirty'),
    // Who set it and when (brick 7): the device's time for an offline change, so a later change
    // wins and an older one synced afterwards doesn't overwrite it.
    housekeepingStatusAt: timestamptz(),
    housekeepingStatusByMemberId: uuid().references(() => members.id, { onDelete: 'set null' }),
    housekeepingStatusByName: text(),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [
    inProperty('rooms_property_fk', t),
    index().on(t.organizationId),
    index().on(t.organizationId, t.propertyId, t.floor, t.number),
    index('rooms_active_room_type_id_index').on(t.roomTypeId).where(sql`${t.archivedAt} is null`),
    // Archived rooms keep their number until deleted for good.
    unique('rooms_property_id_number_unique').on(t.propertyId, t.number),
    unique('rooms_property_id_id_unique').on(t.propertyId, t.id),
    foreignKey({
      name: 'rooms_room_type_fk',
      columns: [t.propertyId, t.roomTypeId],
      foreignColumns: [roomTypes.propertyId, roomTypes.id],
    }).onDelete('restrict'),
    check('rooms_number_format', sql`${t.number} ~ '^[A-Z0-9-]{1,10}$'`),
    check('rooms_floor_range', sql`${t.floor} between -9 and 199`),
    check(
      'rooms_housekeeping_status_stored',
      sql`${t.housekeepingStatus} in ('clean', 'inspected', 'dirty')`,
    ),
  ],
)

// Connecting rooms, stored once per pair with room_a_id < room_b_id, so 401↔402 is one row and
// the two sides can't disagree.
export const roomConnections = pgTable(
  'room_connections',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: propertyId(),
    roomAId: uuid().notNull(),
    roomBId: uuid().notNull(),
    ...timestamps,
  },
  (t) => [
    inProperty('room_connections_property_fk', t),
    index().on(t.organizationId),
    unique('room_connections_pair_unique').on(t.roomAId, t.roomBId),
    index().on(t.roomBId),
    foreignKey({
      name: 'room_connections_room_a_fk',
      columns: [t.propertyId, t.roomAId],
      foreignColumns: [rooms.propertyId, rooms.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'room_connections_room_b_fk',
      columns: [t.propertyId, t.roomBId],
      foreignColumns: [rooms.propertyId, rooms.id],
    }).onDelete('cascade'),
    check('room_connections_ordered', sql`${t.roomAId} < ${t.roomBId}`),
  ],
)

export const outOfOrderReasonEnum = pgEnum('out_of_order_reason', [
  'ac',
  'plumbing',
  'electrical',
  'renovation',
  'other',
])
// active: counted off rooms left on its nights (current, upcoming or ended); removed: an upcoming
// period taken off before it started, kept for history.
export const outOfOrderStatusEnum = pgEnum('out_of_order_status', ['active', 'removed'])

// A room taken off sale for dates (brick 7): From to Back in service, exclusive like a departure.
// Rooms left for the room's type drop by one on each night. Changed only under the room's lock and
// its type's inventory rows (reservations/locks.ts); an exclusion constraint (migration 0019) keeps
// two active periods of one room from overlapping.
export const roomOutOfOrder = pgTable(
  'room_out_of_order',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: propertyId(),
    roomId: uuid().notNull(),
    fromDate: calendarDate().notNull(),
    backInService: calendarDate().notNull(),
    reason: outOfOrderReasonEnum().notNull(),
    reasonText: text(),
    note: text(),
    status: outOfOrderStatusEnum().notNull().default('active'),
    // The hotel's business date when it was put on, and who did it (names are snapshots).
    businessDate: calendarDate().notNull(),
    byMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    byName: text().notNull(),
    deviceId: uuid().references(() => devices.id, { onDelete: 'set null' }),
    idempotencyKey: uuid().notNull(),
    // The key of the last change or end, so a resent one returns the period instead of failing
    // on the version.
    lastKey: uuid(),
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [
    inProperty('room_out_of_order_property_fk', t),
    foreignKey({
      name: 'room_out_of_order_room_fk',
      columns: [t.propertyId, t.roomId],
      foreignColumns: [rooms.propertyId, rooms.id],
    }).onDelete('restrict'),
    unique('room_out_of_order_organization_id_idempotency_key_unique').on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index().on(t.organizationId, t.propertyId, t.fromDate),
    index().on(t.roomId),
    check('room_out_of_order_dates', sql`${t.backInService} > ${t.fromDate}`),
    check('room_out_of_order_length', sql`${t.backInService} - ${t.fromDate} <= 365`),
    check(
      'room_out_of_order_text_length',
      sql`(${t.reasonText} is null or char_length(${t.reasonText}) <= 100) and (${t.note} is null or char_length(${t.note}) <= 200)`,
    ),
    check(
      'room_out_of_order_other_text',
      sql`${t.reason} <> 'other' or ${t.reasonText} is not null`,
    ),
  ],
)

export const roomStatusOutcomeEnum = pgEnum('room_status_outcome', ['applied', 'superseded'])

// The receipt of every Mark clean / Mark dirty (brick 7), online or from an offline outbox: a
// resent command finds its receipt and is applied once.
export const roomStatusCommands = pgTable(
  'room_status_commands',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: propertyId(),
    roomId: uuid().notNull(),
    idempotencyKey: uuid().notNull(),
    status: roomHousekeepingStatusEnum().notNull(),
    // The device's time; appliedAt is when the server received it.
    occurredAt: timestamptz().notNull(),
    appliedAt: timestamptz().notNull().defaultNow(),
    outcome: roomStatusOutcomeEnum().notNull(),
    byMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    deviceId: uuid().references(() => devices.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    inProperty('room_status_commands_property_fk', t),
    foreignKey({
      name: 'room_status_commands_room_fk',
      columns: [t.propertyId, t.roomId],
      foreignColumns: [rooms.propertyId, rooms.id],
    }).onDelete('restrict'),
    unique('room_status_commands_organization_id_idempotency_key_unique').on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index().on(t.roomId),
    index().on(t.organizationId, t.propertyId),
  ],
)
