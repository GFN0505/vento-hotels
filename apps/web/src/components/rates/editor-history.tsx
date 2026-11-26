// The editor's Change history card (design #33): the last 3 changes to the plan, who made them and
// when, with the reason where one was given. The audit log viewer (#28) isn't built yet, so there's
// no link to it. Before and after come from the audit log, for people who may read it.
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'
import { describeChange } from './history-model'

const when = (at: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(at),
  )

type Item = {
  id: string
  action: string
  actorName: string | null
  createdAt: string
  reason: string | null
  before?: unknown
  after?: unknown
}

export function EditorHistory({ planId }: { planId: string }) {
  // With the audit log, each change says what it changed; otherwise just what kind of change.
  const detailed = useMe().can('audit.view')
  const audit = useQuery({
    ...orpc.audit.list.queryOptions({
      input: { entityType: 'rate_plan', entityId: planId, pageSize: 3 },
    }),
    enabled: detailed,
  })
  const plain = useQuery({
    ...orpc.ratePlans.history.queryOptions({ input: { id: planId } }),
    enabled: !detailed,
  })
  const history = detailed ? audit : plain
  const items: Item[] = history.data?.items ?? []
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
              <ChangeTitle item={item} />
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

function ChangeTitle({ item }: { item: Item }) {
  const { title, lines } = describeChange(item)
  return (
    <>
      <span className="font-medium">{title}</span>
      {lines.map((line) => (
        <span key={line} className="num break-words text-text">
          {line}
        </span>
      ))}
    </>
  )
}
