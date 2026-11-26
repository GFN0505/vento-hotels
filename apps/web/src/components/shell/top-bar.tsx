// Top bar from the designs (Shell components · Top bar): property switcher, business date, connection
// status and the account menu. Search (⌘K), offline sync and approvals arrive with their bricks.

import { calendarDateIn } from '@vento/shared'
import { ChevronDown, Lock, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { lockDevice } from '@/lib/device-session'
import { useMe } from '@/lib/me'
import { useOnline } from '@/offline/connection'
import { AccountMenu } from './account-menu'
import { useProperty } from './property-context'

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

// "25 Nov" on phones, where the bar is narrow; the year rarely matters at a glance.
function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

type TopBarProps = { user: { name: string; email: string }; onOpenMenu: () => void }

export function TopBar({ user, onOpenMenu }: TopBarProps) {
  const me = useMe()
  const { current: hotel, allHotels } = useProperty()
  // With "All hotels" chosen there's no single business date to show.
  const current = allHotels ? undefined : hotel
  const online = useOnline()

  // The business date only moves at night audit, so after midnight it can differ from today.
  const today = current ? calendarDateIn(current.timeZone) : undefined
  const behind = current && today && current.businessDate !== today

  return (
    <header className="flex h-14 items-center gap-2.5 border-b border-border bg-surface px-3 lg:h-[60px] lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMenu}
        aria-label="Open menu"
      >
        <Menu className="size-4" />
      </Button>
      {hotel ? <PropertyPill /> : null}
      <div className="grow" />
      {current ? (
        <span
          className={cn(
            'num inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-sm font-medium',
            behind ? 'bg-am-bg text-am' : 'bg-sl-bg text-sl',
          )}
          title={
            behind
              ? `Calendar date ${formatDate(today ?? '')}. Run night audit to close the day.`
              : undefined
          }
        >
          <span className="sr-only sm:not-sr-only">Business date&nbsp;</span>
          <span className="sm:hidden">{formatShortDate(current.businessDate)}</span>
          <span className="hidden sm:inline">{formatDate(current.businessDate)}</span>
        </span>
      ) : null}
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-text-3">
        <span
          className={cn('size-2 rounded-full', online ? 'bg-em-dot' : 'bg-am-dot')}
          aria-hidden="true"
        />
        <span className="sr-only md:not-sr-only">{online ? 'Online' : 'Offline'}</span>
      </span>
      {me.data?.device ? (
        <Button
          variant="ghost"
          onClick={() => void lockDevice()}
          className="max-lg:h-11"
          title={`Lock ${me.data.device.name} for the next person`}
        >
          <Lock className="size-4" aria-hidden="true" />
          Lock
        </Button>
      ) : null}
      <AccountMenu name={user.name} email={user.email} onSharedDevice={Boolean(me.data?.device)} />
    </header>
  )
}

// The hotel being worked in, as a quiet pill on the left (as in Vento Real Estate's entity picker).
// With several hotels it's a native select laid over the pill, so phones get their own picker.
// People who see the whole group get "All hotels" first.
function PropertyPill() {
  const { properties, current, allHotels, canSeeAll, select, selectAll } = useProperty()
  if (!current) return null
  const several = properties.length > 1
  const label = allHotels ? 'All hotels' : current.name
  return (
    <div className="relative flex h-11 min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-3 focus-within:ring-2 focus-within:ring-ring lg:h-9">
      <span className="text-[10px] font-bold tracking-[0.04em] text-text-3 uppercase">
        {allHotels ? 'Group' : 'Hotel'}
      </span>
      <span className="min-w-0 truncate font-semibold" title={label}>
        {label}
      </span>
      {several ? (
        <>
          <ChevronDown className="size-3.5 shrink-0 text-text-3" aria-hidden="true" />
          <select
            aria-label="Hotel"
            value={allHotels ? ALL_HOTELS : current.id}
            onChange={(event) =>
              event.target.value === ALL_HOTELS ? selectAll() : select(event.target.value)
            }
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {canSeeAll ? <option value={ALL_HOTELS}>All hotels</option> : null}
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  )
}

const ALL_HOTELS = 'all'
