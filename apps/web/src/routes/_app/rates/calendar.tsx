// Rate calendar (design #8, the Rates tab of RatesGrid; spec: stage-1-rate-plans). Dates, filters
// and the Change dates sheet live in the URL, so a link opens the same view ("Rates for 5 Dec").
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { CalendarPage } from '@/components/rates/calendar-page'
import type { CalendarSearch, OnCalendarSearch } from '@/components/rates/calendar-search'

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : undefined
const date = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined

// Hand-written rather than zod: route options load with the first page (bundle-budget.json).
function readSearch(search: Record<string, unknown>): CalendarSearch {
  return {
    from: date(search.from),
    nights: Number(search.nights) === 30 ? 30 : undefined,
    type: text(search.type),
    corporate: search.corporate === true || search.corporate === 'true' ? true : undefined,
    sheet: search.sheet === 'dates' ? 'dates' : undefined,
    plan: text(search.plan),
    date: date(search.date),
  }
}

export const Route = createFileRoute('/_app/rates/calendar')({
  staticData: { title: 'Rate calendar' },
  validateSearch: readSearch,
  component: CalendarRoute,
})

function CalendarRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const onSearch: OnCalendarSearch = useCallback(
    (patch, options) =>
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: !options?.push,
        resetScroll: false,
      }),
    [navigate],
  )
  return <CalendarPage search={search} onSearch={onSearch} />
}
