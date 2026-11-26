// Rate plans and the Rate calendar are hotel pages (UX standard §8): who may read them, which hotel,
// and "Rates are set per hotel. Pick a hotel." with All hotels chosen. Reading comes with rates.edit,
// rooms.setup or reservation.manage (read-only for the last two; the front desk quotes by phone).
import { useQuery } from '@tanstack/react-query'
import { type Property, RATES_READERS } from '@vento/shared'
import { Building2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { PickHotel } from '@/components/shell/pick-hotel'
import { useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { NoAccess } from '@/components/team/no-access'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'
import { RatesSkeleton } from './skeletons'

type Props = {
  title: string
  description: string
  calendar?: boolean
  children: (hotel: Property) => ReactNode
}

export function useCanReadRates() {
  const me = useMe()
  return RATES_READERS.some((permission) => me.can(permission))
}

export function RatesHotel({ title, description, calendar, children }: Props) {
  useScopedTitle(title)
  const me = useMe()
  const canRead = useCanReadRates()
  const { current, allHotels, scope, ready } = useProperty()
  // Until the switch knows the hotel, nothing loads (no other hotel's rates first).
  if (me.isPending || (!scope && !ready)) return <RatesSkeleton title={title} calendar={calendar} />
  if (!canRead) return <NoAccess what="rates" ask="Ask your GM if you need to see rates." />
  if (allHotels) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader scope="pick" title={title} description={description} />
        <PickHotel
          title="Rates are set per hotel. Pick a hotel."
          aside={(hotel) => <RatesAside hotel={hotel} />}
        />
      </div>
    )
  }
  if (!current) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={title} />
        <EmptyState icon={Building2} tone="brand">
          You're not on a hotel yet. An owner can give you access from Settings.
        </EmptyState>
      </div>
    )
  }
  return <div key={current.id}>{children(current)}</div>
}

// Each hotel's fact in "Pick a hotel": whether its rates are set (from Home's summary).
function RatesAside({ hotel }: { hotel: Property }) {
  const summary = useQuery(orpc.organization.home.queryOptions())
  const row = summary.data?.byHotel.find((r) => r.propertyId === hotel.id)
  if (!row) return null
  const text = row.ratesSet ? 'Rates set' : row.rooms === 0 ? 'No rooms yet' : 'No rates yet'
  return (
    <span className={`flex-none text-right text-sm ${row.ratesSet ? 'text-em' : 'text-text-2'}`}>
      {text}
    </span>
  )
}
