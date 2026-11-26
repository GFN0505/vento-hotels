// Settings › FX rates (spec: docs/specs/stage-1-taxes-and-payment-methods.md).
import { createFileRoute } from '@tanstack/react-router'
import { FeatureGate } from '@/components/feature-gate'
import { FxRatesPage } from '@/components/finance/fx-page'

export const Route = createFileRoute('/_app/settings/fx-rates')({
  // The tab title as soon as navigation starts (components/shell/route-title.ts).
  staticData: { title: 'FX rates' },
  // Ships behind the front desk module (decision 0021).
  component: () => (
    <FeatureGate feature="front_desk">
      <FxRatesPage />
    </FeatureGate>
  ),
})
