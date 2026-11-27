// Approvals (design #29: Inbox view approvals, InboxApprovals*, ApprovalPhone; spec "Bell and
// inbox"): a group page. One hotel selected shows its requests; All hotels shows every hotel the
// member sees, each row naming its hotel. Waiting (oldest first), Asked by you and Done (newest
// first), 50 a page; the detail beside the list on desktop, on its own on phones. Offline, the
// rows loaded in this visit stay on screen read-only (in memory only: guest names never go to the
// device's storage).
import { useQuery } from '@tanstack/react-query'
import type { ApprovalListView, ApprovalView } from '@vento/shared'
import { ArrowLeft, Inbox, SearchX, WifiOff } from 'lucide-react'
import { LoadError, RowsSkeleton } from '@/components/settings/load-states'
import { useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/media'
import { keepWithinHotel, scopeName, scopePropertyId } from '@/lib/scope'
import { offlineSince, useOnline } from '@/offline/connection'
import { ApprovalDetailCard } from './approval-detail'
import { age, rowAmount, rowLabel, rowTitle, statusBadge } from './format'

export const APPROVALS_PAGE_SIZE = 50

export type ApprovalsSearch = {
  view?: Exclude<ApprovalListView, 'waiting'> | undefined
  page?: number | undefined
  id?: string | undefined
}
export type OnApprovalsSearch = (
  patch: Partial<ApprovalsSearch>,
  options?: { push?: boolean },
) => void

const EMPTY: Record<ApprovalListView, string> = {
  waiting: 'Nothing waiting for you. Approvals your team asks you for show up here.',
  asked:
    "You haven't asked for any approvals today. When a discount is over your limit, you can ask a manager from Review & book.",
  done: 'No answered requests yet.',
}

const clock = (at: number) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(at)

export function ApprovalsPage({
  search,
  onSearch,
  userName,
}: {
  search: ApprovalsSearch
  onSearch: OnApprovalsSearch
  userName: string
}) {
  const { scope } = useProperty()
  const online = useOnline()
  const wide = useMediaQuery('(min-width: 1024px)')
  useScopedTitle('Approvals')
  const propertyId = scopePropertyId(scope)
  const view: ApprovalListView = search.view ?? 'waiting'
  const page = search.page ?? 1
  const list = useQuery({
    ...orpc.approvals.list.queryOptions({
      input: { view, propertyId, page, pageSize: APPROVALS_PAGE_SIZE },
    }),
    enabled: scope !== undefined,
    placeholderData: keepWithinHotel(propertyId),
    refetchOnWindowFocus: true,
  })
  const count = useQuery({
    ...orpc.approvals.count.queryOptions({ input: { propertyId } }),
    enabled: scope !== undefined,
    placeholderData: keepWithinHotel(propertyId),
  })
  const items = list.data?.items ?? []
  // Desktop opens the first row; phones show the list until a row is tapped.
  const selectedId = search.id ?? (wide ? items[0]?.id : undefined)
  const detail = useQuery({
    ...orpc.approvals.get.queryOptions({ input: { id: selectedId ?? '' } }),
    enabled: Boolean(selectedId),
    retry: false,
  })

  const where = scope ? scopeName(scope) : ''
  const name = userName
  const waiting = count.data?.waiting
  const segments: { value: ApprovalListView; label: string }[] = [
    { value: 'waiting', label: waiting ? `Waiting ${waiting}` : 'Waiting' },
    { value: 'asked', label: 'Asked by you' },
    { value: 'done', label: 'Done' },
  ]
  const showDetailOnly = !wide && Boolean(search.id)
  const since = offlineSince()

  return (
    <div className="flex flex-col gap-5">
      {!online ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-border bg-am-bg px-4 py-2.5 text-am"
        >
          <WifiOff className="mt-0.5 size-4 flex-none" aria-hidden="true" />
          <p>
            {list.data ? (
              <>
                <span className="font-semibold">
                  {since ? `Offline since ${clock(since)}.` : 'Offline.'}
                </span>{' '}
                Showing what loaded before {since ? clock(since) : 'now'}. Approving needs a
                connection.
              </>
            ) : (
              "You're offline. Approvals show again when you're back."
            )}
          </p>
        </div>
      ) : null}
      <PageHeader
        title="Approvals"
        description={name ? `Everything waiting for ${name} · ${where}` : undefined}
        actions={
          <div
            role="tablist"
            aria-label="Approvals"
            className="inline-flex rounded-sm border border-input bg-surface-2 p-0.5"
          >
            {segments.map((segment) => (
              <button
                key={segment.value}
                type="button"
                role="tab"
                aria-selected={view === segment.value}
                onClick={() =>
                  onSearch({
                    view: segment.value === 'waiting' ? undefined : segment.value,
                    page: undefined,
                    id: undefined,
                  })
                }
                className={cn(
                  'num min-h-11 rounded-[5px] px-3 text-sm font-medium text-text-2 lg:min-h-8',
                  view === segment.value && 'bg-surface text-text shadow-card',
                )}
              >
                {segment.label}
              </button>
            ))}
          </div>
        }
      />
      {list.isPending || !scope ? (
        <div className="rounded-lg border border-border bg-surface shadow-card">
          <RowsSkeleton rows={6} label="Loading approvals" />
        </div>
      ) : list.isError && !list.data ? (
        online ? (
          <div className="flex flex-col gap-2">
            <p className="font-medium">Couldn't load approvals at {where}.</p>
            <LoadError onRetry={() => list.refetch()} retrying={list.isFetching} />
          </div>
        ) : null
      ) : items.length === 0 ? (
        <EmptyState
          icon={view === 'waiting' ? Inbox : SearchX}
          tone="brand"
          className="border-dashed"
        >
          {EMPTY[view]}
        </EmptyState>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {showDetailOnly ? null : (
            <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card">
              <ul aria-label={segments.find((s) => s.value === view)?.label}>
                {items.map((item) => (
                  <li key={item.id}>
                    <Row
                      view={item}
                      selected={item.id === selectedId}
                      onOpen={() => onSearch({ id: item.id }, { push: !wide })}
                    />
                  </li>
                ))}
              </ul>
              {(list.data?.total ?? 0) > APPROVALS_PAGE_SIZE ? (
                <Pagination
                  page={page}
                  pageSize={APPROVALS_PAGE_SIZE}
                  total={list.data?.total ?? 0}
                  onPage={(next: number) => onSearch({ page: next, id: undefined })}
                />
              ) : null}
            </div>
          )}
          {selectedId ? (
            <div className="flex min-w-0 flex-col gap-3">
              {showDetailOnly ? (
                <button
                  type="button"
                  onClick={() => onSearch({ id: undefined })}
                  className="inline-flex min-h-11 w-fit items-center gap-1.5 font-medium text-pri-ink"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back to approvals
                </button>
              ) : null}
              {detail.data ? (
                <ApprovalDetailCard key={detail.data.id} view={detail.data} />
              ) : detail.isError ? (
                <p
                  role="alert"
                  className="rounded-lg border border-border bg-surface p-5 text-text-2"
                >
                  We couldn't find that request.
                </p>
              ) : (
                <div className="h-72 animate-pulse rounded-lg bg-surface-2" aria-hidden="true" />
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function Row({
  view,
  selected,
  onOpen,
}: {
  view: ApprovalView
  selected: boolean
  onOpen: () => void
}) {
  const badge = statusBadge(view)
  const who = view.role === 'requester' ? (view.approver?.name ?? '') : view.requester.name
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onOpen}
      className={cn(
        'flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
        selected && 'bg-pri-soft hover:bg-pri-soft',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span
          className="truncate text-[11px] font-semibold tracking-[0.05em] text-text-2 uppercase"
          title={rowLabel(view)}
        >
          {rowLabel(view)}
        </span>
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-medium" title={rowTitle(view)}>
          {rowTitle(view)}
        </span>
        <span className="num shrink-0 font-medium">{rowAmount(view)}</span>
      </span>
      <span className="num truncate text-sm text-text-2">
        {view.role === 'requester' ? `To ${who}` : who} · {age(view.requestedAt)}
      </span>
    </button>
  )
}
