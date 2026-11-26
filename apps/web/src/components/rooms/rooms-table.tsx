// The rooms table (design: RoomsRates view=rooms): room, type, floor, features and status, with a
// tick box per row for bulk changes. On phones each row is a card: tap it to open the room; the tick
// box is its own target. Only states other than "in service" are shown, so problems stand out.
import type { RoomView } from '@vento/shared'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/cn'
import { featureLine, floorName } from './format'

type Props = {
  rooms: readonly RoomView[]
  selected: ReadonlySet<string>
  onToggle: (room: RoomView, on: boolean) => void
  onToggleAll: (on: boolean) => void
  onOpen: (room: RoomView) => void
  onRestore: (room: RoomView) => void
  canWrite: boolean
  dimmed: boolean
}

export function RoomsTable(props: Props) {
  const { rooms, selected, onToggleAll, canWrite, dimmed } = props
  const all = rooms.length > 0 && rooms.every((room) => selected.has(room.id))
  return (
    <table
      className={cn(
        'w-full table-fixed border-collapse text-left transition-opacity max-md:block',
        dimmed && 'opacity-60',
      )}
    >
      <thead className="max-md:sr-only">
        <tr className="border-b border-border bg-surface-2/50 text-xs font-medium text-text-3">
          <th scope="col" className="w-11 py-2 pl-4 sm:pl-5">
            <Checkbox
              aria-label="Select all rooms on this page"
              checked={all}
              disabled={!canWrite}
              onChange={(event) => onToggleAll(event.target.checked)}
            />
          </th>
          <th scope="col" className="w-24 px-3 py-2">
            Room
          </th>
          <th scope="col" className="w-[22%] px-3 py-2">
            Type
          </th>
          <th scope="col" className="w-20 px-3 py-2">
            Floor
          </th>
          <th scope="col" className="px-3 py-2">
            Features
          </th>
          <th scope="col" className="w-28 px-3 py-2">
            Status
          </th>
          <th scope="col" className="w-32 px-3 py-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border max-md:block">
        {rooms.map((room) => (
          <Row key={room.id} {...props} room={room} on={selected.has(room.id)} />
        ))}
      </tbody>
    </table>
  )
}

function Row({
  room,
  on,
  onToggle,
  onOpen,
  onRestore,
  canWrite,
}: Props & { room: RoomView; on: boolean }) {
  const features = featureLine(room)
  const what = `${room.archivedAt ? 'View' : 'Edit'} room ${room.number}`
  return (
    <tr
      className={cn(
        'relative transition-colors max-md:grid max-md:min-h-14 max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:px-4 max-md:py-2',
        on ? 'bg-pri-soft/40' : 'hover:bg-surface-2/50',
      )}
    >
      <td className="py-2 pl-4 max-md:relative max-md:z-10 max-md:p-0 sm:pl-5">
        <label
          htmlFor={`select-${room.id}`}
          className="-m-3 grid size-11 place-items-center md:-m-2 md:size-8"
        >
          <Checkbox
            id={`select-${room.id}`}
            aria-label={`Select room ${room.number}`}
            checked={on}
            disabled={!canWrite}
            onChange={(event) => onToggle(room, event.target.checked)}
          />
        </label>
      </td>
      <td className="num px-3 py-2 text-base font-semibold max-md:p-0">
        {/* Phones: the whole row opens the room (the button's box covers the row). */}
        <button
          type="button"
          onClick={() => onOpen(room)}
          className="flex min-w-0 flex-col text-left after:absolute after:inset-0 md:hidden"
        >
          <span className="sr-only">{room.archivedAt ? 'View' : 'Edit'} room </span>
          <span>
            {room.number}
            <span className="font-normal text-text-2"> · {room.roomTypeName}</span>
          </span>
          <span className="truncate text-sm font-normal text-text-2">
            {[floorName(room.floor), features, room.archivedAt ? 'Archived' : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        </button>
        <span className="max-md:hidden">{room.number}</span>
      </td>
      <td className="truncate px-3 py-2 max-md:hidden" title={room.roomTypeName}>
        {room.roomTypeName}
      </td>
      <td className="num px-3 py-2 text-text-2 max-md:hidden">
        {room.floor === 0 ? 'Ground' : room.floor}
      </td>
      <td className="truncate px-3 py-2 text-text-2 max-md:hidden" title={features || undefined}>
        {features || (
          <span className="text-text-3">
            <span aria-hidden="true">—</span>
            <span className="sr-only">None</span>
          </span>
        )}
      </td>
      <td className="px-3 py-2 max-md:hidden">
        {room.archivedAt ? <StatusBadge>Archived</StatusBadge> : null}
      </td>
      <td className="px-3 py-2 text-right max-md:relative max-md:z-10 max-md:p-0">
        <span className="inline-flex items-center gap-1">
          {room.archivedAt ? (
            <Button
              size="sm"
              className="max-lg:h-11"
              disabled={!canWrite}
              onClick={() => onRestore(room)}
              aria-label={`Restore room ${room.number}`}
            >
              Restore
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="max-md:hidden"
            onClick={() => onOpen(room)}
            aria-label={what}
          >
            {room.archivedAt ? 'View' : 'Edit'}
          </Button>
          <ChevronRight
            className="pointer-events-none size-4 text-text-3 md:hidden"
            aria-hidden="true"
          />
        </span>
      </td>
    </tr>
  )
}
