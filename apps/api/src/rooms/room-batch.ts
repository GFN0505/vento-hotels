// "Add rooms by floor": the room types typed in the builder and up to 500 rooms, created in one
// transaction, all or nothing. The browser's batchId makes it safe to resend after a timeout: a
// batch already applied answers with its original result and creates nothing.
import { ORPCError } from '@orpc/server'
import type { CreateManyRoomsResult } from '@vento/shared'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { recordAuditMany } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isUniqueViolation, violatedConstraint } from '../db/errors.ts'
import { auditEvents } from '../db/schema/governance.ts'
import { rooms, roomTypes } from '../db/schema/rooms.ts'
import type { Access } from '../tenancy/access.ts'
import {
  holdProperty,
  loadProperty,
  type Reader,
  type RoomsProperty,
  requireRoomsSetup,
} from './context.ts'
import { duplicateNumbers, numbersTaken } from './errors.ts'
import { lockActiveTypes } from './locks.ts'
import { roomCountChanged } from './room-count.ts'
import { takenNumbers } from './room-reads.ts'
import { insertRoomType, requireNoClash, type TypeFields } from './room-types.ts'
import { createdEvent, explainNumberClash } from './room-writes.ts'

type NewType = TypeFields & { key: string }
type PlannedRoom = {
  number: string
  floor: number
  roomTypeId?: string | undefined
  roomTypeKey?: string | undefined
}
type BatchInput = { propertyId: string; batchId: string; newTypes: NewType[]; rooms: PlannedRoom[] }

const repeats = (values: string[]) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))]

// Two new types in one request with the same name or code. Points at the later of the two.
function requireDistinctNewTypes(types: readonly NewType[]): void {
  for (const [index, type] of types.entries()) {
    const earlier = types.slice(0, index)
    const byName = earlier.some((other) => other.name.toLowerCase() === type.name.toLowerCase())
    if (!byName && !earlier.some((other) => other.code === type.code)) continue
    throw new ORPCError('BAD_REQUEST', {
      message: byName
        ? `${type.name} is in the list twice.`
        : `Code ${type.code} is in the list twice.`,
      data: { code: byName ? 'TYPE_NAME_TAKEN' : 'TYPE_CODE_TAKEN', key: type.key },
    })
  }
}

// A new type clashing with one the hotel has: the same error, plus which line it was.
async function requireNoClashFor(db: Reader, propertyId: string, type: NewType): Promise<void> {
  try {
    await requireNoClash(db, propertyId, type)
  } catch (error) {
    if (!(error instanceof ORPCError)) throw error
    throw new ORPCError(error.code, {
      message: error.message,
      data: { ...(error.data as Record<string, unknown>), key: type.key },
    })
  }
}

// What an earlier request with this batchId did, found through its audit events on the rooms that
// now hold these numbers and on the hotel's types. Only asked when numbers clash.
async function appliedBatch(
  db: Reader,
  access: Access,
  propertyId: string,
  numbers: string[],
  batchId: string,
): Promise<CreateManyRoomsResult | undefined> {
  const existing = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.propertyId, propertyId), inArray(rooms.number, numbers)))
  if (existing.length === 0) return undefined
  const inBatch = (entityType: string, action: string, ids: string[]) =>
    and(
      eq(auditEvents.organizationId, access.organizationId),
      eq(auditEvents.entityType, entityType),
      inArray(auditEvents.entityId, ids),
      eq(auditEvents.action, action),
      sql`${auditEvents.after}->>'batchId' = ${batchId}`,
    )
  const [created] = await db
    .select({ value: count() })
    .from(auditEvents)
    .where(
      inBatch(
        'room',
        'room.created',
        existing.map((room) => room.id),
      ),
    )
  if (!created || created.value === 0) return undefined
  const typeIds = await db
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(eq(roomTypes.propertyId, propertyId))
  const types = typeIds.length
    ? await db
        .select({ id: auditEvents.entityId, key: sql<string>`${auditEvents.after}->>'key'` })
        .from(auditEvents)
        .where(
          inBatch(
            'room_type',
            'room_type.created',
            typeIds.map((type) => type.id),
          ),
        )
    : []
  return {
    created: created.value,
    batchId,
    roomTypes: types.flatMap((type) => (type.id ? [{ key: type.key, id: type.id }] : [])),
  }
}

async function createTypesAndRooms(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  access: Access,
  property: RoomsProperty,
  input: BatchInput,
): Promise<CreateManyRoomsResult> {
  const existingIds = input.rooms.flatMap((room) => (room.roomTypeId ? [room.roomTypeId] : []))
  const names = existingIds.length
    ? await lockActiveTypes(tx, access, property.id, existingIds)
    : new Map<string, string>()
  const byKey = new Map<string, string>()
  for (const { key, ...fields } of input.newTypes) {
    await requireNoClashFor(tx, property.id, { key, ...fields })
    const id = await insertRoomType(tx, access, property, fields, { batchId: input.batchId, key })
    byKey.set(key, id)
    names.set(id, fields.name)
  }
  const resolved = input.rooms.map((room) => ({
    number: room.number,
    floor: room.floor,
    // The contract guarantees exactly one of the two, and that every key is in newTypes.
    roomTypeId: room.roomTypeId ?? byKey.get(room.roomTypeKey ?? '') ?? '',
  }))
  const created = await tx
    .insert(rooms)
    .values(
      resolved.map((room) => ({
        organizationId: access.organizationId,
        propertyId: property.id,
        ...room,
      })),
    )
    .returning({
      id: rooms.id,
      number: rooms.number,
      floor: rooms.floor,
      roomTypeId: rooms.roomTypeId,
    })
  await roomCountChanged(tx, { propertyId: property.id, roomTypeIds: [...names.keys()] })
  await recordAuditMany(
    tx,
    access,
    created.map((room) =>
      createdEvent(
        property,
        { ...room, roomTypeName: names.get(room.roomTypeId) ?? '' },
        { batchId: input.batchId },
      ),
    ),
  )
  return {
    created: created.length,
    batchId: input.batchId,
    roomTypes: [...byKey].map(([key, id]) => ({ key, id })),
  }
}

export async function createManyRooms(
  db: Database,
  access: Access,
  input: BatchInput,
): Promise<CreateManyRoomsResult> {
  requireRoomsSetup(access)
  const numbers = input.rooms.map((room) => room.number)
  const repeated = repeats(numbers)
  if (repeated.length > 0) throw duplicateNumbers(repeated)
  requireDistinctNewTypes(input.newTypes)
  const property = await loadProperty(db, access, input.propertyId)
  try {
    return await db.transaction(async (tx) => {
      await holdProperty(tx, access, property.id)
      // Before creating anything, so a resent batch never trips over its own new types.
      const taken = await takenNumbers(tx, property.id, numbers)
      if (taken.length > 0) {
        const prior = await appliedBatch(tx, access, property.id, numbers, input.batchId)
        if (prior) return prior
        throw numbersTaken(taken)
      }
      return createTypesAndRooms(tx, access, property, input)
    })
  } catch (error) {
    // Two copies of the same request racing: the loser answers like a replay. It loses either on a
    // unique index, or on a pre-check that ran after the winner committed (a CONFLICT).
    const lostRace =
      isUniqueViolation(error) || (error instanceof ORPCError && error.code === 'CONFLICT')
    if (!lostRace) throw error
    const prior = await appliedBatch(db, access, property.id, numbers, input.batchId)
    if (prior) return prior
    if (!isUniqueViolation(error)) throw error
    if (violatedConstraint(error)?.startsWith('room_types')) {
      for (const type of input.newTypes) await requireNoClashFor(db, property.id, type)
    }
    return explainNumberClash(db, error, property.id, numbers)
  }
}
