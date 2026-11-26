// The rates pages' shared states: offline (read-only, nothing queued), a load error with retry,
// and the hotel with no rooms yet.
import { Link } from '@tanstack/react-router'
import { AlertTriangle, BedDouble, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useMe } from '@/lib/me'
import { offlineSince, useOnline } from '@/offline/connection'

function clock(at: number): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(at)
}

// "Offline since 17:32. Rate plans and rates are read-only offline."
export function RatesOffline() {
  const online = useOnline()
  if (online) return null
  const since = offlineSince()
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border border-border bg-am-bg px-4 py-2.5 text-am"
    >
      <WifiOff className="mt-0.5 size-4 flex-none" aria-hidden="true" />
      <p>
        <span className="font-semibold">
          {since ? `Offline since ${clock(since)}.` : 'Offline.'}
        </span>{' '}
        Rate plans and rates are read-only offline.
      </p>
    </div>
  )
}

export function RatesLoadError({
  onRetry,
  what = 'rate plans',
}: {
  onRetry: () => void
  what?: string
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-14 text-center shadow-card"
    >
      <span className="grid size-12 place-items-center rounded-xl bg-surface-2 text-text-2 ring-1 ring-border">
        <AlertTriangle className="size-6" aria-hidden="true" strokeWidth={1.7} />
      </span>
      <p className="text-lg font-semibold">Couldn't load {what}.</p>
      <p className="text-text-2">Nothing changed. Bookings keep their rates.</p>
      <Button variant="primary" className="max-lg:h-11" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

export function NoRoomsYet() {
  const me = useMe()
  const canSetUp = me.can('rooms.setup')
  return (
    <EmptyState
      icon={BedDouble}
      tone="brand"
      action={
        canSetUp ? (
          <Link
            to="/rates/rooms"
            className="inline-flex h-11 items-center rounded-sm bg-pri px-4 font-medium text-white hover:bg-pri-hover lg:h-10"
          >
            Set up rooms
          </Link>
        ) : null
      }
    >
      <p className="font-medium text-text">Set up rooms first. Rates are set per room type.</p>
      {canSetUp ? null : <p>Ask your GM to set up rooms.</p>}
    </EmptyState>
  )
}
