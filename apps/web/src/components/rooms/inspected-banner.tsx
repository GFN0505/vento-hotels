// Before go-live, new rooms start dirty: nobody sells a room nobody has checked. One click marks
// them all inspected (with Undo) when they're ready. Gone once any room changes status.
import { useMutation } from '@tanstack/react-query'
import type { Property } from '@vento/shared'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { plural } from './format'
import { useRoomsRefresh } from './queries'

export function InspectedBanner({
  hotel,
  rooms,
  canWrite,
}: {
  hotel: Property
  rooms: number
  canWrite: boolean
}) {
  const refresh = useRoomsRefresh()
  const undo = useMutation({
    mutationFn: (batchId: string) => api.rooms.undoMarkInspected({ propertyId: hotel.id, batchId }),
    onSuccess: async () => {
      await refresh()
      toast.success('Rooms back to dirty')
    },
    onError: (error) => toast.error(problemMessage(error)),
  })
  const mark = useMutation({
    mutationFn: () => api.rooms.markInspected({ propertyId: hotel.id }),
    onSuccess: async (result) => {
      await refresh()
      toast.success(`${plural(result.count, 'room')} marked inspected`, {
        action: { label: 'Undo', onClick: () => undo.mutate(result.batchId) },
      })
    },
    onError: (error) => toast.error(problemMessage(error)),
  })
  const all = rooms === 1 ? 'The room is' : `All ${plural(rooms, 'room')} are`
  return (
    <section
      aria-label="Room status"
      className="relative flex flex-wrap items-center gap-x-4 gap-y-3 overflow-hidden rounded-lg border border-am-dot/30 bg-am-bg px-4 py-3.5 sm:px-5"
    >
      <span className="grid size-9 flex-none place-items-center rounded-lg bg-surface text-am shadow-card ring-1 ring-am-dot/30">
        <Sparkles className="size-4" aria-hidden="true" />
      </span>
      <p className="min-w-0 grow basis-60 text-text">
        <span className="font-semibold">{all} dirty until someone checks them.</span>{' '}
        <span className="text-text-2">Mark them inspected if they're ready.</span>
      </p>
      <Button
        variant="primary"
        className="max-lg:h-11 max-sm:w-full"
        disabled={!canWrite}
        loading={mark.isPending}
        onClick={() => mark.mutate()}
      >
        Mark {rooms.toLocaleString('en-GB')} inspected
      </Button>
    </section>
  )
}
