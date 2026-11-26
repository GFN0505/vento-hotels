// Closing and reopening a hotel. Archiving never deletes: rooms, history and access rows stay, the
// hotel's devices are revoked and invitations for it alone are cancelled, all in one transaction
// with its audit events (spec: stage-1-hotels-and-companies.md, decision 0022).
import { ORPCError } from '@orpc/server'
import { type ArchivePreview, calendarDateIn, newId, type Property } from '@vento/shared'
import { and, asc, count, eq, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import { invitations, members, organizations, sessions } from '../db/schema/auth.ts'
import { rooms } from '../db/schema/rooms.ts'
import {
  devices,
  entities,
  invitationProperties,
  memberProperties,
  properties,
} from '../db/schema/tenancy.ts'
import { type Access, propertyScope, requirePermission } from './access.ts'
import { archiveBlockers } from './archive-blockers.ts'
import { companyArchived, hotelNotFound, lastHotel, SETUP_ONLY } from './errors.ts'
import { lockActiveEntity, lockProperty } from './properties.ts'
import { type HotelDeps, type Reader, readProperty, type Tx } from './property-views.ts'

// People limited to hotels whose only active hotel is this one.
function onlyHereMembers(organizationId: string, propertyId: string): SQL {
  return and(
    eq(members.organizationId, organizationId),
    eq(members.allProperties, false),
    sql`exists (select 1 from ${memberProperties} mp where mp.member_id = ${members.id} and mp.property_id = ${propertyId})`,
    sql`not exists (select 1 from ${memberProperties} mp join ${properties} p on p.id = mp.property_id where mp.member_id = ${members.id} and mp.property_id <> ${propertyId} and p.archived_at is null)`,
  ) as SQL
}

// Pending invitations whose only active hotel is this one.
function onlyHereInvitations(organizationId: string, propertyId: string): SQL {
  return and(
    eq(invitations.organizationId, organizationId),
    eq(invitations.status, 'pending'),
    eq(invitations.allProperties, false),
    sql`exists (select 1 from ${invitationProperties} ip where ip.invitation_id = ${invitations.id} and ip.property_id = ${propertyId})`,
    sql`not exists (select 1 from ${invitationProperties} ip join ${properties} p on p.id = ip.property_id where ip.invitation_id = ${invitations.id} and ip.property_id <> ${propertyId} and p.archived_at is null)`,
  ) as SQL
}

const liveDevices = (propertyId: string) =>
  and(eq(devices.propertyId, propertyId), isNull(devices.revokedAt))

async function otherActiveHotels(db: Reader, access: Access, propertyId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(properties)
    .where(
      and(
        eq(properties.organizationId, access.organizationId),
        isNull(properties.archivedAt),
        ne(properties.id, propertyId),
      ),
    )
  return row?.value ?? 0
}

// What the archive dialog says, and what would stop it.
export async function archivePreview(
  deps: HotelDeps,
  access: Access,
  id: string,
): Promise<ArchivePreview> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  const [property] = await deps.db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, id), propertyScope(access), isNull(properties.archivedAt)))
  if (!property) throw hotelNotFound()
  const org = access.organizationId
  const [[roomCount], [deviceCount], [people], [invites], others, blockers] = await Promise.all([
    deps.db
      .select({ value: count() })
      .from(rooms)
      .where(and(eq(rooms.propertyId, id), isNull(rooms.archivedAt))),
    deps.db.select({ value: count() }).from(devices).where(liveDevices(id)),
    deps.db.select({ value: count() }).from(members).where(onlyHereMembers(org, id)),
    deps.db.select({ value: count() }).from(invitations).where(onlyHereInvitations(org, id)),
    otherActiveHotels(deps.db, access, id),
    archiveBlockers(deps.db, property),
  ])
  return {
    rooms: roomCount?.value ?? 0,
    devices: deviceCount?.value ?? 0,
    peopleOnlyHere: people?.value ?? 0,
    invitationsOnlyHere: invites?.value ?? 0,
    lastHotel: others === 0,
    blockers,
  }
}

export async function archiveProperty(
  deps: HotelDeps,
  access: Access,
  input: { id: string; reason: string },
): Promise<Property> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  return deps.db.transaction(async (tx) => {
    // Every active hotel of the group, locked in id order: two people archiving the last two
    // hotels at once can't both pass the "at least one hotel" check.
    await tx
      .select({ id: properties.id })
      .from(properties)
      .where(
        and(eq(properties.organizationId, access.organizationId), isNull(properties.archivedAt)),
      )
      .orderBy(asc(properties.id))
      .for('update')
    const property = await lockProperty(tx, access, input.id)
    if (property.archivedAt) return read(tx, deps, access, property.id)
    if ((await otherActiveHotels(tx, access, property.id)) === 0) {
      throw lastHotel(await groupName(tx, access))
    }
    const blockers = await archiveBlockers(tx, property)
    if (blockers.length > 0) {
      throw new ORPCError('CONFLICT', {
        message: `${property.name} can't be archived yet: ${blockers.map((b) => b.label).join(' · ')}`,
        data: { code: 'ARCHIVE_BLOCKED', blockers },
      })
    }

    const eventId = newId()
    const live = property.liveSince !== null
    const [roomCount] = await tx
      .select({ value: count() })
      .from(rooms)
      .where(and(eq(rooms.propertyId, property.id), isNull(rooms.archivedAt)))
    await tx
      .update(properties)
      .set({ archivedAt: new Date() })
      .where(eq(properties.id, property.id))
    const revoked = await revokeDevices(tx, property, input.reason)
    const cancelled = await cancelInvitations(tx, access, property.id)
    await recordAudit(tx, access, {
      id: eventId,
      action: 'property.archived',
      entityType: 'property',
      entityId: property.id,
      propertyId: property.id,
      businessDate: property.businessDate,
      before: { archived: false },
      after: {
        archived: true,
        name: property.name,
        rooms: roomCount?.value ?? 0,
        devicesRevoked: revoked.length,
        invitationsCancelled: cancelled.length,
        liveProperty: live,
        ...(live ? { exception: 'setup_changed' } : {}),
      },
      reason: input.reason,
    })
    const sideEffect = { propertyId: property.id, businessDate: property.businessDate }
    for (const device of revoked) {
      await recordAudit(tx, access, {
        ...sideEffect,
        action: 'device.revoked',
        entityType: 'device',
        entityId: device.id,
        before: { name: device.name },
        after: { revoked: true, causedBy: eventId },
        reason: `Hotel archived: ${input.reason}`,
      })
    }
    for (const invite of cancelled) {
      await recordAudit(tx, access, {
        ...sideEffect,
        action: 'invitation.cancelled',
        entityType: 'invitation',
        entityId: invite.id,
        before: { email: invite.email, role: invite.role },
        after: { status: 'canceled', causedBy: eventId },
        reason: `Hotel archived: ${input.reason}`,
      })
    }
    return read(tx, deps, access, property.id)
  })
}

// Per decision 0022: everyone on the device is signed out now, and the device learns it was
// revoked at its next contact (its saved data is wiped and queued commands are rejected).
async function revokeDevices(tx: Tx, property: { id: string }, reason: string) {
  const live = await tx
    .select({ id: devices.id, name: devices.name })
    .from(devices)
    .where(liveDevices(property.id))
    .orderBy(asc(devices.id))
    .for('update')
  if (live.length === 0) return live
  const ids = live.map((d) => d.id)
  await tx
    .update(devices)
    .set({ revokedAt: new Date(), revokedReason: `Hotel archived: ${reason}` })
    .where(inArray(devices.id, ids))
  await tx.delete(sessions).where(inArray(sessions.deviceId, ids))
  return live
}

// Invitations that also cover other hotels keep them; only invitations for this hotel alone go.
async function cancelInvitations(tx: Tx, access: Access, propertyId: string) {
  const pending = await tx
    .select({ id: invitations.id, email: invitations.email, role: invitations.role })
    .from(invitations)
    .where(onlyHereInvitations(access.organizationId, propertyId))
    .for('update')
  if (pending.length > 0) {
    await tx
      .update(invitations)
      .set({ status: 'canceled' })
      .where(
        inArray(
          invitations.id,
          pending.map((i) => i.id),
        ),
      )
  }
  return pending
}

export async function restoreProperty(
  deps: HotelDeps,
  access: Access,
  input: { id: string; reason: string; entityId?: string | undefined },
): Promise<Property> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  return deps.db.transaction(async (tx) => {
    const property = await lockProperty(tx, access, input.id)
    if (!property.archivedAt) return read(tx, deps, access, property.id)
    const [owner] = await tx
      .select({ id: entities.id, name: entities.name, archivedAt: entities.archivedAt })
      .from(entities)
      .where(eq(entities.id, property.entityId))
      .for('share')
    let entity = owner ? { id: owner.id, name: owner.name } : undefined
    if (!owner || owner.archivedAt) {
      // Its company was archived meanwhile: restoring needs an active one.
      if (!input.entityId) throw companyArchived(owner?.name ?? 'Its company')
      entity = await lockActiveEntity(tx, access, input.entityId)
    }
    const live = property.liveSince !== null
    // A hotel that never went live starts again on today's date; a live one keeps its date
    // (spec open question 4: brick 13 decides before any live hotel can be archived).
    const businessDate = live ? property.businessDate : calendarDateIn(property.timeZone)
    await tx
      .update(properties)
      .set({
        archivedAt: null,
        entityId: entity?.id ?? property.entityId,
        businessDate,
        // A scheduled company change doesn't survive closing the hotel.
        pendingEntityId: null,
        pendingEntityFrom: null,
      })
      .where(eq(properties.id, property.id))
    await recordAudit(tx, access, {
      action: 'property.restored',
      entityType: 'property',
      entityId: property.id,
      propertyId: property.id,
      businessDate,
      before: {
        archived: true,
        ...(entity?.id !== property.entityId ? { entityId: property.entityId } : {}),
        ...(businessDate !== property.businessDate ? { businessDate: property.businessDate } : {}),
      },
      after: {
        archived: false,
        name: property.name,
        ...(entity?.id !== property.entityId
          ? { entityId: entity?.id, entityName: entity?.name }
          : {}),
        ...(businessDate !== property.businessDate ? { businessDate } : {}),
        liveProperty: live,
        ...(live ? { exception: 'setup_changed' } : {}),
      },
      reason: input.reason,
    })
    return read(tx, deps, access, property.id)
  })
}

async function read(tx: Tx, deps: HotelDeps, access: Access, id: string): Promise<Property> {
  const property = await readProperty({ db: tx, storage: deps.storage }, access, id)
  if (!property) throw hotelNotFound()
  return property
}

async function groupName(db: Reader, access: Access): Promise<string> {
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, access.organizationId))
  return org?.name ?? 'Your group'
}
