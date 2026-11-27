// Shown under the top bar while Vento can't be reached (UX standard: offline state). Says what
// still works and how old the data on screen is; it goes away by itself when the connection is back.
// Mark clean and Mark dirty are kept on the device and sync when the connection is back (the
// outbox); everything else needs a connection.
import { WifiOff } from 'lucide-react'
import { useOnline } from '@/offline/connection'
import { useOutbox } from '@/offline/outbox'
import { lastSavedAt } from '@/offline/saved-data'

function savedTime(at: number): string {
  const sameDay = new Date(at).toDateString() === new Date().toDateString()
  return new Intl.DateTimeFormat('en-GB', {
    ...(sameDay ? {} : { day: 'numeric', month: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(at)
}

export function OfflineBanner() {
  const online = useOnline()
  const waiting = useOutbox().filter((item) => item.state === 'waiting').length
  if (online) return null
  const at = lastSavedAt()
  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-am-dot/30 bg-am-bg px-4 py-2.5 text-sm text-am lg:items-center lg:px-6"
    >
      <WifiOff className="mt-0.5 size-4 flex-none lg:mt-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">You're offline.</span>{' '}
        {at
          ? `Showing what was saved on this device at ${savedTime(at)}.`
          : 'Showing what was saved on this device.'}{' '}
        Marking rooms clean or dirty still works and syncs when you're back
        {waiting ? ` (${waiting === 1 ? '1 change' : `${waiting} changes`} will sync)` : ''}; other
        changes need a connection. This clears by itself.
      </p>
    </div>
  )
}
