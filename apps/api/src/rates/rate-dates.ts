// Date prices and restrictions on an own-price plan: Change dates and the inline cell edit (spec,
// Rates and Restrictions), and Undo. One apply is one transaction and one `rates.dates_changed`
// audit event holding every cell's before and after, which is also what Undo restores from.
// Cells are last-write-wins; Undo only puts back cells still holding what it set.
import type { CalendarDate, SetRateDatesInput } from '@vento/shared'
import { lastRateDate, newId, noDatesMessage, selectDates, toAmount } from '@vento/shared'
import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { auditEvents } from '../db/schema/governance.ts'
import { rateDates, ratePlanRoomTypes, ratePlans } from '../db/schema/rates.ts'
import { roomTypes } from '../db/schema/rooms.ts'
import type { Access } from '../tenancy/access.ts'
import {
  auditAt,
  holdRatesProperty,
  type RatesProperty,
  requireRatesEdit,
  type Tx,
} from './context.ts'
import {
  alreadyUndone,
  noDates,
  notOnPlan,
  pastDate,
  planArchived,
  planIsDerived,
  planNotFound,
  roomTypeArchived,
  tooFarAhead,
  undoNotFound,
} from './errors.ts'
import { requireDerivedPositive, tonightAfter, tonightBefore } from './guards.ts'
import type { PlanRow } from './plan-model.ts'
import { plansInScope } from './plan-reads.ts'

// One plan × room type × night as stored, with nothing set = all empty.
export type Cell = {
  roomTypeId: string
  date: CalendarDate
  price: string | null
  closed: boolean
  closedToArrival: boolean
  minStay: number | null
  seasonName: string | null
}

const empty = (roomTypeId: string, date: CalendarDate): Cell => ({
  roomTypeId,
  date,
  price: null,
  closed: false,
  closedToArrival: false,
  minStay: null,
  seasonName: null,
})

const isEmpty = (cell: Cell) =>
  cell.price === null &&
  !cell.closed &&
  !cell.closedToArrival &&
  cell.minStay === null &&
  cell.seasonName === null

const sameCell = (a: Cell, b: Cell) =>
  a.price === b.price &&
  a.closed === b.closed &&
  a.closedToArrival === b.closedToArrival &&
  a.minStay === b.minStay &&
  a.seasonName === b.seasonName

const keyOf = (roomTypeId: string, date: CalendarDate) => `${roomTypeId}|${date}`

export type SetDatesResult = {
  batchId: string
  dates: number
  roomTypes: number
  changed: number
  followers: string[]
}

async function lockOwnPlan(tx: Tx, access: Access, id: string): Promise<PlanRow> {
  const [plan] = await tx
    .select()
    .from(ratePlans)
    .where(and(eq(ratePlans.id, id), plansInScope(access)))
    .for('update')
  if (!plan) throw planNotFound()
  if (plan.archivedAt) throw planArchived(plan.name)
  if (plan.pricing === 'derived') {
    const [parent] = plan.parentId
      ? await tx
          .select({ name: ratePlans.name })
          .from(ratePlans)
          .where(eq(ratePlans.id, plan.parentId))
      : []
    throw planIsDerived(plan.name, parent?.name ?? 'its parent')
  }
  return plan
}

// The plan's room types among `ids`, each on the plan and active, held FOR SHARE.
async function holdPlanTypes(tx: Tx, plan: PlanRow, ids: readonly string[]) {
  const unique = [...new Set(ids)]
  const rows = await tx
    .select({ id: roomTypes.id, name: roomTypes.name, archivedAt: roomTypes.archivedAt })
    .from(ratePlanRoomTypes)
    .innerJoin(roomTypes, eq(roomTypes.id, ratePlanRoomTypes.roomTypeId))
    .where(
      and(eq(ratePlanRoomTypes.ratePlanId, plan.id), inArray(ratePlanRoomTypes.roomTypeId, unique)),
    )
    .orderBy(asc(roomTypes.id))
    .for('share', { of: roomTypes })
  if (rows.length !== unique.length) throw notOnPlan(plan.name)
  const archived = rows.find((row) => row.archivedAt)
  if (archived) throw roomTypeArchived(archived.name)
  return new Map(rows.map((row) => [row.id, row.name]))
}

// The stored cells for these room types and dates, locked FOR UPDATE.
async function lockCells(
  tx: Tx,
  planId: string,
  typeIds: readonly string[],
  dates: readonly CalendarDate[],
): Promise<Map<string, Cell & { id: string }>> {
  if (dates.length === 0 || typeIds.length === 0) return new Map()
  const rows = await tx
    .select()
    .from(rateDates)
    .where(
      and(
        eq(rateDates.ratePlanId, planId),
        inArray(rateDates.roomTypeId, [...typeIds]),
        inArray(rateDates.date, [...dates]),
      ),
    )
    .orderBy(asc(rateDates.roomTypeId), asc(rateDates.date))
    .for('update')
  return new Map(
    rows.map((row) => [
      keyOf(row.roomTypeId, row.date),
      {
        id: row.id,
        roomTypeId: row.roomTypeId,
        date: row.date,
        price: row.price === null ? null : toAmount(row.price),
        closed: row.closed,
        closedToArrival: row.closedToArrival,
        minStay: row.minStay,
        seasonName: row.seasonName,
      },
    ]),
  )
}

// Writes the changed cells: upserts those with something set, deletes those left empty.
async function writeCells(
  tx: Tx,
  scope: { organizationId: string; propertyId: string; ratePlanId: string },
  stored: Map<string, Cell & { id: string }>,
  next: readonly Cell[],
): Promise<void> {
  const toDelete = next.filter(isEmpty).flatMap((cell) => {
    const row = stored.get(keyOf(cell.roomTypeId, cell.date))
    return row ? [row.id] : []
  })
  for (let i = 0; i < toDelete.length; i += 1000) {
    await tx.delete(rateDates).where(inArray(rateDates.id, toDelete.slice(i, i + 1000)))
  }
  const toUpsert = next.filter((cell) => !isEmpty(cell))
  for (let i = 0; i < toUpsert.length; i += 1000) {
    await tx
      .insert(rateDates)
      .values(toUpsert.slice(i, i + 1000).map((cell) => ({ ...scope, ...cell })))
      .onConflictDoUpdate({
        target: [rateDates.ratePlanId, rateDates.roomTypeId, rateDates.date],
        set: {
          price: sql`excluded.price`,
          closed: sql`excluded.closed`,
          closedToArrival: sql`excluded.closed_to_arrival`,
          minStay: sql`excluded.min_stay`,
          seasonName: sql`excluded.season_name`,
          updatedAt: sql`now()`,
        },
      })
  }
}

function requireSettable(property: RatesProperty, from: CalendarDate, to: CalendarDate): void {
  if (from < property.businessDate) throw pastDate(from)
  const last = lastRateDate(property.businessDate)
  if (to > last) throw tooFarAhead(last)
}

async function followerNames(tx: Tx, planId: string): Promise<string[]> {
  const rows = await tx
    .select({ name: ratePlans.name })
    .from(ratePlans)
    .where(and(eq(ratePlans.parentId, planId), isNull(ratePlans.archivedAt)))
    .orderBy(asc(ratePlans.sortOrder), asc(ratePlans.name))
  return rows.map((row) => row.name)
}

// The apply's event, if this batch was already applied (a retry after a timeout).
async function appliedBatch(tx: Tx, access: Access, planId: string, batchId: string) {
  const [event] = await tx
    .select({ id: auditEvents.id, createdAt: auditEvents.createdAt, after: auditEvents.after })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, access.organizationId),
        eq(auditEvents.entityType, 'rate_plan'),
        eq(auditEvents.entityId, planId),
        eq(auditEvents.action, 'rates.dates_changed'),
        sql`${auditEvents.after}->>'batchId' = ${batchId}`,
      ),
    )
    .limit(1)
  return event
}

export async function setRateDates(
  db: Database,
  access: Access,
  input: SetRateDatesInput,
): Promise<SetDatesResult> {
  requireRatesEdit(access)
  return db.transaction(async (tx) => {
    const plan = await lockOwnPlan(tx, access, input.ratePlanId)
    const property = await holdRatesProperty(tx, access, plan.propertyId)
    const done = await appliedBatch(tx, access, plan.id, input.batchId)
    if (done) return (done.after as { summary: SetDatesResult }).summary

    requireSettable(property, input.from, input.to)
    const dates = selectDates(input.from, input.to, input.days)
    if (dates.length === 0) throw noDates(noDatesMessage(input.from, input.to, input.days))
    const typeNames = await holdPlanTypes(tx, plan, input.roomTypeIds)
    const tonight = await tonightBefore(tx, access, property)
    const stored = await lockCells(tx, plan.id, [...typeNames.keys()], dates)
    const prices = new Map((input.prices ?? []).map((p) => [p.roomTypeId, p.price]))

    const before: Cell[] = []
    const after: Cell[] = []
    for (const roomTypeId of typeNames.keys()) {
      for (const date of dates) {
        const { id: _, ...current } = stored.get(keyOf(roomTypeId, date)) ?? {
          id: '',
          ...empty(roomTypeId, date),
        }
        const next: Cell = { ...current }
        const price = prices.get(roomTypeId)
        if (price) next.price = price
        if (input.backToStandard) {
          next.price = null
          next.seasonName = null
        }
        if (input.seasonName !== undefined) next.seasonName = input.seasonName
        if (input.closed !== undefined) next.closed = input.closed
        if (input.closedToArrival !== undefined) next.closedToArrival = input.closedToArrival
        if (input.minStay !== undefined) next.minStay = input.minStay
        if (sameCell(current, next)) continue
        before.push(current)
        after.push(next)
      }
    }
    const scope = {
      organizationId: access.organizationId,
      propertyId: property.id,
      ratePlanId: plan.id,
    }
    await writeCells(tx, scope, stored, after)
    if (after.some((cell, i) => cell.price !== before[i]?.price)) {
      await requireDerivedPositive(tx, access, property)
    }
    const flags = await tonightAfter(tx, access, property, tonight, input.reason)
    const summary: SetDatesResult = {
      batchId: input.batchId,
      dates: dates.length,
      roomTypes: typeNames.size,
      changed: after.length,
      followers: await followerNames(tx, plan.id),
    }
    await recordAudit(tx, access, {
      action: 'rates.dates_changed',
      entityType: 'rate_plan',
      entityId: plan.id,
      ...auditAt(property),
      before: { cells: before },
      after: {
        batchId: input.batchId,
        planName: plan.name,
        roomTypes: [...typeNames].map(([id, name]) => ({ roomTypeId: id, roomTypeName: name })),
        from: input.from,
        to: input.to,
        days: input.days,
        seasonName: input.seasonName ?? null,
        summary,
        cells: after,
        ...flags,
      },
      reason: input.reason ?? null,
    })
    return summary
  })
}

// --- Undo -----------------------------------------------------------------------------------------

type DatesEvent = {
  batchId: string
  undoOf?: string
  cells: Cell[]
}

export async function undoRateDates(
  db: Database,
  access: Access,
  input: { ratePlanId: string; batchId: string; reason?: string | undefined },
): Promise<{ restored: number; skippedDates: number; message: string | null }> {
  requireRatesEdit(access)
  return db.transaction(async (tx) => {
    const plan = await lockOwnPlan(tx, access, input.ratePlanId)
    const property = await holdRatesProperty(tx, access, plan.propertyId)
    const original = await appliedBatch(tx, access, plan.id, input.batchId)
    if (!original) throw undoNotFound()
    const [undone] = await tx
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, access.organizationId),
          eq(auditEvents.entityType, 'rate_plan'),
          eq(auditEvents.entityId, plan.id),
          eq(auditEvents.action, 'rates.dates_changed'),
          sql`${auditEvents.after}->>'undoOf' = ${input.batchId}`,
        ),
      )
      .limit(1)
    if (undone) throw alreadyUndone()
    const [beforeRow] = await tx
      .select({ before: auditEvents.before })
      .from(auditEvents)
      .where(eq(auditEvents.id, original.id))
    const applied = (original.after as DatesEvent).cells
    const previous = (beforeRow?.before as { cells: Cell[] } | null)?.cells ?? []

    const typeIds = [...new Set(applied.map((cell) => cell.roomTypeId))]
    const dates = [...new Set(applied.map((cell) => cell.date))]
    // Room types removed from the plan since have no cells left to restore.
    const onPlan = await tx
      .select({ roomTypeId: ratePlanRoomTypes.roomTypeId })
      .from(ratePlanRoomTypes)
      .where(
        and(
          eq(ratePlanRoomTypes.ratePlanId, plan.id),
          inArray(ratePlanRoomTypes.roomTypeId, typeIds.length ? typeIds : [plan.id]),
        ),
      )
    const present = new Set(onPlan.map((row) => row.roomTypeId))
    const tonight = await tonightBefore(tx, access, property)
    const stored = await lockCells(tx, plan.id, [...present], dates)

    const before: Cell[] = []
    const after: Cell[] = []
    const changedSince = new Set<CalendarDate>()
    const past = new Set<CalendarDate>()
    for (const [i, set] of applied.entries()) {
      const restore = previous[i] ?? empty(set.roomTypeId, set.date)
      if (!present.has(set.roomTypeId)) {
        changedSince.add(set.date)
        continue
      }
      if (set.date < property.businessDate) {
        past.add(set.date)
        continue
      }
      const { id: _, ...current } = stored.get(keyOf(set.roomTypeId, set.date)) ?? {
        id: '',
        ...empty(set.roomTypeId, set.date),
      }
      if (!sameCell(current, set)) {
        changedSince.add(set.date)
        continue
      }
      before.push(current)
      after.push(restore)
    }
    const scope = {
      organizationId: access.organizationId,
      propertyId: property.id,
      ratePlanId: plan.id,
    }
    await writeCells(tx, scope, stored, after)
    await requireDerivedPositive(tx, access, property)
    const flags = await tonightAfter(tx, access, property, tonight, input.reason)
    // Before this undo's own event, so the message names whoever changed the dates since.
    const message = await skipMessage(tx, access, plan.id, original.createdAt, changedSince, past)
    await recordAudit(tx, access, {
      action: 'rates.dates_changed',
      entityType: 'rate_plan',
      entityId: plan.id,
      ...auditAt(property),
      before: { cells: before },
      after: {
        batchId: newId(),
        undoOf: input.batchId,
        planName: plan.name,
        cells: after,
        ...flags,
      },
      reason: input.reason ?? null,
    })
    return {
      restored: after.length,
      skippedDates: new Set([...changedSince, ...past]).size,
      message,
    }
  })
}

const dateCount = (n: number) => (n === 1 ? '1 date was' : `${n} dates were`)

// "2 dates were changed by Sade since, so they were left as they are."
async function skipMessage(
  tx: Tx,
  access: Access,
  planId: string,
  since: Date,
  changedSince: ReadonlySet<CalendarDate>,
  past: ReadonlySet<CalendarDate>,
): Promise<string | null> {
  const parts: string[] = []
  if (changedSince.size > 0) {
    const [later] = await tx
      .select({ actorName: auditEvents.actorName })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, access.organizationId),
          eq(auditEvents.entityType, 'rate_plan'),
          eq(auditEvents.entityId, planId),
          gt(auditEvents.createdAt, since),
        ),
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(1)
    const who = later?.actorName?.split(' ')[0]
    parts.push(
      `${dateCount(changedSince.size)} changed${who ? ` by ${who}` : ''} since, so ${changedSince.size === 1 ? 'it was' : 'they were'} left as ${changedSince.size === 1 ? 'it is' : 'they are'}.`,
    )
  }
  if (past.size > 0) {
    parts.push(
      `${past.size === 1 ? '1 date is' : `${past.size} dates are`} now before the business date, so ${past.size === 1 ? 'it was' : 'they were'} left as ${past.size === 1 ? 'it is' : 'they are'}.`,
    )
  }
  return parts.length ? parts.join(' ') : null
}
