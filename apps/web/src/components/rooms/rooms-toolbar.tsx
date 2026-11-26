// Search by number, the quick views (All, Out of order, Accessible, Archived) with counts, and
// type and floor pickers. Every choice goes into the URL.
import type { RoomsSummary, RoomTypeView } from '@vento/shared'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { floorName } from './format'
import type { RoomsSearch, RoomsView } from './rooms-search'

type Props = {
  search: RoomsSearch
  summary: RoomsSummary | undefined
  types: readonly RoomTypeView[]
  onSearch: (patch: Partial<RoomsSearch>) => void
}

const selectClass =
  'h-11 min-w-0 rounded-sm border border-input bg-surface px-2.5 text-[16px] text-text focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none lg:h-8 lg:text-base'

export function RoomsToolbar({ search, summary, types, onSearch }: Props) {
  const [text, setText] = useState(search.q ?? '')
  // Searching waits for a pause in typing, so the table doesn't flicker on every key.
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = text.trim() || undefined
      if (q !== search.q) onSearch({ q })
    }, 250)
    return () => clearTimeout(timer)
  }, [text, search.q, onSearch])
  useEffect(() => {
    if (!search.q) setText('')
  }, [search.q])

  const views: { value: RoomsView | undefined; label: string; count: number | undefined }[] = [
    { value: undefined, label: 'All', count: summary?.active },
    { value: 'ooo', label: 'Out of order', count: summary?.outOfOrder },
    { value: 'accessible', label: 'Accessible', count: summary?.accessible },
    { value: 'archived', label: 'Archived', count: summary?.archived },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
      <label className="relative flex min-w-0 grow basis-44 items-center sm:max-w-52">
        <span className="sr-only">Room number</span>
        <Search
          className="pointer-events-none absolute left-2.5 size-4 text-text-3"
          aria-hidden="true"
        />
        <input
          type="search"
          value={text}
          inputMode="search"
          autoCapitalize="characters"
          onChange={(event) => setText(event.target.value)}
          placeholder="Room number"
          className="h-11 w-full rounded-sm border border-input bg-surface pr-2.5 pl-8 text-[16px] text-text placeholder:text-text-3 focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none lg:h-8 lg:text-base"
        />
      </label>
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Show</legend>
        {views.map((view) => {
          const on = search.show === view.value
          return (
            <button
              key={view.label}
              type="button"
              aria-pressed={on}
              onClick={() => onSearch({ show: view.value })}
              className={cn(
                'inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium lg:h-7',
                on
                  ? 'border-pri bg-pri-soft text-pri-ink'
                  : 'border-border-strong bg-surface text-text-2 hover:bg-surface-2',
              )}
            >
              {view.label}
              {view.count !== undefined ? (
                <span className={cn('num text-xs', on ? 'text-pri-ink' : 'text-text-3')}>
                  {view.count}
                </span>
              ) : null}
            </button>
          )
        })}
      </fieldset>
      <div className="flex grow flex-wrap justify-end gap-2">
        <select
          aria-label="Room type"
          value={search.type ?? ''}
          onChange={(event) => onSearch({ type: event.target.value || undefined })}
          className={cn(selectClass, 'max-sm:grow')}
        >
          <option value="">All types</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Floor"
          value={search.floor ?? ''}
          onChange={(event) =>
            onSearch({ floor: event.target.value === '' ? undefined : Number(event.target.value) })
          }
          className={cn(selectClass, 'max-sm:grow')}
        >
          <option value="">All floors</option>
          {(summary?.floors ?? []).map((floor) => (
            <option key={floor} value={floor}>
              {floorName(floor)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
