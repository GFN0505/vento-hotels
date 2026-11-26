// Who is acting, inside which organization, on which properties, under which rules. Loaded once per
// request by the `inOrganization` middleware. Organization isolation, property scoping and
// permission checks all live in this file, so every module applies them the same way.
import { ORPCError } from '@orpc/server'
import {
  DEFAULT_MATRIX,
  dec,
  type Feature,
  featuresOn,
  isGroupAdmin,
  limitKindOf,
  type MemberRole,
  PERMISSION_KEYS,
  type Permission,
  type PermissionRule,
} from '@vento/shared'
import { and, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Database } from '../db/client.ts'
import { members } from '../db/schema/auth.ts'
import { organizationFeatures, permissionOverrides } from '../db/schema/governance.ts'
import { devices, memberProperties, properties } from '../db/schema/tenancy.ts'
import { hotelArchived, hotelNotFound } from './errors.ts'

export type Access = {
  organizationId: string
  userId: string
  userName: string
  memberId: string
  role: MemberRole
  // True for owners and group admins, or members given every property.
  allProperties: boolean
  // The properties a limited member may access. Ignored when allProperties is true.
  propertyIds: string[]
  // This member's effective rules: the default matrix with the organization's overrides applied.
  rules: Record<Permission, PermissionRule>
  // Modules switched on for this group (decision 0021).
  features: Feature[]
  // The shared device of a PIN session (decision 0022); null for password sign-ins.
  deviceId: string | null
}

// What a PIN session on a shared device may never do: those need a password sign-in.
const NOT_ON_SHARED_DEVICES: Permission[] = [
  'setup.manage',
  'permissions.manage',
  'rooms.setup',
  'property.operating_times',
  'finance.setup',
  'fx.enter',
]

export async function effectiveRules(
  db: Pick<Database, 'select'>,
  organizationId: string,
  role: MemberRole,
): Promise<Record<Permission, PermissionRule>> {
  const overrides = await db
    .select({
      permission: permissionOverrides.permission,
      allowed: permissionOverrides.allowed,
      limit: permissionOverrides.limitValue,
    })
    .from(permissionOverrides)
    .where(
      and(
        eq(permissionOverrides.organizationId, organizationId),
        eq(permissionOverrides.role, role),
      ),
    )
  const byKey = new Map(overrides.map((o) => [o.permission, o]))
  return Object.fromEntries(
    PERMISSION_KEYS.map((key) => {
      const override = byKey.get(key)
      const rule: PermissionRule = override
        ? { allowed: override.allowed, limit: override.limit }
        : (DEFAULT_MATRIX[role][key] ?? { allowed: false, limit: null })
      return [key, rule]
    }),
  ) as Record<Permission, PermissionRule>
}

export async function loadFeatures(
  db: Pick<Database, 'select'>,
  organizationId: string,
  allOn = false,
): Promise<Feature[]> {
  if (allOn) return featuresOn(new Map(), true)
  const rows = await db
    .select({ feature: organizationFeatures.feature, enabled: organizationFeatures.enabled })
    .from(organizationFeatures)
    .where(eq(organizationFeatures.organizationId, organizationId))
  return featuresOn(new Map(rows.map((row) => [row.feature, row.enabled])))
}

export async function loadAccess(
  db: Pick<Database, 'select'>,
  organizationId: string,
  user: { id: string; name: string },
  options: { allFeatures?: boolean; deviceId?: string | null } = {},
): Promise<Access | undefined> {
  const [member] = await db
    .select({ id: members.id, role: members.role, allProperties: members.allProperties })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, user.id)))
    .limit(1)
  if (!member) return undefined

  const role = member.role as MemberRole
  // A PIN session is confined to its device's hotel, and the device must still be live.
  let deviceProperty: string | null = null
  if (options.deviceId) {
    const [device] = await db
      .select({ propertyId: devices.propertyId })
      .from(devices)
      .where(
        and(
          eq(devices.id, options.deviceId),
          eq(devices.organizationId, organizationId),
          isNull(devices.revokedAt),
        ),
      )
    if (!device) return undefined
    deviceProperty = device.propertyId
  }
  const memberAllProperties = isGroupAdmin(role) || member.allProperties
  const [propertyRows, rules, features] = await Promise.all([
    memberAllProperties
      ? Promise.resolve([])
      : db
          .select({ id: memberProperties.propertyId })
          .from(memberProperties)
          .where(eq(memberProperties.memberId, member.id)),
    effectiveRules(db, organizationId, role),
    loadFeatures(db, organizationId, options.allFeatures),
  ])

  const memberPropertyIds = propertyRows.map((row) => row.id)
  if (deviceProperty) {
    const canSee = memberAllProperties || memberPropertyIds.includes(deviceProperty)
    for (const permission of NOT_ON_SHARED_DEVICES) {
      rules[permission] = { allowed: false, limit: null }
    }
    return {
      organizationId,
      userId: user.id,
      userName: user.name,
      memberId: member.id,
      role,
      allProperties: false,
      propertyIds: canSee ? [deviceProperty] : [],
      rules,
      features,
      deviceId: options.deviceId ?? null,
    }
  }
  return {
    organizationId,
    userId: user.id,
    userName: user.name,
    memberId: member.id,
    role,
    allProperties: memberAllProperties,
    propertyIds: memberPropertyIds,
    rules,
    features,
    deviceId: null,
  }
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

// The hotel a list is narrowed to (one hotel chosen in the top bar). Every list that takes a
// `propertyId` calls this first, so they all answer the same way: another group's hotel, an
// unknown id and a hotel outside the member's access are all "We couldn't find that hotel" (never
// revealing it exists); an archived hotel the member could see says so. The switch only narrows:
// the caller still filters by its own scope as well.
export async function requireListableHotel(
  db: Pick<Database, 'select'>,
  access: Access,
  propertyId: string,
): Promise<{ id: string; entityId: string }> {
  const [hotel] = await db
    .select({ id: properties.id, entityId: properties.entityId, archivedAt: properties.archivedAt })
    .from(properties)
    .where(and(eq(properties.id, propertyId), propertyScope(access)))
  if (!hotel) throw hotelNotFound()
  if (hotel.archivedAt) throw hotelArchived()
  return { id: hotel.id, entityId: hotel.entityId }
}

// A module that's switched off is off for everyone, owners included, and says so before any
// permission check (decision 0021). Every module's procedures call this first.
export function requireFeature(access: Pick<Access, 'features'>, feature: Feature): void {
  if (!access.features.includes(feature)) {
    throw new ORPCError('FORBIDDEN', {
      message: "This isn't switched on for your group. Ask Vento if you'd like to use it.",
      data: { code: 'FEATURE_OFF', feature },
    })
  }
}

export function can(access: Access, permission: Permission): boolean {
  return access.rules[permission].allowed
}

// Server-side permission check (non-negotiable 3). UI hiding is cosmetic only. A module can say
// who to ask in `message`.
export function requirePermission(
  access: Access,
  permission: Permission,
  message = "You don't have access to this",
): void {
  if (!can(access, permission)) {
    throw new ORPCError('FORBIDDEN', { message })
  }
}

export class ApprovalRequiredError extends ORPCError<
  'FORBIDDEN',
  { code: 'APPROVAL_REQUIRED'; permission: Permission; limit: string; value: string }
> {}

// Checks the permission and, for permissions with a limit, that `value` (a percent or naira
// amount as a decimal string) is within this member's limit. Above the limit the action needs an
// approver with a higher limit (PIN approval arrives in Stage 1, decision 0023). Nobody approves their own action.
export function requireWithinLimit(access: Access, permission: Permission, value: string): void {
  requirePermission(access, permission)
  const { limit } = access.rules[permission]
  if (limitKindOf(permission) === undefined || limit === null) return
  if (dec(value).greaterThan(limit)) {
    throw new ApprovalRequiredError('FORBIDDEN', {
      message:
        limitKindOf(permission) === 'percent'
          ? `${value}% is over your ${limit}% limit. A manager can approve it.`
          : `This is over your limit. A manager can approve it.`,
      data: { code: 'APPROVAL_REQUIRED', permission, limit, value },
    })
  }
}
