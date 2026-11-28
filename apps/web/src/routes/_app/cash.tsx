// Cash (spec: docs/specs/stage-1-cashier-shifts.md): My shift and Shifts as tabs. Behind the front
// desk module (decision 0021). Deposits and payment matching join with bricks 10 and 11.
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { CashTabs } from '@/components/cash/cash-tabs'
import { FeatureGate } from '@/components/feature-gate'

export const Route = createFileRoute('/_app/cash')({
  component: () => (
    <FeatureGate feature="front_desk">
      <CashTabs />
      <Outlet />
    </FeatureGate>
  ),
})
