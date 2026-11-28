// The 60-second walk-in (spec: "Walk-in (#6, 60 seconds)"): behind the front desk module.
import { createFileRoute } from '@tanstack/react-router'
import { FeatureGate } from '@/components/feature-gate'
import { WalkInPage } from '@/components/front-desk/walk-in-page'

export const Route = createFileRoute('/_app/walk-in')({
  staticData: { title: 'Walk-in' },
  component: () => (
    <FeatureGate feature="front_desk">
      <WalkInPage />
    </FeatureGate>
  ),
})
