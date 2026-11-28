// The rate calendar below md (spec: "one room type at a time, a list of dates with each plan's
// price and tags"): one card per night, Fri and Sat and seasons marked, the type's rooms left in the
// heading, every plan's price in it.
import type { RateCalendar, RatePlanView } from '@vento/shared'
import { cn } from '@/lib/cn'
import { CalendarCellView } from './calendar-cell'
import { bandLabel, type CellRef, seasonBands, seasonByDate } from './calendar-model'
import { PlanLabel } from './calendar-plan-label'
import { shortDate } from './format'
import { leftTone, leftWords } from './rooms-left'
import type { CellEditing } from './use-cell-editing'

type Props = {
  calendar: RateCalendar
  plans: ReadonlyMap<string, RatePlanView>
  canEdit: boolean
  selected: CellRef | undefined
  editing: CellEditing
  onSelect: (ref: CellRef) => void
}

export function CalendarPhone({ calendar, plans, canEdit, selected, editing, onSelect }: Props) {
  const type = calendar.roomTypes[0]
  if (!type) return null
  const seasons = seasonByDate(
    seasonBands(calendar),
    calendar.dates.map((d) => d.date),
  )
  return (
    <ol className="flex flex-col gap-3" aria-label={`${type.name}, night by night`}>
      {calendar.dates.map((d, c) => {
        const season = seasons.get(d.date)
        const left = type.left[c]
        return (
          <li
            key={d.date}
            className={cn(
              'overflow-hidden rounded-md border border-border bg-surface shadow-card',
              d.weekend && 'border-l-4 border-l-pri-line',
            )}
          >
            <h3
              className={cn(
                'flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 font-semibold',
                d.weekend ? 'bg-weekend' : 'bg-surface-2/60',
              )}
            >
              <span className="num">{shortDate(d.date)}</span>
              {d.date === calendar.businessDate ? (
                <span className="text-sm font-medium text-pri-ink">Business date</span>
              ) : null}
              {d.weekend ? <span className="text-sm font-normal text-text-2">Weekend</span> : null}
              {left ? (
                <span
                  className={cn(
                    'num text-sm',
                    leftTone(left.left),
                    left.left > 2 ? 'font-normal' : 'font-semibold',
                  )}
                >
                  {leftWords(left)}
                </span>
              ) : null}
              {season ? (
                <span className="ml-auto rounded-[4px] bg-pri-soft px-2 py-0.5 text-xs font-semibold text-pri-ink">
                  {bandLabel(season)}
                </span>
              ) : null}
            </h3>
            <ul className="divide-y divide-border">
              {type.rows.map((row) => {
                const cell = row.cells[c]
                if (!cell) return null
                const ref = { typeId: type.id, planId: row.ratePlanId, date: d.date }
                return (
                  <li
                    key={row.ratePlanId}
                    className="grid grid-cols-[minmax(0,1fr)_116px] items-center gap-3 px-4 py-1.5"
                  >
                    <PlanLabel row={row} plan={plans.get(row.ratePlanId)} />
                    <CalendarCellView
                      typeName={type.name}
                      row={row}
                      cell={cell}
                      past={d.past}
                      season={season}
                      canEdit={canEdit}
                      tabStop
                      selected={selected?.planId === row.ratePlanId && selected.date === d.date}
                      pending={editing.isPending(ref)}
                      editing={editing.editingValue(ref)}
                      onActivate={() => onSelect(ref)}
                      onEdit={(initial) => {
                        onSelect(ref)
                        editing.start(ref, initial)
                      }}
                      onCommit={(value) => editing.commit(ref, type.name, value)}
                      onCancel={() => editing.cancel()}
                    />
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ol>
  )
}
