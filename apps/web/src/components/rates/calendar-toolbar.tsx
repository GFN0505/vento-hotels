// The rate calendar's controls: page by the nights shown, back to the business date, go to a date,
// 14 or 30 nights, one room type (always one on phones) and corporate plans (hidden by default).
import type { RatesOverview } from '@vento/shared'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { pageFrom } from './calendar-model'
import type { CalendarSearch, OnCalendarSearch } from './calendar-search'

type Props = {
  overview: RatesOverview
  search: CalendarSearch
  from: string
  nights: number
  phone: boolean
  roomTypeId: string | undefined
  onSearch: OnCalendarSearch
}

const control =
  'h-11 rounded-sm border border-input bg-surface px-2.5 text-[16px] text-text lg:h-8 lg:text-base focus:border-ring focus-visible:outline-none focus:ring-3 focus:ring-pri-line'

export function CalendarToolbar({
  overview,
  search,
  from,
  nights,
  phone,
  roomTypeId,
  onSearch,
}: Props) {
  const businessDate = overview.property.businessDate
  const go = (date: string) => onSearch({ from: date === businessDate ? undefined : date })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          aria-label={`Previous ${nights} nights`}
          onClick={() => go(pageFrom(from, nights, -1))}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <Button
          className="max-lg:h-11"
          disabled={from === businessDate}
          onClick={() => go(businessDate)}
        >
          Business date
        </Button>
        <Button
          size="icon"
          aria-label={`Next ${nights} nights`}
          onClick={() => go(pageFrom(from, nights, 1))}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm text-text-2">
        <span className="sr-only">Go to date</span>
        <input
          type="date"
          className={cn(control, 'num w-40')}
          value={from}
          max={overview.property.lastRateDate}
          onChange={(event) => event.target.value && go(event.target.value)}
        />
      </label>
      {phone ? null : (
        <label className="flex items-center gap-2">
          <span className="sr-only">Nights shown</span>
          <select
            className={control}
            value={nights}
            onChange={(event) => onSearch({ nights: event.target.value === '30' ? 30 : undefined })}
          >
            <option value="14">14 nights</option>
            <option value="30">30 nights</option>
          </select>
        </label>
      )}
      <label className="flex min-w-0 items-center gap-2 max-sm:grow">
        <span className="sr-only">Room type</span>
        <select
          className={cn(control, 'min-w-0 max-sm:w-full')}
          value={roomTypeId ?? ''}
          onChange={(event) => onSearch({ type: event.target.value || undefined })}
        >
          {phone ? null : <option value="">All room types</option>}
          {overview.roomTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        aria-pressed={Boolean(search.corporate)}
        onClick={() => onSearch({ corporate: search.corporate ? undefined : true })}
        className={cn(
          'inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium lg:h-8',
          search.corporate
            ? 'border-pri-line bg-pri-soft text-pri-ink'
            : 'border-border text-text-2 hover:bg-surface-2',
        )}
      >
        Corporate plans
      </button>
    </div>
  )
}
