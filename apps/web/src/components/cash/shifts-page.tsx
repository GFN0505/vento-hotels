// Shifts (spec: "Shifts list and detail"): the hotel's cashier shifts, newest first, 50 a page. GM,
// finance and the owner see every shift; everyone else who runs one sees their own. An open shift
// shows its float and "Counted at close", nothing else. A row opens the shift in a sheet.
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  addDays,
  type Property,
  SHIFT_STATUS_LABELS,
  type ShiftRow,
  type ShiftSegment,
} from '@vento/shared'
import { AlertTriangle, ChevronRight, SearchX, Wallet } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { PickHotel } from '@/components/shell/pick-hotel'
import { useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { Segmented } from '@/components/ui/segmented'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'
import { CashOffline } from './cash-offline'
import { naira, openedClosed, rowDifference, STATUS_TONE, shiftLabel } from './format'
import { RUN_SHIFT_ONLY } from './my-shift-page'
import { ShiftSheet } from './shift-sheet'

export type ShiftsSearch = {
  segment?: 'open' | 'difference' | undefined
  from?: string | undefined
  to?: string | undefined
  page?: number | undefined
  id?: string | undefined
}
export type OnShiftsSearch = (patch: Partial<ShiftsSearch>, options?: { push?: boolean }) => void

const PAGE_SIZE = 50

export function ShiftsPage({
  search,
  onSearch,
}: {
  search: ShiftsSearch
  onSearch: OnShiftsSearch
}) {
  useScopedTitle('Shifts')
  const me = useMe()
  const { scope } = useProperty()
  if (me.isPending || !scope) return <ListSkeleton />
  if (!me.can('cashier_shift.operate') && !me.can('leakage.view')) {
    return <NoAccess what="cashier shifts" ask={RUN_SHIFT_ONLY} />
  }
  if (scope.kind === 'all') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Shifts" scope="pick" />
        <PickHotel title="Cashier shifts are per hotel. Pick a hotel." />
      </div>
    )
  }
  return <HotelShifts hotel={scope.hotel} search={search} onSearch={onSearch} />
}

function HotelShifts({
  hotel,
  search,
  onSearch,
}: {
  hotel: Property
  search: ShiftsSearch
  onSearch: OnShiftsSearch
}) {
  const me = useMe()
  const all = me.can('leakage.view')
  const page = search.page ?? 1
  const to = search.to ?? hotel.businessDate
  const from = search.from ?? addDays(to, -6)
  // Another hotel: back to page 1 and the sheet closes; the filters stay.
  const seen = useRef(hotel.id)
  useEffect(() => {
    if (seen.current === hotel.id) return
    seen.current = hotel.id
    onSearch({ page: undefined, id: undefined })
  }, [hotel.id, onSearch])
  const input = {
    propertyId: hotel.id,
    segment: (search.segment ?? 'all') as ShiftSegment,
    from,
    to,
    page,
    pageSize: PAGE_SIZE,
  }
  const list = useQuery(orpc.cash.shifts.list.queryOptions({ input }))
  const filtered = Boolean(search.segment || search.from || search.to)
  const title = all ? 'Shifts' : 'Your shifts'

  return (
    <div className="flex flex-col gap-5">
      <CashOffline savedAt={list.dataUpdatedAt} what="the shifts" />
      <PageHeader
        title={title}
        description={
          all
            ? `Every cashier shift at ${hotel.name}, newest first`
            : `Your cashier shifts at ${hotel.name}`
        }
      />
      <div className="flex flex-wrap items-end gap-4">
        <Segmented
          label="Show"
          hideLabel
          value={search.segment ?? 'all'}
          options={[
            { value: 'all', label: 'All' },
            { value: 'open', label: 'Open' },
            { value: 'difference', label: 'With a difference' },
          ]}
          onChange={(value) =>
            onSearch({ segment: value === 'all' ? undefined : value, page: undefined })
          }
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-text-2">
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) =>
              onSearch({ from: event.target.value || undefined, page: undefined })
            }
            className="num h-11 rounded-sm border border-input bg-surface px-2.5 text-[16px] text-text lg:h-9 lg:text-base"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-text-2">
          To
          <input
            type="date"
            value={to}
            min={from}
            max={hotel.businessDate}
            onChange={(event) => onSearch({ to: event.target.value || undefined, page: undefined })}
            className="num h-11 rounded-sm border border-input bg-surface px-2.5 text-[16px] text-text lg:h-9 lg:text-base"
          />
        </label>
      </div>
      {list.isPending ? (
        <ListSkeleton bare />
      ) : !list.data ? (
        <EmptyState
          icon={AlertTriangle}
          action={
            <Button
              className="max-lg:h-11"
              onClick={() => list.refetch()}
              loading={list.isFetching}
            >
              Try again
            </Button>
          }
        >
          Shifts didn't load. Try again.
        </EmptyState>
      ) : list.data.items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            action={
              <Button
                className="max-lg:h-11"
                onClick={() =>
                  onSearch({ segment: undefined, from: undefined, to: undefined, page: undefined })
                }
              >
                Clear filters
              </Button>
            }
          >
            No shifts match these filters.
          </EmptyState>
        ) : (
          <EmptyState
            icon={Wallet}
            tone="brand"
            action={
              me.can('cashier_shift.operate') ? (
                <Link
                  to="/cash"
                  className="inline-flex h-11 items-center rounded-sm border border-pri bg-pri px-4 font-medium text-white hover:bg-pri-hover lg:h-9"
                >
                  Open cashier shift
                </Link>
              ) : undefined
            }
          >
            No shifts at {hotel.name} yet. A shift starts with a float before any payment is taken.
          </EmptyState>
        )
      ) : (
        <>
          <ShiftsTable rows={list.data.items} onOpen={(id) => onSearch({ id }, { push: true })} />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onPage={(next) => onSearch({ page: next > 1 ? next : undefined }, { push: true })}
          />
        </>
      )}
      {search.id ? <ShiftSheet id={search.id} onClose={() => onSearch({ id: undefined })} /> : null}
    </div>
  )
}

function ShiftsTable({ rows, onOpen }: { rows: ShiftRow[]; onOpen: (id: string) => void }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
      <ul className="divide-y divide-border lg:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onOpen(row.id)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60"
            >
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{shiftLabel(row)}</span>
                  <StatusBadge tone={STATUS_TONE[row.status]}>
                    {SHIFT_STATUS_LABELS[row.status]}
                  </StatusBadge>
                </span>
                <span className="truncate text-sm text-text-2">
                  {row.drawerName} · {row.memberName} ·{' '}
                  <span className="num">{openedClosed(row)}</span>
                </span>
                <span className="num text-sm">
                  Float {naira(row.openingFloat)} · {rowDifference(row)}
                  {row.approvedBy ? ` · Approved by ${row.approvedBy}` : ''}
                </span>
              </span>
              <ChevronRight className="size-4 flex-none text-text-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <table className="w-full text-left max-lg:hidden">
        <thead className="text-sm text-text-2">
          <tr className="border-b border-border">
            {[
              'Shift',
              'Drawer',
              'Cashier',
              'Opened–closed',
              'Float',
              'Difference',
              'Status',
              'Approved by',
            ].map((label) => (
              <th
                key={label}
                scope="col"
                className={`px-4 py-2.5 font-medium ${label === 'Float' ? 'text-right' : ''}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-surface-2/60">
              <th scope="row" className="px-4 py-2.5 font-medium whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onOpen(row.id)}
                  className="text-left hover:text-pri-ink hover:underline"
                >
                  {shiftLabel(row)}
                </button>
              </th>
              <td className="px-4 py-2.5 whitespace-nowrap">{row.drawerName}</td>
              <td className="max-w-48 truncate px-4 py-2.5" title={row.memberName}>
                {row.memberName}
              </td>
              <td className="num px-4 py-2.5 whitespace-nowrap">{openedClosed(row)}</td>
              <td className="num px-4 py-2.5 text-right">{naira(row.openingFloat)}</td>
              <td className="num px-4 py-2.5">{rowDifference(row)}</td>
              <td className="px-4 py-2.5">
                <StatusBadge tone={STATUS_TONE[row.status]}>
                  {SHIFT_STATUS_LABELS[row.status]}
                </StatusBadge>
              </td>
              <td className="px-4 py-2.5 text-text-2">{row.approvedBy ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ListSkeleton({ bare }: { bare?: boolean }) {
  const bar = 'animate-pulse rounded-sm bg-surface-2'
  return (
    <div role="status" aria-busy="true" aria-label="Loading shifts" className="flex flex-col gap-5">
      {bare ? null : <span className={`h-8 w-48 ${bar}`} />}
      <div className="divide-y divide-border rounded-md border border-border bg-surface">
        {['a', 'b', 'c', 'd', 'e', 'f'].map((row) => (
          <span key={row} className="flex gap-4 px-4 py-3.5">
            <span className={`h-3 flex-[2] ${bar}`} />
            <span className={`h-3 flex-1 ${bar}`} />
            <span className={`h-3 flex-1 ${bar}`} />
            <span className={`h-3 flex-1 ${bar}`} />
          </span>
        ))}
      </div>
    </div>
  )
}
