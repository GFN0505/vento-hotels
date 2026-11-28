// stays.assignRoom: assign, move or remove the room of a confirmed stay within its room type (spec:
// "Assign and move"), and move an in-house guest (brick 8: from the business date on, reason always
// required, the nights before kept in their room as a segment, decision 0030, and the old room set
// dirty). No inventory row changes and no price changes, so no approval. One transaction: the key
// lock (a resend queues and finds the first result), the hotel FOR SHARE (2), the reservation row
// FOR UPDATE (2b), then the old and new rooms FOR UPDATE in id order (3); the new room is checked
// free every night under its lock. A move to another room type is a modify (reservations.modify
// with roomId), never this.
import {
  type AssignedRoom,
  type AssignRoomInput,
  assignRoomInputSchema,
  formatRateDate,
  newId,
  ROOM_MOVE_REASON_LABELS,
} from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import { type AuditEvent, recordAudit } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { isExclusionViolation, isUniqueViolation, violatedConstraint } from '../../db/errors.ts'
import { reservationChanges, stays } from '../../db/schema/reservations.ts'
import { rooms } from '../../db/schema/rooms.ts'
import { setStatusInTx } from '../../rooms/status/set-status.ts'
import { type Access, can, requireFeature, scopeToProperties } from '../../tenancy/access.ts'
import { hotelNotFound } from '../../tenancy/errors.ts'
import { changeAlreadySaved } from '../change/errors.ts'
import { type Loaded, loadForChange, requireVersion } from '../change/load.ts'
import { requestHashOf } from '../change/transaction.ts'
import { type BookingHotel, holdBookingHotel, type Reader, type Tx } from '../context.ts'
import { noPermission } from '../errors.ts'
import { keepEarlierNights, nightsFrom } from '../in-house.ts'
import {
  MOVE_ONLY,
  moveReasonRequired,
  noNightLeft,
  notMovable,
  roomTaken,
  roomWrongType,
  stayNotFound,
  undoRoomTaken,
} from './errors.ts'
import { conflictError, lockRoomsForStay, requireFits, roomConflict } from './room-check.ts'

type Input = ReturnType<typeof assignRoomInputSchema.parse>

export function requireRoomMove(access: Access): void {
  requireFeature(access, 'front_desk')
  if (!can(access, 'room.move')) throw noPermission(MOVE_ONLY)
}

// Why a stay can't change rooms now, or null: confirmed stays arriving from the business date on,
// and in-house stays with a night left (brick 8).
export function movableProblem(
  loaded: Loaded,
  stay: { status: string; arrival: string; departure: string },
  hotel: Pick<BookingHotel, 'businessDate'>,
): string | null {
  const r = loaded.reservation
  if (r.status === 'cancelled') return 'This booking was cancelled, so it holds no room.'
  if (r.status === 'no_show') return 'This booking was marked no-show, so it holds no room.'
  if (stay.status === 'checked_in') {
    if (stay.departure <= hotel.businessDate) {
      const name = `${loaded.guest.firstName} ${loaded.guest.lastName}`
      return `${name} leaves today. There's no night left to move.`
    }
    return null
  }
  if (stay.status !== 'confirmed') return 'This stay has ended, so it holds no room.'
  if (stay.arrival < hotel.businessDate) {
    return `Arrival was ${formatRateDate(stay.arrival)}. Mark it as a no-show.`
  }
  return null
}

// The stay's reservation and hotel, read without a lock so the hotel can be locked first. Another
// group's stay is not found; one at a hotel the member can't see answers as the hotel switch does.
export async function stayHotel(db: Reader, access: Access, stayId: string) {
  const [row] = await db
    .select({ reservationId: stays.reservationId, propertyId: stays.propertyId })
    .from(stays)
    .where(and(eq(stays.id, stayId), eq(stays.organizationId, access.organizationId)))
  if (!row) throw stayNotFound()
  if (!access.allProperties && !access.propertyIds.includes(row.propertyId)) throw hotelNotFound()
  return row
}

type RoomRef = { id: string; number: string } | null

async function replayOf(db: Reader, access: Access, key: string, hash: string) {
  const [row] = await db
    .select({
      hash: reservationChanges.requestHash,
      stayId: reservationChanges.stayId,
      reservationId: reservationChanges.reservationId,
      before: reservationChanges.before,
      after: reservationChanges.after,
      kind: reservationChanges.kind,
    })
    .from(reservationChanges)
    .where(
      and(
        eq(reservationChanges.organizationId, access.organizationId),
        eq(reservationChanges.idempotencyKey, key),
        scopeToProperties(access, reservationChanges.propertyId),
      ),
    )
  if (!row) return null
  if (row.hash !== hash || row.kind !== 'room') throw changeAlreadySaved()
  const after = row.after as { room: RoomRef; version: number; guestName: string }
  const before = row.before as { room: RoomRef }
  return {
    stayId: row.stayId ?? '',
    reservationId: row.reservationId,
    guestName: after.guestName,
    version: after.version,
    room: after.room,
    previous: before.room,
  } satisfies AssignedRoom
}

async function numberOf(db: Reader, roomId: string | null): Promise<RoomRef> {
  if (!roomId) return null
  const [row] = await db
    .select({ id: rooms.id, number: rooms.number })
    .from(rooms)
    .where(eq(rooms.id, roomId))
  return row ?? null
}

async function assignInTx(
  tx: Tx,
  access: Access,
  input: Input,
  hash: string,
): Promise<AssignedRoom> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`change:${access.organizationId}:${input.idempotencyKey}`}, 0))`,
  )
  const replayed = await replayOf(tx, access, input.idempotencyKey, hash)
  if (replayed) return replayed
  const where = await stayHotel(tx, access, input.stayId)
  // Step 2: the hotel; 2b: the reservation row.
  const hotel = await holdBookingHotel(tx, access, where.propertyId)
  const loaded = await loadForChange(tx, access, where.reservationId, true)
  const stay = loaded.stays.find((s) => s.id === input.stayId)
  if (!stay) throw stayNotFound()
  await requireVersion(tx, loaded, input.version, stay.version, hotel.timeZone)
  const problem = movableProblem(loaded, stay, hotel)
  if (problem) {
    throw stay.status === 'checked_in' ? noNightLeft(problem) : notMovable(problem)
  }
  const inHouse = stay.status === 'checked_in'
  if (inHouse && !input.roomId) {
    throw notMovable('An in-house guest always has a room. Move them to another room instead.')
  }
  if (inHouse && !input.reason && input.source !== 'undo') throw moveReasonRequired()
  const guestName = `${loaded.guest.firstName} ${loaded.guest.lastName}`
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  // The nights the move touches: all of them, or for an in-house guest from the business date on.
  const from = nightsFrom(stay, hotel.businessDate)

  // Step 3: the old and new rooms, in id order.
  const locked = await lockRoomsForStay(
    tx,
    scope,
    [stay.roomId, input.roomId].filter((id): id is string => Boolean(id)),
  )
  const previous = stay.roomId ? (locked.get(stay.roomId) ?? null) : null
  const target = input.roomId ? (locked.get(input.roomId) ?? null) : null
  if (input.roomId === stay.roomId) {
    const room = previous ? { id: previous.id, number: previous.number } : null
    return {
      stayId: stay.id,
      reservationId: loaded.reservation.id,
      guestName,
      version: stay.version,
      room,
      previous: room,
    }
  }
  if (target) {
    if (target.roomTypeId !== stay.roomTypeId) {
      throw roomWrongType(target.number, target.roomTypeName)
    }
    requireFits(target, stay)
    const conflict = await roomConflict(tx, target.id, from, stay.departure, {
      stay: stay.id,
    })
    if (conflict) {
      if (input.source === 'undo' && conflict.kind === 'stay') {
        throw undoRoomTaken(target, conflict.date, guestName, previous?.number ?? null)
      }
      throw conflictError(target, conflict)
    }
  }

  const version = stay.version + 1
  const now = new Date()
  // In house: the nights before the business date stay in the old room (decision 0030).
  const kept =
    inHouse && previous && target
      ? await keepEarlierNights(tx, scope, stay, previous, target, hotel.businessDate)
      : null
  await tx
    .update(stays)
    .set({
      roomId: target?.id ?? null,
      ...(kept ? { roomFrom: kept.roomFrom } : {}),
      version,
      updatedAt: now,
    })
    .where(eq(stays.id, stay.id))
  // The old room was slept in: dirty, through the room status service, in this transaction.
  if (inHouse && previous && target && input.source !== 'undo') {
    await setStatusInTx(tx, access, {
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
      roomId: previous.id,
      status: 'dirty',
      source: 'room_move',
      causedBy: { stayId: stay.id, reservationNumber: loaded.reservation.number },
    })
  }
  const before = { room: previous ? { id: previous.id, number: previous.number } : null }
  const after = {
    room: target ? { id: target.id, number: target.number } : null,
    version,
    guestName,
  }
  const changeId = newId()
  await tx.insert(reservationChanges).values({
    id: changeId,
    ...scope,
    reservationId: loaded.reservation.id,
    stayId: stay.id,
    kind: 'room',
    idempotencyKey: input.idempotencyKey,
    requestHash: hash,
    before,
    after,
    businessDate: hotel.businessDate,
    byMemberId: access.memberId,
    byName: access.userName,
    deviceId: access.deviceId,
  })
  const reasonWords = input.reason
    ? input.reason === 'other'
      ? (input.reasonText ?? 'Other')
      : ROOM_MOVE_REASON_LABELS[input.reason]
    : null
  const nights = { arrival: stay.arrival, departure: stay.departure }
  const roomOf = (room: typeof previous) =>
    room ? { id: room.id, number: room.number, roomTypeName: room.roomTypeName } : null
  const common = {
    entityType: 'reservation',
    entityId: loaded.reservation.id,
    propertyId: hotel.id,
    businessDate: hotel.businessDate,
    reason: reasonWords,
  }
  const detail = {
    changeId,
    stayId: stay.id,
    reservationNumber: loaded.reservation.number,
    guestName,
    ...nights,
    source: input.source,
    moveReason: input.reason ?? null,
    reasonText: input.reasonText ?? null,
    inHouse,
    fromDate: from,
    nightsKept: kept?.nightsKept ?? 0,
  }
  const event: AuditEvent = !previous
    ? {
        action: 'stay.room_assigned',
        ...common,
        before: { room: null },
        after: { ...detail, room: roomOf(target) },
      }
    : !target
      ? {
          action: 'stay.room_unassigned',
          ...common,
          before: { room: roomOf(previous) },
          after: { ...detail, room: null, unassignReason: 'manual' },
        }
      : {
          action: 'stay.room_moved',
          ...common,
          before: { room: roomOf(previous) },
          after: { ...detail, room: roomOf(target), keptBookedPrice: false },
        }
  await recordAudit(tx, access, event)
  return {
    stayId: stay.id,
    reservationId: loaded.reservation.id,
    guestName,
    version,
    room: after.room,
    previous: before.room,
  }
}

export async function assignRoom(
  db: Pick<Database, 'transaction' | 'select'>,
  access: Access,
  input: AssignRoomInput,
): Promise<AssignedRoom> {
  requireRoomMove(access)
  const parsed = assignRoomInputSchema.parse(input)
  const hash = requestHashOf(parsed)
  try {
    return await db.transaction((tx) => assignInTx(tx, access, parsed, hash))
  } catch (error) {
    if (
      isUniqueViolation(error) &&
      violatedConstraint(error) === 'reservation_changes_organization_id_idempotency_key_unique'
    ) {
      const replayed = await replayOf(db, access, parsed.idempotencyKey, hash)
      if (replayed) return replayed
      throw changeAlreadySaved()
    }
    // The exclusion constraint caught what the room lock should have: say it as a taken room.
    if (isExclusionViolation(error)) {
      const room = await numberOf(db, parsed.roomId)
      if (room) throw roomTaken(room, '')
    }
    throw error
  }
}
