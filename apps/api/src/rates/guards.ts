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
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { auditEvents } from '../db/schema/governance.ts'
import { roomTypes } from '../db/schema/rooms.ts'
import type { Access } from '../tenancy/access.ts'
import { isLive, type RatesProperty, type Reader, type Tx } from './context.ts'
import { allocationAbovePrice, derivedNotPositive, lowerTonightReason } from './errors.ts'
import { basePlanOf } from './plan-reads.ts'
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

type TonightEntry = Omit<LoweredTonight, 'before' | 'after' | 'against'> & {
  price: string
  bookableBy: 'anyone' | 'corporate_only'
}
type Tonight = Map<string, TonightEntry>
type TonightProperty = Pick<RatesProperty, 'id' | 'businessDate' | 'liveSince'>

async function tonightPrices(tx: Tx, access: Access, property: TonightProperty): Promise<Tonight> {
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
        bookableBy: plan.bookableBy,
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
  property: TonightProperty,
): Promise<TonightCheck> {
  return { before: isLive(property) ? await tonightPrices(tx, access, property) : null }
}

export type TonightRemoved = { ratePlanId: string; roomTypeId: string; price: string }

// What the audit event's `after` carries: `liveProperty`; after go-live, when tonight's price went
// down, `exception: 'rate_lowered_tonight'` with each lowered price; and `tonightRemoved`, the
// prices that stopped selling tonight (room type removed, plan or room type archived), so adding
// one back cheaper later the same business date is still caught.
export type TonightFlags = {
  liveProperty: boolean
  exception?: 'rate_lowered_tonight'
  lowered?: LoweredTonight[]
  tonightRemoved?: TonightRemoved[]
}

// What a plan × room type cost tonight before it was removed earlier this business date: the first
// removal recorded today, so a remove-then-re-add can't start from a price already cut.
async function earlierToday(
  tx: Tx,
  access: Access,
  property: TonightProperty,
  key: { ratePlanId: string; roomTypeId: string },
): Promise<string | null> {
  const probe = JSON.stringify([{ ratePlanId: key.ratePlanId, roomTypeId: key.roomTypeId }])
  const [event] = await tx
    .select({ after: auditEvents.after })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, access.organizationId),
        eq(auditEvents.propertyId, property.id),
        eq(auditEvents.businessDate, property.businessDate),
        sql`${auditEvents.after}->'tonightRemoved' @> ${probe}::jsonb`,
      ),
    )
    .orderBy(asc(auditEvents.createdAt))
    .limit(1)
  const removed = (event?.after as { tonightRemoved?: TonightRemoved[] } | undefined)
    ?.tonightRemoved
  return (
    removed?.find((r) => r.ratePlanId === key.ratePlanId && r.roomTypeId === key.roomTypeId)
      ?.price ?? null
  )
}

// Call after the change, in the same transaction. After go-live, a price is lowered when:
// - it sold tonight before this save and now costs less;
// - it was removed earlier this business date and comes back cheaper;
// - it belongs to a plan new tonight (created or restored), open to anyone, and costs less than
//   the base plan for the same room type.
// Lowering without a reason throws REASON_REQUIRED (listing what would go down), which rolls the
// change back.
export async function tonightAfter(
  tx: Tx,
  access: Access,
  property: TonightProperty,
  check: TonightCheck,
  reason: string | undefined,
): Promise<TonightFlags> {
  if (!check.before) return { liveProperty: false }
  const before = check.before
  const after = await tonightPrices(tx, access, property)
  const plansBefore = new Set([...before.values()].map((entry) => entry.ratePlanId))
  const base = await basePlanOf(tx, access.organizationId, property.id)
  const lowered: LoweredTonight[] = []
  for (const [key, now] of after) {
    let against: LoweredTonight['against'] = 'this_save'
    let was = before.get(key)?.price ?? null
    if (was === null) {
      against = 'earlier_today'
      was = await earlierToday(tx, access, property, now)
    }
    if (
      was === null &&
      !plansBefore.has(now.ratePlanId) &&
      now.bookableBy === 'anyone' &&
      base &&
      base.id !== now.ratePlanId
    ) {
      against = 'base_plan'
      was = after.get(`${base.id}:${now.roomTypeId}`)?.price ?? null
    }
    if (was !== null && dec(now.price).lessThan(was)) {
      lowered.push({
        ratePlanId: now.ratePlanId,
        planName: now.planName,
        roomTypeId: now.roomTypeId,
        roomTypeName: now.roomTypeName,
        before: was,
        after: now.price,
        against,
      })
    }
  }
  const removed = [...before]
    .filter(([key]) => !after.has(key))
    .map(([, entry]) => ({
      ratePlanId: entry.ratePlanId,
      roomTypeId: entry.roomTypeId,
      price: entry.price,
    }))
  const flags: TonightFlags = {
    liveProperty: true,
    ...(removed.length > 0 ? { tonightRemoved: removed } : {}),
  }
  if (lowered.length === 0) return flags
  if (!reason) throw lowerTonightReason(lowered)
  return { ...flags, exception: 'rate_lowered_tonight', lowered }
}

// One save may write several events; the exception and what it found go on one of them only, so
// the owner's report shows each cut once. The others carry just `liveProperty`.
export function onlyLive(flags: TonightFlags): Pick<TonightFlags, 'liveProperty'> {
  return { liveProperty: flags.liveProperty }
}
