// Rates & channels (design: RoomsRates): rooms now; rate plans (brick 2) and channels (Stage 4)
// join as their own pages here. The whole section needs the front desk module (decision 0021).
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { FeatureGate } from '@/components/feature-gate'

export const Route = createFileRoute('/_app/rates')({
  component: () => (
    <FeatureGate feature="front_desk">
      <Outlet />
    </FeatureGate>
  ),
})
