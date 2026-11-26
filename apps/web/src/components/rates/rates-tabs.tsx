// Rates & channels' tabs (spec: "Rooms · Rate plans · Rate calendar"), each shown to who can use
// it: Rooms with rooms.setup, the rates tabs with any rates reader permission. Channels join in
// Stage 4. Links, not ARIA tabs: each one is its own page with its own address.
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/cn'
import { useMe } from '@/lib/me'
import { useCanReadRates } from './rates-hotel'

const TABS = [
  { to: '/rates/rooms', label: 'Rooms', rates: false },
  { to: '/rates/plans', label: 'Rate plans', rates: true },
  { to: '/rates/calendar', label: 'Rate calendar', rates: true },
] as const

export function useRatesTabs() {
  const me = useMe()
  const canReadRates = useCanReadRates()
  return TABS.filter((tab) => (tab.rates ? canReadRates : me.can('rooms.setup')))
}

export function RatesTabs() {
  const tabs = useRatesTabs()
  if (tabs.length < 2) return null
  return (
    <nav aria-label="Rates & channels" className="-mt-1 mb-5 border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-none">
            <Link
              to={tab.to}
              className={cn(
                'flex h-11 items-center border-b-2 border-transparent px-3 font-medium whitespace-nowrap text-text-2 hover:text-text lg:h-10',
                'data-[status=active]:border-pri data-[status=active]:text-text',
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
