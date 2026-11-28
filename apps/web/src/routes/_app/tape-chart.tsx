// The tape chart (spec: docs/specs/stage-1-tape-chart.md): behind the front desk module (decision
// 0021). The page itself loads on demand.
import { createFileRoute } from '@tanstack/react-router'
import { FeatureGate } from '@/components/feature-gate'
import { TapeChartPage } from '@/components/tape-chart/tape-chart-page'

export const Route = createFileRoute('/_app/tape-chart')({
  staticData: { title: 'Tape chart' },
  component: () => (
    <FeatureGate feature="front_desk">
      <TapeChartPage />
    </FeatureGate>
  ),
})
