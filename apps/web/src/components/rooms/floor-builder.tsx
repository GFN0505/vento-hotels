// "Add rooms by floor" (design: OnbRooms): new room types, then lines of "type · floors · numbers",
// a live preview, and one button that creates every room in one go (all or nothing on the API).
// It is the empty Rooms page for a new hotel, and the same builder in a sheet later.
import { useMutation } from '@tanstack/react-query'
import { MAX_ROOMS_PER_BATCH, newId, type Property, type RoomTypeView } from '@vento/shared'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { BuilderLines } from './builder-lines'
import { BuilderPreview } from './builder-preview'
import { BuilderTypes } from './builder-types'
import { NEEDS_CONNECTION, plural } from './format'
import { useRoomsRefresh } from './queries'
import { useFloorBuilder } from './use-floor-builder'

type Props = {
  hotel: Property
  types: readonly RoomTypeView[]
  hotelHasRooms: boolean
  onCreated?: () => void
  // Told when the person has typed anything, so a sheet can warn before closing.
  onDirtyChange?: (dirty: boolean) => void
  // In a sheet the action bar sticks to the sheet's bottom; on the page, to the window's.
  inSheet?: boolean
}

export function FloorBuilder({
  hotel,
  types,
  hotelHasRooms,
  onCreated,
  onDirtyChange,
  inSheet,
}: Props) {
  const online = useOnline()
  const refresh = useRoomsRefresh()
  const b = useFloorBuilder({ propertyId: hotel.id, types, hotelHasRooms })
  const [problem, setProblem] = useState<string>()
  const active = types.filter((type) => !type.archivedAt)
  const count = b.preview.toCreate.length
  useEffect(() => onDirtyChange?.(b.touched), [b.touched, onDirtyChange])

  const create = useMutation({
    mutationFn: async () => {
      // New types first, so the rooms can point at them. Saved ones stay saved if rooms fail.
      const saved = new Map<string, string>()
      try {
        for (const draft of b.drafts) {
          if (!draft.name.trim()) continue
          const guests = Number(draft.guests)
          const type = await api.roomTypes.create({
            propertyId: hotel.id,
            name: draft.name.trim(),
            code: draft.code,
            bed: draft.bed,
            sofaBed: draft.sofaBed,
            baseOccupancy: Math.min(2, guests),
            maxAdults: guests,
            maxChildren: 0,
          })
          saved.set(draft.key, type.id)
        }
      } finally {
        if (saved.size > 0) b.typesSaved(saved)
      }
      const rooms = b.preview.toCreate.map((chip) => ({
        number: chip.number,
        floor: chip.floor,
        roomTypeId: saved.get(chip.typeKey ?? '') ?? chip.typeKey ?? '',
      }))
      return api.rooms.createMany({ propertyId: hotel.id, batchId: newId(), rooms })
    },
    onSuccess: async (result) => {
      await refresh()
      toast.success(`${plural(result.created, 'room')} created at ${hotel.name}`)
      onCreated?.()
    },
    onError: async (error) => {
      await refresh()
      setProblem(problemMessage(error))
    },
  })

  const status = !online
    ? NEEDS_CONNECTION
    : b.blocker
      ? b.blocker
      : b.preview.tooMany
        ? `Up to ${MAX_ROOMS_PER_BATCH} rooms in one go. Split them into two.`
        : b.preview.duplicates.length
          ? `${plural(b.preview.duplicates.length, 'room')} in two lines. Change one of them.`
          : b.preview.takenCount
            ? `${plural(b.preview.takenCount, 'room')} already ${b.preview.takenCount === 1 ? 'exists' : 'exist'} and will be skipped.`
            : count
              ? `${plural(count, 'room')} on ${plural(new Set(b.preview.toCreate.map((c) => c.floor)).size, 'floor')}`
              : 'Add a line to see your rooms.'

  return (
    <div className="flex flex-col gap-4">
      <BuilderTypes
        saved={active}
        drafts={b.drafts}
        checks={b.draftChecks}
        onAdd={b.addDraft}
        onChange={b.updateDraft}
        onRemove={b.removeDraft}
      />
      <BuilderLines
        lines={b.lines}
        options={b.options}
        checks={b.lineChecks}
        onAdd={b.addLine}
        onChange={b.updateLine}
        onRemove={b.removeLine}
      />
      <BuilderPreview
        chips={b.preview.chips}
        options={b.options}
        takenCount={b.preview.takenCount}
        leftOut={b.preview.leftOut}
        onChip={b.setChip}
      />
      <div
        className={cn(
          'sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface/95 px-4 py-3 shadow-[var(--shadow-lg)] backdrop-blur-sm',
          inSheet && '-mb-1',
        )}
      >
        <p className="num min-w-0 grow text-sm text-text-2" aria-live="polite">
          {problem ? (
            <span role="alert" className="text-ro">
              {problem}
            </span>
          ) : (
            status
          )}
        </p>
        <Button
          variant="primary"
          size="lg"
          className="max-lg:h-12 max-sm:w-full"
          disabled={!online || !b.ready}
          loading={create.isPending}
          onClick={() => {
            setProblem(undefined)
            create.mutate()
          }}
        >
          {count ? `Create ${plural(count, 'room')}` : 'Create rooms'}
        </Button>
      </div>
    </div>
  )
}
