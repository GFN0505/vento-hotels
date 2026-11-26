// Settings › Companies (spec: docs/specs/stage-1-hotels-and-companies.md). The page loads on demand.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { CompaniesPage, type CompaniesSearch } from '@/components/companies/companies-page'

// Hand-written rather than zod: route options load with the first page (bundle-budget.json).
function readSearch(search: Record<string, unknown>): CompaniesSearch {
  const page = Number(search.page)
  return {
    show: search.show === 'archived' ? 'archived' : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    sheet: search.sheet === 'add' || search.sheet === 'edit' ? search.sheet : undefined,
    id: typeof search.id === 'string' ? search.id.slice(0, 40) : undefined,
  }
}

export const Route = createFileRoute('/_app/settings/companies')({
  validateSearch: readSearch,
  component: CompaniesRoute,
})

function CompaniesRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const onSearch = useCallback(
    (patch: Partial<CompaniesSearch>, options?: { push?: boolean }) =>
      void navigate({
        search: (prev) => ({ ...prev, page: undefined, ...patch }),
        replace: !options?.push,
        resetScroll: false,
      }),
    [navigate],
  )
  return <CompaniesPage search={search} onSearch={onSearch} />
}
