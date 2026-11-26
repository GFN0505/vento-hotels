// A new rate plan, or a copy of one (?copy=<id>, from Duplicate).
import { createFileRoute } from '@tanstack/react-router'
import { PlanEditorPage } from '@/components/rates/plan-editor-page'

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : undefined

export const Route = createFileRoute('/_app/rates/plans/new')({
  staticData: { title: 'New rate plan' },
  validateSearch: (search: Record<string, unknown>): { copy?: string | undefined } => ({
    copy: text(search.copy),
  }),
  component: NewPlanRoute,
})

function NewPlanRoute() {
  const { copy } = Route.useSearch()
  return <PlanEditorPage key={copy ?? 'new'} copyOf={copy} />
}
