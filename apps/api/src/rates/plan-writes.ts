// Creating and changing rate plans (spec: docs/specs/stage-1-rate-plans.md). Every write runs in
// one transaction with its audit events, after the hotel is held FOR SHARE. Lock order: the plan
// FOR UPDATE, then its parent FOR SHARE, then room types FOR SHARE, so writers can't deadlock.
// Derived prices are never stored; each save re-checks that no derived plan drops to ₦0 or less.
import {
  type CreateRatePlanInput,
  dec,
  newId,
  type RatePlanView,
  type StandardPrice,
  type UpdateRatePlanInput,
} from '@vento/shared'
import { and, asc, eq, gte, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm'
import { type AuditEvent, recordAudit, recordAuditMany } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isUniqueViolation } from '../db/errors.ts'
import { rateDates, ratePlanRoomTypes, ratePlans } from '../db/schema/rates.ts'
import { roomTypes } from '../db/schema/rooms.ts'
import type { Access } from '../tenancy/access.ts'
import { staleVersion } from '../tenancy/errors.ts'
import { lastChangeBy } from '../tenancy/last-change.ts'
import {
  auditAt,
  holdRatesProperty,
  isLive,
  lockHotelRates,
  lockRatesOfPlan,
  type RatesProperty,
  type Reader,
  requireRatesEdit,
  type Tx,
} from './context.ts'
import {
  hasFollowers,
  hasHistory,
  listChanged,
  notArchived,
  notOnParent,
  parentArchived,
  parentNotOwn,
  planArchived,
  planCodeTaken,
  planNameTaken,
  planNotFound,
  roomTypeArchived,
  roomTypeNotFound,
} from './errors.ts'
import { requireValidPrices, tonightAfter, tonightBefore } from './guards.ts'
import { type PlanRow, type PlanTerms, termColumns, termsOf } from './plan-model.ts'
import { findPlan, planHasHistory, plansInScope, planView } from './plan-reads.ts'

export type PlanRoomTypeInput = {
  roomTypeId: string
  weekday?: string | undefined
  weekend?: string | null | undefined
}

// --- Locks and checks -----------------------------------------------------------------------------

async function lockPlan(tx: Tx, access: Access, id: string): Promise<PlanRow> {
  const [row] = await tx
    .select()
    .from(ratePlans)
    .where(and(eq(ratePlans.id, id), plansInScope(access)))
    .for('update')
  if (!row) throw planNotFound()
  return row
}

// The given room types of this hotel, held FOR SHARE; each must exist and be active. Name by id.
export async function holdRoomTypes(
  tx: Tx,
  access: Access,
  propertyId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].sort()
  if (unique.length === 0) return new Map()
  const rows = await tx
    .select({ id: roomTypes.id, name: roomTypes.name, archivedAt: roomTypes.archivedAt })
    .from(roomTypes)
    .where(
      and(
        inArray(roomTypes.id, unique),
        eq(roomTypes.organizationId, access.organizationId),
        eq(roomTypes.propertyId, propertyId),
      ),
    )
    .orderBy(asc(roomTypes.id))
    .for('share')
  if (rows.length !== unique.length) throw roomTypeNotFound()
  const archived = rows.find((row) => row.archivedAt)
  if (archived) throw roomTypeArchived(archived.name)
  return new Map(rows.map((row) => [row.id, row.name]))
}

// A derived plan's parent: same hotel, active, with own prices, held FOR SHARE so it can't become
// derived or be archived until this save commits. Returns the room types it sells.
async function holdParent(
  tx: Tx,
  access: Access,
  propertyId: string,
  parentId: string,
  selfId?: string,
): Promise<{ row: PlanRow; roomTypeIds: Set<string> }> {
  const [row] = await tx
    .select()
    .from(ratePlans)
    .where(
      and(eq(ratePlans.id, parentId), plansInScope(access), eq(ratePlans.propertyId, propertyId)),
    )
    .for('share')
  if (!row) throw planNotFound()
  if (row.id === selfId || row.pricing !== 'own') throw parentNotOwn(row.name)
  if (row.archivedAt) throw parentArchived(row.name)
  const types = await tx
    .select({ roomTypeId: ratePlanRoomTypes.roomTypeId })
    .from(ratePlanRoomTypes)
    .where(eq(ratePlanRoomTypes.ratePlanId, row.id))
  return { row, roomTypeIds: new Set(types.map((t) => t.roomTypeId)) }
}

function requireOnParent(
  parent: { row: PlanRow; roomTypeIds: Set<string> },
  wanted: readonly string[],
  typeNames: Map<string, string>,
): void {
  const missing = wanted.filter((id) => !parent.roomTypeIds.has(id))
  if (missing.length > 0) {
    throw notOnParent(
      parent.row.name,
      missing.map((id) => typeNames.get(id) ?? 'that room type'),
    )
  }
}

async function activeFollowers(tx: Reader, planId: string) {
  return tx
    .select({ id: ratePlans.id, name: ratePlans.name })
    .from(ratePlans)
    .where(and(eq(ratePlans.parentId, planId), isNull(ratePlans.archivedAt)))
    .orderBy(asc(ratePlans.sortOrder), asc(ratePlans.name))
}

// Name clashes among active plans, and code clashes among all plans (codes stay reserved).
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
        sql`lower(${ratePlans.name}) = lower(${fields.name})`,
        isNull(ratePlans.archivedAt),
      ) as SQL,
    )
  }
  if (fields.code) conditions.push(eq(ratePlans.code, fields.code))
  if (conditions.length === 0) return
  const clashes = await db
    .select({ name: ratePlans.name, code: ratePlans.code, archivedAt: ratePlans.archivedAt })
    .from(ratePlans)
    .where(
      and(
        eq(ratePlans.propertyId, propertyId),
        exceptId ? ne(ratePlans.id, exceptId) : undefined,
        sql`(${sql.join(conditions, sql` or `)})`,
      ),
    )
  const byName = clashes.find(
    (c) => fields.name && !c.archivedAt && c.name.toLowerCase() === fields.name.toLowerCase(),
  )
  if (byName) throw planNameTaken(byName.name)
  const byCode = clashes.find((c) => c.code === fields.code)
  if (byCode && fields.code) {
    throw planCodeTaken(fields.code, { name: byCode.name, archived: byCode.archivedAt !== null })
  }
}

// A lost race on the unique indexes: explain it the way the pre-check would.
async function explainUniqueViolation(
  db: Reader,
  error: unknown,
  propertyId: string | undefined,
  fields: { name?: string | undefined; code?: string | undefined },
  exceptId?: string,
): Promise<never> {
  if (propertyId && isUniqueViolation(error)) {
    await requireNoClash(db, propertyId, fields, exceptId)
  }
  throw error
}

const nextSortOrder = (propertyId: string) =>
  sql`(select coalesce(max(${ratePlans.sortOrder}), 0) + 1 from ${ratePlans} where ${ratePlans.propertyId} = ${propertyId})`

function standardOf(row: PlanRoomTypeInput): StandardPrice | null {
  return row.weekday ? { weekday: row.weekday, weekend: row.weekend ?? null } : null
}

// What an audit event says about room types: names, and standard prices on own-price plans.
function typesForAudit(rows: readonly PlanRoomTypeInput[], typeNames: Map<string, string>) {
  return rows.map((row) => ({
    roomTypeId: row.roomTypeId,
    roomTypeName: typeNames.get(row.roomTypeId) ?? null,
    ...(row.weekday ? { weekday: row.weekday, weekend: row.weekend ?? null } : {}),
  }))
}

// --- Create ---------------------------------------------------------------------------------------

// Inserts a plan at the end of the hotel's order with its room types and its audit event.
export async function insertPlan(
  tx: Tx,
  access: Access,
  property: RatesProperty,
  terms: PlanTerms,
  types: readonly PlanRoomTypeInput[],
  extra: Record<string, unknown> = {},
): Promise<string> {
  const typeNames = await holdRoomTypes(
    tx,
    access,
    property.id,
    types.map((t) => t.roomTypeId),
  )
  if (terms.pricing === 'derived' && terms.parentId) {
    const parent = await holdParent(tx, access, property.id, terms.parentId)
    requireOnParent(parent, [...typeNames.keys()], typeNames)
  }
  await requireNoClash(tx, property.id, terms)
  const [row] = await tx
    .insert(ratePlans)
    .values({
      ...termColumns(terms),
      organizationId: access.organizationId,
      propertyId: property.id,
      sortOrder: nextSortOrder(property.id),
    })
    .returning({ id: ratePlans.id })
  if (!row) throw new Error('rate plan insert returned nothing')
  await tx.insert(ratePlanRoomTypes).values(
    types.map((t) => {
      const standard = terms.pricing === 'own' ? standardOf(t) : null
      return {
        organizationId: access.organizationId,
        propertyId: property.id,
        ratePlanId: row.id,
        roomTypeId: t.roomTypeId,
        weekdayPrice: standard?.weekday ?? null,
        weekendPrice: standard?.weekend ?? null,
      }
    }),
  )
  await recordAudit(tx, access, {
    action: 'rate_plan.created',
    entityType: 'rate_plan',
    entityId: row.id,
    ...auditAt(property),
    after: {
      ...terms,
      roomTypes: typesForAudit(terms.pricing === 'own' ? types : stripPrices(types), typeNames),
      ...extra,
      liveProperty: isLive(property),
    },
  })
  return row.id
}

const stripPrices = (types: readonly PlanRoomTypeInput[]) =>
  types.map((t) => ({ roomTypeId: t.roomTypeId }))

function termsFromInput(input: CreateRatePlanInput | UpdateRatePlanInput): PlanTerms {
  return {
    name: input.name,
    code: input.code,
    pricing: input.pricing,
    parentId: input.pricing === 'derived' ? input.parentId : null,
    adjustment: input.pricing === 'derived' ? input.adjustment : null,
    mealPlan: input.mealPlan,
    mealAllocation: input.mealAllocation,
    cancellation: input.cancellation,
    deposit: input.deposit,
    minStay: input.minStay,
    extraAdult: input.pricing === 'own' ? input.extraAdult : null,
    bookableBy: input.bookableBy,
    pricesIncludeTaxes: input.pricesIncludeTaxes,
  }
}

async function readBack(tx: Tx, access: Access, property: RatesProperty, id: string) {
  return planView(tx, property, await findPlan(tx, access, id))
}

export async function createRatePlan(
  db: Database,
  access: Access,
  input: CreateRatePlanInput,
): Promise<RatePlanView> {
  requireRatesEdit(access)
  const terms = termsFromInput(input)
  try {
    return await db.transaction(async (tx) => {
      await lockHotelRates(tx, input.propertyId)
      const property = await holdRatesProperty(tx, access, input.propertyId)
      const id = await insertPlan(tx, access, property, terms, input.roomTypes)
      await requireValidPrices(tx, access, property)
      return readBack(tx, access, property, id)
    })
  } catch (error) {
    return explainUniqueViolation(db, error, input.propertyId, terms)
  }
}

// --- Update ---------------------------------------------------------------------------------------

// The fields that differ, as before/after pairs for the audit event.
function changes<T extends Record<string, unknown>>(current: T, next: T) {
  const before: Partial<T> = {}
  const after: Partial<T> = {}
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(current[key])) {
      before[key] = current[key]
      after[key] = next[key]
    }
  }
  return { before, after, changed: Object.keys(after).length > 0 }
}

async function requireVersion(
  tx: Tx,
  access: Access,
  property: RatesProperty,
  plan: PlanRow,
  version: number,
): Promise<void> {
  if (plan.version === version) return
  const by = await lastChangeBy(tx, {
    organizationId: access.organizationId,
    entityType: 'rate_plan',
    entityId: plan.id,
    actions: [
      'rate_plan.changed',
      'rate_plan.prices_changed',
      'rate_plan.archived',
      'rate_plan.restored',
    ],
    timeZone: property.timeZone,
  })
  throw staleVersion(plan.name, by)
}

type CurrentType = {
  roomTypeId: string
  name: string
  weekday: string | null
  weekend: string | null
}

async function currentActiveTypes(tx: Tx, planId: string): Promise<CurrentType[]> {
  return tx
    .select({
      roomTypeId: ratePlanRoomTypes.roomTypeId,
      name: roomTypes.name,
      weekday: ratePlanRoomTypes.weekdayPrice,
      weekend: ratePlanRoomTypes.weekendPrice,
    })
    .from(ratePlanRoomTypes)
    .innerJoin(roomTypes, eq(roomTypes.id, ratePlanRoomTypes.roomTypeId))
    .where(and(eq(ratePlanRoomTypes.ratePlanId, planId), isNull(roomTypes.archivedAt)))
}

// Removes room types from the plans that follow `plan` (spec: "Removing a room type from a parent
// plan removes it from the plans that derive from it"), with an event on each.
async function removeFromFollowers(
  tx: Tx,
  access: Access,
  property: RatesProperty,
  plan: PlanRow,
  removed: readonly string[],
  typeNames: Map<string, string>,
  causedBy: string,
): Promise<void> {
  if (removed.length === 0) return
  const followers = await tx
    .select({ id: ratePlans.id, version: ratePlans.version })
    .from(ratePlans)
    .where(eq(ratePlans.parentId, plan.id))
    .orderBy(asc(ratePlans.id))
    .for('update')
  const events: AuditEvent[] = []
  for (const follower of followers) {
    const gone = await tx
      .delete(ratePlanRoomTypes)
      .where(
        and(
          eq(ratePlanRoomTypes.ratePlanId, follower.id),
          inArray(ratePlanRoomTypes.roomTypeId, [...removed]),
        ),
      )
      .returning({ roomTypeId: ratePlanRoomTypes.roomTypeId })
    if (gone.length === 0) continue
    await tx
      .update(ratePlans)
      .set({ version: follower.version + 1 })
      .where(eq(ratePlans.id, follower.id))
    events.push({
      action: 'rate_plan.changed',
      entityType: 'rate_plan',
      entityId: follower.id,
      ...auditAt(property),
      before: {
        roomTypesRemoved: gone.map((g) => ({
          roomTypeId: g.roomTypeId,
          roomTypeName: typeNames.get(g.roomTypeId) ?? null,
        })),
      },
      after: { followsRemovalFrom: plan.name, causedBy, liveProperty: isLive(property) },
    })
  }
  await recordAuditMany(tx, access, events)
}

const samePrice = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : dec(a).equals(b)

export async function updateRatePlan(
  db: Database,
  access: Access,
  input: UpdateRatePlanInput,
): Promise<RatePlanView> {
  requireRatesEdit(access)
  const next = termsFromInput(input)
  let propertyId: string | undefined
  try {
    return await db.transaction(async (tx) => {
      await lockRatesOfPlan(tx, access, input.id)
      const plan = await lockPlan(tx, access, input.id)
      propertyId = plan.propertyId
      const property = await holdRatesProperty(tx, access, plan.propertyId)
      if (plan.archivedAt) throw planArchived(plan.name)
      await requireVersion(tx, access, property, plan, input.version)
      const tonight = await tonightBefore(tx, access, property)

      const current = termsOf(plan)
      const followers = await activeFollowers(tx, plan.id)
      if (current.pricing === 'own' && next.pricing === 'derived' && followers.length > 0) {
        throw hasFollowers(
          plan.name,
          followers.map((f) => f.name),
          'Point them to another plan first.',
        )
      }
      const wanted = input.roomTypes
      const typeNames = await holdRoomTypes(
        tx,
        access,
        plan.propertyId,
        wanted.map((t) => t.roomTypeId),
      )
      if (next.pricing === 'derived' && next.parentId) {
        const parent = await holdParent(tx, access, plan.propertyId, next.parentId, plan.id)
        requireOnParent(parent, [...typeNames.keys()], typeNames)
      }
      await requireNoClash(tx, plan.propertyId, next, plan.id)

      // Room types: only active ones are edited; archived ones stay on the plan.
      const existing = await currentActiveTypes(tx, plan.id)
      for (const type of existing) typeNames.set(type.roomTypeId, type.name)
      const wantedIds = new Set(wanted.map((t) => t.roomTypeId))
      const removed = existing.filter((t) => !wantedIds.has(t.roomTypeId)).map((t) => t.roomTypeId)
      const own = next.pricing === 'own'
      const priceChanges: {
        roomTypeId: string
        roomTypeName: string | null
        before: StandardPrice | null
        after: StandardPrice | null
      }[] = []
      for (const row of wanted) {
        const was = existing.find((t) => t.roomTypeId === row.roomTypeId)
        const standard = own ? standardOf(row) : null
        const values = {
          weekdayPrice: standard?.weekday ?? null,
          weekendPrice: standard?.weekend ?? null,
        }
        if (!was) {
          await tx.insert(ratePlanRoomTypes).values({
            organizationId: access.organizationId,
            propertyId: plan.propertyId,
            ratePlanId: plan.id,
            roomTypeId: row.roomTypeId,
            ...values,
          })
        } else if (
          !samePrice(was.weekday, values.weekdayPrice) ||
          !samePrice(was.weekend, values.weekendPrice)
        ) {
          await tx
            .update(ratePlanRoomTypes)
            .set(values)
            .where(
              and(
                eq(ratePlanRoomTypes.ratePlanId, plan.id),
                eq(ratePlanRoomTypes.roomTypeId, row.roomTypeId),
              ),
            )
        } else {
          continue
        }
        const before = was?.weekday ? { weekday: was.weekday, weekend: was.weekend } : null
        priceChanges.push({
          roomTypeId: row.roomTypeId,
          roomTypeName: typeNames.get(row.roomTypeId) ?? null,
          before,
          after: standard,
        })
      }
      if (removed.length > 0) {
        await tx
          .delete(ratePlanRoomTypes)
          .where(
            and(
              eq(ratePlanRoomTypes.ratePlanId, plan.id),
              inArray(ratePlanRoomTypes.roomTypeId, removed),
            ),
          )
      }
      // Own → derived: its own date prices from the business date on go (the confirm said so).
      let droppedDates = 0
      if (current.pricing === 'own' && !own) {
        const dropped = await tx
          .delete(rateDates)
          .where(and(eq(rateDates.ratePlanId, plan.id), gte(rateDates.date, property.businessDate)))
          .returning({ id: rateDates.id })
        droppedDates = dropped.length
        await tx
          .update(ratePlanRoomTypes)
          .set({ weekdayPrice: null, weekendPrice: null })
          .where(eq(ratePlanRoomTypes.ratePlanId, plan.id))
      }

      const diff = changes(current, next)
      const typesChanged =
        removed.length > 0 ||
        wanted.some((t) => !existing.some((e) => e.roomTypeId === t.roomTypeId))
      const pricesChanged = own && priceChanges.length > 0
      if (!diff.changed && !typesChanged && !pricesChanged && droppedDates === 0) {
        return readBack(tx, access, property, plan.id)
      }
      await tx
        .update(ratePlans)
        .set({ ...termColumns(next), version: plan.version + 1 })
        .where(eq(ratePlans.id, plan.id))

      const changeId = newId()
      const nameOf = (id: string) => typeNames.get(id) ?? null
      await removeFromFollowers(tx, access, property, plan, removed, typeNames, changeId)
      await requireValidPrices(tx, access, property)
      const flags = await tonightAfter(tx, access, property, tonight, input.reason)

      const events: AuditEvent[] = []
      if (diff.changed || typesChanged || droppedDates > 0) {
        events.push({
          id: changeId,
          action: 'rate_plan.changed',
          entityType: 'rate_plan',
          entityId: plan.id,
          ...auditAt(property),
          before: {
            ...diff.before,
            ...(removed.length
              ? {
                  roomTypesRemoved: removed.map((id) => ({
                    roomTypeId: id,
                    roomTypeName: nameOf(id),
                  })),
                }
              : {}),
          },
          after: {
            ...diff.after,
            ...(typesChanged
              ? {
                  roomTypesAdded: wanted
                    .filter((t) => !existing.some((e) => e.roomTypeId === t.roomTypeId))
                    .map((t) => ({ roomTypeId: t.roomTypeId, roomTypeName: nameOf(t.roomTypeId) })),
                }
              : {}),
            ...(droppedDates ? { datePricesRemoved: droppedDates } : {}),
            ...flags,
          },
          reason: input.reason ?? null,
        })
      }
      if (pricesChanged) {
        events.push({
          action: 'rate_plan.prices_changed',
          entityType: 'rate_plan',
          entityId: plan.id,
          ...auditAt(property),
          before: {
            prices: priceChanges.map((c) => ({
              roomTypeId: c.roomTypeId,
              roomTypeName: c.roomTypeName,
              ...c.before,
            })),
          },
          after: {
            prices: priceChanges.map((c) => ({
              roomTypeId: c.roomTypeId,
              roomTypeName: c.roomTypeName,
              ...c.after,
            })),
            ...flags,
          },
          reason: input.reason ?? null,
        })
      }
      await recordAuditMany(tx, access, events)
      return readBack(tx, access, property, plan.id)
    })
  } catch (error) {
    return explainUniqueViolation(db, error, propertyId, next, input.id)
  }
}

// --- Archive, restore, delete, reorder ------------------------------------------------------------

function planEvent(property: RatesProperty, plan: PlanRow) {
  return { name: plan.name, code: plan.code, liveProperty: isLive(property) }
}

export async function archiveRatePlan(
  db: Database,
  access: Access,
  input: { id: string },
): Promise<RatePlanView> {
  requireRatesEdit(access)
  return db.transaction(async (tx) => {
    await lockRatesOfPlan(tx, access, input.id)
    const plan = await lockPlan(tx, access, input.id)
    const property = await holdRatesProperty(tx, access, plan.propertyId)
    if (plan.archivedAt) return planView(tx, property, plan)
    const followers = await activeFollowers(tx, plan.id)
    if (followers.length > 0) {
      throw hasFollowers(
        plan.name,
        followers.map((f) => f.name),
        'Archive them first, or point them to another plan.',
      )
    }
    await tx
      .update(ratePlans)
      .set({ archivedAt: new Date(), version: plan.version + 1 })
      .where(eq(ratePlans.id, plan.id))
    await recordAudit(tx, access, {
      action: 'rate_plan.archived',
      entityType: 'rate_plan',
      entityId: plan.id,
      ...auditAt(property),
      before: { archived: false },
      after: { archived: true, ...planEvent(property, plan) },
    })
    return readBack(tx, access, property, plan.id)
  })
}

// Brings the plan back at the end of the order. A derived plan needs its parent active.
export async function restoreRatePlan(
  db: Database,
  access: Access,
  input: { id: string },
): Promise<RatePlanView> {
  requireRatesEdit(access)
  let propertyId: string | undefined
  let name: string | undefined
  try {
    return await db.transaction(async (tx) => {
      await lockRatesOfPlan(tx, access, input.id)
      const plan = await lockPlan(tx, access, input.id)
      const property = await holdRatesProperty(tx, access, plan.propertyId)
      if (!plan.archivedAt) return planView(tx, property, plan)
      propertyId = plan.propertyId
      name = plan.name
      if (plan.parentId) await holdParent(tx, access, plan.propertyId, plan.parentId, plan.id)
      await requireNoClash(tx, plan.propertyId, { name: plan.name }, plan.id)
      await tx
        .update(ratePlans)
        .set({
          archivedAt: null,
          sortOrder: nextSortOrder(plan.propertyId),
          version: plan.version + 1,
        })
        .where(eq(ratePlans.id, plan.id))
      await requireValidPrices(tx, access, property)
      await recordAudit(tx, access, {
        action: 'rate_plan.restored',
        entityType: 'rate_plan',
        entityId: plan.id,
        ...auditAt(property),
        before: { archived: true },
        after: { archived: false, ...planEvent(property, plan) },
      })
      return readBack(tx, access, property, plan.id)
    })
  } catch (error) {
    return explainUniqueViolation(db, error, propertyId, { name }, input.id)
  }
}

// "Delete for good", from Archived, for a plan never used on a booking. Its room types and dates go
// with it; the audit event keeps what it was.
export async function deleteRatePlan(
  db: Database,
  access: Access,
  input: { id: string },
): Promise<{ ok: true }> {
  requireRatesEdit(access)
  return db.transaction(async (tx) => {
    await lockRatesOfPlan(tx, access, input.id)
    const plan = await lockPlan(tx, access, input.id)
    const property = await holdRatesProperty(tx, access, plan.propertyId)
    if (!plan.archivedAt) throw notArchived(plan.name)
    const children = await tx
      .select({ name: ratePlans.name })
      .from(ratePlans)
      .where(eq(ratePlans.parentId, plan.id))
      .orderBy(asc(ratePlans.name))
    if (children.length > 0) {
      throw hasFollowers(
        plan.name,
        children.map((c) => c.name),
        'Delete them first, or point them to another plan.',
      )
    }
    if (await planHasHistory(tx, plan.id)) throw hasHistory(plan.name)
    const { parentId: _, ...terms } = termsOf(plan)
    await tx.delete(ratePlans).where(eq(ratePlans.id, plan.id))
    await recordAudit(tx, access, {
      action: 'rate_plan.deleted',
      entityType: 'rate_plan',
      entityId: plan.id,
      ...auditAt(property),
      before: { ...terms, parentId: plan.parentId },
      after: { deleted: true, liveProperty: isLive(property) },
    })
    return { ok: true as const }
  })
}

// The order booking pickers follow. `ids` must be every active plan, so two people sorting at once
// can't leave one out.
export async function reorderRatePlans(
  db: Database,
  access: Access,
  input: { propertyId: string; ids: string[] },
): Promise<{ ok: true }> {
  requireRatesEdit(access)
  return db.transaction(async (tx) => {
    await lockHotelRates(tx, input.propertyId)
    const property = await holdRatesProperty(tx, access, input.propertyId)
    const current = await tx
      .select({ id: ratePlans.id })
      .from(ratePlans)
      .where(
        and(
          plansInScope(access),
          eq(ratePlans.propertyId, property.id),
          isNull(ratePlans.archivedAt),
        ),
      )
      .orderBy(asc(ratePlans.sortOrder), asc(ratePlans.name))
      .for('update')
    const before = current.map((row) => row.id)
    const sameSet =
      new Set(input.ids).size === input.ids.length &&
      input.ids.length === before.length &&
      input.ids.every((id) => before.includes(id))
    if (!sameSet) throw listChanged()
    if (before.every((id, index) => id === input.ids[index])) return { ok: true as const }
    const order = sql`array[${sql.join(
      input.ids.map((id) => sql`${id}`),
      sql`, `,
    )}]::uuid[]`
    await tx
      .update(ratePlans)
      .set({ sortOrder: sql`array_position(${order}, ${ratePlans.id})` })
      .where(inArray(ratePlans.id, input.ids))
    await recordAudit(tx, access, {
      action: 'rate_plans.reordered',
      entityType: 'rate_plan',
      ...auditAt(property),
      before: { ids: before },
      after: { ids: input.ids, liveProperty: isLive(property) },
    })
    return { ok: true as const }
  })
}
