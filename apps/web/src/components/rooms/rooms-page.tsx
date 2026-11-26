// Rates & channels › Rooms (design #33, RoomsRates view=rooms; spec stage-1-room-types-and-rooms):
// who may see it, which hotel, and the hotel's rooms. A new hotel opens straight into the builder.

import { Building2 } from 'lucide-react'
import { PickHotel } from '@/components/shell/pick-hotel'
import { useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { NoAccess } from '@/components/team/no-access'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { useMe } from '@/lib/me'
import { HotelRooms } from './hotel-rooms'
import { RoomsAside } from './pick-aside'
import type { OnSearch, RoomsSearch } from './rooms-search'
import { PageSkeleton } from './skeletons'

type Props = {
  search: RoomsSearch
  onSearch: OnSearch
}

export function RoomsPage({ search, onSearch }: Props) {
  useScopedTitle('Rooms')
  const me = useMe()
  const { current, allHotels, scope, ready } = useProperty()
  // Until the switch knows the hotel, nothing loads (no other hotel's rooms first).
  if (me.isPending || (!scope && !ready)) return <PageSkeleton />
  if (!me.can('rooms.setup')) {
    return <NoAccess what="rooms" ask="Only a GM or the owner can set up rooms. Ask your GM." />
  }
  if (allHotels) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader scope="pick" title="Rooms" description="Room types and rooms for each hotel." />
        <PickHotel
          title="Rooms are set up per hotel. Pick a hotel."
          aside={(hotel) => <RoomsAside hotel={hotel} />}
        />
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
