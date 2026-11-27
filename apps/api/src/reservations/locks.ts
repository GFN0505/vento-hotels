// Availability: the inventory rows and their locks (decision 0007).
//
// Lock order, everywhere (so no two transactions can deadlock):
//   1. the hotel's rates advisory lock (shared for quotes and bookings, exclusive for rates writes)
//   2. the hotel's properties row (FOR SHARE for bookings and room writes; FOR UPDATE for hotel
//      archive and night audit)
//   3. rooms FOR UPDATE, then room types (room writes only)
//   4. room_type_inventory rows FOR UPDATE, ordered by room type id, then date
//   5. the guest row (an existing guest being corrected)
//   6. the reservation counter row (upsert)
// Code that takes more than one takes them in this order. Room count changes (rooms/room-count.ts)
// take 2 → 3 → 4 without the rates lock: they never touch prices, and bookings never lock rooms or
// room types, so there is no cycle.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { roomTypeInventory } from '../db/schema/reservations.ts'
import { rooms, roomTypes } from '../db/schema/rooms.ts'
import type { Reader, Tx } from './context.ts'

export type Scope = { organizationId: string; propertyId: string }
export type NightKey = { roomTypeId: string; date: string }

export const keyOf = (key: NightKey) => `${key.roomTypeId}:${key.date}`

function unique(keys: readonly NightKey[]): NightKey[] {
  const byKey = new Map(keys.map((key) => [keyOf(key), key]))
  return [...byKey.values()]
}

// Creates any missing rows (booked 0) in one statement, in lock order. A row is created on first use.
export async function ensureInventory(tx: Tx, scope: Scope, keys: readonly NightKey[]) {
  const list = unique(keys)
  if (list.length === 0) return
  const types = list.map((key) => key.roomTypeId)
  const dates = list.map((key) => key.date)
  await tx.execute(sql`
    insert into ${roomTypeInventory} (organization_id, property_id, room_type_id, date)
    select ${scope.organizationId}::uuid, ${scope.propertyId}::uuid, k.room_type_id, k.date
    from unnest(${sql.param(types)}::uuid[], ${sql.param(dates)}::date[]) as k(room_type_id, date)
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

export type Capacity = { name: string; rooms: number; limit: number }

// Active rooms and the overbooking limit per room type, counted live (read after the inventory
// lock, so a room archived by a transaction that held it is seen). Out-of-order rooms reduce this
// from brick 7.
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
  return new Map(
    rows.map((row) => [row.id, { name: row.name, rooms: Number(row.rooms), limit: row.limit }]),
  )
}

// Rooms left as shown (never below 0) and whether `wanted` more can be sold on a night.
export function leftOn(capacity: Capacity | undefined, booked: number) {
  const rooms = capacity?.rooms ?? 0
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
