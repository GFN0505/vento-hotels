// Checks every rates write runs inside its transaction, after its changes and before it commits:
// - no derived plan may cost ₦0 or less on any night from the business date on;
// - after go-live, lowering tonight's price (any plan, any room type, the current business date)
//   needs a reason and flags the audit event for the owner's daily report.
// Both compare prices through the shared maths, so they see exactly what a quote would.
import {
  dec,
  firstNightBelowAllocation,
  firstNonPositiveNight,
  type LoweredTonight,
  lastRateDate,
  nightOf,
} from '@vento/shared'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { roomTypes } from '../db/schema/rooms.ts'
import type { Access } from '../tenancy/access.ts'
import { isLive, type RatesProperty, type Reader, type Tx } from './context.ts'
import { allocationAbovePrice, derivedNotPositive, lowerTonightReason } from './errors.ts'
import { loadPricing, sourceFor } from './pricing-data.ts'

export type PropertyRoomType = {
  id: string
  name: string
  code: string
  baseOccupancy: number
  maxAdults: number
  maxChildren: number
  archived: boolean
}

// The hotel's room types in sort order (active only unless asked).
export async function loadRoomTypes(
  db: Reader,
  scope: { organizationId: string; propertyId: string },
  includeArchived = false,
): Promise<PropertyRoomType[]> {
  const rows = await db
    .select({
      id: roomTypes.id,
      name: roomTypes.name,
      code: roomTypes.code,
      baseOccupancy: roomTypes.baseOccupancy,
      maxAdults: roomTypes.maxAdults,
      maxChildren: roomTypes.maxChildren,
      archivedAt: roomTypes.archivedAt,
    })
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.organizationId, scope.organizationId),
        eq(roomTypes.propertyId, scope.propertyId),
        includeArchived ? undefined : isNull(roomTypes.archivedAt),
      ),
    )
    .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.name))
  return rows.map(({ archivedAt, ...row }) => ({ ...row, archived: archivedAt !== null }))
}

const scopeOf = (access: Access, property: Pick<RatesProperty, 'id'>) => ({
  organizationId: access.organizationId,
  propertyId: property.id,
})

// Every active plan, for every room type it sells, from the business date to the last settable
// date: a derived plan never costs ₦0 or less, and a meal plan never costs less than its meal
// allocation. Refuses the save (rolling it back) on the first night that breaks either.
export async function requireValidPrices(
  tx: Tx,
  access: Access,
  property: Pick<RatesProperty, 'id' | 'businessDate'>,
): Promise<void> {
  const from = property.businessDate
  const to = lastRateDate(from)
  const scope = scopeOf(access, property)
  const [pricing, types] = await Promise.all([
    loadPricing(tx, scope, { from, to }, { pricedOnly: true }),
    loadRoomTypes(tx, scope, true),
  ])
  for (const plan of pricing.plans) {
    for (const type of types) {
      const source = sourceFor(plan, type.id, pricing)
      if (!source) continue
      if (plan.adjustment) {
        const date = firstNonPositiveNight(source, plan.adjustment, from, to)
        if (date) throw derivedNotPositive(plan.name, type.name, date)
      }
      if (plan.mealAllocation) {
        const date = firstNightBelowAllocation(
          source,
          plan.adjustment,
          plan.mealAllocation,
          from,
          to,
        )
        if (date) throw allocationAbovePrice(plan.name, plan.mealAllocation, type.name, date)
      }
    }
  }
}

type Tonight = Map<string, Omit<LoweredTonight, 'before' | 'after'> & { price: string }>

async function tonightPrices(tx: Tx, access: Access, property: RatesProperty): Promise<Tonight> {
  const date = property.businessDate
  const scope = scopeOf(access, property)
  const [pricing, types] = await Promise.all([
    loadPricing(tx, scope, { from: date, to: date }),
    loadRoomTypes(tx, scope),
  ])
  const prices: Tonight = new Map()
  for (const plan of pricing.plans) {
    for (const type of types) {
      const source = sourceFor(plan, type.id, pricing)
      if (!source) continue
      prices.set(`${plan.id}:${type.id}`, {
        ratePlanId: plan.id,
        planName: plan.name,
        roomTypeId: type.id,
        roomTypeName: type.name,
        price: nightOf(source, plan.adjustment, plan.minStay, date).price,
      })
    }
  }
  return prices
}

export type TonightCheck = { before: Tonight | null }

// Call before the change. Before go-live nothing is compared, so nothing is read.
export async function tonightBefore(
  tx: Tx,
  access: Access,
  property: RatesProperty,
): Promise<TonightCheck> {
  return { before: isLive(property) ? await tonightPrices(tx, access, property) : null }
}

// What the audit event's `after` carries: `liveProperty`, and after go-live, when tonight's price
// went down, `exception: 'rate_lowered_tonight'` with each lowered price.
export type TonightFlags = {
  liveProperty: boolean
  exception?: 'rate_lowered_tonight'
  lowered?: LoweredTonight[]
}

// Call after the change, in the same transaction. Lowering tonight's price after go-live without
// a reason throws REASON_REQUIRED (listing what would go down), which rolls the change back.
export async function tonightAfter(
  tx: Tx,
  access: Access,
  property: RatesProperty,
  check: TonightCheck,
  reason: string | undefined,
): Promise<TonightFlags> {
  if (!check.before) return { liveProperty: false }
  const after = await tonightPrices(tx, access, property)
  const lowered: LoweredTonight[] = []
  for (const [key, now] of after) {
    const was = check.before.get(key)
    if (was && dec(now.price).lessThan(was.price)) {
      lowered.push({
        ratePlanId: now.ratePlanId,
        planName: now.planName,
        roomTypeId: now.roomTypeId,
        roomTypeName: now.roomTypeName,
        before: was.price,
        after: now.price,
      })
    }
  }
  if (lowered.length === 0) return { liveProperty: true }
  if (!reason) throw lowerTonightReason(lowered)
  return { liveProperty: true, exception: 'rate_lowered_tonight', lowered }
}
