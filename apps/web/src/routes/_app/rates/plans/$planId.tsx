// One rate plan's editor (design #33, RatePlanEdit). ?add=<roomTypeId> adds an unpriced room type
// ("Add to Best available").
import { createFileRoute } from '@tanstack/react-router'
import { PlanEditorPage } from '@/components/rates/plan-editor-page'

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : undefined

export const Route = createFileRoute('/_app/rates/plans/$planId')({
  staticData: { title: 'Rate plan' },
  validateSearch: (search: Record<string, unknown>): { add?: string | undefined } => ({
    add: text(search.add),
  }),
  component: PlanRoute,
})

function PlanRoute() {
  const { planId } = Route.useParams()
  const { add } = Route.useSearch()
  return <PlanEditorPage key={planId} planId={planId} addRoomType={add} />
}
