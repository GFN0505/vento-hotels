// Vento's own tenancy tables (decision 0003): legal entities, properties (hotels), and which
// properties each member may access.
import { boolean, char, index, pgTable, text, time, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { archivedAt, calendarDate, id, timestamps } from '../columns.ts'
import { members, organizations } from './auth.ts'

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
