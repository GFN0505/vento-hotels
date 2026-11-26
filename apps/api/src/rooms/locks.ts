// Row locks for room writes. Lock order is always rooms first, then room types, and rows within a
// table by id, so two writers can't deadlock. Room writes hold their target types FOR SHARE, and
// archiving a type takes it FOR UPDATE, so a type can't be archived while rooms are added to it.
import { and, asc, eq, inArray } from 'drizzle-orm'
import { rooms, roomTypes } from '../db/schema/rooms.ts'
import type { Access } from '../tenancy/access.ts'
import type { Tx } from './context.ts'
import { roomNotFound, roomTypeNotFound, typeArchived } from './errors.ts'
import { roomsInScope } from './room-reads.ts'

// The given types of this property, locked FOR SHARE; each must exist and be active. Returns
// each type's name by id.
export async function lockActiveTypes(
  tx: Tx,
  access: Access,
  propertyId: string,
  typeIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(typeIds)].sort()
  const rows = await tx
    .select({ id: roomTypes.id, name: roomTypes.name, archivedAt: roomTypes.archivedAt })
    .from(roomTypes)
    .where(
      and(
        inArray(roomTypes.id, unique),
        eq(roomTypes.organizationId, access.organizationId),
        eq(roomTypes.propertyId, propertyId),
      ),
    )
    .orderBy(asc(roomTypes.id))
    .for('share')
  if (rows.length !== unique.length) throw roomTypeNotFound()
  const archived = rows.find((row) => row.archivedAt)
  if (archived) throw typeArchived(archived.name)
  return new Map(rows.map((row) => [row.id, row.name]))
}

export type LockedRoom = {
  id: string
  propertyId: string
  number: string
  floor: number
  roomTypeId: string
  features: string[]
  accessible: boolean
  archivedAt: Date | null
}

const lockedColumns = {
  id: rooms.id,
  propertyId: rooms.propertyId,
  number: rooms.number,
  floor: rooms.floor,
  roomTypeId: rooms.roomTypeId,
  features: rooms.features,
  accessible: rooms.accessible,
  archivedAt: rooms.archivedAt,
}

// Rooms by id, in scope, locked FOR UPDATE. Any id the caller can't see is NOT_FOUND.
export async function lockRooms(
  tx: Tx,
  access: Access,
  ids: readonly string[],
  propertyId?: string,
): Promise<LockedRoom[]> {
  const unique = [...new Set(ids)]
  const rows = await tx
    .select(lockedColumns)
    .from(rooms)
    .where(
      and(
        inArray(rooms.id, unique),
        roomsInScope(access),
        propertyId ? eq(rooms.propertyId, propertyId) : undefined,
      ),
    )
    .orderBy(asc(rooms.id))
    .for('update')
  if (rows.length !== unique.length) throw roomNotFound()
  return rows
}

export async function lockRoom(tx: Tx, access: Access, id: string): Promise<LockedRoom> {
  const [room] = await lockRooms(tx, access, [id])
  if (!room) throw roomNotFound()
  return room
}

// Type names by id for audit events (any state; used for the "from" side of a type change).
export async function typeNames(
  tx: Tx,
  propertyId: string,
  typeIds: readonly string[],
): Promise<Map<string, string>> {
  if (typeIds.length === 0) return new Map()
  const rows = await tx
    .select({ id: roomTypes.id, name: roomTypes.name })
    .from(roomTypes)
    .where(and(eq(roomTypes.propertyId, propertyId), inArray(roomTypes.id, [...new Set(typeIds)])))
  return new Map(rows.map((row) => [row.id, row.name]))
}
