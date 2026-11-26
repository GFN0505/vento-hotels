// Settings › FX rates (spec: docs/specs/stage-1-taxes-and-payment-methods.md).
import { createFileRoute } from '@tanstack/react-router'
import { FxRatesPage } from '@/components/finance/fx-page'

export const Route = createFileRoute('/_app/settings/fx-rates')({
  // The tab title as soon as navigation starts (components/shell/route-title.ts).
  staticData: { title: 'FX rates' },
  component: FxRatesPage,
})
