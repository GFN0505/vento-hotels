// A record's audit trail (designs: AuditOnRoom, AuditOnReservation): every change to it, newest
// first, with who, when, what changed and the reason. Only for people who may see the audit log
// (audit.view). Each record kind says how its events read (`describe`).
import { useInfiniteQuery } from '@tanstack/react-query'
import type { AuditEventView } from '@vento/shared'
import { AlertTriangle, History } from 'lucide-react'
import { Message } from '@/components/rooms/message'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'

export type AuditLine = {
  id: string
  title: string
  changes: string[]
  batch?: string | undefined
  who: string
  when: string
  reason: string | null
}

const PAGE = 30

type Props = {
  entityType: string
  entityId: string
  title: string
  describe: (event: AuditEventView) => AuditLine
  empty: string
  onClose: () => void
}

export function AuditSheet({ entityType, entityId, title, describe, empty, onClose }: Props) {
  const history = useInfiniteQuery(
    orpc.audit.list.infiniteOptions({
      input: (page: number) => ({ entityType, entityId, page, pageSize: PAGE }),
      initialPageParam: 1,
      getNextPageParam: (last) =>
        last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    }),
  )
  const lines = (history.data?.pages ?? []).flatMap((page) => page.items).map(describe)

  return (
    <Sheet open onClose={onClose} title="Audit trail" description={title}>
      {history.isPending ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading the audit trail"
          className="flex flex-col gap-4"
        >
          {['a', 'b', 'c', 'd'].map((key) => (
            <span key={key} className="h-16 animate-pulse rounded-sm bg-surface-2" />
          ))}
        </div>
      ) : history.isError ? (
        <Message icon={AlertTriangle} title="Couldn't load the audit trail." alert>
          <p className="text-sm text-text-3">{problemMessage(history.error)}</p>
          <Button variant="primary" className="max-lg:h-11" onClick={() => history.refetch()}>
            Try again
          </Button>
        </Message>
      ) : lines.length === 0 ? (
        <Message icon={History} title={empty} />
      ) : (
        <>
          <ol className="-mt-2 divide-y divide-border">
            {lines.map((line) => (
              <li key={line.id} className="flex flex-col gap-1 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{line.title}</span>
                  <span className="num flex-none text-sm text-text-3">{line.when}</span>
                </div>
                {line.changes.map((change) => (
                  <span key={change} className="num text-sm break-words">
                    {change}
                  </span>
                ))}
                {line.reason ? (
                  <span className="text-sm text-text-2">Reason: {line.reason}</span>
                ) : null}
                <span className="flex flex-wrap gap-x-3 text-sm text-text-2">
                  <span>{line.who}</span>
                  {line.batch ? <span className="text-text-3">{line.batch}</span> : null}
                </span>
              </li>
            ))}
          </ol>
          {history.hasNextPage ? (
            <Button
              className="mt-2 max-lg:h-11"
              loading={history.isFetchingNextPage}
              onClick={() => history.fetchNextPage()}
            >
              Show earlier changes
            </Button>
          ) : null}
        </>
      )}
    </Sheet>
  )
}
