// Room types, per property (spec: docs/specs/stage-1-room-types-and-rooms.md). The Rooms column is
// counted from active rooms, never stored. Every write runs in one transaction with its audit event.
import { ORPCError } from '@orpc/server'
import { type PageQuery, pageOffset, type RoomBed, type RoomTypeView, toPage } from '@vento/shared'
import { and, asc, count, eq, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isUniqueViolation } from '../db/errors.ts'
import { rooms, roomTypes } from '../db/schema/rooms.ts'
import { type Access, scopeToProperties } from '../tenancy/access.ts'
import {
  auditAt,
  loadProperty,
  type Reader,
  type RoomsProperty,
  requireRoomsSetup,
  type Tx,
} from './context.ts'
import { roomTypeNotFound, typeCodeTaken, typeHasRooms, typeNameTaken } from './errors.ts'
import { isLive } from './live.ts'
import { roomCountChanged } from './room-count.ts'

type TypeFields = {
  name: string
  code: string
  bed: RoomBed
  sofaBed: boolean
  baseOccupancy: number
  maxAdults: number
  maxChildren: number
  sizeSqm: string | null
  amenities: string[]
}

// Written with an alias: Drizzle leaves columns unqualified in single-table selects, which would
// make the inner query compare rooms with themselves.
const activeRooms = sql<number>`(select count(*) from ${rooms} r where r.room_type_id = ${roomTypes}.id and r.archived_at is null)::int`

const typeColumns = {
  id: roomTypes.id,
  propertyId: roomTypes.propertyId,
  code: roomTypes.code,
  name: roomTypes.name,
  bed: roomTypes.bed,
  sofaBed: roomTypes.sofaBed,
  baseOccupancy: roomTypes.baseOccupancy,
  maxAdults: roomTypes.maxAdults,
  maxChildren: roomTypes.maxChildren,
  sizeSqm: roomTypes.sizeSqm,
  amenities: roomTypes.amenities,
  sortOrder: roomTypes.sortOrder,
  archivedAt: roomTypes.archivedAt,
  roomCount: activeRooms.mapWith(Number),
}

type TypeRow = Omit<RoomTypeView, 'maxGuests' | 'archivedAt'> & { archivedAt: Date | null }

function toView(row: TypeRow): RoomTypeView {
  return {
    ...row,
    maxGuests: row.maxAdults + row.maxChildren,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  }
}

function inScope(access: Access): SQL {
  return and(
    eq(roomTypes.organizationId, access.organizationId),
    scopeToProperties(access, roomTypes.propertyId),
  ) as SQL
}

async function findType(db: Reader, access: Access, id: string): Promise<TypeRow> {
  const [row] = await db
    .select(typeColumns)
    .from(roomTypes)
    .where(and(eq(roomTypes.id, id), inScope(access)))
  if (!row) throw roomTypeNotFound()
  return row
}

// Locks the type row, so archiving waits for (and then sees) rooms being added to it.
async function lockType(tx: Tx, access: Access, id: string): Promise<TypeRow> {
  const [locked] = await tx
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(and(eq(roomTypes.id, id), inScope(access)))
    .for('update')
  if (!locked) throw roomTypeNotFound()
  return findType(tx, access, id)
}

// Name clashes among active types, and code clashes among all types (codes stay reserved).
async function requireNoClash(
  db: Reader,
  propertyId: string,
  fields: { name?: string | undefined; code?: string | undefined },
  exceptId?: string,
): Promise<void> {
  const conditions: SQL[] = []
  if (fields.name) {
    conditions.push(
      and(
        sql`lower(${roomTypes.name}) = lower(${fields.name})`,
        isNull(roomTypes.archivedAt),
      ) as SQL,
    )
  }
  if (fields.code) conditions.push(eq(roomTypes.code, fields.code))
  if (conditions.length === 0) return
  const clashes = await db
    .select({ name: roomTypes.name, code: roomTypes.code, archivedAt: roomTypes.archivedAt })
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.propertyId, propertyId),
        exceptId ? ne(roomTypes.id, exceptId) : undefined,
        sql`(${sql.join(conditions, sql` or `)})`,
      ),
    )
  const byName = clashes.find(
    (c) => fields.name && !c.archivedAt && c.name.toLowerCase() === fields.name.toLowerCase(),
  )
  if (byName) throw typeNameTaken(byName.name)
  const byCode = clashes.find((c) => c.code === fields.code)
  if (byCode && fields.code) {
    throw typeCodeTaken(fields.code, { name: byCode.name, archived: byCode.archivedAt !== null })
  }
}

// A lost race on the unique indexes: explain it the same way the pre-check would.
async function explainUniqueViolation(
  db: Reader,
  error: unknown,
  propertyId: string,
  fields: { name?: string | undefined; code?: string | undefined },
  exceptId?: string,
): Promise<never> {
  if (isUniqueViolation(error)) await requireNoClash(db, propertyId, fields, exceptId)
  throw error
}

const nextSortOrder = (propertyId: string) =>
  sql`(select coalesce(max(${roomTypes.sortOrder}), 0) + 1 from ${roomTypes} where ${roomTypes.propertyId} = ${propertyId})`

export async function listRoomTypes(
  db: Database,
  access: Access,
  query: PageQuery & { propertyId: string; includeArchived: boolean },
) {
  requireRoomsSetup(access)
  const property = await loadProperty(db, access, query.propertyId)
  const where = and(
    inScope(access),
    eq(roomTypes.propertyId, property.id),
    query.includeArchived ? undefined : isNull(roomTypes.archivedAt),
  )
  const [rows, [total]] = await Promise.all([
    db
      .select(typeColumns)
      .from(roomTypes)
      .where(where)
      .orderBy(
        sql`${roomTypes.archivedAt} is not null`,
        asc(roomTypes.sortOrder),
        asc(roomTypes.name),
      )
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db.select({ value: count() }).from(roomTypes).where(where),
  ])
  return toPage(rows.map(toView), total?.value ?? 0, query)
}

export async function getRoomType(db: Database, access: Access, id: string): Promise<RoomTypeView> {
  requireRoomsSetup(access)
  return toView(await findType(db, access, id))
}

export async function createRoomType(
  db: Database,
  access: Access,
  input: TypeFields & { propertyId: string },
): Promise<RoomTypeView> {
  requireRoomsSetup(access)
  const property = await loadProperty(db, access, input.propertyId)
  const { propertyId: _, ...fields } = input
  try {
    return await db.transaction(async (tx) => {
      await requireNoClash(tx, property.id, fields)
      const [row] = await tx
        .insert(roomTypes)
        .values({
          ...fields,
          organizationId: access.organizationId,
          propertyId: property.id,
          sortOrder: nextSortOrder(property.id),
        })
        .returning({ id: roomTypes.id })
      if (!row) throw new Error('room type insert returned nothing')
      await recordAudit(tx, access, {
        action: 'room_type.created',
        entityType: 'room_type',
        entityId: row.id,
        ...auditAt(property),
        after: { ...fields, liveProperty: isLive(property) },
      })
      return toView(await findType(tx, access, row.id))
    })
  } catch (error) {
    return explainUniqueViolation(db, error, property.id, fields)
  }
}

// The fields that differ, as before/after pairs for the audit event.
function changes<T extends Record<string, unknown>>(current: T, next: Partial<T>) {
  const before: Partial<T> = {}
  const after: Partial<T> = {}
  for (const key of Object.keys(next) as (keyof T)[]) {
    const value = next[key]
    if (value === undefined) continue
    if (JSON.stringify(value) !== JSON.stringify(current[key])) {
      before[key] = current[key]
      after[key] = value
    }
  }
  return { before, after, changed: Object.keys(after).length > 0 }
}

export async function updateRoomType(
  db: Database,
  access: Access,
  input: { id: string } & { [K in keyof TypeFields]?: TypeFields[K] | undefined },
): Promise<RoomTypeView> {
  requireRoomsSetup(access)
  const { id, ...requested } = input
  const next: Partial<TypeFields> = definedOnly({
    ...requested,
    ...(requested.sizeSqm ? { sizeSqm: oneDecimal(requested.sizeSqm) } : {}),
  })
  let propertyId: string | undefined
  try {
    return await db.transaction(async (tx) => {
      const current = await lockType(tx, access, id)
      propertyId = current.propertyId
      const property = await loadProperty(tx, access, current.propertyId)
      const merged = { ...current, ...next }
      if (merged.baseOccupancy > merged.maxAdults + merged.maxChildren) {
        throw new ORPCError('BAD_REQUEST', {
          message: "Base occupancy can't be more than max guests",
        })
      }
      const diff = changes(current as unknown as TypeFields, next)
      if (!diff.changed) return toView(current)
      await requireNoClash(
        tx,
        current.propertyId,
        {
          name: current.archivedAt ? undefined : diff.after.name,
          code: diff.after.code,
        },
        id,
      )
      await tx.update(roomTypes).set(diff.after).where(eq(roomTypes.id, id))
      await recordAudit(tx, access, {
        action: 'room_type.changed',
        entityType: 'room_type',
        entityId: id,
        ...auditAt(property),
        before: diff.before,
        after: { ...diff.after, liveProperty: isLive(property) },
      })
      return toView(await findType(tx, access, id))
    })
  } catch (error) {
    if (!propertyId) throw error
    return explainUniqueViolation(db, error, propertyId, next, id)
  }
}

// Postgres keeps numeric(6,1) as "32.0"; compare like with like so "32" isn't a change.
function oneDecimal(size: string): string {
  return size.includes('.') ? size : `${size}.0`
}

function definedOnly<T extends Record<string, unknown>>(
  value: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>
  }
}

function typeEvent(property: RoomsProperty, type: TypeRow) {
  return { name: type.name, code: type.code, liveProperty: isLive(property) }
}

// Only a type with no active rooms can be archived; its rooms must be moved or removed first.
export async function archiveRoomType(
  db: Database,
  access: Access,
  input: { id: string; reason?: string | undefined },
): Promise<RoomTypeView> {
  requireRoomsSetup(access)
  return db.transaction(async (tx) => {
    const type = await lockType(tx, access, input.id)
    if (type.archivedAt) return toView(type)
    const property = await loadProperty(tx, access, type.propertyId)
    // Counted after the lock, so rooms added by a transaction that held it are seen.
    const [active] = await tx
      .select({ value: count() })
      .from(rooms)
      .where(and(eq(rooms.roomTypeId, type.id), isNull(rooms.archivedAt)))
    if (active && active.value > 0) throw typeHasRooms(type.name, active.value)
    await tx.update(roomTypes).set({ archivedAt: new Date() }).where(eq(roomTypes.id, type.id))
    await roomCountChanged(tx, { propertyId: property.id, roomTypeIds: [type.id] })
    await recordAudit(tx, access, {
      action: 'room_type.archived',
      entityType: 'room_type',
      entityId: type.id,
      ...auditAt(property),
      before: { archived: false },
      after: { archived: true, ...typeEvent(property, type) },
      reason: input.reason ?? null,
    })
    return toView(await findType(tx, access, type.id))
  })
}

// Brings the type back at the end of the order. Its rooms stay where they were moved.
export async function restoreRoomType(
  db: Database,
  access: Access,
  input: { id: string; reason?: string | undefined },
): Promise<RoomTypeView> {
  requireRoomsSetup(access)
  let propertyId: string | undefined
  let name: string | undefined
  try {
    return await db.transaction(async (tx) => {
      const type = await lockType(tx, access, input.id)
      if (!type.archivedAt) return toView(type)
      propertyId = type.propertyId
      name = type.name
      const property = await loadProperty(tx, access, type.propertyId)
      await requireNoClash(tx, property.id, { name: type.name }, type.id)
      await tx
        .update(roomTypes)
        .set({ archivedAt: null, sortOrder: nextSortOrder(property.id) })
        .where(eq(roomTypes.id, type.id))
      await roomCountChanged(tx, { propertyId: property.id, roomTypeIds: [type.id] })
      await recordAudit(tx, access, {
        action: 'room_type.restored',
        entityType: 'room_type',
        entityId: type.id,
        ...auditAt(property),
        before: { archived: true },
        after: { archived: false, ...typeEvent(property, type) },
        reason: input.reason ?? null,
      })
      return toView(await findType(tx, access, type.id))
    })
  } catch (error) {
    if (!propertyId) throw error
    return explainUniqueViolation(db, error, propertyId, { name }, input.id)
  }
}

// The order every picker and the tape chart follow. `ids` must be every active type, so two
// people reordering at once can't leave a type out.
export async function reorderRoomTypes(
  db: Database,
  access: Access,
  input: { propertyId: string; ids: string[] },
): Promise<{ ok: true }> {
  requireRoomsSetup(access)
  return db.transaction(async (tx) => {
    const property = await loadProperty(tx, access, input.propertyId)
    const current = await tx
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(
        and(inScope(access), eq(roomTypes.propertyId, property.id), isNull(roomTypes.archivedAt)),
      )
      .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.name))
      .for('update')
    const before = current.map((row) => row.id)
    const sameSet =
      new Set(input.ids).size === input.ids.length &&
      input.ids.length === before.length &&
      input.ids.every((id) => before.includes(id))
    if (!sameSet) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'The room types changed while you were sorting. Reload and try again.',
        data: { code: 'LIST_CHANGED' },
      })
    }
    if (before.every((id, index) => id === input.ids[index])) return { ok: true as const }
    const order = sql`array[${sql.join(
      input.ids.map((id) => sql`${id}`),
      sql`, `,
    )}]::uuid[]`
    await tx
      .update(roomTypes)
      .set({ sortOrder: sql`array_position(${order}, ${roomTypes.id})` })
      .where(inArray(roomTypes.id, input.ids))
    await recordAudit(tx, access, {
      action: 'room_types.reordered',
      entityType: 'room_type',
      ...auditAt(property),
      before: { ids: before },
      after: { ids: input.ids },
    })
    return { ok: true as const }
  })
}
