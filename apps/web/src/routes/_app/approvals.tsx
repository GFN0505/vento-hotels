// Approvals (spec: stage-1-approvals.md, "Bell and inbox"): reached from the bell's See all, no
// sidebar item. The segment, page and open request live in the URL. Approvals ship with the front
// desk module (the one kind so far is the over-limit discount).
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import {
  ApprovalsPage,
  type ApprovalsSearch,
  type OnApprovalsSearch,
} from '@/components/approvals/approvals-page'
import { FeatureGate } from '@/components/feature-gate'

// Hand-written rather than zod: route options load with the first page (bundle-budget.json).
function readSearch(search: Record<string, unknown>): ApprovalsSearch {
  const page = Number(search.page)
  return {
    view: search.view === 'asked' || search.view === 'done' ? search.view : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    id: typeof search.id === 'string' && /^[0-9a-f-]{36}$/.test(search.id) ? search.id : undefined,
  }
}

export const Route = createFileRoute('/_app/approvals')({
  staticData: { title: 'Approvals' },
  validateSearch: readSearch,
  component: ApprovalsRoute,
})

function ApprovalsRoute() {
  const search = Route.useSearch()
  const { user } = Route.useRouteContext()
  const navigate = useNavigate({ from: Route.fullPath })
  const onSearch: OnApprovalsSearch = useCallback(
    (patch, options) =>
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: !options?.push,
        resetScroll: false,
      }),
    [navigate],
  )
  return (
    <FeatureGate feature="front_desk">
      <ApprovalsPage search={search} onSearch={onSearch} userName={user.name} />
    </FeatureGate>
  )
}
