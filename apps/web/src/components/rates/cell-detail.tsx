// The line under the toolbar for the chosen cell, what a front desk agent reads to a caller:
// "Deluxe King · Bed & breakfast · Sat 5 Dec · ₦183,000 excl. taxes and service charge · min stay 2".
// With rates.edit, "Change this date" opens Change dates on that night (restrictions included).
import type { RateCalendar } from '@vento/shared'
import { CalendarDays, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type CellRef, cellSummary, editable } from './calendar-model'
import { EXCL } from './format'

type Props = {
  calendar: RateCalendar
  selected: CellRef | undefined
  canEdit: boolean
  onChangeDate: (ref: CellRef) => void
}

export function CellDetail({ calendar, selected, canEdit, onChangeDate }: Props) {
  const type = calendar.roomTypes.find((t) => t.id === selected?.typeId)
  const row = type?.rows.find((r) => r.ratePlanId === selected?.planId)
  const index = calendar.dates.findIndex((d) => d.date === selected?.date)
  const cell = row?.cells[index]
  const past = calendar.dates[index]?.past ?? false
  return (
    // A fixed height, so picking a night never moves the calendar under the pointer.
    <div
      aria-live="polite"
      className="flex h-[4.75rem] items-center gap-3 overflow-hidden rounded-md border border-border bg-surface px-4 text-text-2 shadow-card lg:h-16"
    >
      {type && row && cell ? (
        <>
          <div className="num min-w-0 grow">
            <p className="line-clamp-2">
              <span className="font-medium text-text">{cellSummary(type.name, row, cell)}</span>{' '}
              <span className="text-text-3">{row.pricesIncludeTaxes ? 'incl. taxes' : EXCL}</span>
            </p>
            {row.parent || past ? (
              <p className="truncate text-sm text-text-3 max-lg:hidden">
                {row.parent
                  ? `Follows ${row.parent.name}. Change ${row.parent.name} to change it.`
                  : "Before the business date. Past rates can't change."}
              </p>
            ) : null}
          </div>
          {canEdit && editable(row, past, canEdit) ? (
            <Button
              size="sm"
              className="flex-none max-lg:size-11 max-lg:p-0"
              aria-label="Change this date"
              onClick={() =>
                onChangeDate({ typeId: type.id, planId: row.ratePlanId, date: cell.date })
              }
            >
              <CalendarDays className="size-4" aria-hidden="true" />
              <span className="max-lg:hidden">Change this date</span>
            </Button>
          ) : null}
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <Info className="size-4 flex-none text-text-3" aria-hidden="true" />
          <span className="lg:hidden">
            {canEdit ? 'Tap a price to change it.' : 'Tap a price to see it in words.'}
          </span>
          <span className="max-lg:hidden">
            {canEdit
              ? 'Click a price to change it, or pick a night to see its details.'
              : 'Pick a night to see its price and conditions.'}
          </span>
        </p>
      )}
    </div>
  )
}
