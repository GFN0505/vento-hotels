// The hotel's business date, never editable here (decision 0006: only night audit moves it).
import type { Property } from '@vento/shared'
import { CalendarClock } from 'lucide-react'
import { dateLabel, dayLabel } from './format'

export function BusinessDatePanel({ hotel }: { hotel: Property }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-border bg-surface-2 px-3.5 py-3">
      <CalendarClock className="size-4 flex-none text-text-3" aria-hidden="true" />
      {hotel.liveSince ? (
        <div className="flex min-w-0 grow flex-col">
          <span className="num font-medium">
            Current business date: {dayLabel(hotel.businessDate)}
          </span>
          <span className="num text-sm text-text-2">Live since {dateLabel(hotel.liveSince)}</span>
        </div>
      ) : (
        <div className="flex min-w-0 grow flex-col">
          <span className="num font-medium">Business date {dateLabel(hotel.businessDate)}</span>
          <span className="text-sm text-text-2">
            No night audit yet. The first one makes this hotel live.
          </span>
        </div>
      )}
      <span className="text-sm text-text-2">Only night audit moves this date</span>
    </div>
  )
}
