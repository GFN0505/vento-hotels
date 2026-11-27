// rooms.outOfOrder.check / create / change / end (spec: "Out of order"). Every write runs in one
// transaction in the lock order of reservations/locks.ts: the key lock (a resend finds the first
// result), the hotel FOR SHARE (2), the room FOR UPDATE (3; then its period row), then its type's
// inventory rows for the nights added (4), and checks under those locks that no stay is assigned
// to the room, no other period overlaps, and no added night would hold more bookings than rooms
// plus the overbooking limit. Rooms left for the type drop by one on each night at commit.
import {
  addDays,
  type ChangeOutOfOrderInput,
  type CreateOutOfOrderInput,
  changeOutOfOrderInputSchema,
  createOutOfOrderInputSchema,
  type EndOutOfOrderInput,
  endOutOfOrderInputSchema,
  nightsBetween,
  nightsOf,
  OOO_MAX_NIGHTS,
  OOO_REASON_LABELS,
  type OutOfOrderCheck,
  type OutOfOrderView,
  outOfOrderCheckInputSchema,
} from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { type AuditEvent, recordAuditMany } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { isExclusionViolation, isUniqueViolation, violatedConstraint } from '../../db/errors.ts'
import { roomOutOfOrder, rooms } from '../../db/schema/rooms.ts'
import { roomRemoved } from '../../reservations/assign/errors.ts'
import { lockRoomsForStay, type RoomRow, readRoom } from '../../reservations/assign/room-check.ts'
import { bookedFor, keyOf, lockInventory } from '../../reservations/locks.ts'
import {
  type Access,
  requireFeature,
  requirePermission,
  scopeToProperties,
} from '../../tenancy/access.ts'
import { holdProperty, loadProperty, type Reader, type RoomsProperty, type Tx } from '../context.ts'
import { type Assessment, assess } from './assess.ts'
import {
  ended,
  keyUsed,
  OOO_ONLY,
  overlaps,
  pastDate,
  periodChanged,
  periodNotFound,
  reasonRequired,
  roomHasBookings,
  startPassed,
  tooLong,
  wouldOverbook,
} from './errors.ts'

type Scope = { organizationId: string; propertyId: string }
type Period = typeof roomOutOfOrder.$inferSelect

export function requireOutOfOrder(access: Access): void {
  requireFeature(access, 'front_desk')
  requirePermission(access, 'room.out_of_order', OOO_ONLY)
}

function requireDates(from: string, to: string, businessDate: string) {
  if (from < businessDate) throw pastDate(businessDate)
  if (nightsBetween(from, to) > OOO_MAX_NIGHTS) throw tooLong()
}

// The first thing that stops it, as the server would refuse it.
function problemOf(room: RoomRow, assessment: Assessment) {
  if (assessment.overlap) {
    return overlaps(room.number, assessment.overlap.from, assessment.overlap.to)
  }
  if (assessment.blockers.length) return roomHasBookings(room.number, assessment.blockers)
  const short = assessment.shortfalls[0]
  if (short) return wouldOverbook(room.roomTypeName, room.roomTypeId, short.date, short.short)
  return null
}

async function viewOf(db: Reader, id: string): Promise<OutOfOrderView> {
  const [row] = await db
    .select({ period: roomOutOfOrder, number: rooms.number })
    .from(roomOutOfOrder)
    .innerJoin(rooms, eq(rooms.id, roomOutOfOrder.roomId))
    .where(eq(roomOutOfOrder.id, id))
  if (!row) throw periodNotFound()
  return toView(row.period, row.number)
}

export const toView = (period: Period, roomNumber: string): OutOfOrderView => ({
  id: period.id,
  roomId: period.roomId,
  roomNumber,
  from: period.fromDate,
  backInService: period.backInService,
  reason: period.reason,
  reasonText: period.reasonText,
  note: period.note,
  byName: period.byName,
  status: period.status,
  version: period.version,
})

// --- Check (the dialog, live as the dates change) -----------------------------------------------------

export async function checkOutOfOrder(
  db: Pick<Database, 'select'>,
  access: Access,
  input: z.input<typeof outOfOrderCheckInputSchema>,
): Promise<OutOfOrderCheck> {
  requireOutOfOrder(access)
  const ask = outOfOrderCheckInputSchema.parse(input)
  const property = await loadProperty(db, access, ask.propertyId)
  const scope = { organizationId: access.organizationId, propertyId: property.id }
  const room = await readRoom(db, scope, ask.roomId)
  const period = ask.periodId ? await findPeriod(db, access, ask.periodId) : null
  const nights = Math.max(0, nightsBetween(ask.from, ask.backInService))
  const base = { nights, roomTypeName: room.roomTypeName }
  const refused = (error: { message: string; data?: unknown }) => ({
    ...base,
    blockers: [],
    shortfalls: [],
    left: [],
    problem: { code: (error.data as { code: string }).code, message: error.message },
  })
  if (room.archived) return refused(roomRemoved(room.number))
  if (nights < 1) return { ...base, blockers: [], shortfalls: [], left: [], problem: null }
  try {
    if (!period || ask.from !== period.fromDate)
      requireDates(ask.from, ask.backInService, property.businessDate)
    if (nights > OOO_MAX_NIGHTS) throw tooLong()
  } catch (error) {
    return refused(error as { message: string; data?: unknown })
  }
  const added = addedNights(period, ask.from, ask.backInService)
  const booked = await bookedFor(
    db,
    scope,
    [room.roomTypeId],
    ask.from,
    addDays(ask.backInService, -1),
  )
  const assessment = await assess(
    db,
    scope,
    {
      roomId: room.id,
      roomTypeId: room.roomTypeId,
      from: ask.from,
      to: ask.backInService,
      periodId: period?.id,
      added,
    },
    (date) => booked.get(keyOf({ roomTypeId: room.roomTypeId, date })) ?? 0,
  )
  const problem = problemOf(room, assessment)
  return {
    ...base,
    blockers: assessment.blockers,
    shortfalls: assessment.shortfalls,
    left: assessment.left,
    problem: problem
      ? { code: (problem.data as { code: string }).code, message: problem.message }
      : null,
  }
}

// Nights in the new range that the period didn't cover before (all of them for a new period).
function addedNights(period: Period | null, from: string, to: string): string[] {
  const nights = nightsOf(from, to)
  if (period?.status !== 'active') return nights
  return nights.filter((date) => date < period.fromDate || date >= period.backInService)
}

async function findPeriod(db: Reader, access: Access, id: string): Promise<Period> {
  const [row] = await db
    .select()
    .from(roomOutOfOrder)
    .where(
      and(
        eq(roomOutOfOrder.id, id),
        eq(roomOutOfOrder.organizationId, access.organizationId),
        scopeToProperties(access, roomOutOfOrder.propertyId),
      ),
    )
  if (!row) throw periodNotFound()
  return row
}

// The period row FOR UPDATE, after its room (lock step 3).
async function lockPeriodRow(tx: Tx, id: string): Promise<Period> {
  const [row] = await tx
    .select()
    .from(roomOutOfOrder)
    .where(eq(roomOutOfOrder.id, id))
    .for('update')
  if (!row) throw periodNotFound()
  return row
}

// Under the room's lock: the checks, with the type's inventory rows for the added nights locked.
async function lockAndAssess(
  tx: Tx,
  scope: Scope,
  room: RoomRow,
  ask: { from: string; to: string; periodId?: string; added: string[] },
) {
  const booked = await lockInventory(
    tx,
    scope,
    ask.added.map((date) => ({ roomTypeId: room.roomTypeId, date })),
  )
  const assessment = await assess(
    tx,
    scope,
    { roomId: room.id, roomTypeId: room.roomTypeId, ...ask },
    (date) => booked.get(keyOf({ roomTypeId: room.roomTypeId, date })) ?? 0,
  )
  const problem = problemOf(room, assessment)
  if (problem) throw problem
}

const keyLock = (tx: Tx, access: Access, key: string) =>
  tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`ooo:${access.organizationId}:${key}`}, 0))`,
  )

const periodWords = (period: Pick<Period, 'reason' | 'reasonText'>) =>
  period.reason === 'other' ? (period.reasonText ?? 'Other') : OOO_REASON_LABELS[period.reason]

// The room comes back to be cleaned (repairs make mess), or as the GM says on Back in service.
async function setRoomStatus(
  tx: Tx,
  access: Access,
  property: RoomsProperty,
  room: { id: string; number: string },
  status: 'clean' | 'dirty',
  source: 'out_of_order' | 'back_in_service',
): Promise<AuditEvent> {
  const [before] = await tx
    .select({ status: rooms.housekeepingStatus })
    .from(rooms)
    .where(eq(rooms.id, room.id))
  const now = new Date()
  await tx
    .update(rooms)
    .set({
      housekeepingStatus: status,
      housekeepingStatusAt: now,
      housekeepingStatusByMemberId: access.memberId,
      housekeepingStatusByName: access.userName,
      updatedAt: now,
    })
    .where(eq(rooms.id, room.id))
  return {
    action: 'room.status_changed',
    entityType: 'room',
    entityId: room.id,
    propertyId: property.id,
    businessDate: property.businessDate,
    before: { number: room.number, housekeepingStatus: before?.status ?? null },
    after: {
      number: room.number,
      housekeepingStatus: status,
      applied: true,
      source,
      occurredAt: now.toISOString(),
      syncedAt: null,
    },
  }
}

// --- Create -----------------------------------------------------------------------------------------------

async function replayCreate(db: Reader, access: Access, key: string, input: unknown) {
  const [row] = await db
    .select({ id: roomOutOfOrder.id, roomId: roomOutOfOrder.roomId })
    .from(roomOutOfOrder)
    .where(
      and(
        eq(roomOutOfOrder.organizationId, access.organizationId),
        eq(roomOutOfOrder.idempotencyKey, key),
        scopeToProperties(access, roomOutOfOrder.propertyId),
      ),
    )
  if (!row) return null
  if (row.roomId !== (input as { roomId: string }).roomId) throw keyUsed()
  return viewOf(db, row.id)
}

export async function createOutOfOrder(
  db: Database,
  access: Access,
  input: CreateOutOfOrderInput,
): Promise<OutOfOrderView> {
  requireOutOfOrder(access)
  const ask = createOutOfOrderInputSchema.parse(input)
  if (ask.reason === 'other' && !ask.reasonText) throw reasonRequired()
  try {
    return await db.transaction(async (tx) => {
      await keyLock(tx, access, ask.idempotencyKey)
      const replayed = await replayCreate(tx, access, ask.idempotencyKey, ask)
      if (replayed) return replayed
      const property = await holdProperty(tx, access, ask.propertyId)
      const scope = { organizationId: access.organizationId, propertyId: property.id }
      const room = (await lockRoomsForStay(tx, scope, [ask.roomId])).get(ask.roomId)
      if (!room) throw periodNotFound()
      if (room.archived) throw roomRemoved(room.number)
      requireDates(ask.from, ask.backInService, property.businessDate)
      const added = nightsOf(ask.from, ask.backInService)
      await lockAndAssess(tx, scope, room, { from: ask.from, to: ask.backInService, added })
      const [period] = await tx
        .insert(roomOutOfOrder)
        .values({
          ...scope,
          roomId: room.id,
          fromDate: ask.from,
          backInService: ask.backInService,
          reason: ask.reason,
          reasonText: ask.reasonText || null,
          note: ask.note || null,
          businessDate: property.businessDate,
          byMemberId: access.memberId,
          byName: access.userName,
          deviceId: access.deviceId,
          idempotencyKey: ask.idempotencyKey,
        })
        .returning()
      if (!period) throw periodNotFound()
      const live = property.liveSince !== null
      const events: AuditEvent[] = [
        {
          action: 'room.out_of_order',
          entityType: 'room',
          entityId: room.id,
          propertyId: property.id,
          businessDate: property.businessDate,
          reason: periodWords(period),
          after: {
            periodId: period.id,
            number: room.number,
            roomTypeName: room.roomTypeName,
            from: period.fromDate,
            backInService: period.backInService,
            nights: added.length,
            reason: period.reason,
            reasonText: period.reasonText,
            note: period.note,
            liveProperty: live,
            ...(live ? { exception: 'out_of_order' } : {}),
          },
        },
      ]
      if (ask.from === property.businessDate) {
        events.push(await setRoomStatus(tx, access, property, room, 'dirty', 'out_of_order'))
      }
      await recordAuditMany(tx, access, events)
      return toView(period, room.number)
    })
  } catch (error) {
    if (
      isUniqueViolation(error) &&
      violatedConstraint(error) === 'room_out_of_order_organization_id_idempotency_key_unique'
    ) {
      const replayed = await replayCreate(db, access, ask.idempotencyKey, ask)
      if (replayed) return replayed
      throw keyUsed()
    }
    if (isExclusionViolation(error)) {
      const room = await readRoom(
        db,
        { organizationId: access.organizationId, propertyId: ask.propertyId },
        ask.roomId,
      )
      throw overlaps(room.number, ask.from, ask.backInService)
    }
    throw error
  }
}

// --- Change dates and end ---------------------------------------------------------------------------------

// The period's hotel and room, locked in order: hotel FOR SHARE, room FOR UPDATE, then the period.
async function lockPeriod(tx: Tx, access: Access, id: string, version: number, key: string) {
  const found = await findPeriod(tx, access, id)
  const property = await holdProperty(tx, access, found.propertyId)
  const scope = { organizationId: access.organizationId, propertyId: property.id }
  const room = (await lockRoomsForStay(tx, scope, [found.roomId])).get(found.roomId)
  if (!room) throw periodNotFound()
  const period = await lockPeriodRow(tx, id)
  // A resend of the change that set this version.
  if (period.lastKey === key) return { property, scope, room, period, replay: true }
  if (period.version !== version) throw periodChanged()
  if (period.status !== 'active') throw periodChanged()
  if (period.backInService <= property.businessDate) throw ended(period.backInService)
  return { property, scope, room, period, replay: false }
}

export async function changeOutOfOrder(
  db: Database,
  access: Access,
  input: ChangeOutOfOrderInput,
): Promise<OutOfOrderView> {
  requireOutOfOrder(access)
  const ask = changeOutOfOrderInputSchema.parse(input)
  try {
    return await db.transaction(async (tx) => {
      await keyLock(tx, access, ask.idempotencyKey)
      const { property, scope, room, period, replay } = await lockPeriod(
        tx,
        access,
        ask.periodId,
        ask.version,
        ask.idempotencyKey,
      )
      if (replay) return toView(period, room.number)
      const current = period.fromDate < property.businessDate
      // A current period's start is history; an upcoming one can move.
      if (current && ask.from !== period.fromDate) throw startPassed(period.fromDate)
      if (!current) requireDates(ask.from, ask.backInService, property.businessDate)
      if (current && ask.backInService <= property.businessDate)
        throw pastDate(addDays(property.businessDate, 1))
      if (nightsBetween(ask.from, ask.backInService) > OOO_MAX_NIGHTS) throw tooLong()
      const added = addedNights(period, ask.from, ask.backInService)
      const removed = nightsOf(period.fromDate, period.backInService).filter(
        (date) => date < ask.from || date >= ask.backInService,
      )
      await lockAndAssess(tx, scope, room, {
        from: ask.from,
        to: ask.backInService,
        periodId: period.id,
        added,
      })
      const [updated] = await tx
        .update(roomOutOfOrder)
        .set({
          fromDate: ask.from,
          backInService: ask.backInService,
          version: period.version + 1,
          lastKey: ask.idempotencyKey,
          updatedAt: new Date(),
        })
        .where(eq(roomOutOfOrder.id, period.id))
        .returning()
      if (!updated) throw periodNotFound()
      const live = property.liveSince !== null
      await recordAuditMany(tx, access, [
        {
          action: 'room.out_of_order_changed',
          entityType: 'room',
          entityId: room.id,
          propertyId: property.id,
          businessDate: property.businessDate,
          reason: ask.changeReason,
          before: {
            periodId: period.id,
            from: period.fromDate,
            backInService: period.backInService,
          },
          after: {
            periodId: period.id,
            number: room.number,
            roomTypeName: room.roomTypeName,
            from: updated.fromDate,
            backInService: updated.backInService,
            nightsAdded: added,
            nightsRemoved: removed,
            reason: period.reason,
            liveProperty: live,
            ...(live && added.length ? { exception: 'out_of_order' } : {}),
          },
        },
      ])
      return toView(updated, room.number)
    })
  } catch (error) {
    if (isExclusionViolation(error)) {
      const period = await findPeriod(db, access, ask.periodId)
      const room = await readRoom(
        db,
        { organizationId: access.organizationId, propertyId: period.propertyId },
        period.roomId,
      )
      throw overlaps(room.number, ask.from, ask.backInService)
    }
    throw error
  }
}

// Back in service (a current period ends from the business date, the room dirty or clean) or
// Remove (an upcoming one, or one starting today, is taken off and kept for history).
export async function endOutOfOrder(
  db: Database,
  access: Access,
  input: EndOutOfOrderInput,
): Promise<OutOfOrderView> {
  requireOutOfOrder(access)
  const ask = endOutOfOrderInputSchema.parse(input)
  return db.transaction(async (tx) => {
    await keyLock(tx, access, ask.idempotencyKey)
    const { property, room, period, replay } = await lockPeriod(
      tx,
      access,
      ask.periodId,
      ask.version,
      ask.idempotencyKey,
    )
    if (replay) return toView(period, room.number)
    const current = period.fromDate < property.businessDate
    const returned = nightsOf(
      current ? property.businessDate : period.fromDate,
      period.backInService,
    )
    const [updated] = await tx
      .update(roomOutOfOrder)
      .set({
        ...(current ? { backInService: property.businessDate } : { status: 'removed' as const }),
        version: period.version + 1,
        lastKey: ask.idempotencyKey,
        updatedAt: new Date(),
      })
      .where(eq(roomOutOfOrder.id, period.id))
      .returning()
    if (!updated) throw periodNotFound()
    const events: AuditEvent[] = [
      {
        action: 'room.back_in_service',
        entityType: 'room',
        entityId: room.id,
        propertyId: property.id,
        businessDate: property.businessDate,
        reason: ask.changeReason,
        before: { periodId: period.id, from: period.fromDate, backInService: period.backInService },
        after: {
          periodId: period.id,
          number: room.number,
          roomTypeName: room.roomTypeName,
          ended: current ? 'back_in_service' : 'removed',
          from: updated.fromDate,
          backInService: updated.backInService,
          nightsReturned: returned,
          status: current || period.fromDate === property.businessDate ? ask.status : null,
        },
      },
    ]
    // A room out of order today comes back now: dirty (repairs make mess) or as the GM says.
    if (current || period.fromDate === property.businessDate) {
      events.push(await setRoomStatus(tx, access, property, room, ask.status, 'back_in_service'))
    }
    await recordAuditMany(tx, access, events)
    return toView(updated, room.number)
  })
}
