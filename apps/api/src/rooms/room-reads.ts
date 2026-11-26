// Reading rooms: the list (100 per page, floor then natural number order), the summary behind the
// filter chips and the inspected banner, one room, and which numbers a hotel already has.
import {
  type FrontOfficeStatus,
  type HousekeepingStatus,
  type PageQuery,
  pageOffset,
  type RoomDetail,
  type RoomsSummary,
  type RoomView,
  toPage,
} from '@vento/shared'
import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, type SQL, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { rooms, roomTypes } from '../db/schema/rooms.ts'
import { type Access, scopeToProperties } from '../tenancy/access.ts'
import { connectionsOf } from './connections.ts'
import { loadProperty, type Reader, requireRoomsSetup } from './context.ts'
import { roomNotFound } from './errors.ts'
import { hasHistory } from './history.ts'
import { isLive } from './live.ts'

const roomColumns = {
  id: rooms.id,
  propertyId: rooms.propertyId,
  number: rooms.number,
  floor: rooms.floor,
  roomTypeId: rooms.roomTypeId,
  roomTypeName: roomTypes.name,
  roomTypeCode: roomTypes.code,
  features: rooms.features,
  accessible: rooms.accessible,
  frontOfficeStatus: rooms.frontOfficeStatus,
  housekeepingStatus: rooms.housekeepingStatus,
  archivedAt: rooms.archivedAt,
}

type RoomRow = Omit<RoomView, 'archivedAt' | 'connectingRooms'> & {
  archivedAt: Date | null
  frontOfficeStatus: FrontOfficeStatus
  housekeepingStatus: HousekeepingStatus
}

// Rooms in the caller's organization and hotels.
export function roomsInScope(access: Access): SQL {
  return and(
    eq(rooms.organizationId, access.organizationId),
    scopeToProperties(access, rooms.propertyId),
  ) as SQL
}

// Floor, then shorter numbers first, so 1014 sorts before 1101.
const roomOrder = [asc(rooms.floor), asc(sql`length(${rooms.number})`), asc(rooms.number)]

async function withConnections(db: Reader, access: Access, rows: RoomRow[]): Promise<RoomView[]> {
  const links = await connectionsOf(
    db,
    access,
    rows.map((row) => row.id),
  )
  return rows.map((row) => ({
    ...row,
    connectingRooms: links.get(row.id) ?? [],
    archivedAt: row.archivedAt?.toISOString() ?? null,
  }))
}

const likePattern = (q: string) => `%${q.toUpperCase().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`

export async function listRooms(
  db: Database,
  access: Access,
  query: PageQuery & {
    propertyId: string
    q?: string | undefined
    roomTypeId?: string | undefined
    floor?: number | undefined
    accessible?: boolean | undefined
    archived?: boolean | undefined
    outOfOrder?: boolean | undefined
  },
) {
  requireRoomsSetup(access)
  const property = await loadProperty(db, access, query.propertyId)
  const where = and(
    roomsInScope(access),
    eq(rooms.propertyId, property.id),
    query.archived ? isNotNull(rooms.archivedAt) : isNull(rooms.archivedAt),
    query.q ? ilike(rooms.number, likePattern(query.q)) : undefined,
    query.roomTypeId ? eq(rooms.roomTypeId, query.roomTypeId) : undefined,
    query.floor !== undefined ? eq(rooms.floor, query.floor) : undefined,
    query.accessible !== undefined ? eq(rooms.accessible, query.accessible) : undefined,
    query.outOfOrder ? eq(rooms.housekeepingStatus, 'out_of_order') : undefined,
  )
  const [rows, [total]] = await Promise.all([
    db
      .select(roomColumns)
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .where(where)
      .orderBy(...roomOrder)
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db.select({ value: count() }).from(rooms).where(where),
  ])
  return toPage(await withConnections(db, access, rows), total?.value ?? 0, query)
}

export async function roomsSummary(
  db: Database,
  access: Access,
  input: { propertyId: string },
): Promise<RoomsSummary> {
  requireRoomsSetup(access)
  const property = await loadProperty(db, access, input.propertyId)
  const here = and(roomsInScope(access), eq(rooms.propertyId, property.id))
  const active = and(here, isNull(rooms.archivedAt))
  const [[totals], floors, features] = await Promise.all([
    db
      .select({
        active: sql<number>`count(*) filter (where ${rooms.archivedAt} is null)`.mapWith(Number),
        archived: sql<number>`count(*) filter (where ${rooms.archivedAt} is not null)`.mapWith(
          Number,
        ),
        accessible:
          sql<number>`count(*) filter (where ${rooms.archivedAt} is null and ${rooms.accessible})`.mapWith(
            Number,
          ),
        outOfOrder:
          sql<number>`count(*) filter (where ${rooms.archivedAt} is null and ${rooms.housekeepingStatus} = 'out_of_order')`.mapWith(
            Number,
          ),
        notDirty:
          sql<number>`count(*) filter (where ${rooms.archivedAt} is null and ${rooms.housekeepingStatus} <> 'dirty')`.mapWith(
            Number,
          ),
      })
      .from(rooms)
      .where(here),
    db.selectDistinct({ floor: rooms.floor }).from(rooms).where(active).orderBy(asc(rooms.floor)),
    db
      .selectDistinct({ feature: sql<string>`unnest(${rooms.features})` })
      .from(rooms)
      .where(active)
      .orderBy(sql`1`),
  ])
  const counts = totals ?? { active: 0, archived: 0, accessible: 0, outOfOrder: 0, notDirty: 0 }
  const live = isLive(property)
  return {
    active: counts.active,
    archived: counts.archived,
    accessible: counts.accessible,
    outOfOrder: counts.outOfOrder,
    floors: floors.map((row) => row.floor),
    features: features.map((row) => row.feature),
    // Stays arrive in brick 4; until then "no room has had a stay" always holds.
    allDirtySetup: !live && counts.active > 0 && counts.notDirty === 0,
    live,
  }
}

// One room by id, in scope, with its connections and whether it can be deleted for good.
export async function roomDetail(db: Reader, access: Access, id: string): Promise<RoomDetail> {
  const [row] = await db
    .select(roomColumns)
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(and(eq(rooms.id, id), roomsInScope(access)))
  if (!row) throw roomNotFound()
  const [view] = await withConnections(db, access, [row])
  if (!view) throw roomNotFound()
  return { ...view, canDelete: row.archivedAt !== null && !(await hasHistory(db, row.id)) }
}

export async function getRoom(db: Database, access: Access, id: string): Promise<RoomDetail> {
  requireRoomsSetup(access)
  return roomDetail(db, access, id)
}

// Numbers the hotel already has, archived included.
export async function takenNumbers(
  db: Reader,
  propertyId: string,
  numbers: readonly string[],
): Promise<{ number: string; archived: boolean }[]> {
  if (numbers.length === 0) return []
  const rows = await db
    .select({ number: rooms.number, archivedAt: rooms.archivedAt })
    .from(rooms)
    .where(and(eq(rooms.propertyId, propertyId), inArray(rooms.number, [...numbers])))
    .orderBy(asc(sql`length(${rooms.number})`), asc(rooms.number))
  return rows.map((row) => ({ number: row.number, archived: row.archivedAt !== null }))
}

export async function checkNumbers(
  db: Database,
  access: Access,
  input: { propertyId: string; numbers: string[] },
): Promise<{ taken: { number: string; archived: boolean }[] }> {
  requireRoomsSetup(access)
  const property = await loadProperty(db, access, input.propertyId)
  return { taken: await takenNumbers(db, property.id, input.numbers) }
}
