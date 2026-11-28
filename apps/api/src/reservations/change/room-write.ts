// The room inside reservations.modify (brick 7): locked at step 3, after the reservation row and
// before the inventory rows, checked free for every night of the changed stay, and recorded. A room
// asked for that isn't free refuses the change; a room kept that isn't free any more is dropped and
// the stay comes out unassigned (said on reservation.modified, not as its own event).
import type { AuditEvent } from '../../audit/record.ts'
import { bookedTypeFree, roomRemoved } from '../assign/errors.ts'
import {
  bookedTypeHasFreeRoom,
  conflictError,
  lockRoomsForStay,
  type RoomRow,
  readRoom,
  roomConflict,
} from '../assign/room-check.ts'
import type { Tx } from '../context.ts'
import type { StayRow } from './load.ts'
import type { ChangeFields } from './price-change.ts'
import { requireAskedRoom, targetRoomOf, unassignReason } from './room.ts'

type Scope = { organizationId: string; propertyId: string }

export type SettledRoom = {
  before: RoomRow | null
  after: RoomRow | null
  asked: boolean
  // Why a room the stay had was dropped: another type, or busy on a new night.
  unassigned: 'modify_type_change' | 'modify_not_free' | 'manual' | null
}

export const roomChanges = (stay: StayRow, input: ChangeFields) =>
  input.roomId !== undefined && input.roomId !== stay.roomId

export async function settleRoom(
  tx: Tx,
  scope: Scope,
  stay: StayRow,
  input: ChangeFields,
): Promise<SettledRoom> {
  const before = stay.roomId ? await readRoom(tx, scope, stay.roomId) : null
  const target = targetRoomOf(stay, input)
  if (!target) {
    const reason = input.roomId === null && stay.roomId ? 'manual' : unassignReason(stay, input)
    return { before, after: null, asked: input.roomId !== undefined, unassigned: reason }
  }
  const room = (await lockRoomsForStay(tx, scope, [target.id])).get(target.id)
  if (!room) return { before, after: null, asked: target.asked, unassigned: null }
  if (target.asked) requireAskedRoom(room, input)
  // A room of another type (the Room move flow): only when the booked type has none free.
  if (target.asked && room.roomTypeId !== stay.roomTypeId) {
    if (await bookedTypeHasFreeRoom(tx, stay, input.arrival, input.departure)) {
      throw bookedTypeFree(stay.roomTypeName)
    }
  }
  const conflict = await roomConflict(tx, room.id, input.arrival, input.departure, {
    stay: stay.id,
  })
  if (!conflict && !room.archived) {
    return { before, after: room, asked: target.asked, unassigned: null }
  }
  if (target.asked) {
    if (room.archived) throw roomRemoved(room.number)
    if (conflict) throw conflictError(room, conflict)
  }
  return { before, after: null, asked: false, unassigned: 'modify_not_free' }
}

const roomOf = (room: RoomRow | null) =>
  room ? { id: room.id, number: room.number, roomTypeName: room.roomTypeName } : null

// stay.room_assigned or stay.room_moved for a room asked for on a modify (a move to another type
// dropped on a room, or a drag that keeps its room); null when the room didn't change or was only
// dropped.
export function roomEvent(
  room: SettledRoom,
  context: {
    at: { entityType: string; entityId: string; propertyId: string; businessDate: string }
    changeId: string
    stayId: string
    reservationNumber: string
    guestName: string
    arrival: string
    departure: string
    keptBookedPrice: boolean
    approverMemberId: string | null
    approverName: string | null
    source: string
  },
): AuditEvent | null {
  if (!room.asked || room.before?.id === room.after?.id) return null
  const detail = {
    changeId: context.changeId,
    stayId: context.stayId,
    reservationNumber: context.reservationNumber,
    guestName: context.guestName,
    arrival: context.arrival,
    departure: context.departure,
    source: context.source === 'tape_chart' ? 'chart_drag' : 'dialog',
    keptBookedPrice: context.keptBookedPrice,
    approverName: context.approverName,
  }
  const reason = context.keptBookedPrice ? 'Upgrade at the booked price' : null
  if (!room.after) {
    return {
      action: 'stay.room_unassigned',
      ...context.at,
      reason,
      before: { room: roomOf(room.before) },
      after: { ...detail, room: null, unassignReason: 'manual' },
    }
  }
  return {
    action: room.before ? 'stay.room_moved' : 'stay.room_assigned',
    ...context.at,
    reason,
    approverMemberId: context.approverMemberId,
    before: { room: roomOf(room.before) },
    after: { ...detail, room: roomOf(room.after) },
  }
}
