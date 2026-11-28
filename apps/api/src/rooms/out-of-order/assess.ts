// What stops a room going out of order for some nights (spec: "Out of order", checks 1–3): a stay
// assigned to it, another active period of it, or a night that would hold more bookings than rooms
// plus the overbooking limit (unassigned bookings count, because they are counted on the inventory
// row). Read live for the dialog, and again inside the write under the room's lock and its type's
// inventory locks.
import { nightsOf, roomsLeft } from '@vento/shared'
import { and, asc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm'
import { guests, stays } from '../../db/schema/reservations.ts'
import { roomOutOfOrder } from '../../db/schema/rooms.ts'
import type { Reader } from '../../reservations/context.ts'
import { type Capacity, capacityOf, roomsOn } from '../../reservations/locks.ts'
import { roomFromSql } from '../../reservations/room-from.ts'

export type Assessment = {
  blockers: {
    stayId: string
    reservationId: string
    guestName: string
    arrival: string
    departure: string
  }[]
  overlap: { from: string; to: string } | null
  shortfalls: { date: string; short: number }[]
  left: { date: string; left: number }[]
  capacity: Capacity | undefined
}

export async function assess(
  db: Reader,
  scope: { organizationId: string; propertyId: string },
  ask: {
    roomId: string
    roomTypeId: string
    from: string
    to: string
    // A period whose dates are being changed: its own nights don't count against it.
    periodId?: string | undefined
    // Nights the change adds (all of them for a new period): only these are checked for shortfalls.
    added: readonly string[]
  },
  booked: (date: string) => number,
): Promise<Assessment> {
  const blockers = await db
    .select({
      stayId: stays.id,
      reservationId: stays.reservationId,
      firstName: guests.firstName,
      lastName: guests.lastName,
      arrival: stays.arrival,
      departure: stays.departure,
    })
    .from(stays)
    .innerJoin(guests, eq(guests.id, stays.guestId))
    .where(
      and(
        eq(stays.roomId, ask.roomId),
        inArray(stays.status, ['confirmed', 'checked_in']),
        // From the night the stay is in this room (decision 0030).
        sql`${roomFromSql}::date < ${ask.to}`,
        gt(stays.departure, ask.from),
      ),
    )
    .orderBy(asc(stays.arrival))
  const [other] = await db
    .select({ from: roomOutOfOrder.fromDate, to: roomOutOfOrder.backInService })
    .from(roomOutOfOrder)
    .where(
      and(
        eq(roomOutOfOrder.roomId, ask.roomId),
        eq(roomOutOfOrder.status, 'active'),
        lt(roomOutOfOrder.fromDate, ask.to),
        gt(roomOutOfOrder.backInService, ask.from),
        ask.periodId ? ne(roomOutOfOrder.id, ask.periodId) : undefined,
      ),
    )
    .orderBy(asc(roomOutOfOrder.fromDate))
    .limit(1)
  const loaded = (await capacityOf(db, scope, [ask.roomTypeId])).get(ask.roomTypeId)
  // The type without the period being changed, so its own nights aren't counted twice.
  const capacity: Capacity | undefined = loaded && {
    ...loaded,
    outOfOrder: loaded.outOfOrder.filter((period) => period.id !== ask.periodId),
  }
  const added = new Set(ask.added)
  const left = nightsOf(ask.from, ask.to).map((date) => {
    const rooms = roomsOn(capacity, date) - 1
    return { date, left: roomsLeft(rooms, 0, booked(date)).left }
  })
  const shortfalls = left
    .filter((night) => added.has(night.date))
    .map((night) => ({ date: night.date, short: -(night.left + (capacity?.limit ?? 0)) }))
    .filter((night) => night.short > 0)
  return {
    blockers: blockers.map((row) => ({
      stayId: row.stayId,
      reservationId: row.reservationId,
      guestName: `${row.firstName} ${row.lastName}`,
      arrival: row.arrival,
      departure: row.departure,
    })),
    overlap: other ?? null,
    shortfalls,
    left,
    capacity,
  }
}
