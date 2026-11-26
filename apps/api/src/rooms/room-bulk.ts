// Bulk actions on selected rooms: change type, remove (archive) and restore. Each moves sellable
// rooms, so on a live hotel each needs a reason, and its audit events carry `liveProperty` for the
// owner's daily report (exception "room count changed", brick 16).

import { inArray } from 'drizzle-orm'
import type { AuditEvent } from '../audit/record.ts'
import { recordAuditMany } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { rooms } from '../db/schema/rooms.ts'
import type { Access } from '../tenancy/access.ts'
import { dropConnections } from './connections.ts'
import { auditAt, holdProperty, type RoomsProperty, requireRoomsSetup } from './context.ts'
import { isLive, requireReasonIfLive } from './live.ts'
import { type LockedRoom, lockActiveTypes, lockRooms, typeNames } from './locks.ts'
import { roomCountChanged } from './room-count.ts'

type BulkInput = { propertyId: string; ids: string[]; reason?: string | undefined }

function roomEvent(
  property: RoomsProperty,
  action: string,
  room: LockedRoom,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  reason: string | undefined,
): AuditEvent {
  return {
    action,
    entityType: 'room',
    entityId: room.id,
    ...auditAt(property),
    before: { number: room.number, ...before },
    // Every bulk action moves sellable rooms: the owner's daily report (brick 16) picks these out
    // by `roomCountChange` together with `liveProperty`.
    after: { number: room.number, ...after, roomCountChange: true, liveProperty: isLive(property) },
    reason: reason ?? null,
  }
}

const typesOf = (list: readonly LockedRoom[]) => [...new Set(list.map((room) => room.roomTypeId))]

export async function changeRoomType(
  db: Database,
  access: Access,
  input: BulkInput & { roomTypeId: string },
): Promise<{ count: number }> {
  requireRoomsSetup(access)
  return db.transaction(async (tx) => {
    const property = await holdProperty(tx, access, input.propertyId)
    requireReasonIfLive(property, input.reason)
    const locked = await lockRooms(tx, access, input.ids, property.id)
    const names = await lockActiveTypes(tx, access, property.id, [input.roomTypeId])
    const moving = locked.filter((r) => !r.archivedAt && r.roomTypeId !== input.roomTypeId)
    if (moving.length === 0) return { count: 0 }
    const from = await typeNames(tx, property.id, typesOf(moving))
    await tx
      .update(rooms)
      .set({ roomTypeId: input.roomTypeId })
      .where(
        inArray(
          rooms.id,
          moving.map((r) => r.id),
        ),
      )
    await roomCountChanged(tx, {
      organizationId: access.organizationId,
      propertyId: property.id,
      businessDate: property.businessDate,
      removedFrom: typesOf(moving).filter((id) => id !== input.roomTypeId),
    })
    const to = { roomTypeId: input.roomTypeId, roomTypeName: names.get(input.roomTypeId) }
    await recordAuditMany(
      tx,
      access,
      moving.map((room) =>
        roomEvent(
          property,
          'room.changed',
          room,
          { roomTypeId: room.roomTypeId, roomTypeName: from.get(room.roomTypeId) },
          to,
          input.reason,
        ),
      ),
    )
    return { count: moving.length }
  })
}

// "Remove": the rooms leave lists, pickers and counts but stay on old records. Their connecting
// links are removed from both sides.
export async function archiveRooms(
  db: Database,
  access: Access,
  input: BulkInput,
): Promise<{ count: number }> {
  requireRoomsSetup(access)
  return db.transaction(async (tx) => {
    const property = await holdProperty(tx, access, input.propertyId)
    requireReasonIfLive(property, input.reason)
    const locked = await lockRooms(tx, access, input.ids, property.id)
    const leaving = locked.filter((room) => !room.archivedAt)
    if (leaving.length === 0) return { count: 0 }
    const ids = leaving.map((room) => room.id)
    await tx.update(rooms).set({ archivedAt: new Date() }).where(inArray(rooms.id, ids))
    await dropConnections(tx, access, property, ids)
    await roomCountChanged(tx, {
      organizationId: access.organizationId,
      propertyId: property.id,
      businessDate: property.businessDate,
      removedFrom: typesOf(leaving),
    })
    const names = await typeNames(tx, property.id, typesOf(leaving))
    await recordAuditMany(
      tx,
      access,
      leaving.map((room) => {
        const type = { roomTypeId: room.roomTypeId, roomTypeName: names.get(room.roomTypeId) }
        return roomEvent(
          property,
          'room.archived',
          room,
          { ...type, archived: false },
          { ...type, archived: true },
          input.reason,
        )
      }),
    )
    return { count: leaving.length }
  })
}

// Back into lists and counts, in the type they had. The type must be active.
export async function restoreRooms(
  db: Database,
  access: Access,
  input: BulkInput,
): Promise<{ count: number }> {
  requireRoomsSetup(access)
  return db.transaction(async (tx) => {
    const property = await holdProperty(tx, access, input.propertyId)
    requireReasonIfLive(property, input.reason)
    const locked = await lockRooms(tx, access, input.ids, property.id)
    const returning = locked.filter((room) => room.archivedAt)
    if (returning.length === 0) return { count: 0 }
    const names = await lockActiveTypes(tx, access, property.id, typesOf(returning))
    await tx
      .update(rooms)
      .set({ archivedAt: null })
      .where(
        inArray(
          rooms.id,
          returning.map((room) => room.id),
        ),
      )
    await recordAuditMany(
      tx,
      access,
      returning.map((room) => {
        const type = { roomTypeId: room.roomTypeId, roomTypeName: names.get(room.roomTypeId) }
        return roomEvent(
          property,
          'room.restored',
          room,
          { ...type, archived: true },
          { ...type, archived: false },
          input.reason,
        )
      }),
    )
    return { count: returning.length }
  })
}
