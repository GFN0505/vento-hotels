// Adding, editing and deleting rooms. Room numbers are unique per hotel by a database constraint,
// archived rooms included, so concurrent adds can't create the same room twice: the losing
// transaction rolls back whole and is told which numbers exist.
import { ORPCError } from '@orpc/server'
import type { RoomDetail } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { type AuditEvent, recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isForeignKeyViolation, isUniqueViolation } from '../db/errors.ts'
import { rooms } from '../db/schema/rooms.ts'
import type { Access } from '../tenancy/access.ts'
import { setConnections } from './connections.ts'
import {
  auditAt,
  holdProperty,
  loadProperty,
  type RoomsProperty,
  requireRoomsSetup,
  type Tx,
} from './context.ts'
import { numbersTaken, roomArchived, roomNotFound } from './errors.ts'
import { hasHistory } from './history.ts'
import { isLive, requireReasonIfLive } from './live.ts'
import { lockActiveTypes, lockRoom, lockRooms, typeNames } from './locks.ts'
import { roomCountChanged } from './room-count.ts'
import { roomDetail, takenNumbers } from './room-reads.ts'

export type NewRoom = { number: string; floor: number; roomTypeId: string }

async function requireFreeNumbers(db: Tx | Database, propertyId: string, numbers: string[]) {
  const taken = await takenNumbers(db, propertyId, numbers)
  if (taken.length > 0) throw numbersTaken(taken)
}

// A lost race on the number constraint: say which numbers now exist.
export async function explainNumberClash(
  db: Database,
  error: unknown,
  propertyId: string,
  numbers: string[],
): Promise<never> {
  if (isUniqueViolation(error)) {
    const taken = await takenNumbers(db, propertyId, numbers)
    if (taken.length > 0) throw numbersTaken(taken)
  }
  throw error
}

export function createdEvent(
  property: RoomsProperty,
  room: NewRoom & { id: string; roomTypeName: string },
  extra: Record<string, unknown>,
): AuditEvent {
  return {
    action: 'room.created',
    entityType: 'room',
    entityId: room.id,
    ...auditAt(property),
    after: {
      number: room.number,
      floor: room.floor,
      roomTypeId: room.roomTypeId,
      roomTypeName: room.roomTypeName,
      ...extra,
      liveProperty: isLive(property),
    },
  }
}

export async function createRoom(
  db: Database,
  access: Access,
  input: NewRoom & {
    propertyId: string
    features: string[]
    accessible: boolean
    connectingRoomIds: string[]
  },
): Promise<RoomDetail> {
  requireRoomsSetup(access)
  const property = await loadProperty(db, access, input.propertyId)
  try {
    return await db.transaction(async (tx) => {
      // Partners first (rooms before types), so one being archived meanwhile is seen as archived.
      if (input.connectingRoomIds.length > 0) {
        await lockRooms(tx, access, input.connectingRoomIds, property.id)
      }
      const names = await lockActiveTypes(tx, access, property.id, [input.roomTypeId])
      await holdProperty(tx, access, property.id)
      await requireFreeNumbers(tx, property.id, [input.number])
      const [row] = await tx
        .insert(rooms)
        .values({
          organizationId: access.organizationId,
          propertyId: property.id,
          roomTypeId: input.roomTypeId,
          number: input.number,
          floor: input.floor,
          features: input.features,
          accessible: input.accessible,
        })
        .returning({ id: rooms.id })
      if (!row) throw new Error('room insert returned nothing')
      const links = await setConnections(tx, access, property, row.id, input.connectingRoomIds)
      await roomCountChanged(tx, { propertyId: property.id, roomTypeIds: [input.roomTypeId] })
      await recordAudit(
        tx,
        access,
        createdEvent(
          property,
          { ...input, id: row.id, roomTypeName: names.get(input.roomTypeId) ?? '' },
          { features: input.features, accessible: input.accessible, connectingRooms: links.after },
        ),
      )
      return roomDetail(tx, access, row.id)
    })
  } catch (error) {
    return explainNumberClash(db, error, property.id, [input.number])
  }
}

type RoomChanges = {
  id: string
  number?: string | undefined
  floor?: number | undefined
  roomTypeId?: string | undefined
  features?: string[] | undefined
  accessible?: boolean | undefined
  connectingRoomIds?: string[] | undefined
  reason?: string | undefined
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Edits one room. A type change on a live hotel needs a reason; a new number, floor, features or
// connections never do (doors get renumbered; history follows the room's id).
export async function updateRoom(
  db: Database,
  access: Access,
  input: RoomChanges,
): Promise<RoomDetail> {
  requireRoomsSetup(access)
  let propertyId: string | undefined
  try {
    return await db.transaction(async (tx) => {
      // The room and the partners it should connect to are locked together in id order, so edits
      // linking 401→402 and 402→401 at once can't deadlock, and a partner archived meanwhile is
      // seen as archived once the lock is ours.
      const locked = await lockRooms(tx, access, [input.id, ...(input.connectingRoomIds ?? [])])
      const room = locked.find((row) => row.id === input.id)
      if (!room) throw roomNotFound()
      propertyId = room.propertyId
      if (room.archivedAt) throw roomArchived(room.number)
      const property = await holdProperty(tx, access, room.propertyId)
      const before: Record<string, unknown> = {}
      const after: Record<string, unknown> = {}
      const set: Partial<typeof rooms.$inferInsert> = {}
      for (const key of ['number', 'floor', 'features', 'accessible'] as const) {
        if (input[key] !== undefined && !same(input[key], room[key])) {
          before[key] = room[key]
          after[key] = input[key]
          Object.assign(set, { [key]: input[key] })
        }
      }
      if (set.number) await requireFreeNumbers(tx, property.id, [set.number])
      if (input.roomTypeId && input.roomTypeId !== room.roomTypeId) {
        requireReasonIfLive(property, input.reason)
        const names = await lockActiveTypes(tx, access, property.id, [input.roomTypeId])
        const old = await typeNames(tx, property.id, [room.roomTypeId])
        before.roomTypeId = room.roomTypeId
        before.roomTypeName = old.get(room.roomTypeId)
        after.roomTypeId = input.roomTypeId
        after.roomTypeName = names.get(input.roomTypeId)
        set.roomTypeId = input.roomTypeId
      }
      if (Object.keys(set).length > 0) {
        await tx.update(rooms).set(set).where(eq(rooms.id, room.id))
      }
      if (set.roomTypeId) {
        await roomCountChanged(tx, {
          propertyId: property.id,
          roomTypeIds: [room.roomTypeId, set.roomTypeId],
        })
      }
      if (input.connectingRoomIds) {
        const links = await setConnections(tx, access, property, room.id, input.connectingRoomIds)
        if (!same(links.before, links.after)) {
          before.connectingRooms = links.before
          after.connectingRooms = links.after
        }
      }
      if (Object.keys(after).length > 0) {
        await recordAudit(tx, access, {
          action: 'room.changed',
          entityType: 'room',
          entityId: room.id,
          ...auditAt(property),
          before: { number: room.number, ...before },
          after: {
            number: after.number ?? room.number,
            ...after,
            // A type change moves a room between sellable counts (exception for brick 16).
            ...(set.roomTypeId ? { roomCountChange: true } : {}),
            liveProperty: isLive(property),
          },
          reason: input.reason ?? null,
        })
      }
      return roomDetail(tx, access, room.id)
    })
  } catch (error) {
    if (!propertyId || !input.number) throw error
    return explainNumberClash(db, error, propertyId, [input.number])
  }
}

function hasHistoryError(number: string) {
  return new ORPCError('CONFLICT', {
    message: `Room ${number} has history, so it can only be archived.`,
    data: { code: 'HAS_HISTORY' },
  })
}

// Deletes an archived room with no history for good, which frees its number.
export async function deleteRoom(
  db: Database,
  access: Access,
  input: { id: string },
): Promise<{ ok: true }> {
  requireRoomsSetup(access)
  let number = ''
  try {
    return await db.transaction(async (tx) => {
      const room = await lockRoom(tx, access, input.id)
      number = room.number
      if (!room.archivedAt) {
        throw new ORPCError('CONFLICT', {
          message: `Remove room ${room.number} first. Only removed rooms can be deleted for good.`,
          data: { code: 'NOT_ARCHIVED' },
        })
      }
      if (await hasHistory(tx, room.id)) throw hasHistoryError(room.number)
      const property = await holdProperty(tx, access, room.propertyId)
      await tx.delete(rooms).where(eq(rooms.id, room.id))
      await roomCountChanged(tx, { propertyId: property.id, roomTypeIds: [room.roomTypeId] })
      await recordAudit(tx, access, {
        action: 'room.deleted',
        entityType: 'room',
        entityId: room.id,
        ...auditAt(property),
        before: {
          number: room.number,
          floor: room.floor,
          roomTypeId: room.roomTypeId,
          features: room.features,
          accessible: room.accessible,
          archivedAt: room.archivedAt.toISOString(),
        },
      })
      return { ok: true as const }
    })
  } catch (error) {
    // A later brick's row (a stay, a posting) still points at the room.
    if (isForeignKeyViolation(error)) throw hasHistoryError(number)
    throw error
  }
}
