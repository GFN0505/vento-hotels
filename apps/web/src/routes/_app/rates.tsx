// Rates & channels (design: RoomsRates, RatesGrid): Rooms, Rate plans and the Rate calendar as
// tabs; channels join in Stage 4. The whole section needs the front desk module (decision 0021).
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { FeatureGate } from '@/components/feature-gate'
import { RatesTabs } from '@/components/rates/rates-tabs'

export const Route = createFileRoute('/_app/rates')({
  component: () => (
    <FeatureGate feature="front_desk">
      <RatesTabs />
      <Outlet />
    </FeatureGate>
  ),
})
