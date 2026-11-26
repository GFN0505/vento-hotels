// Rate plans (spec: docs/specs/stage-1-rate-plans.md; design #33). The page loads on demand.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PlansPage } from '@/components/rates/plans-page'

export type PlansSearch = { show?: 'archived' | undefined }

// Hand-written rather than zod: route options load with the first page (bundle-budget.json).
function readSearch(search: Record<string, unknown>): PlansSearch {
  return { show: search.show === 'archived' ? 'archived' : undefined }
}

export const Route = createFileRoute('/_app/rates/plans/')({
  staticData: { title: 'Rate plans' },
  validateSearch: readSearch,
  component: PlansRoute,
})

function PlansRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <PlansPage
      archived={search.show === 'archived'}
      onArchived={(archived) =>
        void navigate({
          search: (prev) => ({ ...prev, show: archived ? 'archived' : undefined }),
          replace: true,
          resetScroll: false,
        })
      }
    />
  )
}
