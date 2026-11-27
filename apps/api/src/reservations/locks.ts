// Availability: the inventory rows and their locks (decision 0007).
//
// Lock order, everywhere (so no two transactions can deadlock):
//   1. the hotel's rates advisory lock (shared for quotes and bookings, exclusive for rates writes)
//   2. the hotel's properties row (FOR SHARE for bookings and room writes; FOR UPDATE for hotel
//      archive and night audit)
//   2b. the reservation row FOR UPDATE (modify, cancel, no-show and penalty waivers, brick 6; one
//      change per reservation at a time). Bookings never lock existing reservations, so no cycle.
//   3. rooms FOR UPDATE in id order, then room types (room writes). Brick 7: assigning or moving a
//      room locks the old and new rooms here (after 2b), a booking from a chart cell and a modify
//      with a room lock the target room here, and out of order locks its room here; Mark clean /
//      dirty locks only its room row and nothing after.
//   4. room_type_inventory rows FOR UPDATE, ordered by room type id, then date
//   5. approval rows FOR UPDATE, all of the request's at once in id order (approvals/use.ts); the
//      expiry job skips locked rows, so it never waits on a booking
//   5b. the penalty row (a waiver of a recorded penalty, brick 6)
//   6. the guest row (an existing guest being corrected)
//   7. the reservation counter row (upsert)
// Code that takes more than one takes them in this order. Room count changes (rooms/room-count.ts)
// take 2 → 3 → 4 without the rates lock: they never touch prices, and bookings never lock rooms or
// room types, so there is no cycle. Answering an approval locks its row, then the approver's
// member_pins row; bookings never lock member_pins, so that is no cycle either. Answering a penalty
// waiver takes the hotel row FOR SHARE (2) and the reservation row (2b), both looked up from the
// approval without a lock, then the approval, then the PIN row, then the penalty (decision 0028).
// The hotel comes before the reservation everywhere (cancel, no-show, waivers), so night audit and
// hotel archive (hotel FOR UPDATE, then whatever they lock after) can't cycle with a waiver. A change locks the inventory rows
// for the union of its old and new nights in one statement, room type then date.
// Brick 7's users: a same-type assign or move takes 2 → 2b → 3 (no inventory); a move to another
// type or a drag-extend with a room is a modify: 1 → 2 → 2b → 3 (the target room) → 4 → 5; a booking
// from a cell 1 → 2 → 3 → 4 → …; out of order (create, change, end) 2 → 3 → 4 for its type's nights.
// The stay-against-out-of-order check is made under the room's lock (every assignment and every
// out-of-order write locks the room row), so the two can't both pass.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { roomTypeInventory } from '../db/schema/reservations.ts'
import { roomOutOfOrder, rooms, roomTypes } from '../db/schema/rooms.ts'
import type { Reader, Tx } from './context.ts'

export type Scope = { organizationId: string; propertyId: string }
export type NightKey = { roomTypeId: string; date: string }

export const keyOf = (key: NightKey) => `${key.roomTypeId}:${key.date}`

function unique(keys: readonly NightKey[]): NightKey[] {
  const byKey = new Map(keys.map((key) => [keyOf(key), key]))
  return [...byKey.values()]
}

// Creates any missing rows (booked 0) in one statement, in lock order. A row is created on first use.
// Only for room types of this hotel: an id from elsewhere gets no row, and the caller then answers
// "We couldn't find that room type" instead of failing on the foreign key.
export async function ensureInventory(tx: Tx, scope: Scope, keys: readonly NightKey[]) {
  const list = unique(keys)
  if (list.length === 0) return
  const types = list.map((key) => key.roomTypeId)
  const dates = list.map((key) => key.date)
  await tx.execute(sql`
    insert into ${roomTypeInventory} (organization_id, property_id, room_type_id, date)
    select ${scope.organizationId}::uuid, ${scope.propertyId}::uuid, k.room_type_id, k.date
    from unnest(${sql.param(types)}::uuid[], ${sql.param(dates)}::date[]) as k(room_type_id, date)
    where exists (
      select 1 from ${roomTypes} rt
      where rt.id = k.room_type_id and rt.property_id = ${scope.propertyId}::uuid
    )
    order by k.room_type_id, k.date
    on conflict (room_type_id, date) do nothing`)
}

// Locks the rows (creating them first) in room type, then date order, and returns rooms booked per
// key. Held until the transaction ends.
export async function lockInventory(
  tx: Tx,
  scope: Scope,
  keys: readonly NightKey[],
): Promise<Map<string, number>> {
  const list = unique(keys)
  await ensureInventory(tx, scope, list)
  if (list.length === 0) return new Map()
  const types = list.map((key) => key.roomTypeId)
  const dates = list.map((key) => key.date)
  const rows = await tx.execute<{ room_type_id: string; date: string; booked: number }>(sql`
    select i.room_type_id, i.date::text as date, i.booked
    from ${roomTypeInventory} i
    join unnest(${sql.param(types)}::uuid[], ${sql.param(dates)}::date[]) as k(room_type_id, date)
      on k.room_type_id = i.room_type_id and k.date = i.date
    where i.organization_id = ${scope.organizationId} and i.property_id = ${scope.propertyId}
    order by i.room_type_id, i.date
    for update of i`)
  return new Map(rows.rows.map((row) => [`${row.room_type_id}:${row.date}`, row.booked]))
}

// Rooms booked per key without locking (reads); missing rows are 0.
export async function bookedFor(
  db: Reader,
  scope: Scope,
  roomTypeIds: readonly string[],
  from: string,
  to: string,
): Promise<Map<string, number>> {
  if (roomTypeIds.length === 0) return new Map()
  const rows = await db
    .select({
      roomTypeId: roomTypeInventory.roomTypeId,
      date: roomTypeInventory.date,
      booked: roomTypeInventory.booked,
    })
    .from(roomTypeInventory)
    .where(
      and(
        eq(roomTypeInventory.organizationId, scope.organizationId),
        eq(roomTypeInventory.propertyId, scope.propertyId),
        inArray(roomTypeInventory.roomTypeId, [...roomTypeIds]),
        sql`${roomTypeInventory.date} between ${from} and ${to}`,
      ),
    )
  return new Map(rows.map((row) => [keyOf(row), row.booked]))
}

export type Capacity = {
  name: string
  rooms: number
  limit: number
  // Active out-of-order periods of the type's active rooms (brick 7): each takes one room off on
  // every night from `from` until `to` (exclusive).
  outOfOrder: { id: string; from: string; to: string }[]
}

// Rooms of a type that can be sold on a night: active rooms less those out of order that night.
export function roomsOn(capacity: Capacity | undefined, date: string): number {
  if (!capacity) return 0
  const off = capacity.outOfOrder.filter((period) => period.from <= date && date < period.to)
  return capacity.rooms - off.length
}

// Active rooms, out-of-order periods and the overbooking limit per room type, counted live (read
// after the inventory lock, so a room archived or put out of order by a transaction that held it
// is seen).
export async function capacityOf(
  db: Reader,
  scope: Scope,
  roomTypeIds: readonly string[],
): Promise<Map<string, Capacity>> {
  if (roomTypeIds.length === 0) return new Map()
  const rows = await db
    .select({
      id: roomTypes.id,
      name: roomTypes.name,
      limit: roomTypes.overbookingLimit,
      // Written with the table name: Drizzle leaves columns unqualified inside a subquery.
      rooms: sql<number>`(select count(*) from ${rooms} r where r.room_type_id = ${roomTypes}.id and r.archived_at is null)::int`,
    })
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.organizationId, scope.organizationId),
        eq(roomTypes.propertyId, scope.propertyId),
        inArray(roomTypes.id, [...roomTypeIds]),
        isNull(roomTypes.archivedAt),
      ),
    )
  const periods = rows.length
    ? await db
        .select({
          id: roomOutOfOrder.id,
          roomTypeId: rooms.roomTypeId,
          from: roomOutOfOrder.fromDate,
          to: roomOutOfOrder.backInService,
        })
        .from(roomOutOfOrder)
        .innerJoin(rooms, eq(rooms.id, roomOutOfOrder.roomId))
        .where(
          and(
            eq(roomOutOfOrder.organizationId, scope.organizationId),
            eq(roomOutOfOrder.propertyId, scope.propertyId),
            eq(roomOutOfOrder.status, 'active'),
            isNull(rooms.archivedAt),
            inArray(
              rooms.roomTypeId,
              rows.map((row) => row.id),
            ),
          ),
        )
    : []
  return new Map(
    rows.map((row) => [
      row.id,
      {
        name: row.name,
        rooms: Number(row.rooms),
        limit: row.limit,
        outOfOrder: periods
          .filter((period) => period.roomTypeId === row.id)
          .map((period) => ({ id: period.id, from: period.from, to: period.to })),
      },
    ]),
  )
}

// Rooms left on a night as shown (never below 0) and how many more can be sold (rooms left plus the
// overbooking limit).
export function leftOn(capacity: Capacity | undefined, booked: number, date: string) {
  const rooms = roomsOn(capacity, date)
  const limit = capacity?.limit ?? 0
  return { left: Math.max(0, rooms - booked), bookable: rooms - booked + limit }
}

// Adds rooms booked per key, in one statement, on rows this transaction has locked.
export async function addBooked(tx: Tx, scope: Scope, counts: ReadonlyMap<string, number>) {
  if (counts.size === 0) return
  const entries = [...counts.entries()].map(([key, count]) => {
    const [roomTypeId = '', date = ''] = key.split(':')
    return { roomTypeId, date, count }
  })
  await tx.execute(sql`
    update ${roomTypeInventory} i
    set booked = i.booked + k.n, updated_at = now()
    from unnest(
      ${sql.param(entries.map((e) => e.roomTypeId))}::uuid[],
      ${sql.param(entries.map((e) => e.date))}::date[],
      ${sql.param(entries.map((e) => e.count))}::int[]
    ) as k(room_type_id, date, n)
    where i.organization_id = ${scope.organizationId} and i.property_id = ${scope.propertyId}
      and i.room_type_id = k.room_type_id and i.date = k.date`)
}
