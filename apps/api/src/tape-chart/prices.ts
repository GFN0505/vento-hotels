// Prices the chart and the Room move dialog show, from one load of the hotel's rates: tonight's
// Best available price per room type (the type header), and a plan's price per room type for a
// stay's nights (the "+₦60,000.00 a night incl. taxes" on other room types). Reads only: the
// figures a move saves come from the change service's quote.
import { type CalendarDate, dec, nightOf, toAmount } from '@vento/shared'
import { basePlanOf } from '../rates/plan-reads.ts'
import { loadPricing, sourceFor } from '../rates/pricing-data.ts'
import type { Reader } from '../reservations/context.ts'

type Scope = { organizationId: string; propertyId: string }

// Tonight's price on the hotel's base plan (Best available) per room type (null when not priced),
// and whether those prices are all-in.
export async function tonightPrices(
  db: Reader,
  scope: Scope,
  date: CalendarDate,
  roomTypeIds: readonly string[],
): Promise<{ prices: Map<string, string | null>; includesTaxes: boolean }> {
  const prices = new Map<string, string | null>(roomTypeIds.map((id) => [id, null]))
  const base = await basePlanOf(db, scope.organizationId, scope.propertyId)
  if (!base) return { prices, includesTaxes: true }
  const result = { prices, includesTaxes: base.pricesIncludeTaxes }
  const pricing = await loadPricing(db, scope, { from: date, to: date })
  const plan = pricing.byId.get(base.id)
  if (!plan) return result
  for (const id of roomTypeIds) {
    const source = sourceFor(plan, id, pricing)
    if (source) prices.set(id, nightOf(source, plan.adjustment, plan.minStay, date).price)
  }
  return result
}

// The average plan price a night over `dates` per room type the plan sells (types it doesn't sell
// are left out).
export async function planPricesFor(
  db: Reader,
  scope: Scope,
  ratePlanId: string,
  roomTypeIds: readonly string[],
  dates: readonly CalendarDate[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const first = dates[0]
  const last = dates.at(-1)
  if (!first || !last) return result
  const pricing = await loadPricing(db, scope, { from: first, to: last }, { includeArchived: true })
  const plan = pricing.byId.get(ratePlanId)
  if (!plan) return result
  for (const id of roomTypeIds) {
    const source = sourceFor(plan, id, pricing)
    if (!source) continue
    const sum = dates.reduce(
      (total, date) => total.plus(nightOf(source, plan.adjustment, plan.minStay, date).price),
      dec('0'),
    )
    result.set(id, toAmount(sum.dividedBy(dates.length)))
  }
  return result
}
