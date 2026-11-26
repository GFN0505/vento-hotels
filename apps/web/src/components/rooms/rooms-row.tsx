// One room in the rooms table: a row on wider screens, a tappable card on phones.
import type { RoomView } from '@vento/shared'
import { ChevronRight } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/cn'
import { featureLine, floorName } from './format'
import type { Props } from './rooms-table'

type RowProps = Props & {
  room: RoomView
  on: boolean
  tabbable: boolean
  onFocus: () => void
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void
}

export function Row({
  room,
  on,
  onToggle,
  onOpen,
  onRestore,
  canWrite,
  tabbable,
  onFocus,
  onKeyDown,
}: RowProps) {
  const features = featureLine(room)
  const verb = room.archivedAt ? 'View' : 'Edit'
  const cell = 'border-b border-border px-3 py-2 max-md:border-0'
  return (
    <tr
      tabIndex={tabbable ? 0 : -1}
      onFocus={(event) => event.target === event.currentTarget && onFocus()}
      onKeyDown={onKeyDown}
      className={cn(
        'relative transition-colors focus-visible:-outline-offset-2 max-md:grid max-md:min-h-14 max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:border-b max-md:border-border max-md:px-4 max-md:py-2',
        on ? 'bg-pri-soft/40' : 'hover:bg-surface-2/50',
      )}
    >
      <td className={cn(cell, 'pl-4 max-md:relative max-md:z-10 max-md:p-0 sm:pl-5')}>
        <label
          htmlFor={`select-${room.id}`}
          className="-mx-3 grid size-11 place-items-center md:-m-2 md:size-8"
        >
          <Checkbox
            id={`select-${room.id}`}
            tabIndex={-1}
            aria-label={`Select room ${room.number}`}
            checked={on}
            disabled={!canWrite}
            onChange={(event) => onToggle(room, event.target.checked)}
          />
        </label>
      </td>
      <td className={cn(cell, 'num text-base font-semibold max-md:p-0')}>
        {/* Phones: the whole row opens the room (the button's box covers the row). */}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onOpen(room)}
          className="flex min-w-0 flex-col text-left after:absolute after:inset-0 md:hidden"
        >
          <span className="sr-only">{verb} room </span>
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
      <td className={cn(cell, 'truncate max-md:hidden')} title={room.roomTypeName}>
        {room.roomTypeName}
      </td>
      <td className={cn(cell, 'num text-text-2 max-md:hidden')}>
        {room.floor === 0 ? 'Ground' : room.floor}
      </td>
      <td className={cn(cell, 'truncate text-text-2 max-md:hidden')} title={features || undefined}>
        {features || (
          <span className="text-text-3">
            <span aria-hidden="true">—</span>
            <span className="sr-only">None</span>
          </span>
        )}
      </td>
      <td className={cn(cell, 'max-md:hidden')}>
        {room.archivedAt ? <StatusBadge>Archived</StatusBadge> : null}
      </td>
      <td className={cn(cell, 'text-right max-md:relative max-md:z-10 max-md:p-0')}>
        <span className="inline-flex items-center gap-1">
          {room.archivedAt ? (
            <Button
              size="sm"
              tabIndex={-1}
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
            tabIndex={-1}
            className="max-md:hidden"
            onClick={() => onOpen(room)}
            aria-label={`${verb} room ${room.number}`}
          >
            {verb}
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
