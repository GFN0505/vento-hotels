// Who may see what inside an organization. Everything that reads operational data scopes it with
// these helpers, so organization isolation and property scoping live in one place.
import { ORPCError } from '@orpc/server'
import { isGroupAdmin, type MemberRole } from '@vento/shared'
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Database } from '../db/client.ts'
import { members } from '../db/schema/auth.ts'
import { memberProperties, properties } from '../db/schema/tenancy.ts'

export type Access = {
  organizationId: string
  memberId: string
  role: MemberRole
  // True for owners and group admins, or members given every property.
  allProperties: boolean
  // The properties a limited member may access. Ignored when allProperties is true.
  propertyIds: string[]
}

export async function loadAccess(
  db: Database,
  organizationId: string,
  userId: string,
): Promise<Access | undefined> {
  const [member] = await db
    .select({ id: members.id, role: members.role, allProperties: members.allProperties })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))
    .limit(1)
  if (!member) return undefined

  const role = member.role as MemberRole
  const allProperties = isGroupAdmin(role) || member.allProperties
  const propertyIds = allProperties
    ? []
    : (
        await db
          .select({ id: memberProperties.propertyId })
          .from(memberProperties)
          .where(eq(memberProperties.memberId, member.id))
      ).map((row) => row.id)

  return { organizationId, memberId: member.id, role, allProperties, propertyIds }
}

// The property part of a scope, for any table with a property id column. Closed by default: a
// limited member with no properties matches nothing.
export function scopeToProperties(access: Access, propertyIdColumn: AnyPgColumn): SQL | undefined {
  if (access.allProperties) return undefined
  if (access.propertyIds.length === 0) return sql`false`
  return inArray(propertyIdColumn, access.propertyIds)
}

// Rows of `properties` this member may see: always their organization, and only their properties
// unless they have all.
export function propertyScope(access: Access): SQL {
  return and(
    eq(properties.organizationId, access.organizationId),
    scopeToProperties(access, properties.id),
  ) as SQL
}

// Until the permissions matrix lands (brick 6), only owners and group admins change the setup.
export function requireGroupAdmin(access: Access): void {
  if (!isGroupAdmin(access.role)) {
    throw new ORPCError('FORBIDDEN', { message: "You don't have access to this" })
  }
}
