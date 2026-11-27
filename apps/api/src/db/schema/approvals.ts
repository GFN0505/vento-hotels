// Approvals (spec: docs/specs/stage-1-approvals.md, decision 0027): one row per ask, bound to one
// exact action by a hash the server computes. Not append-only (the status moves), but every move
// is an audit event. Member ids carry no foreign keys and names are snapshots (decision 0018).
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { calendarDate, id, timestamps } from '../columns.ts'
import { organizations } from './auth.ts'
import { properties } from './tenancy.ts'

export const approvalKindEnum = pgEnum('approval_kind', ['stay_discount'])
export const approvalStatusEnum = pgEnum('approval_status', [
  'pending',
  'approved',
  'declined',
  'cancelled',
  'expired',
])
export const approvalMethodEnum = pgEnum('approval_method', ['pin_here', 'inbox'])
export const approvalValueKindEnum = pgEnum('approval_value_kind', ['percent', 'amount_ngn'])

const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' })

export const approvals = pgTable(
  'approvals',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    propertyId: uuid().notNull(),
    kind: approvalKindEnum().notNull(),
    permission: text().notNull(),
    value: numeric({ precision: 14, scale: 4, mode: 'string' }).notNull(),
    valueKind: approvalValueKindEnum().notNull(),
    status: approvalStatusEnum().notNull(),
    method: approvalMethodEnum(),
    requesterMemberId: uuid().notNull(),
    requesterName: text().notNull(),
    // null = no limit (never for a requester, who is over theirs).
    requesterLimit: numeric({ precision: 14, scale: 4, mode: 'string' }),
    approverMemberId: uuid(),
    approverName: text(),
    // At the time of the grant; null = no limit.
    approverLimit: numeric({ precision: 14, scale: 4, mode: 'string' }),
    bindingHash: text().notNull(),
    subject: jsonb().notNull(),
    // The requester's booking to resume it, cleared when the request closes (NDPA: contact details).
    draft: jsonb(),
    // The action's own idempotency key (the booking's), so one draft has one open request.
    actionKey: uuid().notNull(),
    reason: text(),
    comment: text(),
    businessDate: calendarDate().notNull(),
    requestedAt: timestamptz().notNull().defaultNow(),
    expiresAt: timestamptz().notNull(),
    answeredAt: timestamptz(),
    usedAt: timestamptz(),
    usedEntityType: text(),
    usedEntityId: uuid(),
    // What it was used for, as people say it ("VI-2611-0484").
    usedReference: text(),
    requestDeviceId: uuid(),
    approverDeviceId: uuid(),
    idempotencyKey: uuid().notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'approvals_property_fk',
      columns: [t.organizationId, t.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
    }).onDelete('restrict'),
    unique('approvals_organization_id_idempotency_key_unique').on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index().on(t.organizationId, t.approverMemberId, t.status),
    index().on(t.organizationId, t.requesterMemberId, t.requestedAt),
    index().on(t.propertyId, t.status, t.expiresAt),
    index().on(t.organizationId, t.actionKey),
    index().on(t.usedEntityId),
    check('approvals_not_self', sql`${t.approverMemberId} <> ${t.requesterMemberId}`),
    check('approvals_used_only_approved', sql`${t.usedAt} is null or ${t.status} = 'approved'`),
    check(
      'approvals_comment_length',
      sql`${t.comment} is null or char_length(${t.comment}) <= 500`,
    ),
  ],
)
