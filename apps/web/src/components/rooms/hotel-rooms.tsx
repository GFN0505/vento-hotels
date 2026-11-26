// One hotel's rooms: the header with counts, the "mark inspected" banner before go-live, room
// types, rooms, and the sheets the URL opens. Offline it shows what was saved, read-only.
import type { Property } from '@vento/shared'
import { AlertTriangle, Plus, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { useOnline } from '@/offline/connection'
import { BuilderSheet } from './builder-sheet'
import { FloorBuilder } from './floor-builder'
import { NEEDS_CONNECTION, plural } from './format'
import { InspectedBanner } from './inspected-banner'
import { useRoomsSummary, useRoomTypes } from './queries'
import { RoomSheet } from './room-sheet'
import { RoomTypeSheet } from './room-type-sheet'
import { RoomTypesCard } from './room-types-card'
import { RoomsCard } from './rooms-card'
import type { RoomsSearch, RoomsSheet } from './rooms-search'
import { PageSkeleton } from './skeletons'
import { useRoomActions } from './use-room-actions'

type Props = {
  hotel: Property
  search: RoomsSearch
  // Merges into the URL's search params; page resets unless given.
  onSearch: (patch: Partial<RoomsSearch>) => void
}

export function HotelRooms({ hotel, search, onSearch }: Props) {
  const online = useOnline()
  const types = useRoomTypes(hotel.id)
  const summary = useRoomsSummary(hotel.id)
  const live = summary.data?.live ?? hotel.liveSince !== null
  const actions = useRoomActions({ hotel, live })

  const open = (sheet: RoomsSheet, id?: string) => onSearch({ sheet, id, page: search.page })
  const close = () => onSearch({ sheet: undefined, id: undefined, page: search.page })

  if (types.isPending || summary.isPending) return <PageSkeleton />
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
        <BuilderSheet hotel={hotel} types={types.data.items} onClose={close} />
      ) : null}
      {search.sheet === 'type' &&
      (!search.id || types.data.items.some((t) => t.id === search.id)) ? (
        <RoomTypeSheet
          key={search.id ?? 'new'}
          hotel={hotel}
          type={types.data.items.find((t) => t.id === search.id)}
          onClose={close}
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
            <StatusBadge tone="emerald">Live</StatusBadge>
          ) : (
            <StatusBadge tone="amber">Setting up</StatusBadge>
          )
        }
        description={
          <span className="num">{`${hotel.name} · ${plural(s.active, 'room')} · ${plural(types.active.length, 'type')}`}</span>
        }
        actions={
          <>
            {!online ? (
              <span className="inline-flex items-center gap-1.5 self-center text-sm text-text-3">
                <WifiOff className="size-4" aria-hidden="true" />
                {NEEDS_CONNECTION}
              </span>
            ) : null}
            <Button
              size="lg"
              className="max-lg:h-11"
              disabled={!online}
              onClick={() => open('builder')}
            >
              Add rooms by floor
            </Button>
            <Button
              size="lg"
              variant="primary"
              className="max-lg:h-11"
              disabled={!online}
              onClick={() => open('type')}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add room type
            </Button>
          </>
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
