// The one place a change to the number of active rooms in a type is announced. Every write that can
// take rooms away from a type (archive, change of type, type archive) calls this inside its
// transaction, after the change, with the types that lost rooms. Adding rooms needs no check.
//
// It creates the types' inventory rows from the business date to the last rate date (eagerly: a
// missing row would let a booking skip waiting for this transaction), locks them in room type,
// then date order, and refuses the change if any night would hold more bookings than rooms plus
// the overbooking limit. Lock order: property → rooms → room types → inventory, with no rates lock
// (reservations/locks.ts explains why that can't deadlock with a booking).
import { addDays, lastRateDate, nightsBetween } from '@vento/shared'
import { roomsBooked } from '../reservations/errors.ts'
import { capacityOf, keyOf, lockInventory } from '../reservations/locks.ts'
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
    const rooms = type?.rooms ?? 0
    const limit = type?.limit ?? 0
    if (sold > rooms + limit)
      throw roomsBooked(type?.name ?? 'This room type', key.date, sold, rooms, limit)
  }
}
