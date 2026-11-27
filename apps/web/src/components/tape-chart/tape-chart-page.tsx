// The tape chart (design #3 TapeChart; spec: docs/specs/stage-1-tape-chart.md): a hotel page.
// With All hotels it asks for a hotel; changing hotel goes back to the default window and closes
// what was open. Desktop and tablet get the grid; phones the one-night day list. Refreshed on focus
// and every 30 seconds while visible, and at once after any change made here. Offline it shows the
// last load; Mark clean / Mark dirty still work through the outbox, everything else says why not.
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  addDays,
  CHART_RANGES,
  type ChartRange,
  type ChartRoom,
  type ChartStay,
  chartStartFor,
  type OutOfOrderView,
  type Property,
  type RoomStatus,
  rangeLabel,
  type TapeChart,
} from '@vento/shared'
import { AlertTriangle, BedDouble, ChevronLeft, ChevronRight, Plus, SearchX } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { OutOfOrderDialog } from '@/components/rooms/out-of-order-dialog'
import { RoomHistory } from '@/components/rooms/room-history'
import { RoomMoveDialog } from '@/components/rooms/room-move-dialog'
import { PickHotel } from '@/components/shell/pick-hotel'
import { useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { problemMessage } from '@/lib/errors'
import { useMe } from '@/lib/me'
import { useMediaQuery } from '@/lib/media'
import { offlineSince, useOnline } from '@/offline/connection'
import { dismiss, useOutbox } from '@/offline/outbox'
import { ChartGrid, type StatusOverlay } from './chart-grid'
import {
  buildRows,
  currentOrNext,
  datesOf,
  type Filters,
  floorsOf,
  periodsByRoom,
  totalUnassigned,
} from './chart-model'
import { DayList } from './day-list'
import { ExtendPopover } from './extend-popover'
import { ModifyFromChart } from './modify-from-chart'
import type { Anchor } from './popover'
import { RoomMenu } from './room-menu'
import { StayCard } from './stay-card'
import { MOVE_NEEDS_LIVE, useChartActions } from './use-chart-actions'

// The booking sheet loads when it's first opened.
const BookingSheet = lazy(() =>
  import('@/components/reservations/new/booking-sheet').then((module) => ({
    default: module.BookingSheet,
  })),
)

const READERS = [
  'reservation.manage',
  'night_audit.run',
  'leakage.view',
  'room.status',
  'room.out_of_order',
] as const

const RANGE_KEY = 'vento.tapeChart.range'
const LANES_KEY = 'vento.tapeChart.lanes'

function rememberedRange(): ChartRange {
  try {
    const saved = Number(localStorage.getItem(RANGE_KEY))
    return CHART_RANGES.includes(saved as ChartRange) ? (saved as ChartRange) : 14
  } catch {
    return 14
  }
}

function rememberedLanes(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(LANES_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export function TapeChartPage() {
  const me = useMe()
  const { scope } = useProperty()
  useScopedTitle('Tape chart')
  if (me.isPending || !scope) return <ChartSkeleton />
  if (!READERS.some((permission) => me.can(permission))) {
    return <NoAccess what="the tape chart" ask="Ask your GM if you need it." />
  }
  if (scope.kind === 'all') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Tape chart" scope="pick" />
        <PickHotel title="The tape chart is per hotel. Pick a hotel." />
      </div>
    )
  }
  return <HotelTapeChart key={scope.hotel.id} hotel={scope.hotel} memberId={me.data?.member.id} />
}

type Open =
  | { kind: 'card'; stay: ChartStay; anchor: Anchor }
  | { kind: 'room'; room: ChartRoom; anchor: Anchor }
  | { kind: 'move'; stayId: string; version: number; roomId?: string }
  | { kind: 'modify'; reservationId: string }
  | { kind: 'extend'; stay: ChartStay; departure: string; anchor: Anchor }
  | { kind: 'ooo'; room: ChartRoom; mode: 'create' | 'change' | 'end'; period?: OutOfOrderView }
  | { kind: 'history'; room: ChartRoom }
  | { kind: 'book'; room?: ChartRoom; date?: string }
  | null

function HotelTapeChart({ hotel, memberId }: { hotel: Property; memberId: string | undefined }) {
  const online = useOnline()
  const me = useMe()
  const phone = useMediaQuery('(max-width: 767px)')
  const business = hotel.businessDate
  const [range, setRange] = useState<ChartRange>(rememberedRange)
  const [from, setFrom] = useState(() => chartStartFor(business))
  const [day, setDay] = useState(business)
  const [filters, setFilters] = useState<Filters>({})
  const [lanes, setLanes] = useState<Set<string>>(rememberedLanes)
  const [open, setOpen] = useState<Open>(null)
  const input = phone
    ? { propertyId: hotel.id, from: day, days: 1 as const }
    : { propertyId: hotel.id, from, days: range }
  const chart = useQuery({
    ...orpc.tapeChart.get.queryOptions({ input }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => (previous?.hotel.id === hotel.id ? previous : undefined),
  })
  const data = chart.data
  const actions = useChartActions(data, memberId)
  const outbox = useOutbox()

  // Rooms marked on this device and not yet synced show their new status with "Will sync".
  const overlay = useMemo<StatusOverlay>(() => {
    const map: StatusOverlay = new Map()
    for (const item of outbox) {
      if (item.state !== 'waiting' || item.input.propertyId !== hotel.id) continue
      map.set(item.input.roomId, { status: item.input.status as RoomStatus, pending: true })
    }
    return map
  }, [outbox, hotel.id])
  const attention = outbox.filter(
    (item) => item.state === 'attention' && item.input.propertyId === hotel.id,
  )

  const setRangeKept = (next: ChartRange) => {
    setRange(next)
    try {
      localStorage.setItem(RANGE_KEY, String(next))
    } catch {
      // Storage blocked: 14 days next time.
    }
  }
  const toggleLane = useCallback((typeId: string) => {
    setLanes((previous) => {
      const next = new Set(previous)
      if (next.has(typeId)) next.delete(typeId)
      else next.add(typeId)
      try {
        sessionStorage.setItem(LANES_KEY, JSON.stringify([...next]))
      } catch {
        // Storage blocked: lanes start collapsed next time.
      }
      return next
    })
  }, [])
  const today = useCallback(() => {
    setFrom(chartStartFor(business))
    setDay(business)
  }, [business])

  const canBook = Boolean(data?.can.manage) && online && !phone
  // T: back to today; N: New reservation. Not while typing or with something open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || open) return
      if (document.querySelector('dialog[open]')) return
      const key = event.key.toLowerCase()
      if (key === 't') {
        event.preventDefault()
        today()
      }
      if (key === 'n' && canBook) {
        event.preventDefault()
        setOpen({ kind: 'book' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, canBook, today])

  const built = useMemo(
    () => (data ? buildRows(data, filters, lanes) : { rows: [], shown: 0, total: 0 }),
    [data, filters, lanes],
  )
  const periods = useMemo(() => (data ? periodsByRoom(data) : new Map()), [data])
  const dates = data ? datesOf(data.from, data.days) : []
  const waiting = data ? totalUnassigned(data) : 0
  const filtered = Boolean(filters.typeId || filters.floor !== undefined || filters.unassigned)
  const close = () => setOpen(null)
  const windowLine = data
    ? `${rangeLabel(data.from, addDays(data.from, data.days - 1), true)} · ${
        filtered ? `${built.shown} rooms shown of ${built.total}` : `${built.total} rooms`
      }`
    : undefined

  const header = (
    <PageHeader
      title="Tape chart"
      description={phone ? undefined : windowLine}
      actions={
        phone ? undefined : (
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1">
              <Button
                size="icon"
                aria-label="Previous week"
                onClick={() => setFrom(addDays(from, -7))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <Button className="max-lg:h-11" aria-keyshortcuts="T" onClick={today}>
                Today <kbd className="ml-1 text-xs text-text-3 max-lg:hidden">T</kbd>
              </Button>
              <Button size="icon" aria-label="Next week" onClick={() => setFrom(addDays(from, 7))}>
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </span>
            <RangePicker value={range} onChange={setRangeKept} />
            {data?.can.manage ? (
              <Button
                variant="primary"
                className="max-lg:h-11"
                disabled={!online}
                aria-keyshortcuts="N"
                onClick={() => setOpen({ kind: 'book' })}
              >
                <Plus className="size-4" aria-hidden="true" />
                New reservation
                <kbd className="ml-1 hidden rounded-[4px] bg-white/20 px-1.5 text-xs lg:inline">
                  N
                </kbd>
              </Button>
            ) : null}
          </span>
        )
      }
    />
  )

  if (chart.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ChartSkeleton />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <EmptyState
          icon={AlertTriangle}
          action={
            <Button
              className="max-lg:h-11"
              onClick={() => chart.refetch()}
              loading={chart.isFetching}
            >
              Try again
            </Button>
          }
        >
          {chart.error ? problemMessage(chart.error) : "The tape chart didn't load. Try again."}
        </EmptyState>
      </div>
    )
  }

  const stayOf = (stayId: string) => data.stays.find((stay) => stay.id === stayId)
  const moveStay = (stay: Pick<ChartStay, 'id' | 'version'>, roomId?: string) =>
    setOpen({ kind: 'move', stayId: stay.id, version: stay.version, ...(roomId ? { roomId } : {}) })

  return (
    <div className="flex flex-col gap-4">
      <ChartOffline savedAt={chart.dataUpdatedAt} />
      {header}
      {attention.length ? (
        <ul aria-label="Changes that need a look" className="flex flex-col gap-1.5">
          {attention.map((item) => (
            <li
              key={item.input.idempotencyKey}
              className="flex flex-wrap items-center gap-2 rounded-md border border-am-dot/40 bg-am-bg px-3 py-2 text-sm text-am"
            >
              <span className="grow">{item.message}</span>
              <Button
                size="sm"
                className="max-lg:h-11"
                onClick={() => void dismiss(item.input.idempotencyKey)}
              >
                OK
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {data.rooms.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          tone="brand"
          action={
            data.can.setUpRooms ? (
              <Link
                to="/rates/rooms"
                className="inline-flex h-11 items-center rounded-sm border border-pri bg-pri px-4 font-medium text-white hover:bg-pri-hover lg:h-9"
              >
                Set up rooms
              </Link>
            ) : undefined
          }
        >
          No rooms at {hotel.name} yet. Rooms are set up in Rates & channels.
          {data.can.setUpRooms ? '' : ' Ask your GM to set up rooms.'}
        </EmptyState>
      ) : phone ? (
        <DayList
          chart={data}
          date={day}
          overlay={overlay}
          online={online}
          canAudit={me.can('audit.view')}
          onDate={setDay}
          onStatus={(room, status) => void actions.setStatus(room, status, 'day_list')}
          onOutOfOrder={(room, mode, period) =>
            setOpen({ kind: 'ooo', room, mode, ...(period ? { period } : {}) })
          }
          onMove={(stay) => moveStay(stay)}
          onModify={(stay) => setOpen({ kind: 'modify', reservationId: stay.reservationId })}
        />
      ) : (
        <>
          <Toolbar data={data} filters={filters} onFilters={setFilters} waiting={waiting} />
          {data.stays.length === 0 ? (
            <p className="flex flex-wrap items-center gap-2 text-text-2">
              No bookings {rangeLabel(data.from, addDays(data.from, data.days - 1), true)}.
              {data.can.manage && online ? (
                <Button size="sm" className="max-lg:h-11" onClick={() => setOpen({ kind: 'book' })}>
                  New reservation
                </Button>
              ) : null}
            </p>
          ) : null}
          {built.rows.length === 0 ? (
            <EmptyState
              icon={SearchX}
              action={
                <Button className="max-lg:h-11" onClick={() => setFilters({})}>
                  Clear filters
                </Button>
              }
            >
              No rooms match these filters.
            </EmptyState>
          ) : (
            <ChartGrid
              chart={data}
              rows={built.rows}
              dates={dates}
              overlay={overlay}
              canDrag={online && data.can.move}
              canExtend={online && data.can.manage}
              canBook={canBook}
              onOpenStay={(stay, anchor) => setOpen({ kind: 'card', stay, anchor })}
              onOpenRoom={(room, anchor) => setOpen({ kind: 'room', room, anchor })}
              onCell={(room, date) => setOpen({ kind: 'book', room, date })}
              onToggleLane={toggleLane}
              onDropRoom={(stay, room) =>
                room.roomTypeId === stay.roomTypeId
                  ? void actions.assign(stay, room.id, { source: 'chart_drag' })
                  : moveStay(stay, room.id)
              }
              onDropLane={(stay) => void actions.assign(stay, null, { source: 'chart_drag' })}
              onExtend={(stay, departure, anchor) =>
                setOpen({ kind: 'extend', stay, departure, anchor })
              }
              onMoveKey={(stay) => (data.can.move && stay.movable ? moveStay(stay) : undefined)}
              onModifyKey={(stay) =>
                data.can.manage && stay.movable
                  ? setOpen({ kind: 'modify', reservationId: stay.reservationId })
                  : undefined
              }
              onRefused={(message) => toast.error(message)}
            />
          )}
          {!online ? <p className="text-sm text-text-3">{MOVE_NEEDS_LIVE}</p> : null}
        </>
      )}

      {open?.kind === 'card' ? (
        <StayCard
          chart={data}
          stay={open.stay}
          anchor={open.anchor}
          online={online}
          onClose={close}
          onMove={() => moveStay(open.stay)}
          onModify={() => setOpen({ kind: 'modify', reservationId: open.stay.reservationId })}
        />
      ) : null}
      {open?.kind === 'room' ? (
        <RoomMenu
          chart={data}
          room={open.room}
          stored={overlay.get(open.room.id)?.status ?? open.room.status}
          period={currentOrNext(periods.get(open.room.id), business)}
          anchor={open.anchor}
          online={online}
          canAudit={me.can('audit.view')}
          onClose={close}
          onStatus={(status) => {
            close()
            void actions.setStatus(
              { ...open.room, status: overlay.get(open.room.id)?.status ?? open.room.status },
              status,
            )
          }}
          onOutOfOrder={(mode) => {
            const period = currentOrNext(periods.get(open.room.id), business)
            setOpen({ kind: 'ooo', room: open.room, mode, ...(period ? { period } : {}) })
          }}
          onHistory={() => setOpen({ kind: 'history', room: open.room })}
        />
      ) : null}
      {open?.kind === 'extend' ? (
        <ExtendPopover
          chart={data}
          stay={open.stay}
          departure={open.departure}
          anchor={open.anchor}
          onClose={close}
          onMove={() => moveStay(open.stay)}
          onModify={() => setOpen({ kind: 'modify', reservationId: open.stay.reservationId })}
        />
      ) : null}
      {open?.kind === 'move' ? (
        <RoomMoveDialog
          stayId={open.stayId}
          version={stayOf(open.stayId)?.version ?? open.version}
          initialRoomId={open.roomId}
          timeZone={data.hotel.timeZone}
          onClose={close}
        />
      ) : null}
      {open?.kind === 'modify' ? (
        <ModifyFromChart reservationId={open.reservationId} onClose={close} />
      ) : null}
      {open?.kind === 'ooo' ? (
        <OutOfOrderDialog
          propertyId={hotel.id}
          businessDate={business}
          room={{
            id: open.room.id,
            number: open.room.number,
            typeName: data.roomTypes.find((t) => t.id === open.room.roomTypeId)?.name ?? '',
          }}
          period={open.mode === 'create' ? undefined : open.period}
          mode={open.mode}
          onClose={close}
          onMoveStay={(stayId) => {
            const stay = stayOf(stayId)
            if (stay) moveStay(stay)
          }}
        />
      ) : null}
      {open?.kind === 'history' ? (
        <RoomHistory roomId={open.room.id} title={`Room ${open.room.number}`} onClose={close} />
      ) : null}
      {open?.kind === 'book' ? (
        <Suspense fallback={null}>
          <BookingSheet
            onClose={close}
            preset={
              open.room && open.date
                ? {
                    roomTypeId: open.room.roomTypeId,
                    arrival: open.date,
                    departure: addDays(open.date, 1),
                    room: {
                      id: open.room.id,
                      number: open.room.number,
                      roomTypeId: open.room.roomTypeId,
                    },
                  }
                : undefined
            }
          />
        </Suspense>
      ) : null}
    </div>
  )
}

function RangePicker({
  value,
  onChange,
}: {
  value: ChartRange
  onChange: (value: ChartRange) => void
}) {
  return (
    <fieldset className="inline-flex rounded-sm border border-input bg-surface-2 p-0.5">
      <legend className="sr-only">Range</legend>
      {CHART_RANGES.map((days) => (
        <button
          key={days}
          type="button"
          aria-pressed={value === days}
          onClick={() => onChange(days)}
          className={cn(
            'h-11 rounded-[6px] px-3 font-medium text-text-2 lg:h-8',
            value === days && 'bg-surface text-text shadow-[0_1px_2px_rgba(16,24,40,0.08)]',
          )}
        >
          {days} days
        </button>
      ))}
    </fieldset>
  )
}

function Toolbar({
  data,
  filters,
  onFilters,
  waiting,
}: {
  data: TapeChart
  filters: Filters
  onFilters: (filters: Filters) => void
  waiting: number
}) {
  const pill =
    'h-11 rounded-full border px-3 text-sm font-medium lg:h-8 focus-visible:outline-2 focus-visible:outline-ring'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="chart-type">
          Room type
        </label>
        <select
          id="chart-type"
          value={filters.typeId ?? ''}
          onChange={(event) => onFilters({ ...filters, typeId: event.target.value || undefined })}
          className={cn(
            pill,
            filters.typeId
              ? 'border-pri-line bg-pri-soft text-pri-ink'
              : 'border-border-strong bg-surface',
          )}
        >
          <option value="">All room types</option>
          {data.roomTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="chart-floor">
          Floor
        </label>
        <select
          id="chart-floor"
          value={filters.floor ?? ''}
          onChange={(event) =>
            onFilters({
              ...filters,
              floor: event.target.value === '' ? undefined : Number(event.target.value),
            })
          }
          className={cn(
            pill,
            filters.floor !== undefined
              ? 'border-pri-line bg-pri-soft text-pri-ink'
              : 'border-border-strong bg-surface',
          )}
        >
          <option value="">Floor</option>
          {floorsOf(data).map((floor) => (
            <option key={floor} value={floor}>
              {floor === 0 ? 'Ground floor' : `Floor ${floor}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={Boolean(filters.unassigned)}
          onClick={() => onFilters({ ...filters, unassigned: !filters.unassigned })}
          className={cn(
            pill,
            'inline-flex items-center gap-1.5',
            filters.unassigned
              ? 'border-pri-line bg-pri-soft text-pri-ink'
              : 'border-border-strong bg-surface',
          )}
        >
          Unassigned
          <span className="num rounded-full bg-am-bg px-1.5 text-[11px] font-semibold text-am">
            {waiting}
          </span>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-text-2">
        <span className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            className="h-2.5 w-3.5 rounded-[3px] border border-pri-line bg-pri-soft"
          />
          Confirmed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            className="h-2.5 w-3.5 rounded-[3px]"
            style={{
              background:
                'repeating-linear-gradient(135deg, var(--ro-dot) 0 2px, transparent 2px 5px)',
            }}
          />
          Out of order
        </span>
      </div>
    </div>
  )
}

function ChartOffline({ savedAt }: { savedAt: number }) {
  const online = useOnline()
  if (online) return null
  const since = offlineSince()
  const clock = (at: number) =>
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(at)
  return (
    <div role="status" className="rounded-lg border border-border bg-am-bg px-4 py-2.5 text-am">
      <span className="font-semibold">{since ? `Offline since ${clock(since)}.` : 'Offline.'}</span>{' '}
      {savedAt ? `Last updated ${clock(savedAt)}. ` : ''}Mark clean and Mark dirty still work and
      sync when you're back; moving rooms and out of order need a connection.
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading the tape chart"
      className="overflow-hidden rounded-md border border-border bg-surface shadow-card"
    >
      <div className="flex h-[52px] border-b border-border">
        <span className="w-[168px] flex-none border-r border-border" />
        {Array.from({ length: 14 }, (_, i) => `h${i}`).map((key) => (
          <span key={key} className="flex-1 border-l border-border" />
        ))}
      </div>
      {['a', 'b', 'c', 'd'].map((block) => (
        <div key={block}>
          <div className="h-8 border-b border-border bg-surface-2" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex h-11 items-center border-b border-border">
              <span className="mx-3 h-3 w-20 animate-pulse rounded-full bg-surface-3" />
              <span
                className="h-6 animate-pulse rounded-[7px] bg-surface-2"
                style={{ marginLeft: `${8 + ((i * 13) % 30)}%`, width: `${14 + ((i * 7) % 18)}%` }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
