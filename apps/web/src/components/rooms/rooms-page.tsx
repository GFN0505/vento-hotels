// Rates & channels › Rooms (design #33, RoomsRates view=rooms; spec stage-1-room-types-and-rooms):
// who may see it, which hotel, and the hotel's rooms. A new hotel opens straight into the builder.

import { Building2, Lock } from 'lucide-react'
import { useProperty } from '@/components/shell/property-context'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { useMe } from '@/lib/me'
import { usePageTitle } from '@/lib/title'
import { HotelRooms } from './hotel-rooms'
import { PickHotel } from './pick-hotel'
import type { RoomsSearch } from './rooms-search'
import { PageSkeleton } from './skeletons'

type Props = {
  search: RoomsSearch
  onSearch: (patch: Partial<RoomsSearch>) => void
}

export function RoomsPage({ search, onSearch }: Props) {
  usePageTitle('Rooms')
  const me = useMe()
  const { properties, current, allHotels, select } = useProperty()
  if (me.isPending) return <PageSkeleton />
  if (!me.can('rooms.setup')) {
    return (
      <Card className="flex flex-col items-start gap-2 p-6">
        <Lock className="size-5 text-text-3" aria-hidden="true" />
        <h1 className="text-lg font-semibold">You don't have access to rooms</h1>
        <p className="text-text-2">Only a GM or the owner can set up rooms. Ask your GM.</p>
      </Card>
    )
  }
  if (allHotels) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Rooms" description="Room types and rooms for each hotel." />
        <PickHotel hotels={properties} onPick={select} />
      </div>
    )
  }
  if (!current) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Rooms" />
        <EmptyState icon={Building2} tone="brand">
          You're not on a hotel yet. An owner can give you access from Settings.
        </EmptyState>
      </div>
    )
  }
  return <HotelRooms key={current.id} hotel={current} search={search} onSearch={onSearch} />
}
