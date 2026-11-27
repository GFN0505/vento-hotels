// The room menu (spec: "Click on a room label"): its status with who and when, Mark clean or Mark
// dirty (works offline), Put out of order (or Change dates and Back in service when one is active
// or upcoming), and History.
import {
  type ChartRoom,
  formatRateDate,
  type OutOfOrderView,
  type RoomStatus,
  type TapeChart,
} from '@vento/shared'
import { CalendarClock, History, Sparkles, Trash2, Undo2, Wrench } from 'lucide-react'
import { cn } from '@/lib/cn'
import { oooReason, STATUS_WORDS } from './chart-model'
import { type Anchor, Popover } from './popover'

type Props = {
  chart: TapeChart
  room: ChartRoom
  stored: RoomStatus
  period: OutOfOrderView | undefined
  anchor: Anchor
  online: boolean
  canAudit: boolean
  onClose: () => void
  onStatus: (status: 'clean' | 'dirty') => void
  onOutOfOrder: (mode: 'create' | 'change' | 'end') => void
  onHistory: () => void
}

const clock = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )

export function RoomMenu(p: Props) {
  const { chart, room, period } = p
  const type = chart.roomTypes.find((t) => t.id === room.roomTypeId)
  const business = chart.hotel.businessDate
  const current = period && period.from <= business
  const who = room.statusBy
    ? ` · ${room.statusBy}${room.statusAt ? ` · ${clock(room.statusAt, chart.hotel.timeZone)}` : ''}`
    : ''
  const item =
    'flex min-h-11 w-full items-center gap-2.5 rounded-sm px-2.5 text-left font-medium hover:bg-surface-2 disabled:opacity-45 lg:min-h-9'
  return (
    <Popover
      anchor={p.anchor}
      label={`Room ${room.number}`}
      onClose={p.onClose}
      className="w-[300px] gap-2"
    >
      <div className="flex flex-col gap-0.5 px-1">
        <span className="text-md font-semibold">
          {room.number} <span className="font-normal text-text-3">· {type?.name}</span>
        </span>
        <span className="text-sm text-text-2">
          {STATUS_WORDS[p.stored]}
          {who}
        </span>
        {period ? (
          <span className="num text-sm text-ro">
            Out of order {formatRateDate(period.from, false)} – back{' '}
            {formatRateDate(period.backInService, false)} · {oooReason(period)}
          </span>
        ) : null}
        {room.connectsTo.length ? (
          <span className="text-sm text-text-3">Connects to {room.connectsTo.join(', ')}</span>
        ) : null}
      </div>
      <div className="flex flex-col border-t border-border pt-1.5">
        {chart.can.status ? (
          p.stored === 'dirty' ? (
            <button
              type="button"
              className={item}
              data-autofocus
              onClick={() => p.onStatus('clean')}
            >
              <Sparkles className="size-4 text-em" aria-hidden="true" />
              Mark clean
            </button>
          ) : (
            <button
              type="button"
              className={item}
              data-autofocus
              onClick={() => p.onStatus('dirty')}
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
                className={item}
                disabled={!p.online}
                onClick={() => p.onOutOfOrder('change')}
              >
                <CalendarClock className="size-4 text-text-3" aria-hidden="true" />
                Change dates
              </button>
              <button
                type="button"
                className={cn(item, !current && 'text-ro')}
                disabled={!p.online}
                onClick={() => p.onOutOfOrder('end')}
              >
                {current ? (
                  <Sparkles className="size-4 text-text-3" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-4" aria-hidden="true" />
                )}
                {current ? 'Back in service' : 'Remove'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={item}
              disabled={!p.online}
              onClick={() => p.onOutOfOrder('create')}
            >
              <Wrench className="size-4 text-ro" aria-hidden="true" />
              Put out of order
            </button>
          )
        ) : null}
        {p.canAudit ? (
          <button type="button" className={item} onClick={p.onHistory}>
            <History className="size-4 text-text-3" aria-hidden="true" />
            History
          </button>
        ) : null}
      </div>
      {!p.online && chart.can.outOfOrder ? (
        <span className="px-1 text-sm text-text-3">Out of order needs a connection.</span>
      ) : null}
    </Popover>
  )
}
