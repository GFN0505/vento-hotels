// "Add rooms by floor" (design: OnbRooms): new room types, then lines of "type · floors · numbers",
// a live preview, and one button that creates every room in one go (all or nothing on the API).
// New room types are saved first, outside the rooms' transaction, so a retry reuses them.
// On the page (a new hotel) the action bar sticks to the window; in a sheet it's the sheet's footer.
import { useMutation } from '@tanstack/react-query'
import { MAX_ROOMS_PER_BATCH, newId, type Property, type RoomTypeView } from '@vento/shared'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { BuilderLines } from './builder-lines'
import { BuilderPreview } from './builder-preview'
import { BuilderTypes } from './builder-types'
import { NEEDS_CONNECTION, plural } from './format'
import { useRoomsRefresh } from './queries'
import { type FloorBuilderState, useFloorBuilder } from './use-floor-builder'

export type BuilderProps = {
  hotel: Property
  types: readonly RoomTypeView[]
  hotelHasRooms: boolean
  startFloor?: number
  onCreated?: () => void
  // Told when the person has typed anything, so a sheet can warn before closing.
  onDirtyChange?: (dirty: boolean) => void
}

function statusOf(b: FloorBuilderState, online: boolean): string {
  const p = b.preview
  const count = p.toCreate.length
  if (!online) return NEEDS_CONNECTION
  if (b.blocker) return b.blocker
  if (b.checkingNumbers) return 'Checking room numbers…'
  if (p.tooMany) return `Up to ${MAX_ROOMS_PER_BATCH} rooms in one go. Split them into two.`
  if (p.duplicates.length)
    return `${plural(p.duplicates.length, 'room')} in two lines. Change one of them.`
  const floors = plural(new Set(p.toCreate.map((c) => c.floor)).size, 'floor')
  const skipped = p.takenCount ? ` · ${p.takenCount} already exist, skipped` : ''
  return count ? `${plural(count, 'room')} on ${floors}${skipped}` : 'Add a line to see your rooms.'
}

// The builder's content and its action bar, for the page or a sheet to place.
export function useBuilderView(props: BuilderProps): { content: ReactNode; actions: ReactNode } {
  const { hotel, types, hotelHasRooms, startFloor = 1, onCreated, onDirtyChange } = props
  const online = useOnline()
  const refresh = useRoomsRefresh()
  const b = useFloorBuilder({ propertyId: hotel.id, types, hotelHasRooms, startFloor })
  const [problem, setProblem] = useState<string>()
  const count = b.preview.toCreate.length
  useEffect(() => onDirtyChange?.(b.touched), [b.touched, onDirtyChange])

  const create = useMutation({
    mutationFn: async () => {
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

  const content = (
    <div className="flex flex-col gap-4">
      <BuilderTypes
        saved={types.filter((t) => !t.archivedAt)}
        tones={b.options}
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
        notes={b.notes}
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
    </div>
  )
  const actions = (
    <div className="flex w-full flex-wrap items-center gap-3">
      <p className="num min-w-0 grow text-sm text-text-2" aria-live="polite">
        {problem ? (
          <span role="alert" className="text-ro">
            {problem}
          </span>
        ) : (
          statusOf(b, online)
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
  )
  return { content, actions }
}

// The empty Rooms page of a new hotel.
export function FloorBuilder(props: BuilderProps) {
  const { content, actions } = useBuilderView(props)
  return (
    <div className="flex flex-col gap-4">
      {content}
      <div className="sticky bottom-0 z-10 -mx-1 rounded-lg border border-border bg-surface/95 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[var(--shadow-lg)] backdrop-blur-sm">
        {actions}
      </div>
    </div>
  )
}
