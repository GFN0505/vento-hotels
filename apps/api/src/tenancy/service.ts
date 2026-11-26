// Entities, properties and property access. organizationId always comes from `access` (the
// session), never from input. Reads outside the caller's scope answer NOT_FOUND, so they don't
// reveal that the record exists.
import { ORPCError } from '@orpc/server'
import {
  calendarDateIn,
  type Entity,
  type PageQuery,
  PERMISSION_KEYS,
  type Property,
  pageOffset,
  toPage,
} from '@vento/shared'
import { and, asc, count, eq, gt, isNull } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isUniqueViolation } from '../db/errors.ts'
import { invitations, members, organizations, users } from '../db/schema/auth.ts'
import { rooms } from '../db/schema/rooms.ts'
import {
  devices,
  entities,
  memberPins,
  memberProperties,
  properties,
} from '../db/schema/tenancy.ts'
import { idleSecondsFor } from '../devices/service.ts'
import { type Access, can, propertyScope, requirePermission, scopeToProperties } from './access.ts'

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
  liveSince: properties.liveSince,
}

// Postgres returns `time` as HH:MM:SS; the API speaks HH:MM.
function toProperty(row: typeof properties.$inferSelect | Record<string, unknown>): Property {
  const r = row as Property
  return { ...r, checkInTime: r.checkInTime.slice(0, 5), checkOutTime: r.checkOutTime.slice(0, 5) }
}

const notFound = () => new ORPCError('NOT_FOUND', { message: "We couldn't find that" })
const nameTaken = (what: string) =>
  new ORPCError('CONFLICT', { message: `A ${what} with this name already exists` })

// The shared device of a PIN session (with its idle time), and whether the member has a PIN.
async function deviceAndPin(db: Database, access: Access) {
  const [device] = access.deviceId
    ? await db
        .select({ id: devices.id, name: devices.name, kind: devices.kind })
        .from(devices)
        .where(eq(devices.id, access.deviceId))
    : []
  const [pin] = await db
    .select({ id: memberPins.id })
    .from(memberPins)
    .where(eq(memberPins.memberId, access.memberId))
  const [person] = await db
    .select({ twoStep: users.twoFactorEnabled })
    .from(users)
    .where(eq(users.id, access.userId))
  return {
    twoStep: person?.twoStep ?? false,
    device: device
      ? { id: device.id, name: device.name, idleSeconds: idleSecondsFor(device.kind) }
      : null,
    hasPin: Boolean(pin),
  }
}

export async function currentOrganization(db: Database, access: Access) {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, access.organizationId))
  if (!org) throw notFound()
  return {
    organization: org,
    member: { id: access.memberId, role: access.role, allProperties: access.allProperties },
    permissions: PERMISSION_KEYS.filter((key) => access.rules[key].allowed),
    features: access.features,
    ...(await deviceAndPin(db, access)),
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
  requirePermission(access, 'setup.manage')
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(entities)
        .values({
          organizationId: access.organizationId,
          name: input.name,
          rcNumber: input.rcNumber ?? null,
          tin: input.tin ?? null,
          vatRegistered: input.vatRegistered,
        })
        .returning(entityColumns)
      const entity = row as Entity
      await recordAudit(tx, access, {
        action: 'entity.created',
        entityType: 'entity',
        entityId: entity.id,
        after: entity,
      })
      return entity
    })
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
  requirePermission(access, 'setup.manage')
  const [entity] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.id, input.entityId), eq(entities.organizationId, access.organizationId)))
  if (!entity) throw new ORPCError('BAD_REQUEST', { message: 'Choose a company from this group' })

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
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
      const property = toProperty(row as Property)
      await recordAudit(tx, access, {
        action: 'property.created',
        entityType: 'property',
        entityId: property.id,
        propertyId: property.id,
        after: property,
      })
      return property
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken('property')
    throw error
  }
}

// Home's figures: the hotels you can see with their active rooms, and for people who manage the
// team, how many people, pending invites and live shared devices there are.
export async function homeSummary(db: Database, access: Access) {
  const org = access.organizationId
  const [hotelRows, [groupWide], assigned, deviceRows, roomRows, team] = await Promise.all([
    db
      .select({ id: properties.id })
      .from(properties)
      .where(and(propertyScope(access), isNull(properties.archivedAt))),
    db
      .select({ value: count() })
      .from(members)
      .where(and(eq(members.organizationId, org), eq(members.allProperties, true))),
    db
      .select({ propertyId: memberProperties.propertyId, value: count() })
      .from(memberProperties)
      .innerJoin(members, eq(members.id, memberProperties.memberId))
      .where(and(eq(memberProperties.organizationId, org), eq(members.allProperties, false)))
      .groupBy(memberProperties.propertyId),
    db
      .select({ propertyId: devices.propertyId, value: count() })
      .from(devices)
      .where(and(eq(devices.organizationId, org), isNull(devices.revokedAt)))
      .groupBy(devices.propertyId),
    db
      .select({ propertyId: rooms.propertyId, value: count() })
      .from(rooms)
      .where(
        and(
          eq(rooms.organizationId, org),
          scopeToProperties(access, rooms.propertyId),
          isNull(rooms.archivedAt),
        ),
      )
      .groupBy(rooms.propertyId),
    can(access, 'setup.manage')
      ? Promise.all([
          db
            .select({ value: count() })
            .from(members)
            .where(eq(members.organizationId, access.organizationId)),
          db
            .select({ value: count() })
            .from(invitations)
            .where(
              and(
                eq(invitations.organizationId, access.organizationId),
                eq(invitations.status, 'pending'),
                gt(invitations.expiresAt, new Date()),
              ),
            ),
          db
            .select({ value: count() })
            .from(devices)
            .where(
              and(eq(devices.organizationId, access.organizationId), isNull(devices.revokedAt)),
            ),
        ])
      : Promise.resolve(undefined),
  ])
  const assignedBy = new Map(assigned.map((row) => [row.propertyId, row.value]))
  const devicesBy = new Map(deviceRows.map((row) => [row.propertyId, row.value]))
  const roomsBy = new Map(roomRows.map((row) => [row.propertyId, row.value]))
  const byHotel = hotelRows.map(({ id }) => ({
    propertyId: id,
    people: (groupWide?.value ?? 0) + (assignedBy.get(id) ?? 0),
    devices: devicesBy.get(id) ?? 0,
    rooms: roomsBy.get(id) ?? 0,
  }))
  return {
    hotels: hotelRows.length,
    rooms: byHotel.reduce((sum, hotel) => sum + hotel.rooms, 0),
    byHotel,
    members: team?.[0][0]?.value ?? null,
    pendingInvites: team?.[1][0]?.value ?? null,
    devices: team?.[2][0]?.value ?? null,
  }
}
