// The Tonight strip (the owner: "I can't tell which rooms are occupied"): on the business date, how
// many rooms are occupied (a guest checked in), arriving (a booking in the room, not in yet), vacant
// and out of order, and how many bookings over tonight have no room yet; the front desk lists show
// the same figures. Each filters the chart to those rooms; "not in a room yet" opens the lanes.
import { formatRateDate, type TapeChart } from '@vento/shared'
import { cn } from '@/lib/cn'
import { type Filters, tonightCounts } from './chart-model'

type Props = {
  chart: TapeChart
  date?: string
  filter?: Filters['tonight']
  onFilter?: (filter: Filters['tonight']) => void
  onUnassigned?: () => void
}

const DOT = {
  occupied: 'bg-house',
  arriving: 'bg-pri',
  vacant: 'bg-em-dot',
  out_of_order: 'bg-ro-dot',
  unassigned: 'bg-am-dot',
} as const

export function TonightStrip({
  chart,
  date = chart.hotel.businessDate,
  filter,
  onFilter,
  onUnassigned,
}: Props) {
  const counts = tonightCounts(chart, date)
  const items = [
    { key: 'occupied' as const, n: counts.occupied, words: 'occupied' },
    { key: 'arriving' as const, n: counts.arriving, words: 'arriving' },
    { key: 'vacant' as const, n: counts.vacant, words: 'vacant' },
    { key: 'out_of_order' as const, n: counts.outOfOrder, words: 'out of order' },
  ]
  const tonight = date === chart.hotel.businessDate
  return (
    <section
      aria-label={tonight ? 'Tonight' : `Night of ${formatRateDate(date, false)}`}
      className="flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-md border border-border bg-surface px-3 py-2 shadow-card"
    >
      <span className="mr-1 font-semibold">
        {tonight ? 'Tonight' : 'That night'} · {formatRateDate(date, false)}
      </span>
      {items.map((item) => {
        const on = filter === item.key
        const body = (
          <>
            <span aria-hidden="true" className={cn('size-2 rounded-full', DOT[item.key])} />
            <span className="num font-semibold">{item.n}</span> {item.words}
          </>
        )
        return onFilter ? (
          <button
            key={item.key}
            type="button"
            aria-pressed={on}
            onClick={() => onFilter(on ? undefined : item.key)}
            className={cn(
              'inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm lg:h-8',
              on
                ? 'border-pri-line bg-pri-soft text-pri-ink'
                : 'border-border-strong bg-surface hover:bg-surface-2',
            )}
          >
            {body}
          </button>
        ) : (
          <span key={item.key} className="inline-flex items-center gap-1.5 px-2 text-sm">
            {body}
          </span>
        )
      })}
      {counts.unassigned ? (
        onUnassigned ? (
          <button
            type="button"
            onClick={onUnassigned}
            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-sm hover:bg-surface-2 lg:h-8"
          >
            <span aria-hidden="true" className={cn('size-2 rounded-full', DOT.unassigned)} />
            <span className="num font-semibold">{counts.unassigned}</span> not in a room yet
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2 text-sm">
            <span aria-hidden="true" className={cn('size-2 rounded-full', DOT.unassigned)} />
            <span className="num font-semibold">{counts.unassigned}</span> not in a room yet
          </span>
        )
      ) : null}
    </section>
  )
}
