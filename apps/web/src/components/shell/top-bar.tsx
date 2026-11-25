// Top bar from the designs (Shell components · Top bar): property switcher, business date, connection
// status and the account menu. Search (⌘K), offline sync and approvals arrive with their bricks.

import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { calendarDateIn } from '@vento/shared'
import { LogOut, Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { useProperty } from './property-context'

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function TopBar({ userName, onOpenMenu }: { userName: string; onOpenMenu: () => void }) {
  const { properties, current, select } = useProperty()
  const online = useOnline()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // The business date only moves at night audit, so after midnight it can differ from today.
  const today = current ? calendarDateIn(current.timeZone) : undefined
  const behind = current && today && current.businessDate !== today

  async function signOut() {
    await authClient.signOut()
    queryClient.clear()
    await navigate({ to: '/sign-in' })
  }

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
          className="h-8 max-w-[220px] rounded-sm border border-border-strong bg-surface px-2 font-medium"
        >
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : current ? (
        <span className="font-medium">{current.name}</span>
      ) : null}
      {current ? (
        <span
          className={cn(
            'num hidden h-[22px] items-center rounded-full px-2 text-sm font-medium sm:inline-flex',
            behind ? 'bg-am-bg text-am' : 'bg-sl-bg text-sl',
          )}
          title={
            behind
              ? `Calendar date ${formatDate(today ?? '')}. Run night audit to close the day.`
              : undefined
          }
        >
          Business date {formatDate(current.businessDate)}
        </span>
      ) : null}
      <span className="hidden items-center gap-1.5 text-sm text-text-3 md:inline-flex">
        <span className={cn('size-2 rounded-full', online ? 'bg-em-dot' : 'bg-am-dot')} />
        {online ? 'Online' : 'Offline'}
      </span>
      <span
        className="inline-grid size-7 place-items-center rounded-full bg-pri-soft text-xs font-semibold text-pri-ink"
        title={userName}
      >
        {initials(userName)}
      </span>
      <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" title="Sign out">
        <LogOut className="size-4" />
      </Button>
    </header>
  )
}
