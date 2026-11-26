// Remove (archive) and restore rooms, one or many. Before go-live they run straight away with an
// Undo toast; once the hotel is live they ask for a reason first (spec: reason after go-live).
import { useMutation } from '@tanstack/react-query'
import type { Property } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { plural } from './format'
import { useRoomsRefresh } from './queries'
import { ReasonDialog } from './reason-dialog'

type RoomRef = { id: string; number: string }
type Kind = 'remove' | 'restore'
type Ask = { kind: Kind; rooms: RoomRef[]; done?: (() => void) | undefined }

const named = (rooms: readonly RoomRef[]) =>
  rooms.length === 1 ? `Room ${rooms[0]?.number}` : plural(rooms.length, 'room')

export function useRoomActions({ hotel, live }: { hotel: Property; live: boolean }) {
  const refresh = useRoomsRefresh()
  const [ask, setAsk] = useState<Ask>()
  const [error, setError] = useState<string>()

  const run = useMutation({
    mutationFn: ({ kind, rooms, reason }: Ask & { reason?: string | undefined }) => {
      const input = { propertyId: hotel.id, ids: rooms.map((room) => room.id), reason }
      return kind === 'remove' ? api.rooms.archive(input) : api.rooms.restore(input)
    },
    onSuccess: async (_, { kind, rooms, reason, done }) => {
      setAsk(undefined)
      done?.()
      await refresh()
      if (kind === 'remove') {
        toast.success(`${named(rooms)} removed`, {
          action: { label: 'Undo', onClick: () => run.mutate({ kind: 'restore', rooms, reason }) },
        })
      } else {
        toast.success(`${named(rooms)} restored`)
      }
    },
    onError: (failure, { kind }) => {
      if (ask) setError(problemMessage(failure))
      else toast.error(problemMessage(failure), { id: `rooms-${kind}` })
    },
  })

  function start(kind: Kind, rooms: RoomRef[], done?: () => void) {
    if (rooms.length === 0) return
    setError(undefined)
    if (live) setAsk({ kind, rooms, done })
    else run.mutate({ kind, rooms, done })
  }

  const many = (ask?.rooms.length ?? 0) > 1
  const dialog = ask ? (
    <ReasonDialog
      open
      title={
        ask.kind === 'remove'
          ? many
            ? `Remove ${named(ask.rooms)} from ${hotel.name}?`
            : `Remove ${named(ask.rooms)}?`
          : `Restore ${named(ask.rooms)}?`
      }
      description={
        ask.kind === 'remove'
          ? "They stop counting as rooms you can sell, and the owner's daily report will show it."
          : "They count as rooms you can sell again, and the owner's daily report will show it."
      }
      label={`Reason for ${ask.kind === 'remove' ? 'removing' : 'restoring'} ${named(ask.rooms)}`}
      confirmLabel={`${ask.kind === 'remove' ? 'Remove' : 'Restore'} ${named(ask.rooms)}`}
      destructive={ask.kind === 'remove'}
      pending={run.isPending}
      error={error}
      onConfirm={(reason) => run.mutate({ ...ask, reason })}
      onClose={() => setAsk(undefined)}
    />
  ) : null

  return {
    remove: (rooms: RoomRef[], done?: () => void) => start('remove', rooms, done),
    restore: (rooms: RoomRef[], done?: () => void) => start('restore', rooms, done),
    pending: run.isPending,
    dialog,
  }
}
