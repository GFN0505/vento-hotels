// The Front desk lists (design #30 FrontDesk; spec "Front desk lists (#30)"): a hotel page. With All
// hotels it asks for a hotel, with each hotel's figures. Arrivals (to come, then Checked in today),
// Departures and In house for the business date, with the Tonight strip, search, pills, keyboard
// (J/K, ↵, C, M, W, N, A/D/H, /, ⌘P, ?) and Print list; cards on phones. Refreshed on focus and
// every 30 seconds while visible. Offline it shows the last load (kept through PIN locks on the
// desk PC, decision 0029), and an arrival already in a room can still be checked in.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router'
import {
  addDays,
  type FrontDeskList,
  type FrontDeskPill,
  type FrontDeskRow,
  type FrontDeskTab,
  formatRateDate,
  type Property,
} from '@vento/shared'
import {
  AlertTriangle,
  ArrowLeftRight,
  BedDouble,
  ChevronDown,
  DoorOpen,
  Keyboard,
  LogIn,
  Plus,
  Printer,
  Search,
  SearchX,
} from 'lucide-react'
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { RoomMoveDialog } from '@/components/rooms/room-move-dialog'
import { PickHotel } from '@/components/shell/pick-hotel'
import { useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { problemMessage } from '@/lib/errors'
import { useMe } from '@/lib/me'
import { useMediaQuery } from '@/lib/media'
import { offlineSince, useOnline } from '@/offline/connection'
import { dismiss, useOutbox } from '@/offline/outbox'
import { isDeskList } from '@/offline/saved-data'
import { CheckInSheet, type CheckInTarget } from './check-in-sheet'
import { printList } from './print-list'
import { readinessOf, stayWords } from './rows'

const BookingSheet = lazy(() =>
  import('@/components/reservations/new/booking-sheet').then((m) => ({ default: m.BookingSheet })),
)

const READERS = ['reservation.manage', 'night_audit.run', 'leakage.view'] as const
const TAB_KEY = 'vento.frontDesk.tab'
const TABS: { key: FrontDeskTab; label: string; kbd: string }[] = [
  { key: 'arrivals', label: 'Arrivals', kbd: 'A' },
  { key: 'departures', label: 'Departures', kbd: 'D' },
  { key: 'in_house', label: 'In house', kbd: 'H' },
]

function rememberedTab(): FrontDeskTab {
  try {
    const saved = localStorage.getItem(TAB_KEY)
    return saved === 'departures' || saved === 'in_house' ? saved : 'arrivals'
  } catch {
    return 'arrivals'
  }
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export function FrontDeskPage() {
  const me = useMe()
  const { scope } = useProperty()
  useScopedTitle('Front desk')
  if (me.isPending || !scope) return <ListSkeleton />
  if (!READERS.some((permission) => me.can(permission))) {
    return <NoAccess what="the front desk" ask="Ask your GM if you need it." />
  }
  if (scope.kind === 'all') return <AllHotels />
  return <HotelFrontDesk key={scope.hotel.id} hotel={scope.hotel} />
}

function AllHotels() {
  const hotels = useQuery(orpc.frontDesk.hotels.queryOptions({ input: {} }))
  const figures = new Map((hotels.data ?? []).map((hotel) => [hotel.id, hotel]))
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Front desk" scope="pick" />
      <PickHotel
        title="The front desk is per hotel. Pick a hotel."
        aside={(hotel) => {
          const f = figures.get(hotel.id)
          if (!f) return null
          return (
            <span className="num flex-none text-right text-sm text-text-2">
              {f.arrivals || f.inHouse
                ? `${f.arrivals} ${f.arrivals === 1 ? 'arrival' : 'arrivals'} · ${f.inHouse} in house`
                : 'No arrivals today'}
            </span>
          )
        }}
      />
    </div>
  )
}

type Open =
  | { kind: 'check-in'; target: CheckInTarget; startAt?: 'room' }
  | { kind: 'move'; row: FrontDeskRow }
  | { kind: 'book' }
  | { kind: 'shortcuts' }
  | null

function HotelFrontDesk({ hotel }: { hotel: Property }) {
  const online = useOnline()
  const { user } = useRouteContext({ from: '/_app' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const phone = useMediaQuery('(max-width: 767px)')
  const [tab, setTabState] = useState<FrontDeskTab>(rememberedTab)
  const [pill, setPill] = useState<FrontDeskPill>('all')
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [cursor, setCursor] = useState(0)
  const [open, setOpen] = useState<Open>(null)
  const [showChecked, setShowChecked] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const outbox = useOutbox()

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250)
    return () => clearTimeout(timer)
  }, [typed])
  const setTab = useCallback((next: FrontDeskTab) => {
    setTabState(next)
    setPage(1)
    setCursor(0)
    setPill('all')
    try {
      localStorage.setItem(TAB_KEY, next)
    } catch {
      // Storage blocked: Arrivals next time.
    }
  }, [])

  const input = {
    propertyId: hotel.id,
    tab,
    pill: tab === 'arrivals' ? pill : ('all' as const),
    page,
    ...(search ? { search } : {}),
  }
  const list = useQuery({
    ...orpc.frontDesk.list.queryOptions({ input }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => (previous?.hotel.id === hotel.id ? previous : undefined),
  })
  // Tomorrow's arrivals, kept on the desk PC for a power cut (decision 0029).
  useQuery({
    ...orpc.frontDesk.list.queryOptions({
      input: { propertyId: hotel.id, tab: 'arrivals', day: 'tomorrow' },
    }),
    enabled: online,
    staleTime: 5 * 60 * 1000,
  })
  useQuery({
    ...orpc.ruleSets.current.queryOptions({ input: { propertyId: hotel.id } }),
    enabled: online,
    staleTime: 60 * 60 * 1000,
  })
  const data = list.data
  // A newer business date: lists saved for an older one go (decision 0029).
  const businessDate = data?.hotel.businessDate
  useEffect(() => {
    if (!businessDate) return
    queryClient.removeQueries({
      predicate: (query) =>
        isDeskList(query.queryKey) &&
        ((query.state.data as FrontDeskList | undefined)?.hotel.businessDate ?? businessDate) <
          businessDate,
    })
  }, [businessDate, queryClient])

  // Check-ins made on this device and not yet synced: shown checked in, with "Will sync".
  const pending = useMemo(
    () =>
      new Set(
        outbox
          .filter(
            (item) =>
              item.kind === 'stays.checkIn' &&
              item.state === 'waiting' &&
              item.input.propertyId === hotel.id,
          )
          .map((item) => (item.kind === 'stays.checkIn' ? item.input.stayId : '')),
      ),
    [outbox, hotel.id],
  )
  const attention = outbox.filter(
    (item) =>
      item.kind === 'stays.checkIn' &&
      item.state === 'attention' &&
      item.input.propertyId === hotel.id,
  )

  const rows = data?.items ?? []
  const toCome = rows.filter((row) => row.status === 'confirmed' && !pending.has(row.stayId))
  const checkedToday =
    tab === 'arrivals'
      ? rows.filter((row) => row.status === 'checked_in' || pending.has(row.stayId))
      : []
  const primaryRows = tab === 'arrivals' ? toCome : rows
  const selected = primaryRows[Math.min(cursor, primaryRows.length - 1)]

  const checkIn = useCallback(
    (row: FrontDeskRow, startAt?: 'room') => {
      if (!data || row.checkInBlocked || pending.has(row.stayId)) return
      if (!online && !row.room) return
      setOpen({
        kind: 'check-in',
        target: {
          stayId: row.stayId,
          propertyId: hotel.id,
          row,
          businessDate: data.hotel.businessDate,
        },
        ...(startAt ? { startAt } : {}),
      })
    },
    [data, hotel.id, online, pending],
  )

  const canWalkIn = Boolean(data?.can.walkIn) && !hotel.archivedAt
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (open || document.querySelector('dialog[open]')) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        if (!data) return
        event.preventDefault()
        printList(data, tab, user.name)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      const key = event.key
      const lower = key.toLowerCase()
      if (key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (lower === 'j') {
        setCursor((c) => Math.min(c + 1, Math.max(0, primaryRows.length - 1)))
      } else if (lower === 'k') {
        setCursor((c) => Math.max(0, c - 1))
      } else if (key === 'Enter' && selected) {
        void navigate({
          to: '/reservations/$reservationId',
          params: { reservationId: selected.reservationId },
        })
      } else if (lower === 'c' && selected && tab === 'arrivals') {
        event.preventDefault()
        checkIn(selected)
      } else if (lower === 'm' && selected && tab !== 'arrivals' && data?.can.move && online) {
        event.preventDefault()
        setOpen({ kind: 'move', row: selected })
      } else if (lower === 'w' && canWalkIn && online) {
        event.preventDefault()
        void navigate({ to: '/walk-in' })
      } else if (lower === 'n' && data?.can.manage && online && !phone) {
        event.preventDefault()
        setOpen({ kind: 'book' })
      } else if (lower === 'a') setTab('arrivals')
      else if (lower === 'd') setTab('departures')
      else if (lower === 'h') setTab('in_house')
      else if (key === '?') setOpen({ kind: 'shortcuts' })
      else if (lower === 'r' && list.isError) void list.refetch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    open,
    data,
    tab,
    user.name,
    primaryRows.length,
    selected,
    checkIn,
    canWalkIn,
    online,
    phone,
    navigate,
    setTab,
    list,
  ])

  const counts = data?.counts
  const tabCount = (key: FrontDeskTab) =>
    !counts
      ? null
      : key === 'arrivals'
        ? counts.toCome + counts.checkedInToday
        : key === 'departures'
          ? counts.departures
          : counts.inHouse
  const eyebrowDate = data ? `Business date ${formatRateDate(data.hotel.businessDate)}` : undefined

  const header = (
    <PageHeader
      title="Front desk"
      description={eyebrowDate}
      actions={
        <span className="flex flex-wrap items-center gap-2">
          {!phone ? (
            <Button
              className="max-lg:h-11"
              disabled={!data}
              aria-keyshortcuts="Meta+P"
              onClick={() => data && printList(data, tab, user.name)}
            >
              <Printer className="size-4" aria-hidden="true" />
              Print list
              <kbd className="ml-1 text-xs text-text-3 max-lg:hidden">⌘P</kbd>
            </Button>
          ) : null}
          {data?.can.manage && !phone ? (
            <Button
              className="max-lg:h-11"
              disabled={!online}
              aria-keyshortcuts="N"
              onClick={() => setOpen({ kind: 'book' })}
            >
              <Plus className="size-4" aria-hidden="true" />
              New reservation
              <kbd className="ml-1 text-xs text-text-3 max-lg:hidden">N</kbd>
            </Button>
          ) : null}
          {canWalkIn ? (
            online ? (
              <Link
                to="/walk-in"
                aria-keyshortcuts="W"
                className="inline-flex h-11 items-center gap-1.5 rounded-sm border border-pri bg-pri px-3 font-medium text-white hover:bg-pri-hover lg:h-8"
              >
                <DoorOpen className="size-4" aria-hidden="true" />
                Walk-in
                <kbd className="ml-1 hidden rounded-[4px] bg-white/20 px-1.5 text-xs lg:inline">
                  W
                </kbd>
              </Link>
            ) : (
              // The reason is the line under the header, visible to everyone (walk-in-why).
              <Button variant="primary" disabled aria-describedby="walk-in-why">
                <DoorOpen className="size-4" aria-hidden="true" />
                Walk-in
              </Button>
            )
          ) : null}
        </span>
      }
    />
  )

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DeskOffline savedAt={list.dataUpdatedAt} />
      {header}
      {!online && canWalkIn ? (
        <p id="walk-in-why" className="text-sm text-text-3">
          Walk-ins need a connection to check live availability.
        </p>
      ) : null}
      {attention.length ? (
        <ul aria-label="Check-ins that need a look" className="flex flex-col gap-1.5">
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
                Discard
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {data ? <TonightStrip list={data} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Lists"
          className="inline-flex max-w-full rounded-sm border border-input bg-surface-2 p-0.5"
        >
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              aria-keyshortcuts={item.kbd}
              onClick={() => setTab(item.key)}
              className={cn(
                'inline-flex h-11 items-center gap-1.5 rounded-[6px] px-3 font-medium text-text-2 lg:h-8',
                tab === item.key && 'bg-surface text-text shadow-[0_1px_2px_rgba(16,24,40,0.08)]',
              )}
            >
              {item.label}
              <span className="num text-text-3">{tabCount(item.key) ?? ''}</span>
              <kbd className="text-xs text-text-3 max-lg:hidden">{item.kbd}</kbd>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex items-center">
            <span className="sr-only">Find guest, room, booking</span>
            <Search
              className="pointer-events-none absolute left-2.5 size-4 text-text-3"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value)
                setPage(1)
                setCursor(0)
              }}
              placeholder="Find guest, room, booking"
              aria-keyshortcuts="/"
              className="h-11 w-64 max-w-full rounded-sm border border-input bg-surface pr-8 pl-8 text-[16px] lg:h-8 lg:text-[15px]"
            />
            <kbd className="pointer-events-none absolute right-2.5 text-xs text-text-3 max-lg:hidden">
              /
            </kbd>
          </label>
          {tab === 'arrivals' && counts
            ? (
                [
                  { key: 'all', label: 'All', n: null },
                  { key: 'unassigned', label: 'Not in a room', n: counts.unassigned },
                  { key: 'not_ready', label: 'Not ready', n: counts.notReady },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={pill === item.key}
                  onClick={() => {
                    setPill(item.key)
                    setPage(1)
                    setCursor(0)
                  }}
                  className={cn(
                    'inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium lg:h-8',
                    pill === item.key
                      ? 'border-pri-line bg-pri-soft text-pri-ink'
                      : 'border-border-strong bg-surface',
                  )}
                >
                  {item.label}
                  {item.n !== null ? (
                    <span className="num rounded-full bg-surface-2 px-1.5 text-[11px]">
                      {item.n}
                    </span>
                  ) : null}
                </button>
              ))
            : null}
        </div>
      </div>

      {list.isPending && !data ? (
        <ListSkeleton />
      ) : !data ? (
        <EmptyState
          icon={AlertTriangle}
          action={
            <Button
              className="max-lg:h-11"
              loading={list.isFetching}
              aria-keyshortcuts="R"
              onClick={() => list.refetch()}
            >
              Try again <kbd className="ml-1 text-xs text-text-3 max-lg:hidden">R</kbd>
            </Button>
          }
        >
          <span className="flex flex-col gap-1">
            <span className="font-semibold">
              Couldn't load {TABS.find((t) => t.key === tab)?.label.toLowerCase()}
            </span>
            <span className="text-text-2">
              {list.error &&
              problemMessage(list.error) !==
                "Can't reach Vento right now. Your details are kept on this page. Try again in a moment."
                ? problemMessage(list.error)
                : "The list didn't load; nothing you did was lost. Check-ins already made are saved."}
            </span>
          </span>
        </EmptyState>
      ) : (
        <ListBody
          data={data}
          tab={tab}
          phone={phone}
          primaryRows={primaryRows}
          checkedToday={checkedToday}
          showChecked={showChecked}
          onToggleChecked={() => setShowChecked((v) => !v)}
          cursor={cursor}
          pending={pending}
          online={online}
          filtered={Boolean(search) || pill !== 'all'}
          onClear={() => {
            setPill('all')
            setTyped('')
          }}
          onCheckIn={checkIn}
          onMove={(row) => setOpen({ kind: 'move', row })}
          onWalkIn={canWalkIn && online ? () => void navigate({ to: '/walk-in' }) : undefined}
          onPage={setPage}
        />
      )}

      {!phone ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-3">
          <span>
            <kbd>J</kbd> <kbd>K</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          {tab === 'arrivals' ? (
            <span>
              <kbd>C</kbd> check in
            </span>
          ) : (
            <span>
              <kbd>M</kbd> room move
            </span>
          )}
          <span>
            <kbd>/</kbd> search
          </span>
          <span>
            <kbd>⌘P</kbd> print list
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-text"
            onClick={() => setOpen({ kind: 'shortcuts' })}
          >
            <Keyboard className="size-3.5" aria-hidden="true" />
            <kbd>?</kbd> all shortcuts
          </button>
        </p>
      ) : null}

      {open?.kind === 'check-in' ? (
        <CheckInSheet
          target={open.target}
          {...(open.startAt ? { startAt: open.startAt } : {})}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open?.kind === 'move' ? (
        <RoomMoveDialog
          stayId={open.row.stayId}
          version={open.row.version}
          timeZone={data?.hotel.timeZone ?? 'Africa/Lagos'}
          onClose={() => setOpen(null)}
          onDone={() => void queryClient.invalidateQueries({ queryKey: orpc.frontDesk.key() })}
        />
      ) : null}
      {open?.kind === 'book' ? (
        <Suspense fallback={null}>
          <BookingSheet onClose={() => setOpen(null)} />
        </Suspense>
      ) : null}
      {open?.kind === 'shortcuts' ? <Shortcuts onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

function TonightStrip({ list }: { list: FrontDeskList }) {
  const t = list.tonight
  const items = [
    { key: 'occupied', n: t.occupied, words: 'occupied', dot: 'bg-[var(--bl-dot)]' },
    { key: 'arriving', n: t.arriving, words: 'arriving', dot: 'bg-pri' },
    { key: 'vacant', n: t.vacant, words: 'vacant', dot: 'bg-em-dot' },
    { key: 'out_of_order', n: t.outOfOrder, words: 'out of order', dot: 'bg-ro-dot' },
    { key: 'unassigned', n: t.unassigned, words: 'not in a room yet', dot: 'bg-am-dot' },
  ]
  return (
    <section
      aria-label="Tonight"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-surface px-4 py-2.5 shadow-card"
    >
      <span className="font-semibold">Tonight · {formatRateDate(t.date, false)}</span>
      {items.map((item) =>
        item.key === 'unassigned' && item.n === 0 ? null : (
          <span key={item.key} className="inline-flex items-center gap-1.5 text-sm">
            <span aria-hidden="true" className={cn('size-2 rounded-full', item.dot)} />
            <span className="num font-semibold">{item.n}</span> {item.words}
          </span>
        ),
      )}
    </section>
  )
}

type BodyProps = {
  data: FrontDeskList
  tab: FrontDeskTab
  phone: boolean
  primaryRows: FrontDeskRow[]
  checkedToday: FrontDeskRow[]
  showChecked: boolean
  onToggleChecked: () => void
  cursor: number
  pending: ReadonlySet<string>
  online: boolean
  filtered: boolean
  onClear: () => void
  onCheckIn: (row: FrontDeskRow, startAt?: 'room') => void
  onMove: (row: FrontDeskRow) => void
  onWalkIn: (() => void) | undefined
  onPage: (page: number) => void
}

function ListBody(props: BodyProps) {
  const { data, tab, primaryRows, checkedToday, filtered } = props
  const hotel = data.hotel.name
  const c = data.counts
  const heading =
    tab === 'arrivals'
      ? `Arrivals · ${c.toCome} to come, ${c.checkedInToday} checked in`
      : tab === 'departures'
        ? `Departures · ${c.departures} due`
        : `In house · ${c.inHouse} ${c.inHouse === 1 ? 'room' : 'rooms'} · ${c.inHouseGuests} ${c.inHouseGuests === 1 ? 'guest' : 'guests'}`
  if (primaryRows.length === 0 && checkedToday.length === 0) {
    if (filtered) {
      return (
        <EmptyState
          icon={SearchX}
          action={
            <Button className="max-lg:h-11" onClick={props.onClear}>
              Clear filters
            </Button>
          }
        >
          No {tab === 'arrivals' ? 'arrivals' : tab === 'departures' ? 'departures' : 'guests'}{' '}
          match these filters.
        </EmptyState>
      )
    }
    if (tab === 'arrivals') {
      return (
        <EmptyState
          icon={LogIn}
          tone="brand"
          action={
            <span className="flex flex-wrap justify-center gap-2">
              {c.tomorrow ? (
                <Link
                  to="/reservations"
                  search={
                    {
                      arrivalFrom: addDays(data.hotel.businessDate, 1),
                      arrivalTo: addDays(data.hotel.businessDate, 1),
                    } as never
                  }
                  className="inline-flex h-11 items-center rounded-sm border border-border-strong bg-surface px-3 font-medium hover:bg-surface-2 lg:h-9"
                >
                  Tomorrow
                </Link>
              ) : null}
              {props.onWalkIn ? (
                <Button variant="primary" className="max-lg:h-11" onClick={props.onWalkIn}>
                  Walk-in
                </Button>
              ) : null}
            </span>
          }
        >
          {c.checkedInToday
            ? `No arrivals left today. All ${c.checkedInToday} guests are checked in. Tomorrow has ${c.tomorrow} ${c.tomorrow === 1 ? 'arrival' : 'arrivals'}.`
            : `No arrivals at ${hotel} today.`}
        </EmptyState>
      )
    }
    return (
      <EmptyState icon={tab === 'departures' ? DoorOpen : BedDouble}>
        {tab === 'departures' ? 'No departures today.' : `Nobody is in house at ${hotel}.`}
      </EmptyState>
    )
  }
  return (
    <section
      aria-labelledby="desk-list-heading"
      className="min-w-0 overflow-hidden rounded-md border border-border bg-surface shadow-card"
    >
      <h2 id="desk-list-heading" className="border-b border-border px-4 py-3 font-semibold">
        {heading}
      </h2>
      {props.phone ? (
        <Cards rows={primaryRows} {...props} />
      ) : (
        <Table rows={primaryRows} {...props} />
      )}
      {tab === 'arrivals' && checkedToday.length ? (
        <div className="border-t border-border">
          <button
            type="button"
            aria-expanded={props.showChecked}
            onClick={props.onToggleChecked}
            className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left font-medium hover:bg-surface-2/60"
          >
            <ChevronDown
              className={cn('size-4 transition-transform', props.showChecked && 'rotate-180')}
              aria-hidden="true"
            />
            Checked in today · {checkedToday.length}
          </button>
          {props.showChecked ? (
            props.phone ? (
              <Cards rows={checkedToday} {...props} />
            ) : (
              <Table rows={checkedToday} {...props} cursor={-1} />
            )
          ) : null}
        </div>
      ) : null}
      {data.total > data.pageSize ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-sm text-text-2">
          <span className="num">
            {(data.page - 1) * data.pageSize + 1}–{Math.min(data.total, data.page * data.pageSize)}{' '}
            of {data.total}
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              disabled={data.page === 1}
              onClick={() => props.onPage(data.page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              disabled={data.page * data.pageSize >= data.total}
              onClick={() => props.onPage(data.page + 1)}
            >
              Next
            </Button>
          </span>
        </div>
      ) : null}
    </section>
  )
}

function GuestCell({ row }: { row: FrontDeskRow }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="flex min-w-0 items-center gap-2">
        <Link
          to="/reservations/$reservationId"
          params={{ reservationId: row.reservationId }}
          className="truncate font-medium hover:text-pri-ink hover:underline"
          title={row.guestName}
        >
          {row.guestName}
        </Link>
        {row.foreign ? (
          <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-border">
            Foreign
          </span>
        ) : null}
      </span>
      <span className="num truncate text-sm text-text-3">
        {row.number} · {row.planName}
      </span>
    </div>
  )
}

function Ready({ row }: { row: FrontDeskRow }) {
  const r = readinessOf(row)
  if (!r) return <span className="text-text-3">–</span>
  return <StatusBadge tone={r.tone}>{r.words}</StatusBadge>
}

function Flags({ row, pending }: { row: FrontDeskRow; pending: boolean }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {pending ? <StatusBadge tone="amber">Will sync</StatusBadge> : null}
      {row.waitingForRoom ? <StatusBadge tone="amber">Waiting for room</StatusBadge> : null}
      {row.idPhotoMissing ? <StatusBadge tone="rose">ID photo to add</StatusBadge> : null}
    </span>
  )
}

// A disabled action says why in words people can see and screen readers hear (UX-STANDARD).
function WithReason({
  id,
  reason,
  children,
}: {
  id: string
  reason?: string | undefined
  children: ReactNode
}) {
  if (!reason) return children
  return (
    <span className="flex flex-col items-start gap-1">
      {children}
      <span id={id} className="max-w-48 text-xs text-text-3">
        {reason}
      </span>
    </span>
  )
}

function RowAction({ row, props }: { row: FrontDeskRow; props: BodyProps }) {
  const pending = props.pending.has(row.stayId)
  if (props.tab === 'arrivals' && row.status === 'confirmed' && !pending) {
    const needsRoom = !row.room || row.readiness === 'out_of_order'
    const offlineBlocked = !props.online && !row.room
    const reason =
      row.checkInBlocked ?? (offlineBlocked ? 'Picking a room needs a connection.' : undefined)
    return (
      <WithReason id={`check-in-why-${row.stayId}`} reason={reason}>
        <Button
          size="sm"
          variant={needsRoom ? 'default' : 'primary'}
          className="max-lg:h-11"
          disabled={Boolean(reason)}
          aria-describedby={reason ? `check-in-why-${row.stayId}` : undefined}
          aria-label={`Check in ${row.guestName}`}
          aria-keyshortcuts="C"
          onClick={() =>
            props.onCheckIn(row, row.readiness === 'out_of_order' ? 'room' : undefined)
          }
        >
          {row.readiness === 'out_of_order' ? 'Pick another room' : 'Check in'}
        </Button>
      </WithReason>
    )
  }
  if (
    props.tab !== 'arrivals' &&
    props.data.can.move &&
    row.night &&
    row.departure > props.data.hotel.businessDate
  ) {
    const reason = props.online ? undefined : 'Moving rooms needs a connection.'
    return (
      <WithReason id={`move-why-${row.stayId}`} reason={reason}>
        <Button
          size="sm"
          className="max-lg:h-11"
          disabled={Boolean(reason)}
          aria-describedby={reason ? `move-why-${row.stayId}` : undefined}
          aria-label={`Room move ${row.guestName}`}
          onClick={() => props.onMove(row)}
        >
          <ArrowLeftRight className="size-3.5" aria-hidden="true" />
          Room move
        </Button>
      </WithReason>
    )
  }
  return (
    <Link
      to="/reservations/$reservationId"
      params={{ reservationId: row.reservationId }}
      className="inline-flex h-11 items-center rounded-sm border border-border-strong bg-surface px-2.5 text-sm font-medium hover:bg-surface-2 lg:h-7"
      aria-label={`Open ${row.guestName}`}
    >
      Open
    </Link>
  )
}

function Table({ rows, ...props }: BodyProps & { rows: FrontDeskRow[] }) {
  const bd = props.data.hotel.businessDate
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-surface-2/60 text-xs font-semibold tracking-wide text-text-3 uppercase">
          <tr>
            {props.tab === 'arrivals' ? (
              <>
                <th className="px-4 py-2">Guest</th>
                <th className="px-4 py-2">Room</th>
                <th className="px-4 py-2">Ready</th>
                <th className="px-4 py-2">Stay</th>
                <th className="px-4 py-2">Notes</th>
              </>
            ) : (
              <>
                <th className="px-4 py-2">Room</th>
                <th className="px-4 py-2">Guest</th>
                <th className="px-4 py-2">{props.tab === 'departures' ? 'Leaving' : 'Night'}</th>
                <th className="px-4 py-2">Stay</th>
                <th className="px-4 py-2" />
              </>
            )}
            <th className="px-4 py-2">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => (
            <tr
              key={row.stayId}
              aria-selected={index === props.cursor}
              className={cn(index === props.cursor && 'bg-pri-soft/40')}
            >
              {props.tab === 'arrivals' ? (
                <>
                  <td className="max-w-[280px] px-4 py-2.5">
                    <GuestCell row={row} />
                  </td>
                  <td className="num px-4 py-2.5 whitespace-nowrap">
                    {row.room ? (
                      `${row.room.number} · ${row.roomTypeName}`
                    ) : (
                      <span className="text-am">Not in a room</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap gap-1.5">
                      <Ready row={row} />
                      <Flags row={row} pending={props.pending.has(row.stayId)} />
                    </span>
                  </td>
                  <td className="num px-4 py-2.5 text-sm whitespace-nowrap text-text-2">
                    {stayWords(row)}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-text-2">
                    <span className="block max-w-[220px] truncate" title={row.notes ?? undefined}>
                      {row.notes ?? '–'}
                    </span>
                  </td>
                </>
              ) : (
                <>
                  <td className="num px-4 py-2.5 font-semibold whitespace-nowrap">
                    {row.room?.number ?? '–'}{' '}
                    <span className="font-normal text-text-3">· {row.roomTypeName}</span>
                  </td>
                  <td className="max-w-[280px] px-4 py-2.5">
                    <GuestCell row={row} />
                  </td>
                  <td className="num px-4 py-2.5 text-sm whitespace-nowrap">
                    {row.departure <= bd
                      ? row.departure < bd
                        ? `Due out ${formatRateDate(row.departure, false)}`
                        : 'Leaves today'
                      : row.night
                        ? `Night ${row.night.n} of ${row.night.of}`
                        : ''}
                  </td>
                  <td className="num px-4 py-2.5 text-sm whitespace-nowrap text-text-2">
                    {stayWords(row)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Flags row={row} pending={false} />
                  </td>
                </>
              )}
              <td className="px-4 py-2.5 text-right">
                <RowAction row={row} props={props} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cards({ rows, ...props }: BodyProps & { rows: FrontDeskRow[] }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.stayId} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <GuestCell row={row} />
            <span className="num flex-none text-right font-semibold">
              {row.room?.number ?? (
                <span className="text-sm font-normal text-am">Not in a room</span>
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-text-2">
            {props.tab === 'arrivals' ? <Ready row={row} /> : null}
            <Flags row={row} pending={props.pending.has(row.stayId)} />
            <span className="num">{stayWords(row)}</span>
          </div>
          <div className="[&>*]:w-full">
            <RowAction row={row} props={props} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Shortcuts({ onClose }: { onClose: () => void }) {
  const lines: [string, string][] = [
    ['J / K', 'Move down / up the list'],
    ['↵', 'Open the reservation'],
    ['C', 'Check in'],
    ['M', 'Room move (in house)'],
    ['W', 'Walk-in'],
    ['N', 'New reservation'],
    ['A / D / H', 'Arrivals / Departures / In house'],
    ['/', 'Find guest, room, booking'],
    ['⌘P', 'Print list'],
    ['?', 'These shortcuts'],
  ]
  return (
    <Dialog open onClose={onClose} title="Keyboard shortcuts">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {lines.map(([keys, words]) => (
          <div key={keys} className="contents">
            <dt>
              <kbd className="num rounded-[4px] border border-border bg-surface-2 px-1.5 text-sm">
                {keys}
              </kbd>
            </dt>
            <dd className="text-text-2">{words}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  )
}

function DeskOffline({ savedAt }: { savedAt: number }) {
  const online = useOnline()
  if (online) return null
  const since = offlineSince()
  const clock = (at: number) =>
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(at)
  return (
    <div role="status" className="rounded-lg border border-border bg-am-bg px-4 py-2.5 text-am">
      <span className="font-semibold">{since ? `Offline since ${clock(since)}.` : 'Offline.'}</span>{' '}
      Check-ins save on this computer and sync later.
      {savedAt ? ` Room readiness is as of ${clock(savedAt)}. Last updated ${clock(savedAt)}.` : ''}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading the front desk"
      className="overflow-hidden rounded-md border border-border bg-surface shadow-card"
    >
      <div className="h-12 border-b border-border bg-surface-2/60" />
      {['a', 'b', 'c', 'd', 'e', 'f'].map((key) => (
        <div key={key} className="flex h-14 items-center gap-6 border-b border-border px-4">
          <span className="h-3 w-40 animate-pulse rounded-full bg-surface-3" />
          <span className="h-3 w-24 animate-pulse rounded-full bg-surface-2" />
          <span className="h-5 w-20 animate-pulse rounded-full bg-surface-2" />
          <span className="ml-auto h-7 w-20 animate-pulse rounded-sm bg-surface-2" />
        </div>
      ))}
    </div>
  )
}
