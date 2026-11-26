// The rooms table (design: RoomsRates view=rooms): room, type, floor, features and status, with a
// tick box per row for bulk changes. Keyboard: one tab stop for the list; arrows move between rooms,
// Enter opens one and Space ticks it. On phones each row is a card: tap it to open the room; the
// tick box is its own target. Only states other than "in service" show, so problems stand out.
import type { RoomView } from '@vento/shared'
import { type KeyboardEvent, useRef, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/cn'
import { Row } from './rooms-row'

export type Props = {
  rooms: readonly RoomView[]
  selected: { has: (id: string) => boolean }
  onToggle: (room: RoomView, on: boolean) => void
  onToggleAll: (on: boolean) => void
  onOpen: (room: RoomView) => void
  onRestore: (room: RoomView) => void
  canWrite: boolean
  dimmed: boolean
}

// Sticks under the sticky toolbar on wider screens (its height is set on the card).
const th = 'bg-surface-2 px-3 py-2 md:sticky md:top-[var(--rooms-toolbar-h,0px)] md:z-10'

export function RoomsTable(props: Props) {
  const { rooms, selected, onToggleAll, onToggle, onOpen, canWrite, dimmed } = props
  const all = rooms.length > 0 && rooms.every((room) => selected.has(room.id))
  const [active, setActive] = useState(0)
  const body = useRef<HTMLTableSectionElement>(null)
  const current = Math.min(active, rooms.length - 1)

  function onKeyDown(event: KeyboardEvent<HTMLTableRowElement>, index: number) {
    const room = rooms[index]
    // Keys pressed on the row itself, not on a control inside it.
    if (!room || event.target !== event.currentTarget) return
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: rooms.length - 1,
    }
    if (event.key in moves) {
      event.preventDefault()
      const next = Math.max(0, Math.min(rooms.length - 1, moves[event.key] ?? index))
      setActive(next)
      body.current?.querySelectorAll<HTMLTableRowElement>('tr')[next]?.focus()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      onOpen(room)
    } else if (event.key === ' ' && canWrite) {
      event.preventDefault()
      onToggle(room, !selected.has(room.id))
    }
  }

  return (
    <table
      className={cn(
        'w-full table-fixed border-separate border-spacing-0 text-left transition-opacity max-md:block',
        dimmed && 'opacity-60',
      )}
    >
      <thead className="max-md:sr-only">
        <tr className="text-xs font-medium text-text-3 [&>th]:border-b [&>th]:border-border">
          <th scope="col" className={cn(th, 'w-11 pl-4 sm:pl-5')}>
            <Checkbox
              className="max-md:hidden"
              aria-label="Select all rooms on this page"
              checked={all}
              disabled={!canWrite}
              onChange={(event) => onToggleAll(event.target.checked)}
            />
          </th>
          <th scope="col" className={cn(th, 'w-24')}>
            Room
          </th>
          <th scope="col" className={cn(th, 'w-[22%]')}>
            Type
          </th>
          <th scope="col" className={cn(th, 'w-20')}>
            Floor
          </th>
          <th scope="col" className={th}>
            Features
          </th>
          <th scope="col" className={cn(th, 'w-28')}>
            Status
          </th>
          <th scope="col" className={cn(th, 'w-32')}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody ref={body} className="max-md:block">
        {rooms.map((room, index) => (
          <Row
            key={room.id}
            {...props}
            room={room}
            on={selected.has(room.id)}
            tabbable={index === current}
            onFocus={() => setActive(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          />
        ))}
      </tbody>
    </table>
  )
}
