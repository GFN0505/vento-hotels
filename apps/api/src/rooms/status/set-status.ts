// rooms.setStatus: Mark clean / Mark dirty (spec: "Room status (minimal, Stage 1)"), the first
// command the offline outbox carries (decision 0009). Idempotent: the device makes the key, and a
// resend finds its receipt. The device's time decides between two changes to one room: a change
// older than the room's last one is recorded (receipt and audit event) but doesn't overwrite it.
// Locks only the room row (lock step 3) and nothing after, so it can't cycle with anything.

import { ORPCError } from '@orpc/server'
import {
  clockAt,
  type RoomStatusResult,
  type SetRoomStatusInput,
  setRoomStatusInputSchema,
} from '@vento/shared'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { recordAudit } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { isUniqueViolation, violatedConstraint } from '../../db/errors.ts'
import { roomStatusCommands, rooms } from '../../db/schema/rooms.ts'
import { properties } from '../../db/schema/tenancy.ts'
import {
  type Access,
  propertyScope,
  requireFeature,
  requirePermission,
  scopeToProperties,
} from '../../tenancy/access.ts'
import { hotelNotFound } from '../../tenancy/errors.ts'
import type { Reader, Tx } from '../context.ts'

type Input = ReturnType<typeof setRoomStatusInputSchema.parse>

export const STATUS_ONLY = 'Only front desk, housekeeping and managers can change room status.'

// A device clock running ahead can't push a change into the future.
const SKEW_MS = 5 * 60 * 1000

async function hotelOf(db: Reader, access: Access, propertyId: string) {
  const [hotel] = await db
    .select({
      id: properties.id,
      businessDate: properties.businessDate,
      timeZone: properties.timeZone,
    })
    .from(properties)
    .where(and(eq(properties.id, propertyId), propertyScope(access), isNull(properties.archivedAt)))
  if (!hotel) throw hotelNotFound()
  return hotel
}

async function view(
  db: Reader,
  roomId: string,
  outcome: RoomStatusResult['outcome'],
  message: string | null,
): Promise<RoomStatusResult> {
  const [room] = await db
    .select({
      number: rooms.number,
      status: rooms.housekeepingStatus,
      by: rooms.housekeepingStatusByName,
      at: rooms.housekeepingStatusAt,
    })
    .from(rooms)
    .where(eq(rooms.id, roomId))
  return {
    roomId,
    number: room?.number ?? '',
    outcome,
    // Only clean, inspected and dirty are stored (a check).
    status: (room?.status ?? 'dirty') as RoomStatusResult['status'],
    statusBy: room?.by ?? null,
    statusAt: room?.at?.toISOString() ?? null,
    message,
  }
}

async function receipt(db: Reader, access: Access, key: string) {
  const [row] = await db
    .select({
      roomId: roomStatusCommands.roomId,
      status: roomStatusCommands.status,
      outcome: roomStatusCommands.outcome,
    })
    .from(roomStatusCommands)
    .where(
      and(
        eq(roomStatusCommands.organizationId, access.organizationId),
        eq(roomStatusCommands.idempotencyKey, key),
        scopeToProperties(access, roomStatusCommands.propertyId),
      ),
    )
  return row
}

async function replay(db: Reader, access: Access, input: Input) {
  const found = await receipt(db, access, input.idempotencyKey)
  if (!found) return null
  if (found.roomId !== input.roomId || found.status !== input.status) {
    throw new ORPCError('CONFLICT', {
      message: 'This change was already saved.',
      data: { code: 'IDEMPOTENCY_CONFLICT' },
    })
  }
  return view(db, found.roomId, found.outcome, null)
}

async function setInTx(tx: Tx, access: Access, input: Input): Promise<RoomStatusResult> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`room-status:${access.organizationId}:${input.idempotencyKey}`}, 0))`,
  )
  const replayed = await replay(tx, access, input)
  if (replayed) return replayed
  const hotel = await hotelOf(tx, access, input.propertyId)
  const [room] = await tx
    .select({
      id: rooms.id,
      number: rooms.number,
      status: rooms.housekeepingStatus,
      at: rooms.housekeepingStatusAt,
      by: rooms.housekeepingStatusByName,
      archivedAt: rooms.archivedAt,
    })
    .from(rooms)
    .where(
      and(
        eq(rooms.id, input.roomId),
        eq(rooms.organizationId, access.organizationId),
        eq(rooms.propertyId, hotel.id),
      ),
    )
    .for('update')
  if (!room) throw new ORPCError('NOT_FOUND', { message: "We couldn't find that room" })
  if (room.archivedAt) {
    throw new ORPCError('CONFLICT', {
      message: `Room ${room.number} was removed.`,
      data: { code: 'ROOM_ARCHIVED' },
    })
  }
  const now = new Date()
  const sent = new Date(input.occurredAt)
  const occurredAt = sent.getTime() > now.getTime() + SKEW_MS ? now : sent
  const superseded = room.at !== null && occurredAt.getTime() < room.at.getTime()
  await tx.insert(roomStatusCommands).values({
    organizationId: access.organizationId,
    propertyId: hotel.id,
    roomId: room.id,
    idempotencyKey: input.idempotencyKey,
    status: input.status,
    occurredAt,
    appliedAt: now,
    outcome: superseded ? 'superseded' : 'applied',
    byMemberId: access.memberId,
    deviceId: access.deviceId,
  })
  if (!superseded) {
    await tx
      .update(rooms)
      .set({
        housekeepingStatus: input.status,
        housekeepingStatusAt: occurredAt,
        housekeepingStatusByMemberId: access.memberId,
        housekeepingStatusByName: access.userName,
        updatedAt: now,
      })
      .where(eq(rooms.id, room.id))
  }
  // Synced from an outbox: the change happened a while before it reached the server.
  const late = now.getTime() - occurredAt.getTime() > 60_000
  await recordAudit(tx, access, {
    action: 'room.status_changed',
    entityType: 'room',
    entityId: room.id,
    propertyId: hotel.id,
    businessDate: hotel.businessDate,
    before: { number: room.number, housekeepingStatus: room.status },
    after: {
      number: room.number,
      housekeepingStatus: superseded ? room.status : input.status,
      requested: input.status,
      applied: !superseded,
      source: input.source,
      occurredAt: occurredAt.toISOString(),
      syncedAt: late ? now.toISOString() : null,
    },
  })
  const message =
    superseded && room.at
      ? `${room.number}'s status changed to ${room.status} by ${room.by ?? 'someone'} at ${clockAt(room.at, hotel.timeZone)} after your change at ${clockAt(occurredAt, hotel.timeZone)}. Kept as ${room.status}.`
      : null
  return view(tx, room.id, superseded ? 'superseded' : 'applied', message)
}

export async function setRoomStatus(
  db: Database,
  access: Access,
  input: SetRoomStatusInput,
): Promise<RoomStatusResult> {
  requireFeature(access, 'front_desk')
  requirePermission(access, 'room.status', STATUS_ONLY)
  const parsed = setRoomStatusInputSchema.parse(input)
  try {
    return await db.transaction((tx) => setInTx(tx, access, parsed))
  } catch (error) {
    if (
      isUniqueViolation(error) &&
      violatedConstraint(error) === 'room_status_commands_organization_id_idempotency_key_unique'
    ) {
      const replayed = await replay(db, access, parsed)
      if (replayed) return replayed
      throw new ORPCError('CONFLICT', {
        message: 'This change was already saved.',
        data: { code: 'IDEMPOTENCY_CONFLICT' },
      })
    }
    throw error
  }
}
