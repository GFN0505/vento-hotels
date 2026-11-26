// Reservations offline (spec: "Offline behaviour"): the last loaded rows stay on screen, read-only,
// and the note says since when; new bookings need a connection, since availability is only true on
// the server. Nothing is queued.
import { WifiOff } from 'lucide-react'
import { offlineSince, useOnline } from '@/offline/connection'

const clock = (at: number) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(at)

export function ReservationsOffline({
  savedAt,
  searching,
}: {
  savedAt: number
  searching?: boolean
}) {
  const online = useOnline()
  if (online) return null
  const since = offlineSince()
  const updated = savedAt ? ` Last updated ${clock(savedAt)}.` : ''
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
        {searching
          ? `Search needs a connection. Showing the rows loaded at ${savedAt ? clock(savedAt) : 'the last update'}.`
          : `New bookings need a connection to check live availability.${updated}`}
      </p>
    </div>
  )
}
