// Connecting rooms. One row per pair (room_a_id < room_b_id), so 401↔402 shows on both rooms and
// removing it removes both sides. Partners whose connections change get their own room.changed.
import { ORPCError } from '@orpc/server'
import { compareRoomNumbers } from '@vento/shared'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { type AuditEvent, recordAuditMany } from '../audit/record.ts'
import { roomConnections, rooms } from '../db/schema/rooms.ts'
import type { Access } from '../tenancy/access.ts'
import { auditAt, type Reader, type RoomsProperty, type Tx } from './context.ts'

export type Connected = { id: string; number: string }

const roomA = alias(rooms, 'room_a')
const roomB = alias(rooms, 'room_b')

// Each room's connecting rooms, in number order.
export async function connectionsOf(
  db: Reader,
  access: Access,
  roomIds: readonly string[],
): Promise<Map<string, Connected[]>> {
  const result = new Map<string, Connected[]>(roomIds.map((id) => [id, []]))
  if (roomIds.length === 0) return result
  const rows = await db
    .select({ aId: roomA.id, aNumber: roomA.number, bId: roomB.id, bNumber: roomB.number })
    .from(roomConnections)
    .innerJoin(roomA, eq(roomA.id, roomConnections.roomAId))
    .innerJoin(roomB, eq(roomB.id, roomConnections.roomBId))
    .where(
      and(
        eq(roomConnections.organizationId, access.organizationId),
        or(
          inArray(roomConnections.roomAId, [...roomIds]),
          inArray(roomConnections.roomBId, [...roomIds]),
        ),
      ),
    )
  for (const row of rows) {
    result.get(row.aId)?.push({ id: row.bId, number: row.bNumber })
    result.get(row.bId)?.push({ id: row.aId, number: row.aNumber })
  }
  for (const list of result.values()) list.sort((x, y) => compareRoomNumbers(x.number, y.number))
  return result
}

const numbers = (list: readonly Connected[] | undefined) => (list ?? []).map((c) => c.number)

async function auditPartners(
  tx: Tx,
  access: Access,
  property: RoomsProperty,
  partnerIds: readonly string[],
  before: Map<string, Connected[]>,
  partnerNumbers: Map<string, string>,
): Promise<void> {
  if (partnerIds.length === 0) return
  const after = await connectionsOf(tx, access, partnerIds)
  const events: AuditEvent[] = partnerIds.map((id) => ({
    action: 'room.changed',
    entityType: 'room',
    entityId: id,
    ...auditAt(property),
    before: { number: partnerNumbers.get(id), connectingRooms: numbers(before.get(id)) },
    after: { number: partnerNumbers.get(id), connectingRooms: numbers(after.get(id)) },
  }))
  await recordAuditMany(tx, access, events)
}

// Replaces a room's connections with `wanted` (other active rooms of the same hotel). Returns the
// room's connecting room numbers before and after.
export async function setConnections(
  tx: Tx,
  access: Access,
  property: RoomsProperty,
  roomId: string,
  wanted: readonly string[],
): Promise<{ before: string[]; after: string[] }> {
  const unique = [...new Set(wanted)]
  if (unique.includes(roomId)) {
    throw new ORPCError('BAD_REQUEST', { message: "A room can't connect to itself" })
  }
  const partners = unique.length
    ? await tx
        .select({ id: rooms.id, number: rooms.number })
        .from(rooms)
        .where(
          and(
            inArray(rooms.id, unique),
            eq(rooms.organizationId, access.organizationId),
            eq(rooms.propertyId, property.id),
            isNull(rooms.archivedAt),
          ),
        )
    : []
  if (partners.length !== unique.length) {
    throw new ORPCError('NOT_FOUND', { message: "We couldn't find that connecting room" })
  }
  const current = (await connectionsOf(tx, access, [roomId])).get(roomId) ?? []
  const currentIds = current.map((c) => c.id)
  const added = unique.filter((id) => !currentIds.includes(id))
  const removed = currentIds.filter((id) => !unique.includes(id))
  if (added.length === 0 && removed.length === 0) {
    return { before: numbers(current), after: numbers(current) }
  }
  const touched = [...added, ...removed]
  const partnersBefore = await connectionsOf(tx, access, touched)
  if (removed.length > 0) {
    await tx
      .delete(roomConnections)
      .where(
        or(
          and(eq(roomConnections.roomAId, roomId), inArray(roomConnections.roomBId, removed)),
          and(eq(roomConnections.roomBId, roomId), inArray(roomConnections.roomAId, removed)),
        ),
      )
  }
  if (added.length > 0) {
    await tx
      .insert(roomConnections)
      .values(
        added.map((other) => ({
          organizationId: access.organizationId,
          propertyId: property.id,
          roomAId: roomId < other ? roomId : other,
          roomBId: roomId < other ? other : roomId,
        })),
      )
      .onConflictDoNothing()
  }
  const partnerNumbers = new Map([
    ...partners.map((p): [string, string] => [p.id, p.number]),
    ...current.map((c): [string, string] => [c.id, c.number]),
  ])
  await auditPartners(tx, access, property, touched, partnersBefore, partnerNumbers)
  const after = (await connectionsOf(tx, access, [roomId])).get(roomId) ?? []
  return { before: numbers(current), after: numbers(after) }
}

// Removes every connection of rooms being archived, auditing the partners that stay.
export async function dropConnections(
  tx: Tx,
  access: Access,
  property: RoomsProperty,
  roomIds: readonly string[],
): Promise<void> {
  const links = await connectionsOf(tx, access, roomIds)
  const leaving = new Set(roomIds)
  const partnerNumbers = new Map<string, string>()
  for (const list of links.values()) {
    for (const c of list) if (!leaving.has(c.id)) partnerNumbers.set(c.id, c.number)
  }
  if ([...links.values()].every((list) => list.length === 0)) return
  const partnerIds = [...partnerNumbers.keys()]
  const before = await connectionsOf(tx, access, partnerIds)
  await tx
    .delete(roomConnections)
    .where(
      or(
        inArray(roomConnections.roomAId, [...roomIds]),
        inArray(roomConnections.roomBId, [...roomIds]),
      ),
    )
  await auditPartners(tx, access, property, partnerIds, before, partnerNumbers)
}
