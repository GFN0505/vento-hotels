// Offline on Cash (spec: "Offline behaviour"): the shift and the list as last loaded, under one
// banner. Opening, counting and closing need a connection; typed counts stay on the screen.
import { offlineSince, useOnline } from '@/offline/connection'

const clock = (at: number) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    at,
  )

export function CashOffline({ savedAt, what = 'your shift' }: { savedAt: number; what?: string }) {
  const online = useOnline()
  if (online) return null
  const since = offlineSince()
  const shown = savedAt || since
  return (
    <div role="status" className="rounded-lg border border-border bg-am-bg px-4 py-2.5 text-am">
      <span className="font-semibold">{since ? `Offline since ${clock(since)}.` : 'Offline.'}</span>{' '}
      {shown ? `Showing ${what} as of ${clock(shown)}. ` : ''}Opening, counting and closing a shift
      need a connection.
    </div>
  )
}
