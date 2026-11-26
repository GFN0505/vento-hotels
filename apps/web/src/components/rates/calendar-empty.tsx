// The calendar with no plans to show: none yet, or none matching the filters.
import { Button } from '@/components/ui/button'

export function CalendarEmpty({
  filtered,
  corporate,
  onClear,
}: {
  filtered: boolean
  corporate: boolean
  onClear: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-12 text-center shadow-card">
      <p className="max-w-sm text-text-2">
        {filtered || corporate
          ? 'No rate plans match these filters.'
          : 'No rate plans yet. A rate plan sets the price and conditions for a room type.'}
      </p>
      {filtered || corporate ? (
        <Button className="max-lg:h-11" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}
