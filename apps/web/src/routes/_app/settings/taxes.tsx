// Settings › Taxes and charges (spec: docs/specs/stage-1-taxes-and-payment-methods.md).
import { createFileRoute } from '@tanstack/react-router'
import { TaxesPage } from '@/components/finance/taxes-page'

export const Route = createFileRoute('/_app/settings/taxes')({
  // The tab title as soon as navigation starts (components/shell/route-title.ts).
  staticData: { title: 'Taxes and charges' },
  component: TaxesPage,
})
