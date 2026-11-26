// The signed-in member's organization and Home's figures. Companies and hotels live in
// entities.ts and properties.ts. organizationId always comes from `access` (the session), never
// from input.
import { ORPCError } from '@orpc/server'
import { PERMISSION_KEYS } from '@vento/shared'
import { and, count, eq, gt, isNull } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { invitations, members, organizations, users } from '../db/schema/auth.ts'
import { rooms } from '../db/schema/rooms.ts'
import { devices, memberPins, memberProperties, properties } from '../db/schema/tenancy.ts'
import { idleSecondsFor } from '../devices/service.ts'
import { type Access, can, propertyScope, scopeToProperties } from './access.ts'

const notFound = () => new ORPCError('NOT_FOUND', { message: "We couldn't find that" })

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
