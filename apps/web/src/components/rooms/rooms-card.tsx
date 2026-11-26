// The "All rooms" card: toolbar (sticky on wider screens, turning into the bulk bar when rooms are
// ticked), the table with its states, "select all in this view", and pages (100, or 50 on phones).
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { Property, RoomFilters, RoomsSummary, RoomTypeView } from '@vento/shared'
import { AlertTriangle, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Pagination } from '@/components/ui/pagination'
import { orpc } from '@/lib/api'
import { BulkBar } from './bulk-bar'
import { ChangeTypeDialog } from './change-type-dialog'
import { Message } from './message'
import { RoomsEmpty } from './rooms-empty'
import { type OnSearch, PAGE_SIZE, PHONE_PAGE_SIZE, type RoomsSearch } from './rooms-search'
import { RoomsTable } from './rooms-table'
import { RoomsToolbar } from './rooms-toolbar'
import { SelectAllBanner } from './select-all-banner'
import { TableSkeleton } from './skeletons'
import type { useRoomActions } from './use-room-actions'
import { useRoomSelection } from './use-room-selection'

type Props = {
  hotel: Property
  summary: RoomsSummary | undefined
  types: readonly RoomTypeView[]
  search: RoomsSearch
  canWrite: boolean
  actions: ReturnType<typeof useRoomActions>
  onSearch: OnSearch
  onOpenRoom: (id: string | undefined) => void
  onBuilder: () => void
}

export function RoomsCard(props: Props) {
  const { hotel, summary, types, search, canWrite, actions, onSearch } = props
  const page = search.page ?? 1
  // Phones get pages of 50, so a long hotel stays light to scroll on a mid-range phone.
  const [pageSize] = useState(() =>
    window.matchMedia('(max-width: 767px)').matches ? PHONE_PAGE_SIZE : PAGE_SIZE,
  )
  const filters: RoomFilters = {
    propertyId: hotel.id,
    q: search.q,
    roomTypeId: types.some((type) => type.id === search.type) ? search.type : undefined,
    floor: search.floor,
    accessible: search.show === 'accessible' || undefined,
    archived: search.show === 'archived' || undefined,
    outOfOrder: search.show === 'ooo' || undefined,
  }
  const rooms = useQuery({
    ...orpc.rooms.list.queryOptions({ input: { ...filters, page, pageSize } }),
    placeholderData: keepPreviousData,
  })
  const selection = useRoomSelection(
    filters,
    JSON.stringify([search.q, search.type, search.floor, search.show, page]),
  )
  const [changing, setChanging] = useState(false)
  const archivedView = search.show === 'archived'
  const ticked = selection.refs()
  const items = rooms.data?.items ?? []

  // The column header sticks under the toolbar, whose height changes as its chips wrap.
  const card = useRef<HTMLDivElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = toolbar.current
    if (!el) return
    const observer = new ResizeObserver(() =>
      card.current?.style.setProperty('--rooms-toolbar-h', `${el.offsetHeight}px`),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const bulk = {
    count: ticked.length,
    archived: archivedView,
    pending: actions.pending,
    onChangeType: () => setChanging(true),
    onRemove: () => actions.remove(ticked, selection.clear),
    onRestore: () => actions.restore(ticked, selection.clear),
    onClear: selection.clear,
  }

  return (
    // Not overflow-hidden: the toolbar, column header and bulk bar stick while the list scrolls.
    <Card ref={card}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-md font-semibold">All rooms</h2>
        <Button
          size="sm"
          className="max-lg:h-11"
          disabled={!canWrite}
          onClick={() => props.onOpenRoom(undefined)}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add room
        </Button>
      </header>
      {rooms.data && rooms.data.total > pageSize ? (
        <a
          href="#rooms-pages"
          className="sr-only focus:not-sr-only focus:absolute focus:z-30 focus:m-2 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2 focus:text-pri-ink focus:shadow-[var(--shadow-lg)]"
        >
          Skip to pages
        </a>
      ) : null}
      <div ref={toolbar} className="z-20 bg-surface md:sticky md:top-0">
        {ticked.length > 0 ? (
          <div className="max-md:hidden">
            <BulkBar inline {...bulk} />
          </div>
        ) : null}
        <div className={ticked.length > 0 ? 'md:hidden' : undefined}>
          <RoomsToolbar search={search} summary={summary} types={types} onSearch={onSearch} />
        </div>
        <SelectAllBanner
          pageCount={items.length}
          total={rooms.data?.total ?? 0}
          selected={ticked.length}
          viewTotal={selection.viewTotal}
          loading={selection.loading}
          onSelectView={() => void selection.selectView(items)}
          onClear={selection.clear}
        />
        {selection.notice ? (
          <p
            role="status"
            className="border-b border-border px-4 py-1.5 text-center text-sm text-text-2 sm:px-5"
          >
            {selection.notice}
          </p>
        ) : null}
      </div>

      {rooms.isPending ? (
        <TableSkeleton rows={8} label="Loading rooms" />
      ) : rooms.isError ? (
        <Message icon={AlertTriangle} title="Couldn't load rooms. Nothing changed." alert>
          <Button variant="primary" className="max-lg:h-11" onClick={() => rooms.refetch()}>
            Try again
          </Button>
        </Message>
      ) : items.length === 0 ? (
        <RoomsEmpty
          search={search}
          canWrite={canWrite}
          onSearch={onSearch}
          onBuilder={props.onBuilder}
          onAddRoom={() => props.onOpenRoom(undefined)}
        />
      ) : (
        <>
          {/* Phones have no column header, so ticking the whole page gets its own line. */}
          <label
            htmlFor="rooms-select-page"
            className="flex min-h-11 items-center gap-3 border-b border-border px-4 text-sm text-text-2 md:hidden"
          >
            <Checkbox
              id="rooms-select-page"
              checked={items.every((room) => selection.picked.has(room.id))}
              disabled={!canWrite}
              onChange={(event) => selection.togglePage(items, event.target.checked)}
            />
            Select all on this page
          </label>
          <RoomsTable
            rooms={items}
            selected={selection.picked}
            canWrite={canWrite}
            dimmed={rooms.isPlaceholderData}
            onToggle={selection.toggle}
            onToggleAll={(on) => selection.togglePage(items, on)}
            onOpen={(room) => props.onOpenRoom(room.id)}
            onRestore={(room) => actions.restore([room])}
          />
        </>
      )}
      {rooms.data && rooms.data.total > pageSize ? (
        <div
          id="rooms-pages"
          tabIndex={-1}
          className="border-t border-border px-4 py-3 outline-none sm:px-5"
        >
          <Pagination
            page={page}
            pageSize={pageSize}
            total={rooms.data.total}
            onPage={(next) => onSearch({ page: next })}
          />
        </div>
      ) : null}
      {ticked.length > 0 ? <BulkBar className="md:hidden" {...bulk} /> : null}
      {changing ? (
        <ChangeTypeDialog
          hotel={hotel}
          live={summary?.live ?? false}
          rooms={ticked}
          types={types}
          onDone={() => {
            setChanging(false)
            selection.clear()
          }}
          onClose={() => setChanging(false)}
        />
      ) : null}
    </Card>
  )
}
