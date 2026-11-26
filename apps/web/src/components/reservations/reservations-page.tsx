// Reservations (spec: "Reservations list"): a group page. One hotel shows its reservations; All
// hotels shows every hotel the member sees, with a Hotel column. Views, search and filters in the
// URL; New reservation (N) opens the booking sheet for members who make bookings.
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarDays, Plus, SearchX } from 'lucide-react'
import { lazy, Suspense, useEffect } from 'react'
import { LoadError, RowsSkeleton } from '@/components/settings/load-states'
import { useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { ScrollRegion } from '@/components/ui/scroll-region'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'
import { keepWithinHotel, scopeName, scopePropertyId } from '@/lib/scope'
import { useOnline } from '@/offline/connection'
import { ReservationsOffline } from './offline-note'
import {
  hasFilters,
  NEEDS_LIVE,
  NO_FILTERS,
  type OnReservationsSearch,
  PAGE_SIZE,
  type ReservationsSearch,
} from './queries'
import { ReservationsTable } from './reservations-table'
import { ReservationsToolbar } from './reservations-toolbar'

// The booking sheet loads when it's first opened.
const BookingSheet = lazy(() =>
  import('./new/booking-sheet').then((module) => ({ default: module.BookingSheet })),
)

const READERS = ['reservation.manage', 'night_audit.run', 'leakage.view'] as const

type Props = { search: ReservationsSearch; onSearch: OnReservationsSearch }

// Typing a letter in a field never opens the sheet.
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export function ReservationsPage({ search, onSearch }: Props) {
  const me = useMe()
  const online = useOnline()
  const { scope } = useProperty()
  useScopedTitle('Reservations')
  const propertyId = scopePropertyId(scope)
  const page = search.page ?? 1
  const canRead = READERS.some((permission) => me.can(permission))
  const canBook = me.can('reservation.manage')
  const list = useQuery({
    ...orpc.reservations.list.queryOptions({
      input: {
        propertyId,
        view: search.view ?? 'upcoming',
        q: search.q,
        status: search.status,
        roomTypeId: search.roomTypeId,
        source: search.source,
        arrivalFrom: search.arrivalFrom,
        arrivalTo: search.arrivalTo,
        depositDue: search.depositDue,
        page,
        pageSize: PAGE_SIZE,
      },
    }),
    enabled: canRead && scope !== undefined,
    placeholderData: keepWithinHotel(propertyId),
  })
  const archived = scope?.kind === 'hotel' && scope.hotel.status === 'archived'
  const showNew = canBook && !archived
  const openNew = () => onSearch({ sheet: 'new' }, { push: true })

  useEffect(() => {
    if (!showNew || !online) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey) return
      if (typing(event.target) || search.sheet) return
      event.preventDefault()
      onSearch({ sheet: 'new' }, { push: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showNew, online, search.sheet, onSearch])

  if (me.isPending) return <RowsSkeleton rows={6} label="Loading reservations" />
  if (!canRead) {
    return <NoAccess what="reservations" ask="Ask your GM if you need them." />
  }

  const where = scope ? scopeName(scope) : ''
  const filtered = hasFilters(search)
  const total = list.data?.total

  return (
    <div className="flex flex-col gap-5">
      <ReservationsOffline savedAt={list.dataUpdatedAt} searching={Boolean(search.q)} />
      <PageHeader
        title="Reservations"
        description={
          archived
            ? 'This hotel was archived. Its reservations stay readable.'
            : total !== undefined
              ? `${total.toLocaleString('en-GB')} ${search.view === 'booked_today' ? 'booked today' : search.view === 'all' ? 'in all' : 'upcoming'}`
              : undefined
        }
        actions={
          showNew ? (
            <span className="flex items-center gap-3">
              {!online ? <span className="text-sm text-text-3">{NEEDS_LIVE}</span> : null}
              <Button
                variant="primary"
                size="lg"
                className="max-lg:h-11"
                disabled={!online}
                aria-keyshortcuts="N"
                onClick={openNew}
              >
                <Plus className="size-4" aria-hidden="true" />
                New reservation
                <kbd className="ml-1 hidden rounded-[4px] bg-white/20 px-1.5 text-xs lg:inline">
                  N
                </kbd>
              </Button>
            </span>
          ) : undefined
        }
      />
      <Card className="overflow-hidden">
        <ReservationsToolbar search={search} onSearch={onSearch} propertyId={propertyId} />
        {list.isPending || !scope ? (
          <RowsSkeleton rows={8} label="Loading reservations" />
        ) : list.isError && !list.data ? (
          <div className="flex flex-col gap-2 p-4">
            <p className="font-medium">Couldn't load reservations at {where}.</p>
            <LoadError onRetry={() => list.refetch()} retrying={list.isFetching} />
          </div>
        ) : list.data.items.length === 0 ? (
          search.q ? (
            <EmptyState icon={SearchX} className="m-4 border-dashed shadow-none">
              No reservations for “{search.q}” at {where}.
            </EmptyState>
          ) : filtered ? (
            <EmptyState
              icon={SearchX}
              className="m-4 border-dashed shadow-none"
              action={
                <Button className="max-lg:h-11" onClick={() => onSearch(NO_FILTERS)}>
                  Clear filters
                </Button>
              }
            >
              No reservations match these filters.
            </EmptyState>
          ) : (
            <EmptyState
              icon={CalendarDays}
              tone="brand"
              className="m-4 border-dashed shadow-none"
              action={
                showNew && online ? (
                  <Button variant="primary" className="max-lg:h-11" onClick={openNew}>
                    <Plus className="size-4" aria-hidden="true" />
                    New reservation
                  </Button>
                ) : undefined
              }
            >
              {search.view === 'booked_today'
                ? `Nothing booked at ${where} today yet.`
                : `No reservations at ${where} yet. Bookings taken here, on the phone or at the desk, show in this list.`}
            </EmptyState>
          )
        ) : (
          <ScrollRegion label="Reservations" className="md:overflow-x-auto">
            <ReservationsTable
              rows={list.data.items}
              showHotel={scope.kind === 'all'}
              dimmed={list.isPlaceholderData}
            />
          </ScrollRegion>
        )}
      </Card>
      {list.data ? (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={list.data.total}
          onPage={(next) => onSearch({ page: next }, { push: true })}
        />
      ) : null}
      {search.sheet === 'new' && showNew ? (
        <Suspense fallback={null}>
          <BookingSheet onClose={() => onSearch({ sheet: undefined })} />
        </Suspense>
      ) : null}
      {search.sheet === 'new' && !canBook ? (
        <p className="text-sm text-text-3">
          Only front desk, revenue managers, GMs and the owner can make reservations. Ask your GM.{' '}
          <Link to="/reservations" search={{}} className="text-pri-ink hover:underline">
            Back to the list
          </Link>
        </p>
      ) : null}
    </div>
  )
}
