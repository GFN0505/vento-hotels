// The first-rate table (spec step 1–3, OnbRate): one price per room type creates Best available
// (BAR) with the recommended terms, and optionally Bed & breakfast (BB) at + ₦18,000 with the
// ₦18,000 as its meal allocation. One transaction, one audit event per plan.
import {
  BREAKFAST_SUPPLEMENT,
  DEFAULT_CANCELLATION,
  DEFAULT_DEPOSIT,
  type RatePlanView,
} from '@vento/shared'
import { and, count, eq, sql } from 'drizzle-orm'
import { recordAuditMany } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { ratePlans } from '../db/schema/rates.ts'
import type { Access } from '../tenancy/access.ts'
import { holdRatesProperty, lockHotelRates, requireRatesEdit } from './context.ts'
import { noRoomTypes, plansArchived, plansExist } from './errors.ts'
import { loadRoomTypes, tonightAfter, tonightBefore } from './guards.ts'
import type { PlanTerms } from './plan-model.ts'
import { findPlan, plansInScope, planViews } from './plan-reads.ts'
import { insertPlan } from './plan-writes.ts'

const BEST_AVAILABLE: PlanTerms = {
  name: 'Best available',
  code: 'BAR',
  pricing: 'own',
  parentId: null,
  adjustment: null,
  mealPlan: 'room_only',
  mealAllocation: null,
  cancellation: DEFAULT_CANCELLATION,
  deposit: DEFAULT_DEPOSIT,
  minStay: 1,
  extraAdult: null,
  bookableBy: 'anyone',
  // All-in prices, as most Nigerian hotels quote them (decision 0032).
  pricesIncludeTaxes: true,
}

const bedAndBreakfast = (parentId: string): PlanTerms => ({
  ...BEST_AVAILABLE,
  name: 'Bed & breakfast',
  code: 'BB',
  pricing: 'derived',
  parentId,
  adjustment: { kind: 'amount', value: BREAKFAST_SUPPLEMENT },
  mealPlan: 'bed_breakfast',
  mealAllocation: BREAKFAST_SUPPLEMENT,
})

export async function createFirstRatePlans(
  db: Database,
  access: Access,
  input: {
    propertyId: string
    prices: { roomTypeId: string; weekday: string; weekend: string | null }[]
    withBreakfast: boolean
  },
): Promise<{ plans: RatePlanView[] }> {
  requireRatesEdit(access)
  return db.transaction(async (tx) => {
    // Two people pressing "Create Best available" at once: the second waits, then sees the first's
    // plans.
    await lockHotelRates(tx, input.propertyId)
    const property = await holdRatesProperty(tx, access, input.propertyId)
    const scope = { organizationId: access.organizationId, propertyId: property.id }
    if ((await loadRoomTypes(tx, scope)).length === 0) throw noRoomTypes()
    const counts = await tx
      .select({ archived: sql<boolean>`${ratePlans.archivedAt} is not null`, value: count() })
      .from(ratePlans)
      .where(and(plansInScope(access), eq(ratePlans.propertyId, property.id)))
      .groupBy(sql`${ratePlans.archivedAt} is not null`)
    if (counts.some((row) => !row.archived && row.value > 0)) throw plansExist()
    // Every plan archived: the first-rate table would clash with their codes, and they may just
    // need restoring. The web shows the Archived list.
    if (counts.some((row) => row.archived && row.value > 0)) throw plansArchived()
    const tonight = await tonightBefore(tx, access, property)
    const extra = { firstRate: true }
    const bar = await insertPlan(tx, access, property, BEST_AVAILABLE, input.prices, extra)
    const created = [bar]
    if (input.withBreakfast) {
      const types = input.prices.map((p) => ({ roomTypeId: p.roomTypeId }))
      created.push(await insertPlan(tx, access, property, bedAndBreakfast(bar.id), types, extra))
    }
    const flags = await tonightAfter(tx, access, property, tonight, undefined)
    await recordAuditMany(
      tx,
      access,
      created.map(({ event }) => ({ ...event, after: { ...event.after, ...flags } })),
    )
    const ids = created.map((plan) => plan.id)
    const rows = await Promise.all(ids.map((id) => findPlan(tx, access, id)))
    return { plans: await planViews(tx, property, rows) }
  })
}
