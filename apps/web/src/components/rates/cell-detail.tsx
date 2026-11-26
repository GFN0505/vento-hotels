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
    <div
      aria-live="polite"
      className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-surface px-4 py-2 text-text-2 shadow-card"
    >
      {type && row && cell ? (
        <>
          <p className="num grow">
            <span className="font-medium text-text">{cellSummary(type.name, row, cell)}</span>{' '}
            <span className="text-text-3">{row.pricesIncludeTaxes ? 'incl. taxes' : EXCL}</span>
            {row.parent ? (
              <span className="block text-sm text-text-3">
                Follows {row.parent.name}. Change {row.parent.name} to change it.
              </span>
            ) : past ? (
              <span className="block text-sm text-text-3">
                Before the business date. Past rates can't change.
              </span>
            ) : null}
          </p>
          {canEdit && editable(row, past, canEdit) ? (
            <Button
              size="sm"
              className="max-lg:h-11"
              onClick={() =>
                onChangeDate({ typeId: type.id, planId: row.ratePlanId, date: cell.date })
              }
            >
              <CalendarDays className="size-4" aria-hidden="true" />
              Change this date
            </Button>
          ) : null}
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <Info className="size-4 flex-none text-text-3" aria-hidden="true" />
          {canEdit
            ? 'Click a price to change it, or pick a night to see its details.'
            : 'Pick a night to see its price and conditions.'}
        </p>
      )}
    </div>
  )
}
