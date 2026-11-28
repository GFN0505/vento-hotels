// Shifts: the hotel's cashier shifts, newest first, and one shift's detail in a sheet (spec:
// "Shifts list and detail"). Segment, dates, page and the open shift live in the URL.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { type OnShiftsSearch, ShiftsPage, type ShiftsSearch } from '@/components/cash/shifts-page'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const ID = /^[0-9a-f-]{36}$/

// Hand-written rather than zod: route options load with the first page (bundle-budget.json).
function readSearch(search: Record<string, unknown>): ShiftsSearch {
  const page = Number(search.page)
  return {
    segment:
      search.segment === 'open' || search.segment === 'difference' ? search.segment : undefined,
    from: typeof search.from === 'string' && DATE.test(search.from) ? search.from : undefined,
    to: typeof search.to === 'string' && DATE.test(search.to) ? search.to : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    id: typeof search.id === 'string' && ID.test(search.id) ? search.id : undefined,
  }
}

export const Route = createFileRoute('/_app/cash/shifts')({
  staticData: { title: 'Shifts' },
  validateSearch: readSearch,
  component: ShiftsRoute,
})

function ShiftsRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const onSearch: OnShiftsSearch = useCallback(
    (patch, options) =>
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: !options?.push,
        resetScroll: false,
      }),
    [navigate],
  )
  return <ShiftsPage search={search} onSearch={onSearch} />
}
