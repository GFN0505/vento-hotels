// The tape chart on a phone (spec: "Phone (below md)"): one night at a time, by room type, with
// rooms left tonight, the unassigned arrivals at the top of a type, then rooms by floor with what's
// on that night. Tap a room for its actions in a bottom sheet; no dragging. Targets are at least
// 48px (the housekeeping phone shell's size).
import { Link } from '@tanstack/react-router'
import {
  addDays,
  type ChartRoom,
  type ChartStay,
  formatRateDate,
  type OutOfOrderView,
  type RoomStatus,
  type TapeChart,
} from '@vento/shared'
import {
  ArrowLeftRight,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  Sparkles,
  Undo2,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'
import type { StatusOverlay } from './chart-grid'
import { currentOrNext, type DayRoom, dayList, periodsByRoom, STATUS_WORDS } from './chart-model'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayWords = (date: string) =>
  `${DOW[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${formatRateDate(date, false)}`

const TONE: Record<RoomStatus | 'out_of_order', string> = {
  inspected: 'bg-em-bg text-em',
  clean: 'bg-em-bg text-em',
  dirty: 'bg-am-bg text-am',
  out_of_order: 'bg-ro-bg text-ro',
}

type Props = {
  chart: TapeChart
  date: string
  overlay: StatusOverlay
  online: boolean
  canAudit: boolean
  onDate: (date: string) => void
  onStatus: (room: ChartRoom, status: 'clean' | 'dirty') => void
  onOutOfOrder: (
    room: ChartRoom,
    mode: 'create' | 'change' | 'end',
    period?: OutOfOrderView,
  ) => void
  onMove: (stay: ChartStay) => void
  onModify: (stay: ChartStay) => void
}

export function DayList(p: Props) {
  const { chart, date } = p
  const sections = dayList(
    {
      ...chart,
      rooms: chart.rooms.map((room) => ({
        ...room,
        status: p.overlay.get(room.id)?.status ?? room.status,
      })),
    },
    date,
  )
  const periods = periodsByRoom(chart)
  const [open, setOpen] = useState<DayRoom | null>(null)
  const [arrivals, setArrivals] = useState<ChartStay[] | null>(null)
  const business = chart.hotel.businessDate
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface p-1.5 shadow-card">
        <Button
          variant="ghost"
          size="icon"
          className="size-12"
          aria-label="Previous day"
          disabled={date <= addDays(business, -2)}
          onClick={() => p.onDate(addDays(date, -1))}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Button>
        <span className="num text-center font-semibold" aria-live="polite">
          {dayWords(date)}
          {date === business ? (
            <span className="block text-sm font-medium text-pri-ink">Business date</span>
          ) : null}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-12"
          aria-label="Next day"
          onClick={() => p.onDate(addDays(date, 1))}
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </Button>
      </div>
      {sections.map((section) => (
        <section
          key={section.type.id}
          aria-labelledby={`day-${section.type.id}`}
          className="overflow-hidden rounded-md border border-border bg-surface shadow-card"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
            <h2 id={`day-${section.type.id}`} className="font-semibold">
              {section.type.name}
            </h2>
            <span
              className={cn(
                'num rounded-full px-2 py-0.5 text-sm font-semibold',
                section.left <= 0
                  ? 'bg-ro-bg text-ro'
                  : 'bg-surface text-text-2 ring-1 ring-border',
              )}
            >
              {section.left} left {date === business ? 'tonight' : 'that night'}
            </span>
          </header>
          <ul className="divide-y divide-border">
            {section.arriving.length ? (
              <li>
                <button
                  type="button"
                  onClick={() => setArrivals(section.arriving)}
                  className="flex min-h-12 w-full items-center gap-3 bg-am-bg/50 px-4 py-2 text-left font-medium text-am"
                >
                  Unassigned · {section.arriving.length}{' '}
                  {section.arriving.every((stay) => stay.arrival === date) ? 'arriving' : 'staying'}
                  <ChevronRight className="ml-auto size-4" aria-hidden="true" />
                </button>
              </li>
            ) : null}
            {section.rooms.map((entry) => {
              const pending = p.overlay.get(entry.room.id)?.pending
              return (
                <li key={entry.room.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(entry)}
                    className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2"
                  >
                    <span className="num w-12 flex-none font-semibold">{entry.room.number}</span>
                    <span
                      className={cn(
                        'inline-flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        TONE[entry.status],
                      )}
                    >
                      {entry.status === 'inspected' ? (
                        <Check className="size-3" aria-hidden="true" />
                      ) : null}
                      {STATUS_WORDS[entry.status]}
                    </span>
                    <span className="min-w-0 grow truncate text-text-2">
                      {entry.line ?? 'Free'}
                    </span>
                    {pending ? (
                      <span className="flex-none text-xs font-medium text-am">Will sync</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {open ? (
        <RoomSheet
          {...p}
          entry={open}
          period={currentOrNext(periods.get(open.room.id), business)}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {arrivals ? (
        <Dialog
          open
          onClose={() => setArrivals(null)}
          title="Unassigned"
          description={dayWords(date)}
        >
          <ul className="flex flex-col divide-y divide-border">
            {arrivals.map((stay) => (
              <li key={stay.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 grow">
                  <span className="block truncate font-medium">{stay.guestName}</span>
                  <span className="num text-sm text-text-2">{stay.number}</span>
                </span>
                {chart.can.move && stay.movable ? (
                  <Button
                    className="h-12"
                    disabled={!p.online}
                    onClick={() => {
                      setArrivals(null)
                      p.onMove(stay)
                    }}
                  >
                    Assign room
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {!p.online ? (
            <p className="pt-2 text-sm text-text-3">Moving rooms needs a connection.</p>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  )
}

function RoomSheet(
  p: Props & { entry: DayRoom; period: OutOfOrderView | undefined; onClose: () => void },
) {
  const { chart, entry, period } = p
  const room = entry.room
  const stay = entry.stay
  const type = chart.roomTypes.find((t) => t.id === room.roomTypeId)
  const current = period && period.from <= chart.hotel.businessDate
  const action =
    'flex min-h-12 w-full items-center gap-3 rounded-sm border border-border px-3 text-left font-medium hover:bg-surface-2 disabled:opacity-45'
  const close = (then: () => void) => () => {
    p.onClose()
    then()
  }
  return (
    <Dialog
      open
      onClose={p.onClose}
      title={`Room ${room.number}`}
      description={`${type?.name ?? ''} · ${STATUS_WORDS[entry.status]}${room.statusBy && entry.status !== 'out_of_order' ? ` · ${room.statusBy}` : ''}`}
    >
      <div className="flex flex-col gap-2">
        {stay ? (
          <div className="rounded-sm bg-surface-2 px-3 py-2">
            <p className="font-semibold break-words">{stay.guestName}</p>
            <p className="num text-sm text-text-2">
              {stay.number} · {entry.line}
            </p>
          </div>
        ) : null}
        {chart.can.status ? (
          room.status === 'dirty' ? (
            <button
              type="button"
              className={action}
              onClick={close(() => p.onStatus(room, 'clean'))}
            >
              <Sparkles className="size-4 text-em" aria-hidden="true" />
              Mark clean
            </button>
          ) : (
            <button
              type="button"
              className={action}
              onClick={close(() => p.onStatus(room, 'dirty'))}
            >
              <Undo2 className="size-4 text-am" aria-hidden="true" />
              Mark dirty
            </button>
          )
        ) : null}
        {chart.can.outOfOrder ? (
          period ? (
            <>
              <button
                type="button"
                className={action}
                disabled={!p.online}
                onClick={close(() => p.onOutOfOrder(room, 'change', period))}
              >
                <CalendarClock className="size-4 text-text-3" aria-hidden="true" />
                Change dates
              </button>
              <button
                type="button"
                className={action}
                disabled={!p.online}
                onClick={close(() => p.onOutOfOrder(room, 'end', period))}
              >
                <Wrench className="size-4 text-text-3" aria-hidden="true" />
                {current ? 'Back in service' : 'Remove the out-of-order'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={action}
              disabled={!p.online}
              onClick={close(() => p.onOutOfOrder(room, 'create'))}
            >
              <Wrench className="size-4 text-ro" aria-hidden="true" />
              Put out of order
            </button>
          )
        ) : null}
        {stay && chart.can.open ? (
          <Link
            to="/reservations/$reservationId"
            params={{ reservationId: stay.reservationId }}
            search={{ hotel: chart.hotel.id }}
            className={action}
          >
            <ExternalLink className="size-4 text-text-3" aria-hidden="true" />
            Open reservation
          </Link>
        ) : null}
        {stay && chart.can.move && stay.movable ? (
          <button
            type="button"
            className={action}
            disabled={!p.online}
            onClick={close(() => p.onMove(stay))}
          >
            <ArrowLeftRight className="size-4 text-text-3" aria-hidden="true" />
            Room move
          </button>
        ) : null}
        {stay && chart.can.manage && stay.movable ? (
          <button
            type="button"
            className={action}
            disabled={!p.online}
            onClick={close(() => p.onModify(stay))}
          >
            <Pencil className="size-4 text-text-3" aria-hidden="true" />
            Modify
          </button>
        ) : null}
        {!p.online ? (
          <p className="text-sm text-text-3">Moving rooms and out of order need a connection.</p>
        ) : null}
      </div>
    </Dialog>
  )
}
