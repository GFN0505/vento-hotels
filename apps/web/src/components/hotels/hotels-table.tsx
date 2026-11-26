// The hotels table (spec: "Settings › Hotels: the list"; no board of its own, so it follows the
// devices table): logo, name and where, owning company, rooms, business date and status. A row
// opens that hotel's settings; archived ones offer Restore. On phones each row reads as a card.
import type { Property } from '@vento/shared'
import { ChevronRight } from 'lucide-react'
import { TD, TH } from '@/components/settings/table-styles'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/cn'
import { dateLabel, hotelStatus, hotelWhere, plural } from './format'
import { HotelMark } from './hotel-mark'

type Props = {
  hotels: readonly Property[]
  dimmed: boolean
  canRestore: boolean
  onOpen: (hotel: Property) => void
  onRestore: (hotel: Property) => void
}

const th = TH
const td = TD

export function HotelsTable({ hotels, dimmed, canRestore, onOpen, onRestore }: Props) {
  return (
    <table
      className={cn(
        'w-full table-fixed border-separate border-spacing-0 text-left transition-opacity max-md:block',
        dimmed && 'opacity-60',
      )}
    >
      <thead className="max-md:sr-only">
        <tr>
          <th scope="col" className={cn(th, 'pl-5')}>
            Hotel
          </th>
          <th scope="col" className={cn(th, 'w-[24%]')}>
            Owning company
          </th>
          <th scope="col" className={cn(th, 'w-24')}>
            Rooms
          </th>
          <th scope="col" className={cn(th, 'w-32')}>
            Business date
          </th>
          <th scope="col" className={cn(th, 'w-36')}>
            Status
          </th>
          <th scope="col" className={cn(th, 'w-12 pr-5')}>
            <span className="sr-only">Open</span>
          </th>
        </tr>
      </thead>
      <tbody className="max-md:block max-md:divide-y max-md:divide-border">
        {hotels.map((hotel) => {
          const archived = hotel.status === 'archived'
          const status = hotelStatus(hotel)
          const where = hotelWhere(hotel) || 'Address not set yet'
          const name = (
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium" title={hotel.name}>
                {archived ? null : <span className="sr-only">Open </span>}
                {hotel.name}
              </span>
              <span className="truncate text-sm text-text-2" title={where}>
                {where}
              </span>
            </span>
          )
          return (
            // The whole row opens it for pointers; keyboards use the hotel's button.
            <tr
              key={hotel.id}
              onClick={archived ? undefined : () => onOpen(hotel)}
              className={cn(
                !archived && 'group/row cursor-pointer hover:bg-surface-2/60',
                'max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-4 max-md:gap-y-1.5 max-md:px-4 max-md:py-3 md:[&>td]:border-b md:[&>td]:border-border md:last:[&>td]:border-0',
              )}
            >
              <td className={cn(td, 'pl-5 max-md:max-w-full max-md:basis-full')}>
                {archived ? (
                  <span className="flex min-w-0 items-center gap-3">
                    <HotelMark hotel={hotel} size="sm" />
                    {name}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpen(hotel)
                    }}
                    className="group flex w-full min-w-0 items-center gap-3 text-left hover:text-pri-ink"
                  >
                    <HotelMark hotel={hotel} size="sm" />
                    {name}
                    <ChevronRight
                      className="ml-auto size-4 flex-none text-text-3 md:hidden"
                      aria-hidden="true"
                    />
                  </button>
                )}
              </td>
              <td className={cn(td, 'text-text-2 max-md:basis-full')}>
                <span className="block truncate" title={hotel.entityName}>
                  {hotel.entityName}
                </span>
              </td>
              <td className={cn(td, 'num text-text-2')}>
                {hotel.roomCount > 0 ? plural(hotel.roomCount, 'room') : 'No rooms'}
              </td>
              <td className={cn(td, 'num text-text-2')}>
                <span className="md:sr-only">Business date </span>
                {dateLabel(hotel.businessDate)}
              </td>
              <td className={td}>
                <span className="flex items-center gap-2">
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  {archived && canRestore ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onRestore(hotel)
                      }}
                      aria-label={`Restore ${hotel.name}`}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-pri-ink hover:underline md:min-h-0"
                    >
                      Restore
                    </button>
                  ) : null}
                </span>
              </td>
              <td className={cn(td, 'pr-5 max-md:hidden')}>
                {archived ? null : (
                  <ChevronRight
                    className="ml-auto size-4 text-text-3 transition-transform group-hover/row:translate-x-0.5 group-hover/row:text-pri-ink"
                    aria-hidden="true"
                  />
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
