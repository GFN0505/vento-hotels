// The rate calendar's controls. Phones get three short rows, so the first prices show without
// scrolling: paging and the date picker; the room type with Change dates; corporate plans and the
// key. Wider screens keep them on one line with 14 or 30 nights and the key written out.
import type { RatesOverview } from '@vento/shared'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
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
  // Phones: Change dates sits beside the room type.
  changeDates: ReactNode
  // The key: a popover on phones, a line of text on wider screens.
  legend: ReactNode
  onSearch: OnCalendarSearch
}

const control =
  'h-11 rounded-sm border border-input bg-surface px-2.5 text-[16px] text-text lg:h-8 lg:text-base focus:border-ring focus-visible:outline-none focus:ring-3 focus:ring-pri-line'

export function CalendarToolbar(props: Props) {
  const { overview, search, from, nights, phone, roomTypeId, onSearch } = props
  const businessDate = overview.property.businessDate
  const go = (date: string) => onSearch({ from: date === businessDate ? undefined : date })
  const paging = (
    <div className="flex min-w-0 items-center gap-1 max-md:w-full">
      <Button
        size="icon"
        aria-label={`Previous ${nights} nights`}
        onClick={() => go(pageFrom(from, nights, -1))}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Button>
      <Button
        className="max-lg:h-11 max-md:px-2.5"
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
      <label className="ml-1 flex min-w-0 grow items-center md:grow-0">
        <span className="sr-only">Go to date</span>
        <input
          type="date"
          className={cn(control, 'num w-full min-w-0 md:w-40')}
          value={from}
          max={overview.property.lastRateDate}
          onChange={(event) => event.target.value && go(event.target.value)}
        />
      </label>
    </div>
  )
  const roomType = (
    <label className="flex min-w-0 items-center max-md:grow">
      <span className="sr-only">Room type</span>
      <select
        className={cn(control, 'min-w-0 max-md:w-full')}
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
  )
  const corporate = (
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
  )
  if (phone) {
    return (
      <div className="flex flex-col gap-2">
        {paging}
        <div className="flex items-center gap-2">
          {roomType}
          {props.changeDates}
        </div>
        <div className="flex items-center justify-between gap-2">
          {corporate}
          {props.legend}
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {paging}
        <label className="flex items-center">
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
        {roomType}
        {corporate}
      </div>
      {props.legend}
    </div>
  )
}
