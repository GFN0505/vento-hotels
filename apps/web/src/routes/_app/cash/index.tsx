// My shift: open a shift, count it blind, close it (spec: "Open a shift", "My shift", "Count
// blind", "Close"). The page itself loads on demand.
import { createFileRoute } from '@tanstack/react-router'
import { MyShiftPage } from '@/components/cash/my-shift-page'

export const Route = createFileRoute('/_app/cash/')({
  // The tab title as soon as navigation starts (components/shell/route-title.ts).
  staticData: { title: 'Cash' },
  component: MyShiftPage,
})
