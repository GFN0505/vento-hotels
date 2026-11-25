// Audit events (append-only) and per-organization permission overrides (decision 0018).
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { amount, calendarDate, id, timestamps } from '../columns.ts'
import { organizations } from './auth.ts'
import { properties } from './tenancy.ts'

// One row per change, written in the same transaction as the change. Never updated or deleted:
// the `vento_forbid_update_delete()` trigger (migration 0000) enforces it, which is also why this
// table has no updatedAt and why actor and subject ids carry no foreign keys (a later delete
// elsewhere must never need to touch history). Names are snapshots at the time of the event.
export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    propertyId: uuid().references(() => properties.id, { onDelete: 'restrict' }),
    // Who did it. Null only for changes made through Better Auth's own endpoints, whose hooks
    // don't say who acted (see decision 0018).
    actorUserId: uuid(),
    actorMemberId: uuid(),
    actorName: text(),
    approverMemberId: uuid(),
    // Arrive with devices (brick 9) and night audit; null until then.
    deviceId: uuid(),
    businessDate: calendarDate(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid(),
    before: jsonb(),
    after: jsonb(),
    reason: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.organizationId, t.createdAt.desc()),
    index().on(t.organizationId, t.entityType, t.entityId),
    index().on(t.organizationId, t.actorMemberId),
    index().on(t.organizationId, t.propertyId).where(sql`${t.propertyId} is not null`),
  ],
)

// An organization's changes to the default matrix in @vento/shared. Absent row = default applies.
export const permissionOverrides = pgTable(
  'permission_overrides',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: text().notNull(),
    permission: text().notNull(),
    allowed: boolean().notNull(),
    // Percent or naira, depending on the permission's limit kind. Null = no limit.
    limitValue: amount(),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.organizationId, t.role, t.permission)],
)
