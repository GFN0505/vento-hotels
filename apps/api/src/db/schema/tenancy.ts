// Vento's own tenancy tables (decision 0003): legal entities, properties (hotels), and which
// properties each member may access.
import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  type PgTableExtraConfigValue,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { archivedAt, calendarDate, id, timestamps } from '../columns.ts'
import { invitations, members, organizations } from './auth.ts'

const organizationId = () =>
  uuid()
    .notNull()
    .references(() => organizations.id, { onDelete: 'restrict' })

// A legal company inside the group (holding or operating company). Owns properties, and from later
// stages its ledger, bank accounts, payroll and contracts.
export const entities = pgTable(
  'entities',
  {
    id: id(),
    organizationId: organizationId(),
    name: text().notNull(),
    rcNumber: text(),
    tin: text(),
    vatRegistered: boolean().notNull().default(false),
    // A VAT registration change on a company that owns a live hotel waits for the next business
    // date, like a change of owning company, so tax lines on one date never mix. Night audit
    // applies it (brick 13); brick 3 reads it for charges on or after `pendingVatFrom`.
    pendingVatRegistered: boolean(),
    pendingVatFrom: calendarDate(),
    baseCurrency: char({ length: 3 }).notNull().default('NGN'),
    archivedAt: archivedAt(),
    // Bumped by every edit; a save names the version it started from (optimistic locking).
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    // Target of composite foreign keys, so a hotel can't name another group's company.
    unique('entities_organization_id_id_unique').on(t.organizationId, t.id),
    check(
      'entities_pending_vat_complete',
      sql`(${t.pendingVatRegistered} is null) = (${t.pendingVatFrom} is null)`,
    ),
    // Names are unique in the group whatever the capitals, archived companies included.
    uniqueIndex('entities_organization_id_lower_name_unique').on(
      t.organizationId,
      sql`lower(${t.name})`,
    ),
    uniqueIndex('entities_organization_id_rc_number_unique')
      .on(t.organizationId, t.rcNumber)
      .where(sql`${t.rcNumber} is not null`),
    // A TIN is the same number with or without its hyphen.
    uniqueIndex('entities_organization_id_tin_digits_unique')
      .on(t.organizationId, sql`regexp_replace(${t.tin}, '[^0-9]', '', 'g')`)
      .where(sql`${t.tin} is not null`),
  ],
)

// One hotel. Operational data (rooms, reservations, folios…) belongs to a property.
export const properties = pgTable(
  'properties',
  {
    id: id(),
    organizationId: organizationId(),
    entityId: uuid().notNull(),
    name: text().notNull(),
    addressLine1: text(),
    area: text(),
    lga: text(),
    state: text(),
    country: char({ length: 2 }).notNull().default('NG'),
    timeZone: text().notNull().default('Africa/Lagos'),
    checkInTime: time().notNull().default('14:00'),
    checkOutTime: time().notNull().default('12:00'),
    // Only night audit moves this forward (decision 0006).
    businessDate: calendarDate().notNull(),
    // Go-live: the business date closed by the first completed night audit (set by brick 13).
    // Null until then; before go-live, room setup changes need no reason and raise no exceptions.
    liveSince: calendarDate(),
    // A change of owning company on a live hotel waits for the next business date, so a business
    // date is never split between two companies' books. Night audit applies it (brick 13).
    pendingEntityId: uuid(),
    pendingEntityFrom: calendarDate(),
    // The current logo. Old files are kept, so documents already issued keep what they showed.
    logoUploadId: uuid(),
    archivedAt: archivedAt(),
    // Bumped by every edit of the settings form; a save names the version it started from.
    version: integer().notNull().default(1),
    ...timestamps,
  },
  // Typed explicitly: properties and file_uploads point at each other.
  (t): PgTableExtraConfigValue[] => [
    index().on(t.organizationId),
    index().on(t.entityId),
    index().on(t.pendingEntityId).where(sql`${t.pendingEntityId} is not null`),
    // Names are unique in the group whatever the capitals, archived hotels included.
    uniqueIndex('properties_organization_id_lower_name_unique').on(
      t.organizationId,
      sql`lower(${t.name})`,
    ),
    // Composite keys, so a hotel can't name another group's company or file.
    foreignKey({
      name: 'properties_entity_fk',
      columns: [t.organizationId, t.entityId],
      foreignColumns: [entities.organizationId, entities.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'properties_logo_upload_fk',
      columns: [t.organizationId, t.logoUploadId],
      foreignColumns: [fileUploads.organizationId, fileUploads.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'properties_pending_entity_fk',
      columns: [t.organizationId, t.pendingEntityId],
      foreignColumns: [entities.organizationId, entities.id],
    }).onDelete('restrict'),
    check(
      'properties_pending_entity_complete',
      sql`(${t.pendingEntityId} is null) = (${t.pendingEntityFrom} is null)`,
    ),
    // Target of composite foreign keys from property-owned tables (rooms, room types…).
    unique('properties_organization_id_id_unique').on(t.organizationId, t.id),
  ],
)

// Properties a member may access when members.all_properties is false.
export const memberProperties = pgTable(
  'member_properties',
  {
    id: id(),
    organizationId: organizationId(),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    propertyId: uuid()
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.memberId, t.propertyId),
    index().on(t.organizationId),
    index().on(t.propertyId),
  ],
)

// Hotels an invited person will see once they join, when invitations.all_properties is false.
export const invitationProperties = pgTable(
  'invitation_properties',
  {
    id: id(),
    organizationId: organizationId(),
    invitationId: uuid()
      .notNull()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    propertyId: uuid()
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.invitationId, t.propertyId),
    index().on(t.organizationId),
    index().on(t.propertyId),
  ],
)

// A shared tablet, PC or phone registered to one hotel (decision 0022). The browser holds a random
// secret in an httpOnly cookie; only its hash is here. Revoked devices are kept for history.
export const devices = pgTable(
  'devices',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid()
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    kind: text().notNull(),
    tokenHash: text().notNull().unique(),
    lastSeenAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    revokedReason: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    uniqueIndex().on(t.organizationId, t.name),
    // Settings › Devices for one hotel, and the hotel's foreign key.
    index().on(t.organizationId, t.propertyId),
  ],
)

// A member's staff PIN, hashed like a password, with the wrong-try counter behind the lockout.
export const memberPins = pgTable(
  'member_pins',
  {
    id: id(),
    organizationId: organizationId(),
    memberId: uuid()
      .notNull()
      .unique()
      .references(() => members.id, { onDelete: 'cascade' }),
    pinHash: text().notNull(),
    failedAttempts: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    // Lockouts since the last successful sign-in; at 3 the PIN needs a manager's reset.
    lockCount: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index().on(t.organizationId)],
)

export const fileUploadStatusEnum = pgEnum('file_upload_status', [
  'pending',
  'confirmed',
  'rejected',
  'expired',
])

// A file sent straight to object storage through a short-lived signed URL. `pending` until the API
// has checked the stored file (type from its first bytes, and size) and confirmed it;
// pending uploads older than a day are deleted by the storage.purgeUnconfirmed job. Every upload
// has its own key, so a file is never overwritten.
export const fileUploads = pgTable(
  'file_uploads',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid(),
    // What the file is for, e.g. 'property_logo'.
    purpose: text().notNull(),
    storageKey: text().notNull().unique(),
    contentType: text().notNull(),
    byteSize: integer().notNull(),
    status: fileUploadStatusEnum().notNull().default('pending'),
    width: integer(),
    height: integer(),
    createdByMemberId: uuid().references(() => members.id, { onDelete: 'set null' }),
    confirmedAt: timestamp({ withTimezone: true }),
    // When the daily purge deleted an unconfirmed or rejected upload's files.
    purgedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t): PgTableExtraConfigValue[] => [
    index().on(t.organizationId),
    index().on(t.propertyId),
    index().on(t.status, t.createdAt),
    index().on(t.createdByMemberId),
    // Target of the composite key from properties.logo_upload_id.
    unique('file_uploads_organization_id_id_unique').on(t.organizationId, t.id),
    // Composite, so a file can't name another group's hotel.
    foreignKey({
      name: 'file_uploads_property_fk',
      columns: [t.organizationId, t.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
    }).onDelete('restrict'),
    check('file_uploads_byte_size_positive', sql`${t.byteSize} > 0`),
  ],
)
