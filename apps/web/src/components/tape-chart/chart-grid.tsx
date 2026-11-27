// The tape chart's grid (design #3 TapeChart): rooms as rows grouped by room type, nights as
// columns, stays as bars and out-of-order periods as hatched blocks. Sticky room column and date
// header; it scrolls inside its own box. Only bars, blocks and labels are elements: the column
// lines are one background, weekend and business-date columns one stripe each, and rows are
// windowed above 150 rooms (performance skill). Drag a bar onto a room to move it, onto its type's
// Unassigned lane to remove the room, or drag its right end to change the departure; every drag has
// a keyboard alternative (arrows, Enter, M, E; Escape cancels a drag).
import {
  addDays,
  type ChartRoom,
  type ChartStay,
  formatNaira,
  type OutOfOrderView,
  type RoomStatus,
  type TapeChart,
} from '@vento/shared'
import { Accessibility, Check, ChevronDown, ChevronLeft, ChevronRight, Link2 } from 'lucide-react'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cn } from '@/lib/cn'
import {
  barLabel,
  barSpan,
  barText,
  bookedTypeFree,
  cellProblem,
  LABEL_WIDTH,
  oooReason,
  periodsByRoom,
  type Row,
  roomFreeFor,
  STATUS_WORDS,
  shownStatus,
  staysByRoom,
  VIRTUAL_FROM,
} from './chart-model'
import { type Anchor, anchorOf } from './popover'

export type StatusOverlay = Map<string, { status: RoomStatus; pending: boolean }>

type Props = {
  chart: TapeChart
  rows: Row[]
  dates: string[]
  overlay: StatusOverlay
  canDrag: boolean
  canExtend: boolean
  canBook: boolean
  onOpenStay: (stay: ChartStay, anchor: Anchor) => void
  onOpenRoom: (room: ChartRoom, anchor: Anchor) => void
  onCell: (room: ChartRoom, date: string) => void
  onToggleLane: (typeId: string) => void
  onDropRoom: (stay: ChartStay, room: ChartRoom) => void
  onDropLane: (stay: ChartStay) => void
  onExtend: (stay: ChartStay, departure: string, anchor: Anchor) => void
  onMoveKey: (stay: ChartStay) => void
  onModifyKey: (stay: ChartStay) => void
  onRefused: (message: string) => void
}

type Drag = {
  stay: ChartStay
  mode: 'move' | 'extend'
  x: number
  y: number
  started: boolean
  // Rooms free for the stay's nights, worked out once when the drag starts.
  free: Map<string, { free: true } | { free: false; why: string }>
}

const TONE: Record<RoomStatus | 'out_of_order', string> = {
  inspected: 'bg-em-bg text-em',
  clean: 'bg-em-bg text-em',
  dirty: 'bg-am-bg text-am',
  out_of_order: 'bg-ro-bg text-ro',
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
const isWeekend = (date: string) => [5, 6].includes(dayOf(date))

function columnWidth(width: number, days: number) {
  const min = days >= 30 ? 40 : days >= 14 ? 56 : 72
  return Math.max(min, Math.min(160, Math.floor((width - LABEL_WIDTH) / days)))
}

export function ChartGrid(props: Props) {
  const { chart, rows, dates, overlay } = props
  const scrollRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1100)
  const [view, setView] = useState({ top: 0, height: 800 })
  const [focus, setFocus] = useState<{ row: number; col: number }>({ row: -1, col: 0 })
  const [said, setSaid] = useState('')
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const suppressClick = useRef(false)
  const days = dates.length
  const colW = columnWidth(width, days)
  const trackW = colW * days
  const from = chart.from
  const business = chart.hotel.businessDate

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      setWidth(element.clientWidth)
      setView((v) => ({ ...v, height: element.clientHeight }))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const byRoom = useMemo(() => staysByRoom(chart), [chart])
  const periods = useMemo(() => periodsByRoom(chart), [chart])
  const offsets = useMemo(() => {
    const list: number[] = []
    let at = 0
    for (const row of rows) {
      list.push(at)
      at += row.height
    }
    return { list, total: at }
  }, [rows])
  const roomCount = rows.filter((row) => row.kind === 'room').length
  const windowed = roomCount > VIRTUAL_FROM
  const visible = useMemo(() => {
    if (!windowed) return { first: 0, last: rows.length - 1 }
    const top = view.top - 400
    const bottom = view.top + view.height + 400
    let first = offsets.list.findIndex((offset, i) => offset + (rows[i]?.height ?? 0) >= top)
    if (first < 0) first = 0
    let last = offsets.list.findIndex((offset) => offset > bottom)
    if (last < 0) last = rows.length - 1
    return { first, last }
  }, [windowed, view, offsets, rows])

  // Keyboard: the rows a focus can rest on.
  const focusable = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => row.kind === 'room' || row.kind === 'unassigned'),
    [rows],
  )

  const stayAt = useCallback(
    (row: Row | undefined, date: string): ChartStay | undefined => {
      if (!row) return undefined
      if (row.kind === 'room') {
        return byRoom.get(row.room.id)?.find((s) => s.arrival <= date && date < s.departure)
      }
      if (row.kind === 'unassigned') {
        return row.stays.find(({ stay }) => stay.arrival <= date && date < stay.departure)?.stay
      }
      return undefined
    },
    [byRoom],
  )

  const describeCell = useCallback(
    (rowIndex: number, col: number) => {
      const row = rows[rowIndex]
      if (!row) return ''
      if (row.kind === 'unassigned') {
        const date = dates[col]
        const count = date
          ? row.stays.filter(({ stay }) => stay.arrival <= date && date < stay.departure).length
          : 0
        return `${row.type.name} unassigned${date ? `, ${dayName(date)}: ${count}` : ''}`
      }
      if (row.kind !== 'room') return ''
      const status = shownStatus(
        overlay.get(row.room.id) ?? row.room,
        periods.get(row.room.id),
        business,
      )
      if (col < 0)
        return `Room ${row.room.number}, ${row.type.name}, ${STATUS_WORDS[status].toLowerCase()}`
      const date = dates[col] ?? ''
      const stay = stayAt(row, date)
      const off = periods.get(row.room.id)?.find((p) => p.from <= date && date < p.backInService)
      const problem = cellProblem(chart, row.room, date)
      const what = stay
        ? stay.guestShort
        : off
          ? `Out of order · ${oooReason(off)}`
          : problem
            ? `${problem}, can't be booked`
            : 'free, Enter books it'
      return `Room ${row.room.number}, ${dayName(date)}: ${what}`
    },
    [rows, dates, overlay, periods, business, stayAt, chart],
  )

  const moveFocus = (rowIndex: number, col: number) => {
    setFocus({ row: rowIndex, col })
    setSaid(describeCell(rowIndex, col))
    const element = scrollRef.current
    const top = offsets.list[rowIndex] ?? 0
    if (element) {
      if (top < element.scrollTop + 44) element.scrollTop = Math.max(0, top - 60)
      else if (top + 44 > element.scrollTop + element.clientHeight) {
        element.scrollTop = top - element.clientHeight + 120
      }
      const left = LABEL_WIDTH + col * colW
      if (col >= 0 && left < element.scrollLeft + LABEL_WIDTH) element.scrollLeft = col * colW
      else if (left + colW > element.scrollLeft + element.clientWidth) {
        element.scrollLeft = left + colW - element.clientWidth + 8
      }
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Escape' && dragRef.current) {
      cancelDrag()
      return
    }
    const position = focusable.findIndex(({ index }) => index === focus.row)
    const current = Math.max(0, position)
    const go = (rowPosition: number, col: number) => {
      const target = focusable[Math.min(focusable.length - 1, Math.max(0, rowPosition))]
      if (!target) return
      event.preventDefault()
      moveFocus(target.index, Math.max(-1, Math.min(days - 1, col)))
    }
    const col = focus.row < 0 ? Math.max(0, dates.indexOf(business)) : focus.col
    switch (event.key) {
      case 'ArrowDown':
        return go(position < 0 ? 0 : current + 1, col)
      case 'ArrowUp':
        return go(current - 1, col)
      case 'ArrowRight':
        return go(current, col + 1)
      case 'ArrowLeft':
        return go(current, col - 1)
      case 'Home':
        return go(current, -1)
      case 'End':
        return go(current, days - 1)
    }
    const row = rows[focus.row]
    if (!row) return
    const date = dates[focus.col] ?? ''
    const stay = focus.col >= 0 ? stayAt(row, date) : undefined
    const anchor = focusAnchor()
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (row.kind === 'unassigned' && (!row.expanded || !stay))
        return props.onToggleLane(row.type.id)
      if (stay) return props.onOpenStay(stay, anchor)
      if (row.kind !== 'room') return
      if (focus.col < 0) return props.onOpenRoom(row.room, anchor)
      const problem = cellProblem(chart, row.room, date)
      if (problem) return setSaid(`${problem}. It can't be booked.`)
      if (props.canBook) props.onCell(row.room, date)
      return
    }
    if ((event.key === 'm' || event.key === 'M') && stay && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      props.onMoveKey(stay)
    }
    if ((event.key === 'e' || event.key === 'E') && stay && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      props.onModifyKey(stay)
    }
  }

  const focusAnchor = (): Anchor => {
    const body = bodyRef.current?.getBoundingClientRect()
    const scroll = scrollRef.current
    if (!body || !scroll) return anchorOf(null)
    const top = body.top + (offsets.list[focus.row] ?? 0)
    const left =
      focus.col < 0 ? body.left + scroll.scrollLeft : body.left + LABEL_WIDTH + focus.col * colW
    return { left, top, bottom: top + 44, right: left + colW }
  }

  // --- Dragging -------------------------------------------------------------------------------------

  const rowAtY = (clientY: number): number => {
    const body = bodyRef.current?.getBoundingClientRect()
    if (!body) return -1
    const y = clientY - body.top
    for (let i = 0; i < rows.length; i++) {
      const top = offsets.list[i] ?? 0
      if (y >= top && y < top + (rows[i]?.height ?? 0)) return i
    }
    return -1
  }
  // The column line nearest the pointer: where a dragged end lands (the departure).
  const edgeAtX = (clientX: number): number => {
    const body = bodyRef.current?.getBoundingClientRect()
    if (!body) return 0
    return Math.round((clientX - body.left - LABEL_WIDTH) / colW)
  }

  const cancelDrag = useCallback(() => {
    dragRef.current = null
    setDrag(null)
  }, [])

  const startDrag = (event: ReactPointerEvent, stay: ChartStay, mode: Drag['mode']) => {
    if (event.button !== 0) return
    const allowed = mode === 'move' ? props.canDrag : props.canExtend
    if (!allowed || !stay.movable) return
    event.stopPropagation()
    const free = new Map<string, { free: true } | { free: false; why: string }>()
    if (mode === 'move') {
      // Rooms of another type only when the booked type has none free (an upgrade).
      const typeName = chart.roomTypes.find((t) => t.id === stay.roomTypeId)?.name ?? ''
      const sameFree = bookedTypeFree(chart, stay)
      for (const room of chart.rooms) {
        free.set(
          room.id,
          sameFree && room.roomTypeId !== stay.roomTypeId
            ? { free: false, why: `A ${typeName} room is free: assign one of those` }
            : roomFreeFor(chart, room, stay),
        )
      }
    }
    dragRef.current = { stay, mode, x: event.clientX, y: event.clientY, started: false, free }
  }

  useEffect(() => {
    let frame = 0
    const onMove = (event: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      const moved = Math.abs(event.clientX - current.x) + Math.abs(event.clientY - current.y)
      if (!current.started && moved < 5) return
      const next = { ...current, x: event.clientX, y: event.clientY, started: true }
      dragRef.current = next
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setDrag(next))
    }
    const onUp = (event: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      dragRef.current = null
      setDrag(null)
      if (!current.started) return
      suppressClick.current = true
      setTimeout(() => {
        suppressClick.current = false
      }, 0)
      if (current.mode === 'extend') {
        const departure = extendTo(current.stay, edgeAtX(event.clientX))
        if (departure !== current.stay.departure) {
          props.onExtend(current.stay, departure, {
            left: event.clientX,
            right: event.clientX,
            top: event.clientY,
            bottom: event.clientY,
          })
        }
        return
      }
      const row = rows[rowAtY(event.clientY)]
      if (!row) return
      if (row.kind === 'unassigned' && row.type.id === current.stay.roomTypeId) {
        if (current.stay.roomId) props.onDropLane(current.stay)
        return
      }
      if (row.kind !== 'room' || row.room.id === current.stay.roomId) return
      const check = current.free.get(row.room.id)
      if (check && !check.free) return props.onRefused(check.why)
      props.onDropRoom(current.stay, row.room)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragRef.current) {
        event.stopPropagation()
        cancelDrag()
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey, true)
    }
  })

  // The departure a drag of the right end points at: at least a night, never before tomorrow's
  // business date.
  const extendTo = (stay: ChartStay, edge: number) => {
    const end = addDays(from, Math.max(1, edge))
    const earliest = [addDays(stay.arrival, 1), addDays(business, 1)].sort().at(-1) ?? end
    return [end, earliest].sort().at(-1) ?? end
  }

  // What a move drag is over, for the ghost and its tip.
  const hover = (() => {
    if (drag?.mode !== 'move') return null
    const index = rowAtY(drag.y)
    const row = rows[index]
    if (!row) return { index: -1, tip: null as string | null, ok: false }
    if (row.kind === 'unassigned' && row.type.id === drag.stay.roomTypeId) {
      return {
        index,
        tip: drag.stay.roomId ? 'Remove the room' : null,
        ok: Boolean(drag.stay.roomId),
      }
    }
    if (row.kind !== 'room') return { index, tip: null, ok: false }
    if (row.room.id === drag.stay.roomId) return { index, tip: null, ok: false }
    const check = drag.free.get(row.room.id)
    if (check && !check.free) return { index, tip: check.why, ok: false }
    const other = row.room.roomTypeId !== drag.stay.roomTypeId
    return {
      index,
      tip: other ? `Move to ${row.room.number} · ${row.type.name}` : `Move to ${row.room.number}`,
      ok: true,
    }
  })()

  const ghost = (() => {
    if (!drag) return null
    const span = barSpan(drag.stay.arrival, drag.stay.departure, from, days)
    if (!span) return null
    if (drag.mode === 'extend') {
      const departure = extendTo(drag.stay, edgeAtX(drag.x))
      const ext = barSpan(drag.stay.arrival, departure, from, days)
      const index = rows.findIndex(
        (row) =>
          (row.kind === 'room' && row.room.id === drag.stay.roomId) ||
          (row.kind === 'unassigned' && !drag.stay.roomId && row.type.id === drag.stay.roomTypeId),
      )
      if (!ext || index < 0) return null
      return {
        top: (offsets.list[index] ?? 0) + 6,
        left: LABEL_WIDTH + ext.start * colW + 2,
        width: ext.span * colW - 4,
        tip: `${drag.stay.guestShort} → ${formatDay(departure)}`,
        ok: true,
      }
    }
    if (!hover || hover.index < 0) return null
    return {
      top: (offsets.list[hover.index] ?? 0) + 6,
      left: LABEL_WIDTH + span.start * colW + 2,
      width: span.span * colW - 4,
      tip: hover.tip,
      ok: hover.ok,
    }
  })()

  const background = `repeating-linear-gradient(to right, transparent 0 ${colW - 1}px, var(--border) ${colW - 1}px ${colW}px)`
  const stripes = dates
    .map((date, i) => ({ date, i }))
    .filter(({ date }) => date === business || isWeekend(date) || date < business)

  return (
    <div className="relative">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </p>
      <section
        ref={scrollRef}
        aria-label="Tape chart. Arrow keys move between rooms and nights; Enter opens; M moves a stay, E modifies it."
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the grid is driven from the keyboard.
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (event.target === event.currentTarget && focus.row < 0 && focusable[0]) {
            moveFocus(focusable[0].index, Math.max(0, dates.indexOf(business)))
          }
        }}
        onScroll={(event) => {
          const element = event.currentTarget
          if (windowed) setView({ top: element.scrollTop, height: element.clientHeight })
        }}
        className={cn(
          'relative max-h-[calc(100dvh-250px)] min-h-[360px] overflow-auto rounded-md border border-border bg-surface shadow-card',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          drag?.started && 'cursor-grabbing select-none',
        )}
      >
        <div style={{ width: LABEL_WIDTH + trackW }}>
          <Header dates={dates} business={business} colW={colW} />
          <div ref={bodyRef} className="relative" style={{ height: offsets.total }}>
            {stripes.map(({ date, i }) => (
              <div
                key={date}
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute top-0 bottom-0',
                  date === business
                    ? 'bg-pri-soft/70'
                    : date < business
                      ? 'bg-surface-2/50'
                      : 'bg-weekend',
                )}
                style={{ left: LABEL_WIDTH + i * colW, width: colW }}
              />
            ))}
            {rows.slice(visible.first, visible.last + 1).map((row, i) => {
              const index = visible.first + i
              return (
                <div
                  key={row.key}
                  className="absolute right-0 left-0"
                  style={{ top: offsets.list[index], height: row.height }}
                >
                  <RowView
                    row={row}
                    index={index}
                    {...props}
                    from={from}
                    days={days}
                    colW={colW}
                    trackW={trackW}
                    background={background}
                    business={business}
                    stays={row.kind === 'room' ? (byRoom.get(row.room.id) ?? []) : []}
                    periods={row.kind === 'room' ? (periods.get(row.room.id) ?? []) : []}
                    focused={focus.row === index ? focus.col : null}
                    dragging={drag?.started ? drag : null}
                    target={hover?.index === index ? hover : null}
                    suppressClick={suppressClick}
                    startDrag={startDrag}
                    onFocusCell={(col) => moveFocus(index, col)}
                  />
                </div>
              )
            })}
            {ghost ? (
              <>
                <div
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute z-30 h-8 rounded-[7px] border-2 shadow-[var(--shadow-lg)]',
                    ghost.ok ? 'border-brand bg-pri-soft/90' : 'border-ro-dot bg-ro-bg/90',
                  )}
                  style={{ top: ghost.top, left: ghost.left, width: Math.max(ghost.width, 24) }}
                />
                {ghost.tip ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none absolute z-30 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap shadow-[var(--shadow-lg)]',
                      ghost.ok ? 'bg-text text-surface' : 'bg-ro text-white',
                    )}
                    style={{ top: ghost.top - 26, left: ghost.left }}
                  >
                    {ghost.tip}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}

const formatDay = (date: string) => {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MONTHS[(m ?? 1) - 1]}`
}
const dayName = (date: string) => `${DOW[dayOf(date)]} ${formatDay(date)}`

function Header({ dates, business, colW }: { dates: string[]; business: string; colW: number }) {
  return (
    <div className="sticky top-0 z-20 flex border-b border-border bg-surface">
      <div
        className="sticky left-0 z-10 flex flex-none items-end border-r border-border bg-surface px-3 pb-2 text-xs font-medium tracking-wide text-text-3 uppercase"
        style={{ width: LABEL_WIDTH, height: 52 }}
      >
        Room
      </div>
      {dates.map((date, i) => {
        const day = Number(date.slice(8))
        const biz = date === business
        const showMonth = i === 0 || day === 1
        return (
          <div
            key={date}
            className={cn(
              'flex flex-none flex-col items-center justify-center border-l border-border text-[11px] leading-tight',
              biz
                ? 'bg-pri-soft text-pri-ink'
                : isWeekend(date)
                  ? 'bg-weekend text-text-2'
                  : 'text-text-3',
            )}
            style={{ width: colW, height: 52 }}
          >
            <span className={cn(showMonth && 'font-semibold')}>
              {showMonth ? `${MONTHS[Number(date.slice(5, 7)) - 1]} · ` : ''}
              {DOW[dayOf(date)]}
            </span>
            <b className={cn('num text-[13px] font-semibold', biz ? 'text-pri-ink' : 'text-text')}>
              {day}
            </b>
            {biz ? (
              <span className="text-[10px] font-semibold whitespace-nowrap">
                {colW >= 64 ? 'Business date' : 'Today'}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

type RowProps = Props & {
  row: Row
  index: number
  from: string
  days: number
  colW: number
  trackW: number
  background: string
  business: string
  stays: ChartStay[]
  periods: OutOfOrderView[]
  focused: number | null
  dragging: Drag | null
  target: { tip: string | null; ok: boolean } | null
  suppressClick: { current: boolean }
  startDrag: (event: ReactPointerEvent, stay: ChartStay, mode: Drag['mode']) => void
  onFocusCell: (col: number) => void
}

function RowView(p: RowProps) {
  const { row } = p
  if (row.kind === 'type') {
    const night = row.type.nights.find((n) => n.date === p.business)
    return (
      <div className="flex h-full items-center border-b border-border bg-surface-2">
        <div
          className="sticky left-0 z-10 flex h-full items-center gap-2 bg-surface-2 px-3 text-sm font-semibold whitespace-nowrap"
          style={{ minWidth: LABEL_WIDTH }}
        >
          <span>{row.type.name}</span>
          {row.type.tonightPrice ? (
            <span className="num font-medium text-text-3">
              {formatNaira(row.type.tonightPrice)} excl. taxes
            </span>
          ) : null}
          {night ? (
            <span className="num ml-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-2 ring-1 ring-border">
              {night.left} left tonight
            </span>
          ) : null}
        </div>
      </div>
    )
  }
  if (row.kind === 'available') {
    return (
      <div className="flex h-full border-b border-border">
        <div
          className="sticky left-0 z-10 flex h-full flex-none items-center border-r border-border bg-surface-2 px-3 text-sm font-medium text-text-3"
          style={{ width: LABEL_WIDTH }}
        >
          Available
        </div>
        {row.type.nights.map((night) => {
          const short = night.left < 0
          return (
            <div
              key={night.date}
              title={
                short
                  ? `${-night.left} more booking${night.left === -1 ? '' : 's'} than rooms`
                  : undefined
              }
              className={cn(
                'num grid flex-none place-items-center border-l border-border bg-surface-2/80 text-[12px] font-semibold',
                night.left <= 0 ? 'text-ro' : night.left <= 2 ? 'text-am' : 'text-text-2',
              )}
              style={{ width: p.colW }}
            >
              {night.left < 0 ? `−${-night.left}` : night.left}
            </div>
          )
        })}
      </div>
    )
  }
  if (row.kind === 'unassigned') return <LaneRow {...p} row={row} />
  return <RoomRow {...p} row={row} />
}

function LaneRow(p: RowProps & { row: Extract<Row, { kind: 'unassigned' }> }) {
  const { row } = p
  const total = row.stays.length
  const dropping = p.dragging?.mode === 'move' && p.dragging.stay.roomTypeId === row.type.id
  return (
    <div
      className={cn(
        'flex h-full border-b border-border',
        dropping && p.target?.ok && 'bg-pri-soft/60',
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-expanded={row.expanded}
        onClick={() => p.onToggleLane(row.type.id)}
        className="sticky left-0 z-10 flex h-full flex-none items-center gap-1.5 border-r border-border bg-surface px-3 text-left text-sm font-medium text-am hover:bg-surface-2"
        style={{ width: LABEL_WIDTH }}
      >
        <ChevronDown
          className={cn('size-3.5 transition-transform', !row.expanded && '-rotate-90')}
          aria-hidden="true"
        />
        Unassigned
        <span className="num ml-auto rounded-full bg-am-bg px-1.5 text-[11px] font-semibold">
          {total}
        </span>
      </button>
      <div
        className="relative flex-none"
        style={{ width: p.trackW, backgroundImage: p.background }}
      >
        {row.expanded
          ? row.stays.map(({ stay, lane }) => (
              <Bar key={stay.id} {...p} stay={stay} top={2 + lane * 34} />
            ))
          : p.row.type.nights.map((night, i) =>
              night.unassigned ? (
                <button
                  key={night.date}
                  type="button"
                  tabIndex={-1}
                  onClick={() => p.onToggleLane(row.type.id)}
                  aria-label={`${night.unassigned} ${row.type.name} unassigned on ${night.date}`}
                  className="num absolute top-1 grid h-[22px] place-items-center rounded-full bg-am-bg text-[11px] font-semibold text-am hover:ring-1 hover:ring-am-dot"
                  style={{ left: i * p.colW + 6, width: p.colW - 12 }}
                >
                  {night.unassigned}
                </button>
              ) : null,
            )}
        {p.focused !== null && p.focused >= 0 ? <FocusRing col={p.focused} colW={p.colW} /> : null}
      </div>
    </div>
  )
}

function RoomRow(p: RowProps & { row: Extract<Row, { kind: 'room' }> }) {
  const { row } = p
  const room = row.room
  const overlay = p.overlay.get(room.id)
  const status = shownStatus(overlay ?? room, p.periods, p.business)
  const dragging = p.dragging?.mode === 'move' ? p.dragging : null
  const check =
    dragging && room.id !== dragging.stay.roomId ? dragging.free.get(room.id) : undefined
  const words = STATUS_WORDS[status]
  return (
    <div
      className={cn(
        'flex h-full border-b border-border',
        check?.free && 'bg-em-bg/45',
        p.target && (p.target.ok ? 'outline-2 -outline-offset-2 outline-brand' : 'bg-ro-bg/40'),
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        title={
          room.statusBy && status !== 'out_of_order'
            ? `${words} · ${room.statusBy}${room.statusAt ? ` · ${clock(room.statusAt, p.chart.hotel.timeZone)}` : ''}`
            : room.connectsTo.length
              ? `Connects to ${room.connectsTo.join(', ')}`
              : undefined
        }
        onClick={(event) => p.onOpenRoom(room, anchorOf(event.currentTarget))}
        className={cn(
          'sticky left-0 z-10 flex h-full flex-none items-center gap-2 border-r border-border bg-surface px-3 text-left hover:bg-surface-2',
          p.focused === -1 && 'outline-2 -outline-offset-2 outline-ring',
        )}
        style={{ width: LABEL_WIDTH }}
      >
        <span className="num w-11 text-[13px] font-semibold">
          <span className="sr-only">Room </span>
          {room.number}
        </span>{' '}
        <span
          className={cn(
            'inline-flex h-[18px] items-center gap-1 rounded-full px-1.5 text-[11px] font-semibold whitespace-nowrap',
            TONE[status],
          )}
        >
          {status === 'inspected' ? <Check className="size-3" aria-hidden="true" /> : null}
          {words}
        </span>
        <span className="sr-only">
          , {row.type.name}
          {overlay?.pending ? ', will sync' : ''}
        </span>
        {overlay?.pending ? (
          <span className="size-1.5 rounded-full bg-am-dot" aria-hidden="true" title="Will sync" />
        ) : null}
        <span className="ml-auto flex items-center gap-1 text-text-3">
          {room.accessible ? <Accessibility className="size-3.5" aria-hidden="true" /> : null}
          {room.connectsTo.length ? <Link2 className="size-3.5" aria-hidden="true" /> : null}
        </span>
      </button>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the grid's own keys (Enter) do this. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: cells are reached by the grid's keys. */}
      <div
        className="relative flex-none"
        style={{ width: p.trackW, backgroundImage: p.background }}
        onMouseMove={(event) => {
          if (!p.canBook || event.target !== event.currentTarget) return
          const rect = event.currentTarget.getBoundingClientRect()
          const date = addDays(p.from, Math.floor((event.clientX - rect.left) / p.colW))
          const problem = cellProblem(p.chart, room, date)
          // The reason on hover; only a night that can be sold looks clickable.
          event.currentTarget.title = problem ?? `Book ${room.number} from ${dayName(date)}`
          event.currentTarget.style.cursor = problem ? 'not-allowed' : 'cell'
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget || p.suppressClick.current) return
          const rect = event.currentTarget.getBoundingClientRect()
          const col = Math.floor((event.clientX - rect.left) / p.colW)
          p.onFocusCell(col)
          const date = addDays(p.from, col)
          if (p.canBook && !cellProblem(p.chart, room, date)) p.onCell(room, date)
        }}
      >
        {p.periods.map((period) => {
          const span = barSpan(period.from, period.backInService, p.from, p.days)
          if (!span) return null
          const past = period.backInService <= p.business
          return (
            <div
              key={period.id}
              title={`Out of order · ${oooReason(period)}${period.note ? ` · ${period.note}` : ''} · ${period.byName}`}
              className={cn(
                'absolute top-[6px] flex h-8 items-center gap-1.5 overflow-hidden rounded-[7px] border border-ro-bg px-2 text-[12px] font-semibold whitespace-nowrap text-ro',
                past && 'opacity-55',
              )}
              style={{
                left: span.start * p.colW + 2,
                width: span.span * p.colW - 4,
                backgroundImage:
                  'repeating-linear-gradient(135deg, var(--ro-bg) 0 6px, transparent 6px 11px)',
              }}
            >
              <span className="truncate">Out of order · {oooReason(period)}</span>
            </div>
          )
        })}
        {p.stays.map((stay) => (
          <Bar key={stay.id} {...p} stay={stay} top={6} />
        ))}
        {p.focused !== null && p.focused >= 0 ? <FocusRing col={p.focused} colW={p.colW} /> : null}
      </div>
    </div>
  )
}

function FocusRing({ col, colW }: { col: number; colW: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0.5 bottom-0.5 z-20 rounded-[5px] outline-2 outline-ring"
      style={{ left: col * colW + 1, width: colW - 2 }}
    />
  )
}

function Bar(p: RowProps & { stay: ChartStay; top: number }) {
  const { stay } = p
  const span = barSpan(stay.arrival, stay.departure, p.from, p.days)
  if (!span) return null
  const typeName = p.chart.roomTypes.find((t) => t.id === stay.roomTypeId)?.name ?? ''
  const room = p.chart.rooms.find((r) => r.id === stay.roomId)
  const text = barText(stay, span.span)
  const lifted = p.dragging?.stay.id === stay.id
  const draggable = p.canDrag && stay.movable
  const extendable = p.canExtend && stay.movable && !span.clippedEnd
  const past = stay.departure <= p.business
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`${text.name}${text.sub ? ` ${text.sub}` : ''}: ${barLabel(stay, typeName, room?.number)}`}
      title={barLabel(stay, typeName, room?.number)}
      onPointerDown={(event) => p.startDrag(event, stay, 'move')}
      onClick={(event) => {
        if (p.suppressClick.current) return
        p.onOpenStay(stay, anchorOf(event.currentTarget))
      }}
      className={cn(
        'group absolute z-[1] flex h-8 items-center gap-1.5 overflow-hidden rounded-[7px] border border-pri-line bg-pri-soft px-2 text-left text-[12px] font-medium whitespace-nowrap text-pri-ink',
        'transition-[box-shadow,opacity] hover:shadow-[0_2px_8px_-2px_color-mix(in_srgb,var(--brand)_40%,transparent)]',
        draggable && 'cursor-grab active:cursor-grabbing',
        lifted && 'opacity-40',
        past && 'opacity-70',
        stay.status === 'checked_in' && 'border-bl-dot/40 bg-bl-bg text-bl',
      )}
      style={{ top: p.top, left: span.start * p.colW + 2, width: span.span * p.colW - 4 }}
    >
      {span.clippedStart ? (
        <ChevronLeft className="-ml-1 size-3.5 flex-none" aria-hidden="true" />
      ) : null}
      <span className="truncate font-semibold">{text.name}</span>
      {text.sub ? <span className="truncate font-normal">{text.sub}</span> : null}
      {span.clippedEnd ? (
        <ChevronRight className="ml-auto size-3.5 flex-none" aria-hidden="true" />
      ) : null}
      {extendable ? (
        <span
          aria-hidden="true"
          onPointerDown={(event) => p.startDrag(event, stay, 'extend')}
          className="absolute top-0 right-0 flex h-full w-3 cursor-ew-resize items-center justify-center"
        >
          <span className="h-4 w-1 rounded-full bg-current opacity-40 group-hover:opacity-80" />
        </span>
      ) : null}
    </button>
  )
}

const clock = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )
