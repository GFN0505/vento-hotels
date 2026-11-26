// Who may manage whom, and which hotels they may hand out. Shared by members and invitations so
// both follow the same rules (spec: docs/specs/stage-0-team-and-roles.md).
import { ORPCError } from '@orpc/server'
import {
  type AccessChoice,
  dec,
  isGroupAdmin,
  type MemberRole,
  PERMISSION_KEYS,
} from '@vento/shared'
import { and, asc, eq, inArray, isNull, notInArray, type SQL, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { members } from '../db/schema/auth.ts'
import { memberProperties, properties } from '../db/schema/tenancy.ts'
import { type Access, effectiveRules, requirePermission } from '../tenancy/access.ts'

type Reader = Pick<Database, 'select'>

// Whether someone may invite, change or remove a person in `role`:
// - managing people needs setup.manage;
// - owners and group admins can only be handled by an owner;
// - everyone but an owner can only hand out (or touch) roles that can do no more than they can,
//   with limits no higher than theirs, after the group's own permission changes. So a manager
//   can't make a friend, or a second account of their own, more powerful than themselves.
export async function requireCanManage(db: Reader, access: Access, role: string): Promise<void> {
  requirePermission(access, 'setup.manage')
  if (access.role === 'owner') return
  if (isGroupAdmin(role)) {
    throw new ORPCError('FORBIDDEN', {
      message: 'Only an owner can do this for owners and group admins',
    })
  }
  const theirs = await effectiveRules(db, access.organizationId, role as MemberRole)
  const exceeds = PERMISSION_KEYS.some((key) => {
    const rule = theirs[key]
    const mine = access.rules[key]
    if (!rule.allowed) return false
    if (!mine.allowed) return true
    if (mine.limit === null) return false
    return rule.limit === null || dec(rule.limit).greaterThan(mine.limit)
  })
  if (exceeds) {
    throw new ORPCError('FORBIDDEN', {
      message: 'You can only manage roles that can do no more than you can. Ask an owner.',
    })
  }
}

export type NormalizedAccess = { allProperties: boolean; propertyIds: string[] }

// Turns the requested access into what will be stored. Owners and group admins always see the
// whole group. Nobody can hand out hotels they can't see themselves.
export async function grantableAccess(
  db: Reader,
  access: Access,
  role: MemberRole,
  choice: AccessChoice,
): Promise<NormalizedAccess> {
  if (isGroupAdmin(role) || choice.allProperties) {
    if (!access.allProperties) {
      throw new ORPCError('FORBIDDEN', { message: 'You can only give access to your own hotels' })
    }
    return { allProperties: true, propertyIds: [] }
  }
  const propertyIds = [...new Set(choice.propertyIds)].sort()
  const found = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.organizationId, access.organizationId),
        inArray(properties.id, propertyIds),
        isNull(properties.archivedAt),
      ),
    )
    // Held FOR SHARE (in id order) until the caller's transaction ends, so a hotel can't be
    // archived while access to it is handed out; archiving then sees the new access or invite.
    .orderBy(asc(properties.id))
    .for('share')
  if (found.length !== propertyIds.length) {
    throw new ORPCError('BAD_REQUEST', { message: 'Choose hotels from this group' })
  }
  if (!access.allProperties && propertyIds.some((id) => !access.propertyIds.includes(id))) {
    throw new ORPCError('FORBIDDEN', { message: 'You can only give access to your own hotels' })
  }
  return { allProperties: false, propertyIds }
}

// Members someone may see and manage. Whole-group managers see everyone; a manager limited to some
// hotels sees only people limited to hotels within theirs.
export function visibleMembers(access: Access): SQL {
  const inOrganization = eq(members.organizationId, access.organizationId)
  if (access.allProperties) return inOrganization
  if (access.propertyIds.length === 0) return and(inOrganization, sql`false`) as SQL
  return and(
    inOrganization,
    eq(members.allProperties, false),
    notInArray(members.role, ['owner', 'group_admin']),
    sql`exists (select 1 from ${memberProperties} where ${memberProperties.memberId} = ${members.id})`,
    sql`not exists (select 1 from ${memberProperties} where ${memberProperties.memberId} = ${members.id} and ${notInArray(memberProperties.propertyId, access.propertyIds)})`,
  ) as SQL
}

// Escapes % and _ so a search for "50%" means the text, not a wildcard.
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}
