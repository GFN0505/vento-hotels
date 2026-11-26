// /rates opens the first tab the member can see: Rooms for people who set up rooms, Rate plans for
// people who only read or change rates (the front desk, a revenue manager).
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useRatesTabs } from '@/components/rates/rates-tabs'
import { useMe } from '@/lib/me'

export const Route = createFileRoute('/_app/rates/')({
  component: RatesIndex,
})

function RatesIndex() {
  const me = useMe()
  const tabs = useRatesTabs()
  if (me.isPending) return null
  return <Navigate to={tabs[0]?.to ?? '/rates/rooms'} replace />
}
