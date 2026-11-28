// A hotel's active rooms as the tape chart, the day list and the Room move dialog show them: type,
// floor, features, connecting rooms, and the housekeeping status with who set it and when. One
// query for the rooms and one for the connections.
import type { RoomStatus } from '@vento/shared'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { roomConnections, rooms, roomTypes } from '../db/schema/rooms.ts'
import type { Reader } from '../reservations/context.ts'

export type HotelRoom = {
  id: string
  number: string
  floor: number
  roomTypeId: string
  features: string[]
  accessible: boolean
  connectsTo: string[]
  status: RoomStatus
  statusBy: string | null
  statusAt: Date | null
}

export async function hotelRooms(
  db: Reader,
  scope: { organizationId: string; propertyId: string },
): Promise<HotelRoom[]> {
  const rows = await db
    .select({
      id: rooms.id,
      number: rooms.number,
      floor: rooms.floor,
      roomTypeId: rooms.roomTypeId,
      features: rooms.features,
      accessible: rooms.accessible,
      status: rooms.housekeepingStatus,
      statusBy: rooms.housekeepingStatusByName,
      statusAt: rooms.housekeepingStatusAt,
    })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(
      and(
        eq(rooms.organizationId, scope.organizationId),
        eq(rooms.propertyId, scope.propertyId),
        isNull(rooms.archivedAt),
        isNull(roomTypes.archivedAt),
      ),
    )
    .orderBy(asc(rooms.floor), asc(rooms.number))
  const links = await db
    .select({ a: roomConnections.roomAId, b: roomConnections.roomBId })
    .from(roomConnections)
    .where(
      and(
        eq(roomConnections.organizationId, scope.organizationId),
        eq(roomConnections.propertyId, scope.propertyId),
      ),
    )
  const numberOf = new Map(rows.map((row) => [row.id, row.number]))
  const partners = new Map<string, string[]>()
  for (const link of links) {
    const a = numberOf.get(link.a)
    const b = numberOf.get(link.b)
    if (!a || !b) continue
    partners.set(link.a, [...(partners.get(link.a) ?? []), b])
    partners.set(link.b, [...(partners.get(link.b) ?? []), a])
  }
  return rows.map((row) => ({
    ...row,
    // Only clean, inspected and dirty are stored (a check), so this narrowing is safe.
    status: row.status as RoomStatus,
    connectsTo: (partners.get(row.id) ?? []).sort(),
  }))
}
