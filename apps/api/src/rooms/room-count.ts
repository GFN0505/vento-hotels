// The one place a change to the number of active rooms in a type is announced. Every write that can
// take rooms away from a type (archive, change of type, type archive) calls this inside its
// transaction, after the change, with the types that lost rooms. Adding rooms needs no check.
//
// It creates the types' inventory rows from the business date to the last rate date (eagerly: a
// missing row would let a booking skip waiting for this transaction), locks them in room type,
// then date order, and refuses the change if any night would hold more bookings than rooms plus
// the overbooking limit. Lock order: property → rooms → room types → inventory, with no rates lock
// (reservations/locks.ts explains why that can't deadlock with a booking).
import { ORPCError } from '@orpc/server'
import { addDays, formatRateDate, lastRateDate, nightsBetween } from '@vento/shared'
import { and, asc, eq, gt, inArray } from 'drizzle-orm'
import { stays } from '../db/schema/reservations.ts'
import { roomOutOfOrder } from '../db/schema/rooms.ts'
import { roomsBooked } from '../reservations/errors.ts'
import { capacityOf, keyOf, lockInventory, roomsOn } from '../reservations/locks.ts'
import type { Tx } from './context.ts'

export async function roomCountChanged(
  tx: Tx,
  change: {
    organizationId: string
    propertyId: string
    businessDate: string
    removedFrom: readonly string[]
  },
): Promise<void> {
  const types = [...new Set(change.removedFrom)].sort()
  if (types.length === 0) return
  const scope = { organizationId: change.organizationId, propertyId: change.propertyId }
  const last = lastRateDate(change.businessDate)
  const count = nightsBetween(change.businessDate, last) + 1
  const keys = types.flatMap((roomTypeId) =>
    Array.from({ length: count }, (_, i) => ({
      roomTypeId,
      date: addDays(change.businessDate, i),
    })),
  )
  const booked = await lockInventory(tx, scope, keys)
  // Counted after the lock and after this transaction's own change.
  const capacity = await capacityOf(tx, scope, types)
  for (const key of keys) {
    const sold = booked.get(keyOf(key)) ?? 0
    if (sold === 0) continue
    const type = capacity.get(key.roomTypeId)
    // Rooms out of order that night are not there to sell (brick 7).
    const rooms = roomsOn(type, key.date)
    const limit = type?.limit ?? 0
    if (sold > rooms + limit)
      throw roomsBooked(type?.name ?? 'This room type', key.date, sold, rooms, limit)
  }
}

// Brick 7: a room leaving its type (archived, or moved to another type) can't take a booking or an
// out-of-order period with it. Called with the rooms locked (lock step 3), so no assignment or
// out-of-order change can land on them meanwhile.
export async function requireRoomsFree(
  tx: Tx,
  change: { businessDate: string; rooms: readonly { id: string; number: string }[] },
): Promise<void> {
  if (change.rooms.length === 0) return
  const ids = change.rooms.map((room) => room.id)
  const numberOf = (id: string) => change.rooms.find((room) => room.id === id)?.number ?? ''
  const [booked] = await tx
    .select({ roomId: stays.roomId, arrival: stays.arrival, departure: stays.departure })
    .from(stays)
    .where(
      and(
        inArray(stays.roomId, ids),
        inArray(stays.status, ['confirmed', 'checked_in']),
        gt(stays.departure, change.businessDate),
      ),
    )
    .orderBy(asc(stays.arrival))
    .limit(1)
  if (booked?.roomId) {
    const night = [booked.arrival, change.businessDate].sort().at(-1) ?? booked.arrival
    throw new ORPCError('CONFLICT', {
      message: `Room ${numberOf(booked.roomId)} has a booking on ${formatRateDate(night, false)}. Move it first.`,
      data: { code: 'ROOM_HAS_BOOKINGS' },
    })
  }
  const [period] = await tx
    .select({ roomId: roomOutOfOrder.roomId })
    .from(roomOutOfOrder)
    .where(
      and(
        inArray(roomOutOfOrder.roomId, ids),
        eq(roomOutOfOrder.status, 'active'),
        gt(roomOutOfOrder.backInService, change.businessDate),
      ),
    )
    .limit(1)
  if (period) {
    throw new ORPCError('CONFLICT', {
      message: `End ${numberOf(period.roomId)}'s out-of-order first.`,
      data: { code: 'ROOM_OUT_OF_ORDER_PERIOD' },
    })
  }
}
