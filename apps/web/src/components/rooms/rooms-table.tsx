// The rooms table (design: RoomsRates view=rooms): room, type, floor, features and status, with a
// tick box per row for bulk changes. On phones each row reads as a small card.
import type { RoomView } from '@vento/shared'
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

export function RoomsTable({
  rooms,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  onRestore,
  canWrite,
  dimmed,
}: Props) {
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
          <th scope="col" className="w-32 px-3 py-2">
            Status
          </th>
          <th scope="col" className="w-36 px-3 py-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border max-md:block">
        {rooms.map((room) => {
          const features = featureLine(room)
          const on = selected.has(room.id)
          return (
            <tr
              key={room.id}
              className={cn(
                'transition-colors max-md:grid max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-0.5 max-md:px-4 max-md:py-3',
                on ? 'bg-pri-soft/40' : 'hover:bg-surface-2/50',
              )}
            >
              <td className="py-2.5 pl-4 max-md:row-span-2 max-md:p-0 sm:pl-5">
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
              <td className="num px-3 py-2.5 text-base font-semibold max-md:p-0">
                {room.number}
                <span className="font-normal text-text-2 md:hidden">
                  {' '}
                  · {room.roomTypeName} · {floorName(room.floor)}
                </span>
              </td>
              <td className="truncate px-3 py-2.5 max-md:hidden" title={room.roomTypeName}>
                {room.roomTypeName}
              </td>
              <td className="num px-3 py-2.5 text-text-2 max-md:hidden">
                {room.floor === 0 ? 'Ground' : room.floor}
              </td>
              <td
                className={cn(
                  'truncate px-3 py-2.5 text-text-2 max-md:col-start-2 max-md:p-0 max-md:text-sm',
                  !features && 'max-md:hidden',
                )}
                title={features || undefined}
              >
                {features || (
                  <span className="text-text-3 max-md:hidden">
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">None</span>
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 max-md:hidden">
                {room.archivedAt ? (
                  <StatusBadge>Archived</StatusBadge>
                ) : (
                  <StatusBadge tone="emerald">In service</StatusBadge>
                )}
              </td>
              <td className="px-3 py-2.5 text-right max-md:col-start-3 max-md:row-span-2 max-md:row-start-1 max-md:p-0">
                <span className="inline-flex gap-1">
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
                    className="max-lg:h-11"
                    onClick={() => onOpen(room)}
                    aria-label={`${room.archivedAt ? 'View' : 'Edit'} room ${room.number}`}
                  >
                    {room.archivedAt ? 'View' : 'Edit'}
                  </Button>
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
