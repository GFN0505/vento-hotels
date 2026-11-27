// The Reservations list (spec: stage-1-availability-and-reservations, "Reservations list"). View,
// search, filters, page and the New reservation sheet live in the URL.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { ReservationSource, ReservationStatus } from '@vento/shared'
import { useCallback } from 'react'
import type { OnReservationsSearch, ReservationsSearch } from '@/components/reservations/queries'
import { ReservationsPage } from '@/components/reservations/reservations-page'

// Written out rather than imported: route options load with the first page (bundle-budget.json),
// and @vento/shared's values would bring zod with them. Types keep them in step.
const STATUSES: readonly ReservationStatus[] = [
  'tentative',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show',
]
const SOURCES: readonly ReservationSource[] = [
  'direct',
  'walk_in',
  'phone',
  'email',
  'whatsapp',
  'booking_engine',
  'ota',
  'corporate',
  'travel_agent',
]

const date = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
const oneOf = <T extends string>(list: readonly T[], value: unknown) =>
  list.includes(value as T) ? (value as T) : undefined

// Hand-written rather than zod: route options load with the first page (bundle-budget.json).
function readSearch(search: Record<string, unknown>): ReservationsSearch {
  const page = Number(search.page)
  return {
    view: oneOf(['booked_today', 'all'] as const, search.view),
    q: typeof search.q === 'string' && search.q.trim() ? search.q.slice(0, 120) : undefined,
    status: oneOf(STATUSES, search.status),
    roomTypeId: typeof search.roomTypeId === 'string' ? search.roomTypeId.slice(0, 40) : undefined,
    source: oneOf(SOURCES, search.source),
    arrivalFrom: date(search.arrivalFrom),
    arrivalTo: date(search.arrivalTo),
    depositDue: search.depositDue === true || search.depositDue === 'true' ? true : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    sheet: search.sheet === 'new' ? 'new' : undefined,
    approval:
      search.sheet === 'new' &&
      typeof search.approval === 'string' &&
      /^[0-9a-f-]{36}$/.test(search.approval)
        ? search.approval
        : undefined,
  }
}

export const Route = createFileRoute('/_app/reservations/')({
  staticData: { title: 'Reservations' },
  validateSearch: readSearch,
  component: ReservationsRoute,
})

function ReservationsRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const onSearch: OnReservationsSearch = useCallback(
    (patch, options) =>
      void navigate({
        search: (prev) => ({ ...prev, page: undefined, ...patch }),
        replace: !options?.push,
        resetScroll: false,
      }),
    [navigate],
  )
  return <ReservationsPage search={search} onSearch={onSearch} />
}
