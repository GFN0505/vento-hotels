// The audit log (screen 28) and the permissions matrix (screen 26).
import { ORPCError } from '@orpc/server'
import {
  type AuditEventView,
  DEFAULT_MATRIX,
  dec,
  limitKindOf,
  MEMBER_ROLES,
  type MemberRole,
  type PageQuery,
  PERMISSION_KEYS,
  PERMISSIONS,
  type Permission,
  type PermissionRule,
  type PermissionRuleView,
  pageOffset,
  toPage,
} from '@vento/shared'
import { and, count, desc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { auditEvents, permissionOverrides } from '../db/schema/governance.ts'
import { type Access, effectiveRules, requirePermission } from '../tenancy/access.ts'

// A member limited to some properties sees only events at those properties; group-level events
// (setup, permissions) are for members who see every property.
function auditScope(access: Access): SQL {
  const inOrganization = eq(auditEvents.organizationId, access.organizationId)
  if (access.allProperties) return inOrganization
  if (access.propertyIds.length === 0) return sql`false`
  return and(inOrganization, inArray(auditEvents.propertyId, access.propertyIds)) as SQL
}

export async function listAudit(
  db: Database,
  access: Access,
  query: PageQuery & {
    entityType?: string | undefined
    entityId?: string | undefined
    actorMemberId?: string | undefined
  },
) {
  requirePermission(access, 'audit.view')
  const where = and(
    auditScope(access),
    query.entityType ? eq(auditEvents.entityType, query.entityType) : undefined,
    query.entityId ? eq(auditEvents.entityId, query.entityId) : undefined,
    query.actorMemberId ? eq(auditEvents.actorMemberId, query.actorMemberId) : undefined,
  )
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(auditEvents)
      .where(where)
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db.select({ value: count() }).from(auditEvents).where(where),
  ])
  const items: AuditEventView[] = rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    propertyId: row.propertyId,
    actorMemberId: row.actorMemberId,
    actorName: row.actorName,
    approverMemberId: row.approverMemberId,
    before: row.before,
    after: row.after,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }))
  return toPage(items, total?.value ?? 0, query)
}

function view(role: MemberRole, permission: Permission, rule: PermissionRule): PermissionRuleView {
  const fallback = DEFAULT_MATRIX[role][permission] ?? { allowed: false, limit: null }
  return {
    role,
    permission,
    label: PERMISSIONS[permission].label,
    allowed: rule.allowed,
    limit: rule.limit,
    limitKind: limitKindOf(permission) ?? null,
    isDefault: fallback.allowed === rule.allowed && fallback.limit === rule.limit,
  }
}

export async function listPermissions(db: Database, access: Access) {
  requirePermission(access, 'permissions.manage')
  const perRole = await Promise.all(
    MEMBER_ROLES.map(async (role) => ({
      role,
      rules: await effectiveRules(db, access.organizationId, role),
    })),
  )
  return {
    items: perRole.flatMap(({ role, rules }) =>
      PERMISSION_KEYS.map((permission) => view(role, permission, rules[permission])),
    ),
  }
}

export async function setPermission(
  db: Database,
  access: Access,
  input: {
    role: MemberRole
    permission: Permission
    allowed: boolean
    limit: string | null
    reason: string
  },
): Promise<PermissionRuleView> {
  requirePermission(access, 'permissions.manage')
  if (input.role === 'owner') {
    throw new ORPCError('BAD_REQUEST', { message: 'The owner always has every permission' })
  }
  const kind = limitKindOf(input.permission)
  if (input.limit !== null && kind === undefined) {
    throw new ORPCError('BAD_REQUEST', { message: "This permission doesn't take a limit" })
  }
  if (input.limit !== null && kind === 'percent' && dec(input.limit).greaterThan(100)) {
    throw new ORPCError('BAD_REQUEST', { message: 'A percentage limit can be at most 100' })
  }
  const limit = input.allowed ? input.limit : null

  return db.transaction(async (tx) => {
    const before = (await effectiveRules(tx, access.organizationId, input.role))[input.permission]
    const after: PermissionRule = {
      allowed: input.allowed,
      limit: limit === null ? null : dec(limit).toFixed(2),
    }
    await tx
      .insert(permissionOverrides)
      .values({
        organizationId: access.organizationId,
        role: input.role,
        permission: input.permission,
        allowed: after.allowed,
        limitValue: after.limit,
      })
      .onConflictDoUpdate({
        target: [
          permissionOverrides.organizationId,
          permissionOverrides.role,
          permissionOverrides.permission,
        ],
        set: { allowed: after.allowed, limitValue: after.limit, updatedAt: new Date() },
      })
    await recordAudit(tx, access, {
      action: 'permission.changed',
      entityType: 'permission',
      before: { role: input.role, permission: input.permission, ...before },
      after: { role: input.role, permission: input.permission, ...after },
      reason: input.reason,
    })
    return view(input.role, input.permission, after)
  })
}
