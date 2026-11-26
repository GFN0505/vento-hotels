// Vento's own tenancy tables (decision 0003): legal entities, properties (hotels), and which
// properties each member may access.
import {
  boolean,
  char,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
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
    baseCurrency: char({ length: 3 }).notNull().default('NGN'),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [index().on(t.organizationId), uniqueIndex().on(t.organizationId, t.name)],
)

// One hotel. Operational data (rooms, reservations, folios…) belongs to a property.
export const properties = pgTable(
  'properties',
  {
    id: id(),
    organizationId: organizationId(),
    entityId: uuid()
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
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
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.entityId),
    uniqueIndex().on(t.organizationId, t.name),
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
  (t) => [index().on(t.organizationId), uniqueIndex().on(t.organizationId, t.name)],
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
