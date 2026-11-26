// The editor's Change history card (design #33): the last 3 changes to the plan, who made them and
// when, with the reason where one was given. The audit log viewer (#28) isn't built yet, so there's
// no link to it.
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { orpc } from '@/lib/api'

const ACTIONS: Record<string, string> = {
  'rate_plan.created': 'Plan created',
  'rate_plan.changed': 'Terms changed',
  'rate_plan.prices_changed': 'Standard prices changed',
  'rate_plan.archived': 'Archived',
  'rate_plan.restored': 'Restored',
  'rate_plans.reordered': 'Order changed',
  'rates.dates_changed': 'Date prices or restrictions changed',
}

const when = (at: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(at),
  )

export function EditorHistory({ planId }: { planId: string }) {
  const history = useQuery(orpc.ratePlans.history.queryOptions({ input: { id: planId } }))
  const items = history.data?.items ?? []
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <History className="size-4 text-text-3" aria-hidden="true" />
        Change history
      </h2>
      {history.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <span className="h-4 animate-pulse rounded-sm bg-surface-2" />
          <span className="h-4 w-2/3 animate-pulse rounded-sm bg-surface-2" />
        </div>
      ) : history.isError ? (
        <p className="text-sm text-text-2">
          Couldn't load the history. It's kept; try again later.
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-2">No changes yet.</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col text-sm">
              <span className="font-medium">{ACTIONS[item.action] ?? 'Changed'}</span>
              <span className="num text-text-2">
                {[item.actorName, when(item.createdAt)].filter(Boolean).join(' · ')}
              </span>
              {item.reason ? <span className="text-text-3">Reason: {item.reason}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
