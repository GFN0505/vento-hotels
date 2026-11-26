// Settings › Hotels with "All hotels" chosen (spec: "Settings › Hotels: the list"): every hotel in
// the group, 25 a page, by name. Archived ones are under their own chip, with Restore. A name search
// appears once the group has more than 10 hotels.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { Property } from '@vento/shared'
import { Building2, Search } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { LoadError, RowsSkeleton } from '@/components/settings/load-states'
import { type Show, StatusChips } from '@/components/settings/status-chips'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'
import { plural } from './format'
import type { HotelsSearch, OnHotelsSearch } from './hotels-search'
import { HotelsTable } from './hotels-table'
import { PAGE_SIZE } from './queries'
import { RestoreHotel } from './restore-hotel'

type Props = {
  search: HotelsSearch
  onSearch: OnHotelsSearch
  onOpen: (hotel: Property) => void
  addButton: ReactNode
  online: boolean
}

export function HotelsList({ search, onSearch, onOpen, addButton, online }: Props) {
  const me = useMe()
  const [restoring, setRestoring] = useState<Property>()
  const page = search.page ?? 1
  const archived = search.show === 'archived'
  const list = useQuery({
    ...orpc.properties.list.queryOptions({
      input: { status: search.show ?? 'active', page, pageSize: PAGE_SIZE, q: search.q },
    }),
    placeholderData: keepPreviousData,
  })
  const group = me.data?.organization.name ?? ''
  const total = list.data?.total
  const searchable = Boolean(search.q) || (total !== undefined && total > 10)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Hotels"
        description={
          total !== undefined && !archived && !search.q
            ? `${group} · ${plural(total, 'hotel')}`
            : group
        }
        actions={addButton}
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
          {searchable ? (
            <NameSearch value={search.q} onChange={(q) => onSearch({ q })} />
          ) : (
            <h2 className="grow font-semibold">{archived ? 'Archived hotels' : 'Active hotels'}</h2>
          )}
          <StatusChips show={search.show} onShow={(show: Show) => onSearch({ show })} />
        </div>
        {list.isPending ? (
          <RowsSkeleton rows={4} label="Loading hotels" />
        ) : list.isError && !list.data ? (
          <div className="p-4">
            <LoadError onRetry={() => list.refetch()} retrying={list.isFetching} />
          </div>
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={Building2}
            className="m-4 border-dashed shadow-none"
            action={
              <Button
                className="max-lg:h-11"
                onClick={() => onSearch({ show: undefined, q: undefined })}
              >
                {search.q ? 'Clear search' : 'Show active'}
              </Button>
            }
          >
            {search.q ? 'No hotels match this name.' : 'No archived hotels.'}
          </EmptyState>
        ) : (
          <HotelsTable
            hotels={list.data.items}
            dimmed={list.isPlaceholderData}
            canRestore={online && me.can('setup.manage')}
            onOpen={onOpen}
            onRestore={setRestoring}
          />
        )}
      </Card>
      {list.data ? (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={list.data.total}
          onPage={(next) => onSearch({ page: next }, { push: true })}
        />
      ) : null}
      {restoring ? (
        <RestoreHotel hotel={restoring} onClose={() => setRestoring(undefined)} />
      ) : null}
    </div>
  )
}

// Waits for a pause in typing before searching, so the list doesn't flicker on every key.
function NameSearch({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (q: string | undefined) => void
}) {
  const [text, setText] = useState(value ?? '')
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = text.trim() || undefined
      if (q !== value) onChange(q)
    }, 300)
    return () => clearTimeout(timer)
  }, [text, value, onChange])
  return (
    <label className="relative flex min-w-0 grow basis-56 items-center sm:max-w-xs">
      <span className="sr-only">Search hotels by name</span>
      <Search
        className="pointer-events-none absolute left-2.5 size-4 text-text-3"
        aria-hidden="true"
      />
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search hotels"
        className="h-11 w-full rounded-sm border border-input bg-surface pr-2.5 pl-8 text-[16px] text-text placeholder:text-text-3 focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none lg:h-8 lg:text-base"
      />
    </label>
  )
}
