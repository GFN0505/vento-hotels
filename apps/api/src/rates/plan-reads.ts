// Reading rate plans: the list, one plan, the page overview and a plan's recent history. Anyone with
// rates.edit, rooms.setup or reservation.manage reads them (the front desk quotes by phone).
import type { PageQuery, RatePlanView, RatesOverview } from '@vento/shared'
import { lastRateDate, pageOffset, toAmount, toPage } from '@vento/shared'
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { auditEvents } from '../db/schema/governance.ts'
import { rateDates, ratePlanRoomTypes, ratePlans } from '../db/schema/rates.ts'
import { stays } from '../db/schema/reservations.ts'
import { rooms, roomTypes } from '../db/schema/rooms.ts'
import { type Access, can, scopeToProperties } from '../tenancy/access.ts'
import {
  isLive,
  loadRatesProperty,
  type RatesProperty,
  type Reader,
  requireRatesEdit,
  requireRatesRead,
} from './context.ts'
import { planNotFound } from './errors.ts'
import { loadRoomTypes } from './guards.ts'
import { type PlanRow, termsOf } from './plan-model.ts'

// Whether a plan has been used on a booking, so it can't be deleted for good. Stays' foreign key to
// rate plans also RESTRICTs as a backstop.
export async function planHasHistory(db: Reader, planId: string): Promise<boolean> {
  return (await plansWithHistory(db, [planId])).has(planId)
}

// The same for a list of plans, in one query.
async function plansWithHistory(db: Reader, planIds: readonly string[]): Promise<Set<string>> {
  if (planIds.length === 0) return new Set()
  const rows = await db
    .select({ id: stays.ratePlanId })
    .from(stays)
    .where(inArray(stays.ratePlanId, [...planIds]))
    .groupBy(stays.ratePlanId)
  return new Set(rows.map((row) => row.id))
}

export function plansInScope(access: Access) {
  return and(
    eq(ratePlans.organizationId, access.organizationId),
    scopeToProperties(access, ratePlans.propertyId),
  )
}

// The plan row by id, in the caller's organization and hotels; anything else is not found.
export async function findPlan(db: Reader, access: Access, id: string): Promise<PlanRow> {
  const [row] = await db
    .select()
    .from(ratePlans)
    .where(and(eq(ratePlans.id, id), plansInScope(access)))
  if (!row) throw planNotFound()
  return row
}

// Views for plans of one hotel, in the order given, in four queries whatever the count.
export async function planViews(
  db: Reader,
  property: RatesProperty,
  rows: readonly PlanRow[],
): Promise<RatePlanView[]> {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const parentIds = rows.flatMap((row) => (row.parentId ? [row.parentId] : []))
  const [types, parents, children, dated, used] = await Promise.all([
    db
      .select({
        ratePlanId: ratePlanRoomTypes.ratePlanId,
        roomTypeId: ratePlanRoomTypes.roomTypeId,
        weekday: ratePlanRoomTypes.weekdayPrice,
        weekend: ratePlanRoomTypes.weekendPrice,
      })
      .from(ratePlanRoomTypes)
      .innerJoin(roomTypes, eq(roomTypes.id, ratePlanRoomTypes.roomTypeId))
      .where(and(inArray(ratePlanRoomTypes.ratePlanId, ids), isNull(roomTypes.archivedAt)))
      .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.name)),
    parentIds.length
      ? db
          .select({ id: ratePlans.id, name: ratePlans.name, code: ratePlans.code })
          .from(ratePlans)
          .where(inArray(ratePlans.id, parentIds))
      : Promise.resolve([]),
    db
      .select({
        id: ratePlans.id,
        name: ratePlans.name,
        parentId: ratePlans.parentId,
        archivedAt: ratePlans.archivedAt,
      })
      .from(ratePlans)
      .where(inArray(ratePlans.parentId, ids))
      .orderBy(asc(ratePlans.sortOrder), asc(ratePlans.name)),
    db
      .select({ ratePlanId: rateDates.ratePlanId, value: count() })
      .from(rateDates)
      .where(and(inArray(rateDates.ratePlanId, ids), gte(rateDates.date, property.businessDate)))
      .groupBy(rateDates.ratePlanId),
    plansWithHistory(
      db,
      rows.filter((row) => row.archivedAt !== null).map((row) => row.id),
    ),
  ])
  const parentBy = new Map(parents.map((p) => [p.id, p]))
  const datedBy = new Map(dated.map((d) => [d.ratePlanId, d.value]))
  return rows.map((row) => {
    const mine = children.filter((child) => child.parentId === row.id)
    const { parentId: _, ...terms } = termsOf(row)
    return {
      id: row.id,
      propertyId: row.propertyId,
      ...terms,
      parent: (row.parentId && parentBy.get(row.parentId)) || null,
      roomTypes: types
        .filter((t) => t.ratePlanId === row.id)
        .map((t) => ({
          roomTypeId: t.roomTypeId,
          weekday: t.weekday && toAmount(t.weekday),
          weekend: t.weekend && toAmount(t.weekend),
        })),
      currency: 'NGN' as const,
      sortOrder: row.sortOrder,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      version: row.version,
      followers: mine
        .filter((child) => !child.archivedAt)
        .map((child) => ({ id: child.id, name: child.name })),
      datedFromBusinessDate: datedBy.get(row.id) ?? 0,
      canDelete: row.archivedAt !== null && mine.length === 0 && !used.has(row.id),
    }
  })
}

export async function planView(
  db: Reader,
  property: RatesProperty,
  row: PlanRow,
): Promise<RatePlanView> {
  const [view] = await planViews(db, property, [row])
  if (!view) throw planNotFound()
  return view
}

export async function listRatePlans(
  db: Database,
  access: Access,
  query: PageQuery & { propertyId: string; archived: boolean; includeCorporate: boolean },
) {
  requireRatesRead(access)
  const property = await loadRatesProperty(db, access, query.propertyId)
  const where = and(
    plansInScope(access),
    eq(ratePlans.propertyId, property.id),
    query.archived ? isNotNull(ratePlans.archivedAt) : isNull(ratePlans.archivedAt),
    query.includeCorporate ? undefined : eq(ratePlans.bookableBy, 'anyone'),
  )
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(ratePlans)
      .where(where)
      .orderBy(asc(ratePlans.sortOrder), asc(ratePlans.name))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db.select({ value: count() }).from(ratePlans).where(where),
  ])
  return toPage(await planViews(db, property, rows), total?.value ?? 0, query)
}

export async function getRatePlan(db: Database, access: Access, id: string) {
  requireRatesRead(access)
  const row = await findPlan(db, access, id)
  const property = await loadRatesProperty(db, access, row.propertyId)
  return planView(db, property, row)
}

// The plan behind the Base rate column and "Add to Best available": the first active plan in sort
// order with own prices, open to anyone.
export async function basePlanOf(db: Reader, organizationId: string, propertyId: string) {
  const [plan] = await db
    .select({ id: ratePlans.id, name: ratePlans.name })
    .from(ratePlans)
    .where(
      and(
        eq(ratePlans.organizationId, organizationId),
        eq(ratePlans.propertyId, propertyId),
        isNull(ratePlans.archivedAt),
        eq(ratePlans.pricing, 'own'),
        eq(ratePlans.bookableBy, 'anyone'),
      ),
    )
    .orderBy(asc(ratePlans.sortOrder), asc(ratePlans.name))
    .limit(1)
  return plan ?? null
}

export async function ratesOverview(
  db: Database,
  access: Access,
  input: { propertyId: string },
): Promise<RatesOverview> {
  requireRatesRead(access)
  const property = await loadRatesProperty(db, access, input.propertyId)
  const scope = { organizationId: access.organizationId, propertyId: property.id }
  const inHotel = and(plansInScope(access), eq(ratePlans.propertyId, property.id))
  const [types, roomCounts, planCounts, priced, basePlan] = await Promise.all([
    loadRoomTypes(db, scope),
    db
      .select({ roomTypeId: rooms.roomTypeId, value: count() })
      .from(rooms)
      .where(
        and(
          eq(rooms.organizationId, access.organizationId),
          eq(rooms.propertyId, property.id),
          isNull(rooms.archivedAt),
        ),
      )
      .groupBy(rooms.roomTypeId),
    db
      .select({ archived: sql<boolean>`${ratePlans.archivedAt} is not null`, value: count() })
      .from(ratePlans)
      .where(inHotel)
      .groupBy(sql`${ratePlans.archivedAt} is not null`),
    db
      .selectDistinct({ roomTypeId: ratePlanRoomTypes.roomTypeId })
      .from(ratePlanRoomTypes)
      .innerJoin(ratePlans, eq(ratePlans.id, ratePlanRoomTypes.ratePlanId))
      .where(and(inHotel, isNull(ratePlans.archivedAt))),
    basePlanOf(db, access.organizationId, property.id),
  ])
  const roomsBy = new Map(roomCounts.map((row) => [row.roomTypeId, row.value]))
  const pricedIds = new Set(priced.map((row) => row.roomTypeId))
  return {
    property: {
      id: property.id,
      name: property.name,
      businessDate: property.businessDate,
      lastRateDate: lastRateDate(property.businessDate),
      live: isLive(property),
      checkInTime: property.checkInTime,
    },
    roomTypes: types.map((type) => ({
      id: type.id,
      name: type.name,
      code: type.code,
      roomCount: roomsBy.get(type.id) ?? 0,
      baseOccupancy: type.baseOccupancy,
      maxAdults: type.maxAdults,
      maxChildren: type.maxChildren,
    })),
    activePlans: planCounts.find((row) => !row.archived)?.value ?? 0,
    archivedPlans: planCounts.find((row) => row.archived)?.value ?? 0,
    unpricedRoomTypes: types
      .filter((type) => !pricedIds.has(type.id))
      .map((type) => ({ id: type.id, name: type.name })),
    basePlan,
    canEdit: can(access, 'rates.edit'),
  }
}

// The editor's Change history card: the last 3 events on the plan (plan changes and its dates).
export async function ratePlanHistory(db: Database, access: Access, id: string) {
  requireRatesEdit(access)
  const plan = await findPlan(db, access, id)
  await loadRatesProperty(db, access, plan.propertyId)
  const events = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorName: auditEvents.actorName,
      createdAt: auditEvents.createdAt,
      reason: auditEvents.reason,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, access.organizationId),
        eq(auditEvents.entityType, 'rate_plan'),
        eq(auditEvents.entityId, plan.id),
      ),
    )
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(3)
  return {
    items: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
  }
}
