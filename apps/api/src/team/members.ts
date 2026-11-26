// The people in a group: list, change role and hotels, remove. Every change is audited with who
// made it, in the same transaction (spec: docs/specs/stage-0-team-and-roles.md).
import { ORPCError } from '@orpc/server'
import {
  type AccessChoice,
  type MemberRole,
  type MemberView,
  type PageQuery,
  pageOffset,
  ROLE_FILTERS,
  type RoleFilter,
  toPage,
} from '@vento/shared'
import { and, asc, count, eq, ilike, inArray, isNull, or, type SQL, sql } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { members, sessions, users } from '../db/schema/auth.ts'
import { memberPins, memberProperties, properties } from '../db/schema/tenancy.ts'
import { type Access, requireListableHotel, requirePermission } from '../tenancy/access.ts'
import {
  containsPattern,
  grantableAccess,
  requireCanManage,
  visibleMembers,
  worksAt,
} from './rules.ts'

type Reader = Pick<Database, 'select'>
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

const notFound = () => new ORPCError('NOT_FOUND', { message: "We couldn't find that person" })
const notYourself = () =>
  new ORPCError('BAD_REQUEST', {
    message: "You can't change your own role or access. Ask another owner.",
  })

const memberColumns = {
  id: members.id,
  userId: members.userId,
  name: users.name,
  email: users.email,
  role: members.role,
  allProperties: members.allProperties,
  createdAt: members.createdAt,
  hasPin: sql<boolean>`${memberPins.id} is not null`,
  twoStep: users.twoFactorEnabled,
}

type MemberRow = {
  id: string
  userId: string
  name: string
  email: string
  role: string
  allProperties: boolean
  createdAt: Date
  hasPin: boolean
  twoStep: boolean
}

// Hotel names for each member, in one query.
async function hotelsFor(db: Reader, memberIds: string[]) {
  const byMember = new Map<string, { id: string; name: string }[]>()
  if (memberIds.length === 0) return byMember
  const rows = await db
    .select({
      memberId: memberProperties.memberId,
      id: properties.id,
      name: properties.name,
    })
    .from(memberProperties)
    .innerJoin(properties, eq(properties.id, memberProperties.propertyId))
    .where(and(inArray(memberProperties.memberId, memberIds), isNull(properties.archivedAt)))
    .orderBy(asc(properties.name))
  for (const row of rows) {
    const list = byMember.get(row.memberId) ?? []
    list.push({ id: row.id, name: row.name })
    byMember.set(row.memberId, list)
  }
  return byMember
}

function toView(
  access: Access,
  row: MemberRow,
  hotels: Map<string, { id: string; name: string }[]>,
): MemberView {
  const wholeGroup = row.role === 'owner' || row.role === 'group_admin' || row.allProperties
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role as MemberRole,
    allProperties: wholeGroup,
    properties: wholeGroup ? [] : (hotels.get(row.id) ?? []),
    joinedAt: row.createdAt.toISOString(),
    isYou: row.id === access.memberId,
    hasPin: row.hasPin,
    twoStep: row.twoStep,
  }
}

export async function listMembers(
  db: Database,
  access: Access,
  query: PageQuery & {
    search?: string | undefined
    filter?: RoleFilter | undefined
    propertyId?: string | undefined
  },
) {
  requirePermission(access, 'setup.manage')
  const conditions: (SQL | undefined)[] = [visibleMembers(access)]
  // The hotel narrows within who the caller may already see; it never widens it.
  if (query.propertyId) {
    await requireListableHotel(db, access, query.propertyId)
    conditions.push(worksAt(query.propertyId))
  }
  if (query.search) {
    const pattern = containsPattern(query.search)
    conditions.push(or(ilike(users.name, pattern), ilike(users.email, pattern)))
  }
  if (query.filter) conditions.push(inArray(members.role, [...ROLE_FILTERS[query.filter]]))
  const where = and(...conditions)

  const [rows, [total]] = await Promise.all([
    db
      .select(memberColumns)
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .leftJoin(memberPins, eq(memberPins.memberId, members.id))
      .where(where)
      // You first, then everyone by name.
      .orderBy(sql`${members.id} = ${access.memberId} desc`, asc(users.name), asc(members.id))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db
      .select({ value: count() })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .leftJoin(memberPins, eq(memberPins.memberId, members.id))
      .where(where),
  ])
  const hotels = await hotelsFor(
    db,
    rows.map((row) => row.id),
  )
  return toPage(
    rows.map((row) => toView(access, row, hotels)),
    total?.value ?? 0,
    query,
  )
}

async function findMember(db: Reader, access: Access, memberId: string): Promise<MemberRow> {
  const [row] = await db
    .select(memberColumns)
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .leftJoin(memberPins, eq(memberPins.memberId, members.id))
    .where(and(eq(members.id, memberId), visibleMembers(access)))
  if (!row) throw notFound()
  return row
}

async function currentHotelIds(db: Reader, memberId: string): Promise<string[]> {
  const rows = await db
    .select({ id: memberProperties.propertyId })
    .from(memberProperties)
    .where(eq(memberProperties.memberId, memberId))
  return rows.map((row) => row.id).sort()
}

// A group always keeps an owner. Locks the owner rows, so two owners demoting or removing each
// other at the same moment can't both succeed.
async function keepAnOwner(tx: Tx, access: Access, leavingId: string) {
  const owners = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.organizationId, access.organizationId), eq(members.role, 'owner')))
    .for('update')
  if (!owners.some((owner) => owner.id !== leavingId)) {
    throw new ORPCError('BAD_REQUEST', { message: 'A group needs at least one owner' })
  }
}

// The older "set property access" call, kept for scripts and tests; same rules as updateMember.
export async function setMemberAccess(
  db: Database,
  access: Access,
  input:
    | { memberId: string; allProperties: true }
    | { memberId: string; allProperties: false; propertyIds: string[] },
): Promise<{ ok: true }> {
  requirePermission(access, 'setup.manage')
  const target = await findMember(db, access, input.memberId)
  await updateMember(db, access, {
    memberId: input.memberId,
    role: target.role as MemberRole,
    access: input.allProperties
      ? { allProperties: true }
      : { allProperties: false, propertyIds: input.propertyIds },
  })
  return { ok: true }
}

export async function updateMember(
  db: Database,
  access: Access,
  input: { memberId: string; role: MemberRole; access: AccessChoice },
): Promise<MemberView> {
  requirePermission(access, 'setup.manage')
  return db.transaction(async (tx) => {
    const target = await findMember(tx, access, input.memberId)
    if (target.id === access.memberId) throw notYourself()
    await requireCanManage(tx, access, target.role)
    await requireCanManage(tx, access, input.role)
    if (target.role === 'owner' && input.role !== 'owner') await keepAnOwner(tx, access, target.id)
    const next = await grantableAccess(tx, access, input.role, input.access)
    const beforeIds = await currentHotelIds(tx, target.id)

    if (target.role !== input.role) {
      await tx.update(members).set({ role: input.role }).where(eq(members.id, target.id))
      await recordAudit(tx, access, {
        action: 'member.role_changed',
        entityType: 'member',
        entityId: target.id,
        before: { name: target.name, role: target.role },
        after: { name: target.name, role: input.role },
      })
    }

    const accessChanged =
      target.allProperties !== next.allProperties || beforeIds.join() !== next.propertyIds.join()
    if (accessChanged) {
      await tx
        .update(members)
        .set({ allProperties: next.allProperties })
        .where(eq(members.id, target.id))
      await tx.delete(memberProperties).where(eq(memberProperties.memberId, target.id))
      if (next.propertyIds.length > 0) {
        await tx.insert(memberProperties).values(
          next.propertyIds.map((propertyId) => ({
            organizationId: access.organizationId,
            memberId: target.id,
            propertyId,
          })),
        )
      }
      await recordAudit(tx, access, {
        action: 'member.property_access_changed',
        entityType: 'member',
        entityId: target.id,
        before: { name: target.name, allProperties: target.allProperties, propertyIds: beforeIds },
        after: { name: target.name, ...next },
      })
    }

    const updated = { ...target, role: input.role, allProperties: next.allProperties }
    return toView(access, updated, await hotelsFor(tx, [target.id]))
  })
}

export async function removeMember(
  db: Database,
  access: Access,
  memberId: string,
): Promise<{ ok: true }> {
  requirePermission(access, 'setup.manage')
  await db.transaction(async (tx) => {
    const target = await findMember(tx, access, memberId)
    if (target.id === access.memberId) {
      throw new ORPCError('BAD_REQUEST', { message: "You can't remove yourself from the group" })
    }
    await requireCanManage(tx, access, target.role)
    if (target.role === 'owner') await keepAnOwner(tx, access, target.id)
    const hotelIds = await currentHotelIds(tx, target.id)
    // Their hotel list goes with them (cascade). Their account stays: they may belong to other
    // groups, and their name stays on everything they did here.
    await tx.delete(members).where(eq(members.id, target.id))
    // Signed-in sessions pointing at this group stop working at once.
    await tx
      .update(sessions)
      .set({ activeOrganizationId: null })
      .where(
        and(
          eq(sessions.userId, target.userId),
          eq(sessions.activeOrganizationId, access.organizationId),
        ),
      )
    await recordAudit(tx, access, {
      action: 'member.removed',
      entityType: 'member',
      entityId: target.id,
      before: {
        name: target.name,
        email: target.email,
        role: target.role,
        allProperties: target.allProperties,
        propertyIds: hotelIds,
      },
    })
  })
  return { ok: true }
}
