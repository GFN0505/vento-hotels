// A room's sheet, opened from the table or "Add room": loads the room fresh (with its connecting
// rooms and whether it can be deleted), then shows the form, or for an archived room its details
// with Restore and Delete for good.
import { useQuery } from '@tanstack/react-query'
import type { Property, RoomTypeView } from '@vento/shared'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { ArchivedRoom } from './archived-room'
import { RoomForm } from './room-form'
import type { useRoomActions } from './use-room-actions'

type Props = {
  hotel: Property
  id: string | undefined
  types: readonly RoomTypeView[]
  live: boolean
  featureSuggestions: readonly string[]
  actions: ReturnType<typeof useRoomActions>
  onClose: () => void
}

export function RoomSheet(props: Props) {
  const { id, onClose } = props
  const room = useQuery({
    ...orpc.rooms.get.queryOptions({ input: { id: id ?? '' } }),
    enabled: Boolean(id),
  })
  if (!id) return <RoomForm {...props} room={undefined} />
  if (room.data?.archivedAt) return <ArchivedRoom {...props} room={room.data} />
  if (room.data) return <RoomForm key={room.data.id} {...props} room={room.data} />
  return (
    <Sheet open onClose={onClose} title={room.isError ? "Couldn't load this room" : 'Room'}>
      {room.isError ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-text-2">{problemMessage(room.error)}</p>
          <Button variant="primary" className="max-lg:h-11" onClick={() => room.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div
          className="flex flex-col gap-5"
          role="status"
          aria-busy="true"
          aria-label="Loading room"
        >
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-14 animate-pulse rounded-sm bg-surface-2" />
          ))}
        </div>
      )}
    </Sheet>
  )
}
