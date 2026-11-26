// The first-rate table (spec step 1–3, OnbRate): one price per room type creates Best available
// (BAR) with the recommended terms, and optionally Bed & breakfast (BB) at + ₦18,000 with the
// ₦18,000 as its meal allocation. One transaction, one audit event per plan.
import {
  BREAKFAST_SUPPLEMENT,
  DEFAULT_CANCELLATION,
  DEFAULT_DEPOSIT,
  type RatePlanView,
} from '@vento/shared'
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { ratePlans } from '../db/schema/rates.ts'
import type { Access } from '../tenancy/access.ts'
import { holdRatesProperty, requireRatesEdit } from './context.ts'
import { noRoomTypes, plansExist } from './errors.ts'
import { loadRoomTypes } from './guards.ts'
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
  pricesIncludeTaxes: false,
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
    const property = await holdRatesProperty(tx, access, input.propertyId)
    const scope = { organizationId: access.organizationId, propertyId: property.id }
    if ((await loadRoomTypes(tx, scope)).length === 0) throw noRoomTypes()
    // Two people pressing "Create Best available" at once: the second waits, then sees the first's
    // plans. Held to the end of the transaction, keyed on the hotel.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`first-rate:${property.id}`}, 0))`,
    )
    const [active] = await tx
      .select({ value: count() })
      .from(ratePlans)
      .where(
        and(
          plansInScope(access),
          eq(ratePlans.propertyId, property.id),
          isNull(ratePlans.archivedAt),
        ),
      )
    if ((active?.value ?? 0) > 0) throw plansExist()
    const extra = { firstRate: true }
    const barId = await insertPlan(tx, access, property, BEST_AVAILABLE, input.prices, extra)
    const ids = [barId]
    if (input.withBreakfast) {
      const types = input.prices.map((p) => ({ roomTypeId: p.roomTypeId }))
      ids.push(await insertPlan(tx, access, property, bedAndBreakfast(barId), types, extra))
    }
    const rows = await Promise.all(ids.map((id) => findPlan(tx, access, id)))
    return { plans: await planViews(tx, property, rows) }
  })
}
