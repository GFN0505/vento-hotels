// Settings need a connection (spec: hotels and companies, "Offline behaviour"): the page shows what
// was saved on this device, read-only, and says why. Nothing is queued.
import { WifiOff } from 'lucide-react'
import { offlineSince, useOnline } from '@/offline/connection'

export const NEEDS_CONNECTION = 'Needs a connection'

function clock(at: number): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(at)
}

// `note` replaces the usual line, e.g. the taxes pages' "Bills keep using the rules saved on each device."
export function SettingsOffline({ note }: { note?: string } = {}) {
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
        {note ??
          'Settings are read-only while offline. Changes need a connection so every device gets them.'}
      </p>
    </div>
  )
}
