// Settings › Payments (spec: docs/specs/stage-1-taxes-and-payment-methods.md).
import { createFileRoute } from '@tanstack/react-router'
import { FeatureGate } from '@/components/feature-gate'
import { PaymentsPage } from '@/components/finance/payments-page'

export const Route = createFileRoute('/_app/settings/payments')({
  // The tab title as soon as navigation starts (components/shell/route-title.ts).
  staticData: { title: 'Payments' },
  // Ships behind the front desk module (decision 0021).
  component: () => (
    <FeatureGate feature="front_desk">
      <PaymentsPage />
    </FeatureGate>
  ),
})
