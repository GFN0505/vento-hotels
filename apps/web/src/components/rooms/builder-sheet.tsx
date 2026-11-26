// "Add rooms by floor" for a hotel that already has rooms: the same builder, in a wide sheet.
import type { Property, RoomTypeView } from '@vento/shared'
import { useState } from 'react'
import { useDiscardGuard } from '@/components/ui/discard-guard'
import { Sheet } from '@/components/ui/sheet'
import { FloorBuilder } from './floor-builder'

export function BuilderSheet({
  hotel,
  types,
  onClose,
}: {
  hotel: Property
  types: readonly RoomTypeView[]
  onClose: () => void
}) {
  const [dirty, setDirty] = useState(false)
  const guard = useDiscardGuard(dirty, onClose)
  return (
    <Sheet
      open
      size="lg"
      onClose={guard.close}
      title="Add rooms by floor"
      description="Describe the pattern once; Vento numbers every room."
      footer={guard.bar ?? undefined}
    >
      <FloorBuilder
        hotel={hotel}
        types={types}
        hotelHasRooms
        onCreated={onClose}
        onDirtyChange={setDirty}
        inSheet
      />
    </Sheet>
  )
}
