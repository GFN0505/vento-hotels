// One hotel's rooms: the header with counts, the "mark inspected" banner before go-live, room
// types, rooms, and the sheets the URL opens. Offline it shows what was saved, read-only.
import { useQuery } from '@tanstack/react-query'
import type { Property } from '@vento/shared'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { useOnline } from '@/offline/connection'
import { BuilderSheet } from './builder-sheet'
import { FloorBuilder } from './floor-builder'
import { plural } from './format'
import { HeaderActions } from './header-actions'
import { InspectedBanner } from './inspected-banner'
import { useRoomsSummary, useRoomTypes } from './queries'
import { RoomSheet } from './room-sheet'
import { RoomTypeSheet } from './room-type-sheet'
import { RoomTypesCard } from './room-types-card'
import { RoomsCard } from './rooms-card'
import type { OnSearch, RoomsSearch, RoomsSheet } from './rooms-search'
import { BuilderSkeleton, PageSkeleton } from './skeletons'
import { useRoomActions } from './use-room-actions'

type Props = {
  hotel: Property
  search: RoomsSearch
  // Merges into the URL's search params; page resets unless given.
  onSearch: OnSearch
}

export function HotelRooms({ hotel, search, onSearch }: Props) {
  const online = useOnline()
  const types = useRoomTypes(hotel.id)
  const summary = useRoomsSummary(hotel.id)
  const live = summary.data?.live ?? hotel.liveSince !== null
  const actions = useRoomActions({ hotel, live })
  // Home's summary is usually cached already: it says whether to load in the builder's shape.
  const home = useQuery(orpc.organization.home.queryOptions())
  const homeRooms = home.data?.byHotel.find((row) => row.propertyId === hotel.id)?.rooms

  const open = (sheet: RoomsSheet, id?: string) =>
    onSearch({ sheet, id, page: search.page }, { push: true })
  const close = () =>
    onSearch({ sheet: undefined, id: undefined, page: search.page }, { push: true })

  if (types.isPending || summary.isPending) {
    return homeRooms === 0 ? <BuilderSkeleton /> : <PageSkeleton />
  }
  if (types.isError || summary.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Rooms" description={hotel.name} />
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-14 text-center shadow-card"
        >
          <span className="grid size-12 place-items-center rounded-xl bg-surface-2 text-text-2 ring-1 ring-border">
            <AlertTriangle className="size-6" aria-hidden="true" strokeWidth={1.7} />
          </span>
          <p className="text-lg font-semibold">Couldn't load rooms. Nothing changed.</p>
          <p className="text-text-2">Check your connection, then try again.</p>
          <Button
            variant="primary"
            className="max-lg:h-11"
            onClick={() => void Promise.all([types.refetch(), summary.refetch()])}
          >
            Try again
          </Button>
        </div>
      </div>
    )
  }

  const s = summary.data
  const sheets = (
    <>
      {search.sheet === 'builder' ? (
        <BuilderSheet hotel={hotel} types={types.data.items} floors={s.floors} onClose={close} />
      ) : null}
      {search.sheet === 'type' &&
      (!search.id || types.data.items.some((t) => t.id === search.id)) ? (
        <RoomTypeSheet
          key={search.id ?? 'new'}
          hotel={hotel}
          type={types.data.items.find((t) => t.id === search.id)}
          onClose={close}
          onViewRooms={(typeId) =>
            onSearch(
              { sheet: undefined, id: undefined, type: typeId, show: undefined, q: undefined },
              { push: true },
            )
          }
        />
      ) : null}
      {search.sheet === 'room' ? (
        <RoomSheet
          key={search.id ?? 'new'}
          hotel={hotel}
          id={search.id}
          types={types.active}
          live={live}
          featureSuggestions={s.features}
          actions={actions}
          onClose={close}
        />
      ) : null}
      {actions.dialog}
    </>
  )

  // A new hotel: the empty page is the builder (design: OnbRooms).
  if (types.active.length === 0 && s.active === 0 && s.archived === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Rooms"
          badge={<StatusBadge tone="amber">Setting up</StatusBadge>}
          description={`${hotel.name} · Describe the pattern once; Vento numbers every room.`}
        />
        <FloorBuilder hotel={hotel} types={types.data.items} hotelHasRooms={false} />
        {sheets}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Rooms"
        badge={
          live ? (
            <span title="Live: night audit has run. Changes ask for a reason.">
              <StatusBadge tone="emerald">
                Live
                <span className="sr-only">: night audit has run. Changes ask for a reason.</span>
              </StatusBadge>
            </span>
          ) : (
            <span title="Setting up: no night audit yet. Changes need no reason.">
              <StatusBadge tone="amber">Setting up</StatusBadge>
            </span>
          )
        }
        description={
          <span className="num">{`${hotel.name} · ${plural(s.active, 'room')} · ${plural(types.active.length, 'type')}`}</span>
        }
        actions={
          <HeaderActions
            online={online}
            onBuilder={() => open('builder')}
            onAddType={() => open('type')}
            onAddRoom={() => open('room')}
          />
        }
      />
      {s.allDirtySetup && s.active > 0 ? (
        <InspectedBanner hotel={hotel} rooms={s.active} canWrite={online} />
      ) : null}
      <RoomTypesCard
        propertyId={hotel.id}
        types={types.active}
        archived={types.archived}
        canWrite={online}
        onEdit={(id) => open('type', id)}
      />
      <RoomsCard
        hotel={hotel}
        summary={s}
        types={types.active}
        search={search}
        canWrite={online}
        actions={actions}
        onSearch={onSearch}
        onOpenRoom={(id) => open('room', id)}
        onBuilder={() => open('builder')}
      />
      {sheets}
    </div>
  )
}
