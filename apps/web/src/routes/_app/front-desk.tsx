// The Front desk lists (spec: docs/specs/stage-1-front-desk-check-in.md): behind the front desk
// module (decision 0021).
import { createFileRoute } from '@tanstack/react-router'
import { FeatureGate } from '@/components/feature-gate'
import { FrontDeskPage } from '@/components/front-desk/front-desk-page'

export const Route = createFileRoute('/_app/front-desk')({
  staticData: { title: 'Front desk' },
  component: () => (
    <FeatureGate feature="front_desk">
      <FrontDeskPage />
    </FeatureGate>
  ),
})
