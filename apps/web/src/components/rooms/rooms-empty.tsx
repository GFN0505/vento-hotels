// What the rooms table says when it has nothing to show: the hotel has no rooms yet, a quick view
// is empty, or filters match nothing.
import { DoorClosed, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Message } from './message'
import { isFiltered, type OnSearch, type RoomsSearch } from './rooms-search'

type Props = {
  search: RoomsSearch
  canWrite: boolean
  onSearch: OnSearch
  onBuilder: () => void
  onAddRoom: () => void
}

export function RoomsEmpty({ search, canWrite, onSearch, onBuilder, onAddRoom }: Props) {
  // A quick view on its own gets its own message rather than "no match".
  const onlyView = !search.q && !search.type && search.floor === undefined ? search.show : undefined
  if (onlyView === 'archived') {
    return (
      <Message
        icon={DoorClosed}
        title="No removed rooms. Rooms you remove are kept here, so they can be restored."
      />
    )
  }
  if (onlyView === 'ooo') return <Message icon={DoorClosed} title="No rooms are out of order." />
  if (isFiltered(search)) {
    return (
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
    )
  }
  return (
    <Message icon={DoorClosed} title="No rooms yet. Add them floor by floor, or one at a time.">
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" className="max-lg:h-11" disabled={!canWrite} onClick={onBuilder}>
          Add rooms by floor
        </Button>
        <Button className="max-lg:h-11" disabled={!canWrite} onClick={onAddRoom}>
          Add room
        </Button>
      </div>
    </Message>
  )
}
