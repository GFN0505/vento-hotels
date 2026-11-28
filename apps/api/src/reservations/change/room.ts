// The room of a changed stay (brick 7, spec: "Modify (brick 6) keeps the room"). A room id moves the
// stay into that room, which must be free every night (refused otherwise); null removes the room;
// left out, the stay keeps its room when it is of the same type and free on every night, and is
// unassigned otherwise. Quotes read it without a lock; modify locks the room first (step 3).
import type { ChangeQuote } from '@vento/shared'
import { bookedTypeFree, roomWrongType } from '../assign/errors.ts'
import {
  bookedTypeHasFreeRoom,
  type RoomConflict,
  type RoomRow,
  readRoom,
  requireFits,
  roomConflict,
} from '../assign/room-check.ts'
import type { Reader } from '../context.ts'
import type { StayRow } from './load.ts'
import type { ChangeFields } from './price-change.ts'

export type TargetRoom = { id: string; asked: boolean } | null

export function targetRoomOf(stay: StayRow, input: ChangeFields): TargetRoom {
  if (input.roomId !== undefined) return input.roomId ? { id: input.roomId, asked: true } : null
  if (stay.roomId && input.roomTypeId === stay.roomTypeId) return { id: stay.roomId, asked: false }
  return null
}

// Why the stay would lose its room, for the audit trail.
export function unassignReason(stay: StayRow, input: ChangeFields) {
  if (!stay.roomId || input.roomId !== undefined) return null
  return input.roomTypeId !== stay.roomTypeId ? 'modify_type_change' : 'modify_not_free'
}

// A room asked for must be of the new type and fit the party (an asked room that isn't free is
// refused by the caller; a kept one is dropped).
export function requireAskedRoom(room: RoomRow, input: ChangeFields) {
  if (room.roomTypeId !== input.roomTypeId) throw roomWrongType(room.number, room.roomTypeName)
  requireFits(room, input)
}

const blockedWords = (conflict: RoomConflict | null) =>
  !conflict ? null : conflict.kind === 'stay' ? conflict.guestShort : 'Out of order'

// The quote's room line: "Room 502 is free on the new nights." / "Room 502 isn't free on 28 Nov
// (Kalu E.). The booking will be unassigned."
export async function quoteRoom(
  db: Reader,
  scope: { organizationId: string; propertyId: string },
  stay: StayRow,
  input: ChangeFields,
  from: string = input.arrival,
): Promise<{ room: ChangeQuote['room']; roomBefore: ChangeQuote['roomBefore'] }> {
  const before = stay.roomId ? await readRoom(db, scope, stay.roomId) : null
  const roomBefore = before ? { id: before.id, number: before.number } : null
  const target = targetRoomOf(stay, input)
  if (!target) return { room: null, roomBefore }
  const room = target.id === before?.id ? before : await readRoom(db, scope, target.id)
  if (target.asked) requireAskedRoom(room, input)
  if (target.asked && room.roomTypeId !== stay.roomTypeId) {
    if (await bookedTypeHasFreeRoom(db, stay, from, input.departure)) {
      throw bookedTypeFree(stay.roomTypeName)
    }
  }
  // An in-house guest's room matters from the business date on (decision 0030).
  const conflict = await roomConflict(db, room.id, from, input.departure, {
    stay: stay.id,
  })
  return {
    room: {
      id: room.id,
      number: room.number,
      free: conflict === null && !room.archived,
      blockedOn: conflict?.date ?? null,
      blockedBy: blockedWords(conflict),
      asked: target.asked,
    },
    roomBefore,
  }
}
