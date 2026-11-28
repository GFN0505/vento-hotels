// Is a room free for a stay's nights? Read under the room's lock (lock step 3) by everything that
// puts a stay in a room or takes a room off sale: assign and move, a modify with a room, a booking
// from a chart cell and out of order. Because every one of them locks the room row first, the
// stay-against-out-of-order check (two tables) can't be passed by two of them at once; the
// exclusion constraints on stays and room_out_of_order are the last line of defence.
import { shortGuestName } from '@vento/shared'
import { and, asc, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm'
import { guests, stays } from '../../db/schema/reservations.ts'
import { roomOutOfOrder, rooms, roomTypes } from '../../db/schema/rooms.ts'
import type { Reader, Tx } from '../context.ts'
import { roomFromSql } from '../room-from.ts'
import {
  roomOutOfOrder as outOfOrderError,
  roomNotFound,
  roomRemoved,
  roomTaken,
  roomTooSmall,
  roomWrongHotel,
} from './errors.ts'

export type RoomRow = {
  id: string
  propertyId: string
  number: string
  floor: number
  roomTypeId: string
  roomTypeName: string
  maxAdults: number
  maxChildren: number
  archived: boolean
}

const columns = {
  id: rooms.id,
  propertyId: rooms.propertyId,
  number: rooms.number,
  floor: rooms.floor,
  roomTypeId: rooms.roomTypeId,
  roomTypeName: roomTypes.name,
  maxAdults: roomTypes.maxAdults,
  maxChildren: roomTypes.maxChildren,
  archivedAt: rooms.archivedAt,
}

// Rooms by id in the organization, FOR UPDATE in id order (only the room rows are locked, not their
// types). A room of another hotel is ROOM_WRONG_HOTEL; another group's is not found.
export async function lockRoomsForStay(
  tx: Tx,
  scope: { organizationId: string; propertyId: string },
  ids: readonly string[],
): Promise<Map<string, RoomRow>> {
  const unique = [...new Set(ids)].sort()
  if (unique.length === 0) return new Map()
  const rows = await tx
    .select(columns)
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(and(inArray(rooms.id, unique), eq(rooms.organizationId, scope.organizationId)))
    .orderBy(asc(rooms.id))
    .for('update', { of: rooms })
  if (rows.length !== unique.length) throw roomNotFound()
  if (rows.some((row) => row.propertyId !== scope.propertyId)) throw roomWrongHotel()
  return new Map(rows.map((row) => [row.id, toRow(row)]))
}

// The same, read without a lock (quotes and the dialog).
export async function readRoom(
  db: Reader,
  scope: { organizationId: string; propertyId: string },
  id: string,
): Promise<RoomRow> {
  const [row] = await db
    .select(columns)
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(and(eq(rooms.id, id), eq(rooms.organizationId, scope.organizationId)))
  if (!row) throw roomNotFound()
  if (row.propertyId !== scope.propertyId) throw roomWrongHotel()
  return toRow(row)
}

function toRow(row: {
  id: string
  propertyId: string
  number: string
  floor: number
  roomTypeId: string
  roomTypeName: string
  maxAdults: number
  maxChildren: number
  archivedAt: Date | null
}): RoomRow {
  const { archivedAt, ...rest } = row
  return { ...rest, archived: archivedAt !== null }
}

export type RoomConflict =
  | {
      kind: 'stay'
      date: string
      stayId: string
      guestName: string
      guestShort: string
      arrival: string
      departure: string
    }
  | { kind: 'out_of_order'; date: string; periodId: string; from: string; to: string }

// The first night of [from, to) the room isn't free: another confirmed or checked-in stay in it, or
// an active out-of-order period. `exceptStay` is the stay being moved or changed; `exceptPeriod`
// the period whose dates are being changed.
export async function roomConflict(
  db: Reader,
  roomId: string,
  from: string,
  to: string,
  except: { stay?: string; period?: string } = {},
): Promise<RoomConflict | null> {
  const [taken] = await db
    .select({
      id: stays.id,
      // In this room from (an in-house stay that moved here: the move's business date).
      from: roomFromSql,
      arrival: stays.arrival,
      departure: stays.departure,
      firstName: guests.firstName,
      lastName: guests.lastName,
    })
    .from(stays)
    .innerJoin(guests, eq(guests.id, stays.guestId))
    .where(
      and(
        eq(stays.roomId, roomId),
        inArray(stays.status, ['confirmed', 'checked_in']),
        sql`${roomFromSql}::date < ${to}`,
        gt(stays.departure, from),
        except.stay ? ne(stays.id, except.stay) : undefined,
      ),
    )
    .orderBy(asc(roomFromSql))
    .limit(1)
  const [period] = await db
    .select({
      id: roomOutOfOrder.id,
      from: roomOutOfOrder.fromDate,
      to: roomOutOfOrder.backInService,
    })
    .from(roomOutOfOrder)
    .where(
      and(
        eq(roomOutOfOrder.roomId, roomId),
        eq(roomOutOfOrder.status, 'active'),
        lt(roomOutOfOrder.fromDate, to),
        gt(roomOutOfOrder.backInService, from),
        except.period ? ne(roomOutOfOrder.id, except.period) : undefined,
      ),
    )
    .orderBy(asc(roomOutOfOrder.fromDate))
    .limit(1)
  const stayFirst = taken ? (taken.from > from ? taken.from : from) : null
  const periodFirst = period ? (period.from > from ? period.from : from) : null
  if (taken && stayFirst && (!periodFirst || stayFirst <= periodFirst)) {
    return {
      kind: 'stay',
      date: stayFirst,
      stayId: taken.id,
      guestName: `${taken.firstName} ${taken.lastName}`,
      guestShort: shortGuestName(taken.firstName, taken.lastName),
      arrival: taken.arrival,
      departure: taken.departure,
    }
  }
  if (period && periodFirst) {
    return {
      kind: 'out_of_order',
      date: periodFirst,
      periodId: period.id,
      from: period.from,
      to: period.to,
    }
  }
  return null
}

// Checks a locked room can take a stay: active, big enough, free every night. Throws the spec's
// errors; the caller decides what a busy room means (refused, or unassigned on a modify).
export function requireFits(room: RoomRow, party: { adults: number; children: number }) {
  if (room.archived) throw roomRemoved(room.number)
  if (party.adults > room.maxAdults || party.children > room.maxChildren) {
    throw roomTooSmall(room.number, room.maxAdults, room.maxChildren)
  }
}

export function conflictError(room: RoomRow, conflict: RoomConflict) {
  return conflict.kind === 'stay'
    ? roomTaken(room, conflict.date)
    : outOfOrderError(room, conflict.from, conflict.to)
}

// Ids of rooms (of those given) busy on any night of [from, to), and their first conflict, in two
// queries: for the Room move dialog's lists.
export async function busyRooms(
  db: Reader,
  propertyId: string,
  from: string,
  to: string,
  exceptStay: string,
): Promise<Set<string>> {
  const taken = await db
    .select({ roomId: stays.roomId })
    .from(stays)
    .where(
      and(
        eq(stays.propertyId, propertyId),
        inArray(stays.status, ['confirmed', 'checked_in']),
        sql`${roomFromSql}::date < ${to}`,
        gt(stays.departure, from),
        ne(stays.id, exceptStay),
      ),
    )
  const off = await db
    .select({ roomId: roomOutOfOrder.roomId })
    .from(roomOutOfOrder)
    .where(
      and(
        eq(roomOutOfOrder.propertyId, propertyId),
        eq(roomOutOfOrder.status, 'active'),
        lt(roomOutOfOrder.fromDate, to),
        gt(roomOutOfOrder.backInService, from),
      ),
    )
  return new Set(
    [...taken.map((row) => row.roomId), ...off.map((row) => row.roomId)].filter(
      (id): id is string => id !== null,
    ),
  )
}

// Whether a room of the booked type, other than the stay's own, is free every night of [from, to):
// while one is, a move to another type isn't offered or allowed (only a full booked type opens the
// upgrade path).
export async function bookedTypeHasFreeRoom(
  db: Reader,
  stay: { id: string; propertyId: string; roomTypeId: string; roomId: string | null },
  from: string,
  to: string,
): Promise<boolean> {
  const busy = await busyRooms(db, stay.propertyId, from, to, stay.id)
  const candidates = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(
      and(
        eq(rooms.roomTypeId, stay.roomTypeId),
        eq(rooms.propertyId, stay.propertyId),
        isNull(rooms.archivedAt),
      ),
    )
  return candidates.some((room) => room.id !== stay.roomId && !busy.has(room.id))
}
