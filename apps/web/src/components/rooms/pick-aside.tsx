// Rooms' fact for each hotel in "Pick a hotel": how many rooms it has (from Home's summary), or a
// nudge to set them up.
import { useQuery } from '@tanstack/react-query'
import type { Property } from '@vento/shared'
import { orpc } from '@/lib/api'
import { plural } from './format'

export function RoomsAside({ hotel }: { hotel: Property }) {
  const summary = useQuery(orpc.organization.home.queryOptions())
  const count = summary.data?.byHotel.find((row) => row.propertyId === hotel.id)?.rooms
  if (count === undefined) return null
  if (count === 0) {
    return (
      <>
        <span className="inline-flex h-9 flex-none items-center rounded-sm bg-pri px-3 text-sm font-medium text-white group-hover:bg-pri-hover max-sm:hidden">
          Set up rooms
        </span>
        <span className="text-sm text-text-2 sm:hidden">No rooms yet</span>
      </>
    )
  }
  return (
    <span className="num flex-none text-right text-sm text-text-2">
      {plural(count, 'room')}
      {hotel.liveSince ? <span className="text-em"> · Live</span> : null}
    </span>
  )
}
