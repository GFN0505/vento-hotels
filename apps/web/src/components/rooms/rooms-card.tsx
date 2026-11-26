// The Rooms card: toolbar, the table with its states (loading, empty, filtered, error), bulk
// changes for the ticked rooms, and pages of 100.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { Property, RoomsSummary, RoomTypeView, RoomView } from '@vento/shared'
import { AlertTriangle, DoorClosed, Plus, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { orpc } from '@/lib/api'
import { BulkBar } from './bulk-bar'
import { ChangeTypeDialog } from './change-type-dialog'
import { Message } from './message'
import {
  isFiltered,
  type OnSearch,
  PAGE_SIZE,
  PHONE_PAGE_SIZE,
  type RoomsSearch,
} from './rooms-search'
import { RoomsTable } from './rooms-table'
import { RoomsToolbar } from './rooms-toolbar'
import { TableSkeleton } from './skeletons'
import type { useRoomActions } from './use-room-actions'

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
  const typeId = types.some((type) => type.id === search.type) ? search.type : undefined
  const rooms = useQuery({
    ...orpc.rooms.list.queryOptions({
      input: {
        propertyId: hotel.id,
        page,
        pageSize,
        q: search.q,
        roomTypeId: typeId,
        floor: search.floor,
        accessible: search.show === 'accessible' || undefined,
        archived: search.show === 'archived' || undefined,
        outOfOrder: search.show === 'ooo' || undefined,
      },
    }),
    placeholderData: keepPreviousData,
  })
  const [selected, setSelected] = useState<Map<string, RoomView>>(() => new Map())
  const [changing, setChanging] = useState(false)
  const view = JSON.stringify([search.q, search.type, search.floor, search.show, page])
  // A new view starts with nothing ticked, so a bulk change never touches rooms out of sight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets when the view changes.
  useEffect(() => setSelected(new Map()), [view])

  const filtered = isFiltered(search)
  const archivedView = search.show === 'archived'
  // A quick view on its own gets its own empty message rather than "no match".
  const onlyView = !search.q && !search.type && search.floor === undefined ? search.show : undefined
  const ticked = [...selected.values()]
  const clear = () => setSelected(new Map())

  return (
    // Not overflow-hidden: the bulk bar sticks to the bottom of the window while the card shows.
    <Card>
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
      {/* Stays in view while scrolling a long list; with rooms ticked it becomes the bulk bar. */}
      <div className="z-20 bg-surface md:sticky md:top-0">
        {ticked.length > 0 ? (
          <div className="max-md:hidden">
            <BulkBar
              inline
              count={ticked.length}
              archived={archivedView}
              pending={actions.pending}
              onChangeType={() => setChanging(true)}
              onRemove={() => actions.remove(ticked, clear)}
              onRestore={() => actions.restore(ticked, clear)}
              onClear={clear}
            />
          </div>
        ) : null}
        <div className={ticked.length > 0 ? 'md:hidden' : undefined}>
          <RoomsToolbar search={search} summary={summary} types={types} onSearch={onSearch} />
        </div>
      </div>

      {rooms.isPending ? (
        <TableSkeleton rows={8} label="Loading rooms" />
      ) : rooms.isError ? (
        <Message icon={AlertTriangle} title="Couldn't load rooms. Nothing changed." alert>
          <Button variant="primary" className="max-lg:h-11" onClick={() => rooms.refetch()}>
            Try again
          </Button>
        </Message>
      ) : rooms.data.items.length === 0 ? (
        onlyView === 'archived' ? (
          <Message
            icon={DoorClosed}
            title="No removed rooms. Rooms you remove are kept here, so they can be restored."
          />
        ) : onlyView === 'ooo' ? (
          <Message icon={DoorClosed} title="No rooms are out of order." />
        ) : filtered ? (
          <Message icon={SearchX} title="No rooms match these filters.">
            <Button
              className="max-lg:h-11"
              onClick={() =>
                onSearch({ q: undefined, type: undefined, floor: undefined, show: undefined })
              }
            >
              Clear filters
            </Button>
          </Message>
        ) : (
          <Message
            icon={DoorClosed}
            title="No rooms yet. Add them floor by floor, or one at a time."
          >
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                className="max-lg:h-11"
                disabled={!canWrite}
                onClick={props.onBuilder}
              >
                Add rooms by floor
              </Button>
              <Button
                className="max-lg:h-11"
                disabled={!canWrite}
                onClick={() => props.onOpenRoom(undefined)}
              >
                Add room
              </Button>
            </div>
          </Message>
        )
      ) : (
        <RoomsTable
          rooms={rooms.data.items}
          selected={new Set(selected.keys())}
          canWrite={canWrite}
          dimmed={rooms.isPlaceholderData}
          onToggle={(room, on) =>
            setSelected((map) => {
              const next = new Map(map)
              if (on) next.set(room.id, room)
              else next.delete(room.id)
              return next
            })
          }
          onToggleAll={(on) =>
            setSelected(on ? new Map(rooms.data.items.map((r) => [r.id, r])) : new Map())
          }
          onOpen={(room) => props.onOpenRoom(room.id)}
          onRestore={(room) => actions.restore([room])}
        />
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
      {ticked.length > 0 ? (
        <BulkBar
          className="md:hidden"
          count={ticked.length}
          archived={archivedView}
          pending={actions.pending}
          onChangeType={() => setChanging(true)}
          onRemove={() => actions.remove(ticked, clear)}
          onRestore={() => actions.restore(ticked, clear)}
          onClear={clear}
        />
      ) : null}
      {changing ? (
        <ChangeTypeDialog
          hotel={hotel}
          live={summary?.live ?? false}
          rooms={ticked}
          types={types}
          onDone={() => {
            setChanging(false)
            clear()
          }}
          onClose={() => setChanging(false)}
        />
      ) : null}
    </Card>
  )
}
