// Settings › Payments (spec: docs/specs/stage-1-taxes-and-payment-methods.md).
import { createFileRoute } from '@tanstack/react-router'
import { PaymentsPage } from '@/components/finance/payments-page'

export const Route = createFileRoute('/_app/settings/payments')({
  // The tab title as soon as navigation starts (components/shell/route-title.ts).
  staticData: { title: 'Payments' },
  component: PaymentsPage,
})
