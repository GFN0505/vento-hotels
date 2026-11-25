// Entities, properties and property access. organizationId always comes from `access` (the
// session), never from input. Reads outside the caller's scope answer NOT_FOUND, so they don't
// reveal that the record exists.
import { ORPCError } from '@orpc/server'
import {
  calendarDateIn,
  type Entity,
  type PageQuery,
  type Property,
  pageOffset,
  toPage,
} from '@vento/shared'
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { isUniqueViolation } from '../db/errors.ts'
import { members, organizations } from '../db/schema/auth.ts'
import { entities, memberProperties, properties } from '../db/schema/tenancy.ts'
import { type Access, propertyScope, requireGroupAdmin } from './access.ts'

const entityColumns = {
  id: entities.id,
  name: entities.name,
  rcNumber: entities.rcNumber,
  tin: entities.tin,
  vatRegistered: entities.vatRegistered,
  baseCurrency: entities.baseCurrency,
}

const propertyColumns = {
  id: properties.id,
  entityId: properties.entityId,
  name: properties.name,
  addressLine1: properties.addressLine1,
  area: properties.area,
  lga: properties.lga,
  state: properties.state,
  country: properties.country,
  timeZone: properties.timeZone,
  checkInTime: properties.checkInTime,
  checkOutTime: properties.checkOutTime,
  businessDate: properties.businessDate,
}

// Postgres returns `time` as HH:MM:SS; the API speaks HH:MM.
function toProperty(row: typeof properties.$inferSelect | Record<string, unknown>): Property {
  const r = row as Property
  return { ...r, checkInTime: r.checkInTime.slice(0, 5), checkOutTime: r.checkOutTime.slice(0, 5) }
}

const notFound = () => new ORPCError('NOT_FOUND', { message: "We couldn't find that" })
const nameTaken = (what: string) =>
  new ORPCError('CONFLICT', { message: `A ${what} with this name already exists` })

export async function currentOrganization(db: Database, access: Access) {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, access.organizationId))
  if (!org) throw notFound()
  return {
    organization: org,
    member: { id: access.memberId, role: access.role, allProperties: access.allProperties },
  }
}

export async function listEntities(db: Database, access: Access, query: PageQuery) {
  const where = and(eq(entities.organizationId, access.organizationId), isNull(entities.archivedAt))
  const [rows, [total]] = await Promise.all([
    db
      .select(entityColumns)
      .from(entities)
      .where(where)
      .orderBy(asc(entities.name))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db.select({ value: count() }).from(entities).where(where),
  ])
  return toPage(rows as Entity[], total?.value ?? 0, query)
}

export async function createEntity(
  db: Database,
  access: Access,
  input: {
    name: string
    rcNumber?: string | undefined
    tin?: string | undefined
    vatRegistered: boolean
  },
): Promise<Entity> {
  requireGroupAdmin(access)
  try {
    const [row] = await db
      .insert(entities)
      .values({
        organizationId: access.organizationId,
        name: input.name,
        rcNumber: input.rcNumber ?? null,
        tin: input.tin ?? null,
        vatRegistered: input.vatRegistered,
      })
      .returning(entityColumns)
    return row as Entity
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken('company')
    throw error
  }
}

export async function listProperties(db: Database, access: Access, query: PageQuery) {
  const where = and(propertyScope(access), isNull(properties.archivedAt))
  const [rows, [total]] = await Promise.all([
    db
      .select(propertyColumns)
      .from(properties)
      .where(where)
      .orderBy(asc(properties.name))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db.select({ value: count() }).from(properties).where(where),
  ])
  return toPage(rows.map(toProperty), total?.value ?? 0, query)
}

export async function getProperty(db: Database, access: Access, id: string): Promise<Property> {
  const [row] = await db
    .select(propertyColumns)
    .from(properties)
    .where(and(propertyScope(access), eq(properties.id, id)))
  if (!row) throw notFound()
  return toProperty(row)
}

export async function createProperty(
  db: Database,
  access: Access,
  input: {
    entityId: string
    name: string
    addressLine1?: string | undefined
    area?: string | undefined
    lga?: string | undefined
    state?: string | undefined
    timeZone: string
    checkInTime?: string | undefined
    checkOutTime?: string | undefined
  },
): Promise<Property> {
  requireGroupAdmin(access)
  const [entity] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.id, input.entityId), eq(entities.organizationId, access.organizationId)))
  if (!entity) throw new ORPCError('BAD_REQUEST', { message: 'Choose a company from this group' })

  try {
    const [row] = await db
      .insert(properties)
      .values({
        organizationId: access.organizationId,
        entityId: entity.id,
        name: input.name,
        addressLine1: input.addressLine1 ?? null,
        area: input.area ?? null,
        lga: input.lga ?? null,
        state: input.state ?? null,
        timeZone: input.timeZone,
        ...(input.checkInTime ? { checkInTime: input.checkInTime } : {}),
        ...(input.checkOutTime ? { checkOutTime: input.checkOutTime } : {}),
        // A new property starts on today's date in its own time zone; night audit moves it after.
        businessDate: calendarDateIn(input.timeZone),
      })
      .returning(propertyColumns)
    return toProperty(row as Property)
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken('property')
    throw error
  }
}

export async function setPropertyAccess(
  db: Database,
  access: Access,
  input:
    | { memberId: string; allProperties: true }
    | { memberId: string; allProperties: false; propertyIds: string[] },
): Promise<{ ok: true }> {
  requireGroupAdmin(access)
  const propertyIds = input.allProperties ? [] : [...new Set(input.propertyIds)]

  await db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.id, input.memberId), eq(members.organizationId, access.organizationId)))
    if (!member) throw notFound()

    if (propertyIds.length > 0) {
      const found = await tx
        .select({ id: properties.id })
        .from(properties)
        .where(
          and(
            eq(properties.organizationId, access.organizationId),
            inArray(properties.id, propertyIds),
          ),
        )
      if (found.length !== propertyIds.length) {
        throw new ORPCError('BAD_REQUEST', { message: 'Choose properties from this group' })
      }
    }

    await tx
      .update(members)
      .set({ allProperties: input.allProperties })
      .where(eq(members.id, member.id))
    await tx.delete(memberProperties).where(eq(memberProperties.memberId, member.id))
    if (propertyIds.length > 0) {
      await tx.insert(memberProperties).values(
        propertyIds.map((propertyId) => ({
          organizationId: access.organizationId,
          memberId: member.id,
          propertyId,
        })),
      )
    }
  })
  return { ok: true }
}
