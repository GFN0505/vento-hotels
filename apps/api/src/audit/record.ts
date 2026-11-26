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
  // For events not tied to a signed-in actor, e.g. a PIN lockout on a shared device.
  deviceId?: string | null
}

// Who acted. Usually the request's `Access`; someone joining from an invite acts as their new member.
export type Actor = Pick<Access, 'organizationId' | 'userId' | 'memberId' | 'userName'> & {
  deviceId?: string | null
}

function auditRow(access: Actor, event: AuditEvent) {
  return {
    organizationId: access.organizationId,
    actorUserId: access.userId,
    actorMemberId: access.memberId,
    actorName: access.userName,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    propertyId: event.propertyId ?? null,
    deviceId: event.deviceId ?? access.deviceId ?? null,
    before: event.before ?? null,
    after: event.after ?? null,
    reason: event.reason ?? null,
    approverMemberId: event.approverMemberId ?? null,
    businessDate: event.businessDate ?? null,
  }
}

export async function recordAudit(tx: Writer, access: Actor, event: AuditEvent): Promise<void> {
  await tx.insert(auditEvents).values(auditRow(access, event))
}

// Many events in one statement, e.g. one per room when 500 rooms are added in one go.
export async function recordAuditMany(
  tx: Writer,
  access: Actor,
  events: readonly AuditEvent[],
): Promise<void> {
  if (events.length === 0) return
  await tx.insert(auditEvents).values(events.map((event) => auditRow(access, event)))
}

// For changes made through Better Auth's own endpoints (add or remove member, change role), whose
// hooks don't say who acted. The actor stays null; the subject and the change are recorded.
export async function recordSystemAudit(
  tx: Writer,
  organizationId: string,
  event: AuditEvent,
  // Who to show as the actor: Better Auth's hooks, or the Vento team running a command.
  actorName = 'Sign-in service',
): Promise<void> {
  await tx.insert(auditEvents).values({
    organizationId,
    actorName,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    propertyId: event.propertyId ?? null,
    deviceId: event.deviceId ?? null,
    before: event.before ?? null,
    after: event.after ?? null,
    reason: event.reason ?? null,
  })
}
