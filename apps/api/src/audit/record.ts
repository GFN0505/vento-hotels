// Writes one audit event. Call it with the same transaction as the change it describes, so the
// change and its record commit or roll back together (non-negotiable 15).
import type { Database } from '../db/client.ts'
import { auditEvents } from '../db/schema/governance.ts'
import type { Access } from '../tenancy/access.ts'

type Writer = Pick<Database, 'insert'>

export type AuditEvent = {
  // `<entity>.<verb>`, e.g. 'property.created', 'permission.changed'.
  action: string
  entityType: string
  entityId?: string | null
  propertyId?: string | null
  before?: unknown
  after?: unknown
  reason?: string | null
  approverMemberId?: string | null
  businessDate?: string | null
}

// Who acted. Usually the request's `Access`; someone joining from an invite acts as their new member.
export type Actor = Pick<Access, 'organizationId' | 'userId' | 'memberId' | 'userName'>

export async function recordAudit(tx: Writer, access: Actor, event: AuditEvent): Promise<void> {
  await tx.insert(auditEvents).values({
    organizationId: access.organizationId,
    actorUserId: access.userId,
    actorMemberId: access.memberId,
    actorName: access.userName,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    propertyId: event.propertyId ?? null,
    before: event.before ?? null,
    after: event.after ?? null,
    reason: event.reason ?? null,
    approverMemberId: event.approverMemberId ?? null,
    businessDate: event.businessDate ?? null,
  })
}

// For changes made through Better Auth's own endpoints (add or remove member, change role), whose
// hooks don't say who acted. The actor stays null; the subject and the change are recorded.
export async function recordSystemAudit(
  tx: Writer,
  organizationId: string,
  event: AuditEvent,
): Promise<void> {
  await tx.insert(auditEvents).values({
    organizationId,
    actorName: 'Sign-in service',
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    before: event.before ?? null,
    after: event.after ?? null,
    reason: event.reason ?? null,
  })
}
