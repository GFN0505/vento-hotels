// One rate plan in the list: name and code, what it costs (own prices or how it follows its parent),
// meal plan and terms, who follows it, and its actions. Phones show two lines and a chevron.
import { Link } from '@tanstack/react-router'
import type { RatePlanView } from '@vento/shared'
import { ChevronDown, ChevronRight, ChevronUp, GripVertical, Link2 } from 'lucide-react'
import type { HTMLAttributes } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/cn'
import { cancellationLabel, listNames, MEAL_PLAN_LABELS } from './format'
import { priceSummary } from './plan-summary'
import type { usePlanActions } from './use-plan-actions'

type Props = {
  plan: RatePlanView
  // Reordering (active plans, rates.edit, online): position and how to move.
  order?:
    | { index: number; count: number; pending: boolean; onMove: (to: number) => void }
    | undefined
  actions?: ReturnType<typeof usePlanActions> | undefined
  // Drag to reorder, on wider screens.
  rowProps?: HTMLAttributes<HTMLTableRowElement> | undefined
}

export function PlanBadges({
  plan,
}: {
  plan: Pick<RatePlanView, 'bookableBy' | 'pricesIncludeTaxes'>
}) {
  return (
    <>
      {plan.bookableBy === 'corporate_only' ? (
        <StatusBadge tone="blue">Corporate only</StatusBadge>
      ) : null}
      {plan.pricesIncludeTaxes ? <StatusBadge>Incl. taxes</StatusBadge> : null}
    </>
  )
}

export function PlanRow({ plan, order, actions, rowProps }: Props) {
  const derived = plan.pricing === 'derived'
  const summary = priceSummary(plan)
  const cell = 'px-3 py-3 align-top max-md:hidden'
  return (
    <tr
      {...rowProps}
      className={cn('transition-colors hover:bg-surface-2/40 max-md:relative', rowProps?.className)}
    >
      <td className="w-10 py-3 pl-3 align-top max-md:hidden">
        {order ? (
          <GripVertical className="mt-0.5 size-4 cursor-grab text-text-3" aria-hidden="true" />
        ) : null}
      </td>
      <td className="px-3 py-3 align-top max-md:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {derived ? (
            <Link2 className="size-3.5 flex-none text-text-3" aria-label="Derived plan" />
          ) : null}
          <Link
            to="/rates/plans/$planId"
            params={{ planId: plan.id }}
            className="min-w-0 truncate font-medium hover:text-pri-ink hover:underline max-md:after:absolute max-md:after:inset-0"
            title={plan.name}
          >
            {plan.name}
          </Link>
          <span className="num text-xs text-text-3">{plan.code}</span>
          <PlanBadges plan={plan} />
        </div>
        <p className="mt-0.5 text-sm text-text-2 md:hidden">
          <span className="num">{summary}</span> · {MEAL_PLAN_LABELS[plan.mealPlan]}
        </p>
        {plan.followers.length > 0 ? (
          <p className="mt-0.5 text-sm text-text-3">
            Followed by {listNames(plan.followers.map((f) => f.name))}
          </p>
        ) : null}
      </td>
      <td className={cn(cell, 'num whitespace-nowrap')}>
        {summary}
        <span className="block text-sm text-text-3">
          {derived ? 'Follows its parent' : 'Own prices, weekday'}
        </span>
      </td>
      <td className={cn(cell, 'text-text-2')}>{MEAL_PLAN_LABELS[plan.mealPlan]}</td>
      <td className={cn(cell, 'max-w-64 text-text-2 max-lg:hidden')}>
        {cancellationLabel(plan.cancellation)}
      </td>
      <td className="px-3 py-2 text-right align-top max-md:relative max-md:w-12 max-md:px-2 max-md:align-middle">
        <span className="inline-flex items-center gap-1 max-md:hidden">
          {order ? (
            <span className="inline-flex">
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Move ${plan.name} up`}
                disabled={order.index === 0 || order.pending}
                onClick={() => order.onMove(order.index - 1)}
              >
                <ChevronUp className="size-4" aria-hidden="true" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Move ${plan.name} down`}
                disabled={order.index === order.count - 1 || order.pending}
                onClick={() => order.onMove(order.index + 1)}
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </Button>
            </span>
          ) : null}
          {plan.archivedAt && actions ? (
            <>
              <Button
                size="sm"
                loading={actions.restoring === plan.id}
                onClick={() => actions.restore(plan)}
              >
                Restore
              </Button>
              {plan.canDelete ? (
                <Button size="sm" variant="danger" onClick={() => actions.remove(plan)}>
                  Delete for good
                </Button>
              ) : null}
            </>
          ) : null}
        </span>
        <ChevronRight className="size-4 text-text-3 md:hidden" aria-hidden="true" />
      </td>
    </tr>
  )
}
