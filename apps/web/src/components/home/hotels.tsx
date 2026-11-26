// The hotels on Home. With the whole group in view (design: ExecHome "Properties"), every hotel is
// a row that opens that hotel's Home in one click. With one hotel chosen, a card on that hotel.
// Stage 0 knows each hotel's business date, times, people and devices; occupancy, ADR and revenue
// join the rows as front office ships.

import { Link } from '@tanstack/react-router'
import { calendarDateIn, type HomeSummary, type Property } from '@vento/shared'
import { BedDouble, ChevronRight, MonitorSmartphone, Settings2, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { HotelMark } from '@/components/hotels/hotel-mark'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/cn'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

function where(hotel: Property): string {
  return [hotel.area, hotel.lga, hotel.state].filter(Boolean).join(', ') || 'Address not set yet'
}

function DateBadge({ hotel }: { hotel: Property }) {
  const behind = hotel.businessDate !== calendarDateIn(hotel.timeZone)
  return (
    <StatusBadge tone={behind ? 'amber' : 'emerald'}>
      <span className="sr-only">Business date </span>
      {behind ? `Behind · ${shortDate(hotel.businessDate)}` : shortDate(hotel.businessDate)}
      {behind ? null : <span className="sr-only">, on time</span>}
    </StatusBadge>
  )
}

const FUTURE_NOTE = 'Occupancy, ADR and revenue join here once front office is running.'

function FutureNote() {
  return (
    <div className="m-4 flex items-center gap-3 rounded-md border border-dashed border-border-strong px-4 py-3.5 text-sm text-text-2">
      <span
        className="grid size-8 flex-none place-items-center rounded-lg bg-surface-2"
        aria-hidden="true"
      >
        <BedDouble className="size-4" strokeWidth={1.8} />
      </span>
      <span>{FUTURE_NOTE}</span>
    </div>
  )
}

export function HotelsBoard({
  hotels,
  summary,
  onOpen,
  canManage = false,
}: {
  hotels: Property[]
  summary: HomeSummary | undefined
  onOpen: (id: string) => void
  // People who manage setup get a link to each hotel's settings at the end of its row.
  canManage?: boolean
}) {
  // The Rooms column appears once any hotel has rooms (spec: room types and rooms).
  const rooms = (summary?.rooms ?? 0) > 0
  const columns = rooms
    ? 'md:grid-cols-[minmax(0,1fr)_120px_80px_90px_90px_20px]'
    : 'md:grid-cols-[minmax(0,1fr)_120px_90px_90px_20px]'
  return (
    <section
      aria-labelledby="hotels-heading"
      className="overflow-hidden rounded-lg border border-border bg-surface shadow-card"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex flex-col">
          <h2 id="hotels-heading" className="text-base font-semibold">
            Hotels
          </h2>
          <p className="text-sm text-text-2">Open one to see its day.</p>
        </div>
        <StatusBadge>{plural(hotels.length, 'hotel')}</StatusBadge>
      </header>
      {/* Column names for wide screens; on phones each row reads on its own. */}
      <div
        aria-hidden="true"
        className={cn(
          'hidden gap-4 border-b border-border bg-surface-2/60 px-5 py-2 text-xs font-medium text-text-3 md:grid',
          canManage && 'md:pr-[76px]',
          columns,
        )}
      >
        <span>Hotel</span>
        <span>Business date</span>
        {rooms ? <span>Rooms</span> : null}
        <span>People</span>
        <span>Devices</span>
        <span />
      </div>
      <ul className="divide-y divide-border">
        {hotels.map((hotel) => {
          const counts = summary?.byHotel.find((row) => row.propertyId === hotel.id)
          return (
            <li key={hotel.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onOpen(hotel.id)}
                className={cn(
                  'group grid min-w-0 grow grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-surface-2/60',
                  columns,
                )}
              >
                <span className="flex min-w-0 items-center gap-4 max-md:contents">
                  <HotelMark hotel={hotel} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold break-words">
                      <span className="sr-only">Open </span>
                      {hotel.name}
                    </span>
                    <span className="truncate text-sm text-text-2" title={where(hotel)}>
                      {where(hotel)}
                    </span>
                  </span>
                </span>
                <ChevronRight
                  className="size-4 text-text-3 transition-transform group-hover:translate-x-0.5 group-hover:text-pri-ink md:hidden"
                  aria-hidden="true"
                />
                <span className="col-start-2 col-end-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm md:contents">
                  <span>
                    <DateBadge hotel={hotel} />
                  </span>
                  {rooms ? <Count icon={BedDouble} value={counts?.rooms} label="rooms" /> : null}
                  <Count icon={Users} value={counts?.people} label="people" />
                  <Count icon={MonitorSmartphone} value={counts?.devices} label="devices" />
                </span>
                <ChevronRight
                  className="hidden size-4 text-text-3 transition-transform group-hover:translate-x-0.5 group-hover:text-pri-ink md:block"
                  aria-hidden="true"
                />
              </button>
              {canManage ? (
                <Link
                  to="/settings/hotels"
                  search={{ hotel: hotel.id }}
                  aria-label={`${hotel.name} settings`}
                  title="Hotel settings"
                  className="mr-3 grid size-11 flex-none place-items-center rounded-sm text-text-3 hover:bg-surface-2 hover:text-pri-ink"
                >
                  <Settings2 className="size-4" aria-hidden="true" />
                </Link>
              ) : null}
            </li>
          )
        })}
      </ul>
      <FutureNote />
    </section>
  )
}

function Count({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Users
  value: number | undefined
  label: string
}) {
  return (
    <span className="num inline-flex items-center gap-1.5 text-text-2">
      <Icon className="size-3.5 text-text-3" aria-hidden="true" />
      {value === undefined ? (
        <span className="h-4 w-6 animate-pulse rounded-sm bg-surface-2" aria-hidden="true" />
      ) : (
        <>
          <span className="font-medium text-text">{value}</span>
          <span className="md:sr-only">{label}</span>
        </>
      )}
    </span>
  )
}

export function HotelCard({
  hotel,
  summary,
  managesTeam,
  canSetUpRooms = false,
  compact,
}: {
  hotel: Property
  summary: HomeSummary | undefined
  managesTeam: boolean
  // Rooms links to the hotel's rooms page for people who set them up.
  canSetUpRooms?: boolean
  // For roles that don't run the hotel: its name and business date, no setup facts.
  compact?: boolean
}) {
  if (compact) {
    return (
      <section
        aria-labelledby="hotel-heading"
        className="flex items-center gap-4 rounded-lg border border-border bg-surface px-5 py-4 shadow-card"
      >
        <HotelMark hotel={hotel} />
        <div className="flex min-w-0 grow flex-col">
          <h2 id="hotel-heading" className="font-semibold break-words">
            {hotel.name}
          </h2>
          <p className="text-sm text-text-2">{where(hotel)}</p>
        </div>
        <DateBadge hotel={hotel} />
      </section>
    )
  }
  const counts = summary?.byHotel.find((row) => row.propertyId === hotel.id)
  return (
    <section
      aria-labelledby="hotel-heading"
      className="overflow-hidden rounded-lg border border-border bg-surface shadow-card"
    >
      <header className="flex items-center gap-4 border-b border-border px-5 py-4">
        <HotelMark hotel={hotel} size="lg" />
        <div className="flex min-w-0 flex-col">
          <h2 id="hotel-heading" className="text-base font-semibold break-words">
            {hotel.name}
          </h2>
          <p className="text-sm text-text-2">{where(hotel)}</p>
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 xl:grid-cols-6">
        <Fact label="Business date">
          <DateBadge hotel={hotel} />
        </Fact>
        <Fact label="Check-in">{hotel.checkInTime}</Fact>
        <Fact label="Check-out">{hotel.checkOutTime}</Fact>
        <Fact label="Rooms" hotel={hotel.id} to={canSetUpRooms ? '/rates/rooms' : undefined}>
          {counts?.rooms}
        </Fact>
        <Fact label="People" hotel={hotel.id} to={managesTeam ? '/settings/members' : undefined}>
          {counts?.people}
        </Fact>
        <Fact
          label="Shared devices"
          hotel={hotel.id}
          to={managesTeam ? '/settings/devices' : undefined}
        >
          {counts?.devices}
        </Fact>
      </dl>
      <FutureNote />
    </section>
  )
}

function Fact({
  label,
  children,
  to,
  hotel,
  className,
}: {
  label: string
  children: ReactNode
  // The hotel the figure is about: its link opens on that hotel (?hotel=).
  hotel?: string
  to?: '/settings/members' | '/settings/devices' | '/rates/rooms' | undefined
  className?: string
}) {
  const value =
    children === undefined ? (
      <span className="block h-5 w-8 animate-pulse rounded-sm bg-surface-2" aria-hidden="true" />
    ) : (
      <span className="num text-md font-semibold">{children}</span>
    )
  return (
    <div className={cn('flex flex-col gap-1 bg-surface px-5 py-3.5', className)}>
      <dt className="text-xs text-text-3">{label}</dt>
      <dd>
        {to ? (
          <Link
            to={to}
            search={hotel ? { hotel } : {}}
            className="underline-offset-4 hover:text-pri-ink hover:underline"
          >
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}
