// Views, search (/ to focus) and filter pills over the Reservations list (DSComponents: "Table · the
// one list pattern"). No in-page hotel filter: the hotel switch is the only one. Room type only
// when one hotel is chosen.
import { useQuery } from '@tanstack/react-query'
import {
  RESERVATION_SOURCES,
  RESERVATION_STATUSES,
  SOURCE_LABELS,
  STATUS_LABELS,
} from '@vento/shared'
import { Search, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { OnReservationsSearch, ReservationsSearch } from './queries'

const VIEWS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'booked_today', label: 'Booked today' },
  { value: 'all', label: 'All' },
] as const

type Props = {
  search: ReservationsSearch
  onSearch: OnReservationsSearch
  propertyId: string | undefined
}

const PILL =
  'h-11 rounded-full border border-border-strong bg-surface px-3 text-sm font-medium text-text-2 hover:bg-surface-2 lg:h-8'
const PILL_ON = 'border-pri-line bg-pri-soft text-pri-ink'

function SelectPill({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | undefined
  options: readonly { value: string; label: string }[]
  onChange: (value: string | undefined) => void
}) {
  const chosen = options.find((option) => option.value === value)
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        className={cn(PILL, 'appearance-none pr-3', chosen && PILL_ON)}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {`${label}: ${option.label}`}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ReservationsToolbar({ search, onSearch, propertyId }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(search.q ?? '')
  const [arrivals, setArrivals] = useState(Boolean(search.arrivalFrom || search.arrivalTo))
  useEffect(() => setText(search.q ?? ''), [search.q])

  // Room types for the pill: read with the rates page's permission; hidden when not allowed.
  const overview = useQuery({
    ...orpc.ratePlans.overview.queryOptions({ input: { propertyId: propertyId ?? '' } }),
    enabled: propertyId !== undefined,
    retry: false,
  })

  // Search as you type, a moment after the last key.
  useEffect(() => {
    const next = text.trim() || undefined
    if (next === search.q) return
    const timer = setTimeout(() => onSearch({ q: next }), 250)
    return () => clearTimeout(timer)
  }, [text, search.q, onSearch])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key !== '/' || target?.closest('input, textarea, select, [contenteditable]')) return
      event.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const view = search.view ?? 'upcoming'
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="View"
          hideLabel
          value={view}
          options={VIEWS}
          onChange={(next) => onSearch({ view: next === 'upcoming' ? undefined : next })}
        />
        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3"
            aria-hidden="true"
          />
          <Input
            ref={input}
            type="search"
            aria-label="Search reservations"
            aria-keyshortcuts="/"
            placeholder="Search name, phone, email or booking no."
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="pr-9 pl-9"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-[4px] border border-border px-1.5 text-xs text-text-3 lg:block">
            /
          </kbd>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SelectPill
          label="Status"
          value={search.status}
          options={RESERVATION_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))}
          onChange={(status) => onSearch({ status: status as ReservationsSearch['status'] })}
        />
        {propertyId && overview.data ? (
          <SelectPill
            label="Room type"
            value={search.roomTypeId}
            options={overview.data.roomTypes.map((type) => ({ value: type.id, label: type.name }))}
            onChange={(roomTypeId) => onSearch({ roomTypeId })}
          />
        ) : null}
        <SelectPill
          label="How they booked"
          value={search.source}
          options={RESERVATION_SOURCES.map((value) => ({ value, label: SOURCE_LABELS[value] }))}
          onChange={(source) => onSearch({ source: source as ReservationsSearch['source'] })}
        />
        <Toggle
          on={arrivals || Boolean(search.arrivalFrom || search.arrivalTo)}
          onClick={() => {
            if (arrivals) onSearch({ arrivalFrom: undefined, arrivalTo: undefined })
            setArrivals(!arrivals)
          }}
        >
          Arrival dates
        </Toggle>
        <Toggle
          on={Boolean(search.depositDue)}
          onClick={() => onSearch({ depositDue: search.depositDue ? undefined : true })}
        >
          Deposit due
        </Toggle>
      </div>
      {arrivals ? (
        <div className="flex flex-wrap items-end gap-3">
          <label
            htmlFor="arrival-from"
            className="flex flex-col gap-1 text-sm font-medium text-text-2"
          >
            Arriving from
            <Input
              id="arrival-from"
              type="date"
              value={search.arrivalFrom ?? ''}
              onChange={(event) => onSearch({ arrivalFrom: event.target.value || undefined })}
            />
          </label>
          <label
            htmlFor="arrival-to"
            className="flex flex-col gap-1 text-sm font-medium text-text-2"
          >
            to
            <Input
              id="arrival-to"
              type="date"
              value={search.arrivalTo ?? ''}
              onChange={(event) => onSearch({ arrivalTo: event.target.value || undefined })}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(PILL, 'inline-flex items-center gap-1.5', on && PILL_ON)}
    >
      {children}
      {on ? <X className="size-3.5" aria-hidden="true" /> : null}
    </button>
  )
}
