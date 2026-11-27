// Who may approve (spec: "Who can approve"), checked when the approver list is built, when the
// approval is given and when it is used: a member of the same group who works at the hotel (given
// it, or whole-group access), has the kind's permission with a limit at or above the value (no
// limit = any), and a PIN that doesn't need a manager's reset. Never the requester.
import {
  dec,
  type MemberRole,
  type Permission,
  type PermissionRule,
  roleLabel,
} from '@vento/shared'
import { and, eq, or, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { members, users } from '../db/schema/auth.ts'
import { memberPins, memberProperties } from '../db/schema/tenancy.ts'
import { PIN_LOCKS_BEFORE_RESET } from '../devices/pin-counter.ts'
import { effectiveRules } from '../tenancy/access.ts'

type Reader = Pick<Database, 'select'>

export type Candidate = {
  memberId: string
  userId: string
  name: string
  role: MemberRole
  roleLabel: string
  // Their limit for the permission; null = any.
  limit: string | null
  hasPin: boolean
  pinNeedsReset: boolean
}

// A member works at a hotel when given it, or with whole-group access.
export const worksAt = (propertyId: string) =>
  or(
    eq(members.allProperties, true),
    sql`${members.role} in ('owner', 'group_admin')`,
    sql`exists (select 1 from ${memberProperties} where ${memberProperties.memberId} = ${members.id} and ${memberProperties.propertyId} = ${propertyId})`,
  )

const covers = (rule: PermissionRule, value: string) =>
  rule.allowed && (rule.limit === null || dec(rule.limit).greaterThanOrEqualTo(value))

// Everyone at the hotel whose permission covers the value, with or without a PIN.
async function candidates(
  db: Reader,
  organizationId: string,
  propertyId: string,
  permission: Permission,
  value: string,
  only?: string,
): Promise<Candidate[]> {
  const rows = await db
    .select({
      memberId: members.id,
      userId: members.userId,
      name: users.name,
      role: members.role,
      pinId: memberPins.id,
      lockCount: memberPins.lockCount,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .leftJoin(memberPins, eq(memberPins.memberId, members.id))
    .where(
      and(
        eq(members.organizationId, organizationId),
        worksAt(propertyId),
        only ? eq(members.id, only) : undefined,
      ),
    )
  const rulesByRole = new Map<string, PermissionRule>()
  for (const role of new Set(rows.map((row) => row.role))) {
    const rules = await effectiveRules(db, organizationId, role as MemberRole)
    rulesByRole.set(role, rules[permission])
  }
  const out: Candidate[] = []
  for (const row of rows) {
    const rule = rulesByRole.get(row.role)
    if (!rule || !covers(rule, value)) continue
    out.push({
      memberId: row.memberId,
      userId: row.userId,
      name: row.name,
      role: row.role as MemberRole,
      roleLabel: roleLabel(row.role),
      limit: rule.limit === null ? null : dec(rule.limit).toFixed(2),
      hasPin: row.pinId !== null,
      pinNeedsReset: (row.lockCount ?? 0) >= PIN_LOCKS_BEFORE_RESET,
    })
  }
  return out
}

// Lowest covering limit first, then name, so the owner isn't the first ask.
function byLimitThenName(a: Candidate, b: Candidate): number {
  if (a.limit !== b.limit) {
    if (a.limit === null) return 1
    if (b.limit === null) return -1
    const diff = dec(a.limit).comparedTo(b.limit)
    if (diff !== 0) return diff
  }
  return a.name.localeCompare(b.name)
}

export async function approversFor(
  db: Reader,
  where: { organizationId: string; propertyId: string },
  permission: Permission,
  value: string,
  requesterMemberId: string,
): Promise<{ approvers: Candidate[]; withoutPin: string[] }> {
  const all = (await candidates(db, where.organizationId, where.propertyId, permission, value))
    .filter((c) => c.memberId !== requesterMemberId)
    .sort(byLimitThenName)
  return {
    approvers: all.filter((c) => c.hasPin && !c.pinNeedsReset),
    withoutPin: all.filter((c) => !c.hasPin).map((c) => c.name),
  }
}

// One named member, if they are eligible now (PIN rules apart, which the caller words).
export async function candidate(
  db: Reader,
  where: { organizationId: string; propertyId: string },
  permission: Permission,
  value: string,
  memberId: string,
): Promise<Candidate | undefined> {
  const [found] = await candidates(
    db,
    where.organizationId,
    where.propertyId,
    permission,
    value,
    memberId,
  )
  return found
}

// The requester still works at the hotel (a pending request from someone removed can't be
// approved; it expires as usual).
export async function stillWorksAt(
  db: Reader,
  organizationId: string,
  propertyId: string,
  memberId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organizationId, organizationId),
        eq(members.id, memberId),
        worksAt(propertyId),
      ),
    )
  return Boolean(row)
}
