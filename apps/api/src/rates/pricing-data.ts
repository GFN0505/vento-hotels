// Loads what the shared pricing maths needs: a hotel's plans, the room types each sells with their
// standard prices, and the date cells of own-price plans in a range. Reads, quotes, the calendar,
// the "₦0 or less" check and the "lowered tonight" check all price through this, so a derived
// plan's price is computed one way only.
import type {
  CalendarDate,
  DateCell,
  PriceSource,
  RateAdjustment,
  StandardPrice,
} from '@vento/shared'
import { toAmount } from '@vento/shared'
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, type SQL } from 'drizzle-orm'
import { rateDates, ratePlanRoomTypes, ratePlans } from '../db/schema/rates.ts'
import type { Reader } from './context.ts'
import { adjustmentOf, type PlanRow } from './plan-model.ts'

export type PlanCore = {
  id: string
  name: string
  code: string
  pricing: PlanRow['pricing']
  parentId: string | null
  adjustment: RateAdjustment | null
  minStay: number
  extraAdult: string | null
  mealPlan: PlanRow['mealPlan']
  mealAllocation: string | null
  bookableBy: PlanRow['bookableBy']
  pricesIncludeTaxes: boolean
  sortOrder: number
  archived: boolean
  version: number
}

export type StoredCell = DateCell & { seasonName: string | null }

const coreColumns = {
  id: ratePlans.id,
  name: ratePlans.name,
  code: ratePlans.code,
  pricing: ratePlans.pricing,
  parentId: ratePlans.parentId,
  adjustmentPercent: ratePlans.adjustmentPercent,
  adjustmentAmount: ratePlans.adjustmentAmount,
  minStay: ratePlans.minStay,
  extraAdult: ratePlans.extraAdult,
  mealPlan: ratePlans.mealPlan,
  mealAllocation: ratePlans.mealAllocation,
  bookableBy: ratePlans.bookableBy,
  pricesIncludeTaxes: ratePlans.pricesIncludeTaxes,
  sortOrder: ratePlans.sortOrder,
  archivedAt: ratePlans.archivedAt,
  version: ratePlans.version,
}

// A hotel's plans in sort order (active only unless asked). The caller has already checked the
// hotel is in the member's organization and scope; the organization is filtered here too.
export async function loadPlans(
  db: Reader,
  scope: { organizationId: string; propertyId: string },
  options: { includeArchived?: boolean; where?: SQL } = {},
): Promise<PlanCore[]> {
  const rows = await db
    .select(coreColumns)
    .from(ratePlans)
    .where(
      and(
        eq(ratePlans.organizationId, scope.organizationId),
        eq(ratePlans.propertyId, scope.propertyId),
        options.includeArchived ? undefined : isNull(ratePlans.archivedAt),
        options.where,
      ),
    )
    .orderBy(asc(ratePlans.sortOrder), asc(ratePlans.name))
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    pricing: row.pricing,
    parentId: row.parentId,
    adjustment: adjustmentOf(row),
    minStay: row.minStay,
    extraAdult: row.extraAdult === null ? null : toAmount(row.extraAdult),
    mealPlan: row.mealPlan,
    mealAllocation: row.mealAllocation === null ? null : toAmount(row.mealAllocation),
    bookableBy: row.bookableBy,
    pricesIncludeTaxes: row.pricesIncludeTaxes,
    sortOrder: row.sortOrder,
    archived: row.archivedAt !== null,
    version: row.version,
  }))
}

// plan id → room type id → standard price (null on derived plans).
export type PlanRoomTypes = Map<string, Map<string, StandardPrice | null>>

export async function loadPlanRoomTypes(
  db: Reader,
  planIds: readonly string[],
): Promise<PlanRoomTypes> {
  const result: PlanRoomTypes = new Map(planIds.map((id) => [id, new Map()]))
  if (planIds.length === 0) return result
  const rows = await db
    .select({
      ratePlanId: ratePlanRoomTypes.ratePlanId,
      roomTypeId: ratePlanRoomTypes.roomTypeId,
      weekday: ratePlanRoomTypes.weekdayPrice,
      weekend: ratePlanRoomTypes.weekendPrice,
    })
    .from(ratePlanRoomTypes)
    .where(inArray(ratePlanRoomTypes.ratePlanId, [...planIds]))
  for (const row of rows) {
    result
      .get(row.ratePlanId)
      ?.set(
        row.roomTypeId,
        row.weekday === null
          ? null
          : { weekday: toAmount(row.weekday), weekend: row.weekend && toAmount(row.weekend) },
      )
  }
  return result
}

// plan id → room type id → date → cell.
export type Cells = Map<string, Map<string, Map<CalendarDate, StoredCell>>>

export async function loadCells(
  db: Reader,
  planIds: readonly string[],
  from: CalendarDate,
  to: CalendarDate,
  options: { pricedOnly?: boolean } = {},
): Promise<Cells> {
  const result: Cells = new Map()
  if (planIds.length === 0) return result
  const rows = await db
    .select({
      ratePlanId: rateDates.ratePlanId,
      roomTypeId: rateDates.roomTypeId,
      date: rateDates.date,
      price: rateDates.price,
      closed: rateDates.closed,
      closedToArrival: rateDates.closedToArrival,
      minStay: rateDates.minStay,
      seasonName: rateDates.seasonName,
    })
    .from(rateDates)
    .where(
      and(
        inArray(rateDates.ratePlanId, [...planIds]),
        gte(rateDates.date, from),
        lte(rateDates.date, to),
        options.pricedOnly ? isNotNull(rateDates.price) : undefined,
      ),
    )
  for (const row of rows) {
    const byType = result.get(row.ratePlanId) ?? new Map<string, Map<CalendarDate, StoredCell>>()
    result.set(row.ratePlanId, byType)
    const byDate = byType.get(row.roomTypeId) ?? new Map<CalendarDate, StoredCell>()
    byType.set(row.roomTypeId, byDate)
    byDate.set(row.date, {
      price: row.price === null ? null : toAmount(row.price),
      closed: row.closed,
      closedToArrival: row.closedToArrival,
      minStay: row.minStay,
      seasonName: row.seasonName,
    })
  }
  return result
}

const NO_CELLS: ReadonlyMap<CalendarDate, StoredCell> = new Map()

// The own-price plan whose prices a plan uses: itself, or its parent.
export function basePlanOf(plan: PlanCore, byId: ReadonlyMap<string, PlanCore>): PlanCore | null {
  if (plan.pricing === 'own') return plan
  return (plan.parentId && byId.get(plan.parentId)) || null
}

// What prices `plan` for `roomTypeId`: the base plan's standard price, date cells and extra adult
// amount. Null when the plan (or its parent) doesn't sell the room type.
export function sourceFor(
  plan: PlanCore,
  roomTypeId: string,
  data: { byId: ReadonlyMap<string, PlanCore>; roomTypes: PlanRoomTypes; cells: Cells },
): (Omit<PriceSource, 'dates'> & { dates: ReadonlyMap<CalendarDate, StoredCell> }) | null {
  if (!data.roomTypes.get(plan.id)?.has(roomTypeId)) return null
  const base = basePlanOf(plan, data.byId)
  if (!base) return null
  const standard = data.roomTypes.get(base.id)?.get(roomTypeId)
  if (!standard) return null
  return {
    standard,
    dates: data.cells.get(base.id)?.get(roomTypeId) ?? NO_CELLS,
    extraAdult: base.extraAdult,
  }
}

// Everything needed to price a hotel's plans in a range, in three queries.
export async function loadPricing(
  db: Reader,
  scope: { organizationId: string; propertyId: string },
  range: { from: CalendarDate; to: CalendarDate },
  options: { includeArchived?: boolean; pricedOnly?: boolean } = {},
) {
  const plans = await loadPlans(db, scope, options)
  const byId = new Map(plans.map((plan) => [plan.id, plan]))
  // A derived plan's parent is always loaded: archived parents can't have active followers, but
  // an archived follower may be read.
  const missingParents = plans
    .map((plan) => plan.parentId)
    .filter((id): id is string => id !== null && !byId.has(id))
  if (missingParents.length > 0) {
    const parents = await loadPlans(db, scope, {
      includeArchived: true,
      where: inArray(ratePlans.id, missingParents),
    })
    for (const parent of parents) byId.set(parent.id, parent)
  }
  const ids = [...byId.keys()]
  const ownIds = [...byId.values()].filter((p) => p.pricing === 'own').map((p) => p.id)
  const [roomTypes, cells] = await Promise.all([
    loadPlanRoomTypes(db, ids),
    loadCells(db, ownIds, range.from, range.to, options),
  ])
  return { plans, byId, roomTypes, cells }
}
export type Pricing = Awaited<ReturnType<typeof loadPricing>>
