// "Add rooms by floor" for a hotel that already has rooms: the same builder in a wide sheet, its
// action bar in the sheet's footer. Starts on the floor above the highest one with rooms.
import type { Property, RoomTypeView } from '@vento/shared'
import { useState } from 'react'
import { useDiscardGuard } from '@/components/ui/discard-guard'
import { Sheet } from '@/components/ui/sheet'
import { useBuilderView } from './floor-builder'

type Props = {
  hotel: Property
  types: readonly RoomTypeView[]
  floors: readonly number[]
  onClose: () => void
}

export function BuilderSheet({ hotel, types, floors, onClose }: Props) {
  const [dirty, setDirty] = useState(false)
  const guard = useDiscardGuard(dirty, onClose)
  const { content, actions } = useBuilderView({
    hotel,
    types,
    hotelHasRooms: true,
    startFloor: floors.length ? Math.max(0, ...floors) + 1 : 1,
    onCreated: onClose,
    onDirtyChange: setDirty,
  })
  return (
    <Sheet
      open
      size="lg"
      onClose={guard.close}
      title="Add rooms by floor"
      description="Describe the pattern once; Vento numbers every room."
      footer={guard.bar ?? actions}
    >
      {content}
    </Sheet>
  )
}
