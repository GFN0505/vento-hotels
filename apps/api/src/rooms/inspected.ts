// "Mark N inspected": the one setup status change. New rooms start dirty because nobody sells a
// room nobody has checked; before go-live a GM can say they're all ready in one go, and undo it.
// After go-live, room status belongs to the front desk and housekeeping (brick 7).
import { ORPCError } from '@orpc/server'
import { newId } from '@vento/shared'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { recordAuditMany } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { auditEvents } from '../db/schema/governance.ts'
import { rooms } from '../db/schema/rooms.ts'
import type { Access } from '../tenancy/access.ts'
import { auditAt, holdProperty, type RoomsProperty, requireRoomsSetup } from './context.ts'
import { isLive } from './live.ts'
import { roomsInScope } from './room-reads.ts'

const SET_UP = 'Set up'

function requireNotLive(property: RoomsProperty): void {
  if (isLive(property)) {
    throw new ORPCError('CONFLICT', {
      message: `${property.name} is live, so room status now changes at the front desk and in housekeeping.`,
      data: { code: 'PROPERTY_LIVE' },
    })
  }
}

function statusEvents(
  property: RoomsProperty,
  changed: readonly { id: string; number: string }[],
  from: 'dirty' | 'inspected',
  to: 'dirty' | 'inspected',
  batchId: string,
  reason: string,
) {
  return changed.map((room) => ({
    action: 'room.status_changed',
    entityType: 'room',
    entityId: room.id,
    ...auditAt(property),
    before: { number: room.number, housekeepingStatus: from },
    after: { number: room.number, housekeepingStatus: to, batchId },
    reason,
  }))
}

export async function markInspected(
  db: Database,
  access: Access,
  input: { propertyId: string },
): Promise<{ count: number; batchId: string }> {
  requireRoomsSetup(access)
  return db.transaction(async (tx) => {
    const property = await holdProperty(tx, access, input.propertyId)
    requireNotLive(property)
    // The same rule as the banner (summary.allDirtySetup): offered only while every active room
    // is still dirty. Locks them in id order, so a concurrent change waits or is seen.
    const active = await tx
      .select({ status: rooms.housekeepingStatus })
      .from(rooms)
      .where(and(roomsInScope(access), eq(rooms.propertyId, property.id), isNull(rooms.archivedAt)))
      .orderBy(asc(rooms.id))
      .for('update')
    const checked = active.filter((room) => room.status !== 'dirty').length
    if (checked > 0) {
      throw new ORPCError('CONFLICT', {
        message: `${checked === 1 ? '1 room has' : `${checked} rooms have`} already been checked, so rooms can't all be marked inspected at once.`,
        data: { code: 'ROOMS_NOT_ALL_DIRTY' },
      })
    }
    const batchId = newId()
    const changed = await tx
      .update(rooms)
      .set({ housekeepingStatus: 'inspected' })
      .where(
        and(
          roomsInScope(access),
          eq(rooms.propertyId, property.id),
          isNull(rooms.archivedAt),
          eq(rooms.housekeepingStatus, 'dirty'),
        ),
      )
      .returning({ id: rooms.id, number: rooms.number })
    await recordAuditMany(
      tx,
      access,
      statusEvents(property, changed, 'dirty', 'inspected', batchId, SET_UP),
    )
    return { count: changed.length, batchId }
  })
}

// Puts back to dirty the rooms one "Mark inspected" changed, if nothing has changed them since.
export async function undoMarkInspected(
  db: Database,
  access: Access,
  input: { propertyId: string; batchId: string },
): Promise<{ count: number }> {
  requireRoomsSetup(access)
  return db.transaction(async (tx) => {
    const property = await holdProperty(tx, access, input.propertyId)
    requireNotLive(property)
    const events = await tx
      .select({ roomId: auditEvents.entityId })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, access.organizationId),
          eq(auditEvents.propertyId, property.id),
          eq(auditEvents.action, 'room.status_changed'),
          sql`${auditEvents.after}->>'batchId' = ${input.batchId}`,
          sql`${auditEvents.after}->>'housekeepingStatus' = 'inspected'`,
        ),
      )
    const ids = events.flatMap((event) => (event.roomId ? [event.roomId] : []))
    if (ids.length === 0) {
      throw new ORPCError('NOT_FOUND', { message: "We couldn't find that change to undo" })
    }
    const changed = await tx
      .update(rooms)
      .set({ housekeepingStatus: 'dirty' })
      .where(
        and(
          roomsInScope(access),
          inArray(rooms.id, ids),
          isNull(rooms.archivedAt),
          eq(rooms.housekeepingStatus, 'inspected'),
        ),
      )
      .returning({ id: rooms.id, number: rooms.number })
    await recordAuditMany(
      tx,
      access,
      statusEvents(property, changed, 'inspected', 'dirty', input.batchId, `Undo: ${SET_UP}`),
    )
    return { count: changed.length }
  })
}
