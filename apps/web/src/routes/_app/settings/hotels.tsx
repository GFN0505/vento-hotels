// Settings › Hotels (spec: docs/specs/stage-1-hotels-and-companies.md). The page loads on demand.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { HotelsPage } from '@/components/hotels/hotels-page'
import type { HotelsSearch, OnHotelsSearch } from '@/components/hotels/hotels-search'

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined

// Hand-written rather than zod: route options load with the first page (bundle-budget.json).
function readSearch(search: Record<string, unknown>): HotelsSearch {
  const page = Number(search.page)
  return {
    show: search.show === 'archived' ? 'archived' : undefined,
    q: text(search.q, 120),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    sheet: search.sheet === 'add' ? 'add' : undefined,
  }
}

export const Route = createFileRoute('/_app/settings/hotels')({
  validateSearch: readSearch,
  component: HotelsRoute,
})

function HotelsRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const onSearch: OnHotelsSearch = useCallback(
    (patch, options) =>
      void navigate({
        search: (prev) => ({ ...prev, page: undefined, ...patch }),
        replace: !options?.push,
        resetScroll: false,
      }),
    [navigate],
  )
  return <HotelsPage search={search} onSearch={onSearch} />
}
