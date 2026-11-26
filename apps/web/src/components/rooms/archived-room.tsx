// An archived room: what it was, Restore, and Delete for good when it has no history (frees the
// number; the API refuses it otherwise).
import { useMutation } from '@tanstack/react-query'
import type { Property, RoomDetail } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Sheet } from '@/components/ui/sheet'
import { StatusBadge } from '@/components/ui/status-badge'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { featureLine, floorName, NEEDS_CONNECTION } from './format'
import { HistoryButton } from './history-button'
import { useRoomsRefresh } from './queries'
import type { useRoomActions } from './use-room-actions'

type Props = {
  hotel: Property
  room: RoomDetail
  actions: ReturnType<typeof useRoomActions>
  onClose: () => void
}

export function ArchivedRoom({ room, actions, onClose }: Props) {
  const online = useOnline()
  const refresh = useRoomsRefresh()
  const [confirming, setConfirming] = useState(false)
  const remove = useMutation({
    mutationFn: () => api.rooms.delete({ id: room.id }),
    onSuccess: async () => {
      await refresh()
      toast.success(`Room ${room.number} deleted`)
      onClose()
    },
    onError: (error) => toast.error(problemMessage(error)),
  })

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Room ${room.number}`}
      description={
        <span className="flex flex-wrap items-center gap-x-3">
          <StatusBadge>Archived</StatusBadge>
          <HistoryButton roomId={room.id} title={`Room ${room.number} · ${room.roomTypeName}`} />
        </span>
      }
      footer={
        <>
          {room.canDelete ? (
            <Button
              variant="danger"
              className="mr-auto"
              disabled={!online}
              onClick={() => setConfirming(true)}
            >
              Delete for good
            </Button>
          ) : null}
          <span className="grow" />
          {!online ? <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span> : null}
          <Button
            variant="primary"
            disabled={!online}
            loading={actions.pending}
            onClick={() => actions.restore([room], onClose)}
          >
            Restore
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3">
        <dt className="text-text-3">Type</dt>
        <dd>{room.roomTypeName}</dd>
        <dt className="text-text-3">Floor</dt>
        <dd>{floorName(room.floor)}</dd>
        <dt className="text-text-3">Features</dt>
        <dd>{featureLine(room) || 'None'}</dd>
      </dl>
      <p className="mt-6 rounded-sm bg-surface-2 px-3 py-2.5 text-sm text-text-2">
        Removed rooms don't count as rooms you can sell, and their number can't be used again.
        {room.canDelete
          ? ' It has no history, so you can delete it for good if it was a mistake.'
          : ' It has history, so it can only stay archived.'}
      </p>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete Room ${room.number} for good?`}
        description="This frees the number for a new room. It can't be undone."
        footer={
          <>
            <Button onClick={() => setConfirming(false)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete for good
            </Button>
          </>
        }
      >
        <p className="text-text-2">Room {room.number} was never on a stay or a folio.</p>
      </Dialog>
    </Sheet>
  )
}
