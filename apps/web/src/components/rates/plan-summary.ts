// One line on what a plan costs, for the list: "₦120,000 – ₦320,000" for own prices (weekday), or
// "Best available + ₦18,000" for a derived plan.
import { dec, type RatePlanView } from '@vento/shared'
import { adjustmentLabel, formatNaira } from './format'

export function priceSummary(
  plan: Pick<RatePlanView, 'pricing' | 'parent' | 'adjustment' | 'roomTypes'>,
): string {
  if (plan.pricing === 'derived' && plan.parent && plan.adjustment) {
    return adjustmentLabel(plan.parent.name, plan.adjustment)
  }
  const prices = plan.roomTypes.flatMap((row) => (row.weekday ? [row.weekday] : []))
  if (prices.length === 0) return 'No prices yet'
  const sorted = [...prices].sort((a, b) => dec(a).comparedTo(dec(b)))
  const low = sorted[0] ?? '0'
  const high = sorted.at(-1) ?? low
  return dec(low).equals(high) ? formatNaira(low) : `${formatNaira(low)} – ${formatNaira(high)}`
}
