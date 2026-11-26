// The hotel's rate plans in the order booking pickers follow (design #33). Drag a row on a desktop,
// or use Move up / Move down (also the keyboard way). Archived plans sit behind their own filter
// with Restore and, when never used, Delete for good.
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import type { RatePlanView } from '@vento/shared'
import { Archive, SearchX } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Message } from '@/components/rooms/message'
import { TableSkeleton } from '@/components/rooms/skeletons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { problemMessage } from '@/lib/errors'
import { PlanRow } from './plan-row'
import { plansQuery, useRatesRefresh } from './queries'
import { RatesLoadError } from './states'
import { usePlanActions } from './use-plan-actions'

type Props = {
  propertyId: string
  archived: boolean
  counts: { active: number; archived: number }
  canWrite: boolean
  onArchived: (archived: boolean) => void
}

export function PlansList({ propertyId, archived, counts, canWrite, onArchived }: Props) {
  const list = useQuery({ ...plansQuery(propertyId, archived), placeholderData: keepPreviousData })
  const actions = usePlanActions()
  const refresh = useRatesRefresh()
  const [order, setOrder] = useState<string[]>()
  const [dragging, setDragging] = useState<string>()
  // The previous filter's rows stay a moment while the next load; never show them as this one's.
  const items = list.isPlaceholderData ? undefined : list.data?.items
  const byId = new Map((items ?? []).map((plan) => [plan.id, plan]))
  const ordered: RatePlanView[] = (order ?? (items ?? []).map((p) => p.id)).flatMap(
    (id) => byId.get(id) ?? [],
  )
  const reorderable = canWrite && !archived && ordered.length > 1

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.ratePlans.reorder({ propertyId, ids }),
    onSettled: async () => {
      await refresh()
      setOrder(undefined)
    },
    onError: (error) => toast.error(problemMessage(error)),
  })

  function move(id: string, to: number) {
    const ids = ordered.map((p) => p.id).filter((x) => x !== id)
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id)
    setOrder(ids)
    reorder.mutate(ids)
  }

  const pill = (on: boolean) =>
    cn(
      'inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium lg:h-7',
      on
        ? 'border-pri-line bg-pri-soft text-pri-ink'
        : 'border-border text-text-2 hover:bg-surface-2',
    )
  return (
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <fieldset className="flex gap-2">
          <legend className="sr-only">Show</legend>
          <button
            type="button"
            aria-pressed={!archived}
            className={pill(!archived)}
            onClick={() => onArchived(false)}
          >
            Active <span className="num text-text-3">{counts.active}</span>
          </button>
          <button
            type="button"
            aria-pressed={archived}
            className={pill(archived)}
            onClick={() => onArchived(true)}
          >
            Archived <span className="num text-text-3">{counts.archived}</span>
          </button>
        </fieldset>
        {reorderable ? (
          <span className="text-sm text-text-3 max-md:hidden">
            Booking pickers follow this order
          </span>
        ) : null}
      </header>
      {list.isError ? (
        <div className="p-4">
          <RatesLoadError onRetry={() => void list.refetch()} />
        </div>
      ) : !items ? (
        <TableSkeleton rows={4} label="Loading rate plans" />
      ) : ordered.length === 0 ? (
        archived ? (
          <Message
            icon={Archive}
            title="No archived plans. Plans you archive are kept here, so they can be restored."
          />
        ) : (
          <Message icon={SearchX} title="No rate plans match these filters.">
            <Button className="max-lg:h-11" onClick={() => onArchived(false)}>
              Clear filters
            </Button>
          </Message>
        )
      ) : (
        <table className="w-full border-collapse text-left">
          <thead className="max-md:sr-only">
            <tr className="border-b border-border bg-surface-2/50 text-xs font-medium text-text-3">
              <th scope="col" className="w-10 py-2 pl-3">
                <span className="sr-only">Order</span>
              </th>
              <th scope="col" className="px-3 py-2">
                Plan
              </th>
              <th scope="col" className="px-3 py-2">
                Price per night
              </th>
              <th scope="col" className="px-3 py-2">
                Meal plan
              </th>
              <th scope="col" className="px-3 py-2 max-lg:hidden">
                Cancellation
              </th>
              <th scope="col" className="w-32 px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ordered.map((plan, index) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                actions={canWrite ? actions : undefined}
                order={
                  reorderable
                    ? {
                        index,
                        count: ordered.length,
                        pending: reorder.isPending,
                        onMove: (to) => move(plan.id, to),
                      }
                    : undefined
                }
                rowProps={
                  reorderable
                    ? {
                        draggable: true,
                        onDragStart: () => setDragging(plan.id),
                        onDragEnd: () => setDragging(undefined),
                        onDragOver: (event) => {
                          if (dragging && dragging !== plan.id) event.preventDefault()
                        },
                        onDrop: () => dragging && move(dragging, index),
                        className: cn(
                          dragging === plan.id && 'opacity-50',
                          dragging && dragging !== plan.id && 'hover:bg-pri-soft/40',
                        ),
                      }
                    : undefined
                }
              />
            ))}
          </tbody>
        </table>
      )}
      {actions.dialog}
    </Card>
  )
}
