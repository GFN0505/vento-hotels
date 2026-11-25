// Top bar from the designs (Shell components · Top bar): property switcher, business date, connection
// status and the account menu. Search (⌘K), offline sync and approvals arrive with their bricks.

import { calendarDateIn } from '@vento/shared'
import { Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
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

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

type TopBarProps = { user: { name: string; email: string }; onOpenMenu: () => void }

export function TopBar({ user, onOpenMenu }: TopBarProps) {
  const { properties, current, select } = useProperty()
  const online = useOnline()

  // The business date only moves at night audit, so after midnight it can differ from today.
  const today = current ? calendarDateIn(current.timeZone) : undefined
  const behind = current && today && current.businessDate !== today

  return (
    <header className="flex h-14 items-center gap-2 border-b border-border bg-surface px-3 lg:px-5">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMenu}
        aria-label="Open menu"
      >
        <Menu className="size-4" />
      </Button>
      <div className="grow" />
      {properties.length > 1 ? (
        <select
          aria-label="Property"
          value={current?.id}
          onChange={(event) => select(event.target.value)}
          className="h-11 max-w-[160px] min-w-0 rounded-sm sm:max-w-[220px] lg:h-8 border border-border-strong bg-surface px-2 font-medium"
        >
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : current ? (
        <span className="min-w-0 truncate font-medium">{current.name}</span>
      ) : null}
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
      <AccountMenu name={user.name} email={user.email} />
    </header>
  )
}
