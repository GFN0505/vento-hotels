// A plan's name at the start of its calendar row: derived plans get the link icon and how they
// follow their parent ("Best available + ₦18,000"); corporate plans, and plans priced before taxes
// (all-in is the default, decision 0032), say so.
import type { RatePlanView } from '@vento/shared'
import { Link2 } from 'lucide-react'
import type { CalendarRow } from './calendar-model'
import { priceSummary } from './plan-summary'

export function PlanLabel({ row, plan }: { row: CalendarRow; plan: RatePlanView | undefined }) {
  const derived = row.pricing === 'derived'
  const sub = [
    derived
      ? plan
        ? priceSummary(plan)
        : `Follows ${row.parent?.name ?? 'its parent'}`
      : 'Own prices',
    row.bookableBy === 'corporate_only' ? 'corporate' : null,
    row.pricesIncludeTaxes ? null : 'excl. taxes',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex min-w-0 items-center gap-1.5">
        {derived ? (
          <Link2 className="size-3.5 flex-none text-text-3" aria-label="Derived plan" />
        ) : null}
        <span className={derived ? 'truncate' : 'truncate font-medium'} title={row.name}>
          {row.name}
        </span>
      </span>
      <span className="num truncate text-xs font-normal text-text-3" title={sub}>
        {sub}
      </span>
    </span>
  )
}
