// The rate calendar on wider screens (design #8, Rates tab): dates across, room types down with one
// row per plan, a sticky first column, season bands over the dates and Fri and Sat shaded. One tab
// stop for the grid; arrows move between cells, Enter or a digit opens an own-price cell.
import type { RateCalendar, RatePlanView } from '@vento/shared'
import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { CalendarCellView } from './calendar-cell'
import { type CellRef, moveCell, seasonBands } from './calendar-model'
import { PlanLabel } from './calendar-plan-label'
import { dayName, formatRateDate } from './format'
import type { CellEditing } from './use-cell-editing'

type Props = {
  calendar: RateCalendar
  plans: ReadonlyMap<string, RatePlanView>
  canEdit: boolean
  selected: CellRef | undefined
  editing: CellEditing
  onSelect: (ref: CellRef) => void
}

const STICKY = 'sticky left-0 z-10 bg-surface'

export function CalendarGrid({ calendar, plans, canEdit, selected, editing, onSelect }: Props) {
  const grid = useRef<HTMLDivElement>(null)
  const [stop, setStop] = useState({ row: 0, col: 0 })
  const dates = calendar.dates
  const bands = seasonBands(
    dates.map((d) => d.date),
    calendar.seasons,
  )
  const rows = calendar.roomTypes.flatMap((type) => type.rows.map((row) => ({ type, row })))
  const size = { rows: rows.length, cols: dates.length }
  const focusCell = (at: { row: number; col: number }) => {
    setStop(at)
    requestAnimationFrame(() =>
      grid.current
        ?.querySelector<HTMLElement>(`[data-row="${at.row}"][data-col="${at.col}"]`)
        ?.focus(),
    )
  }
  function navigate(event: KeyboardEvent<HTMLElement>, at: { row: number; col: number }) {
    const next = moveCell(event.key, at, size)
    if (!next) return
    event.preventDefault()
    focusCell(next)
  }
  let index = -1
  return (
    <div
      ref={grid}
      className="overflow-x-auto rounded-md border border-border bg-surface shadow-card"
    >
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Prices per night, excl. taxes and service charge. Arrow keys move between nights and
          plans.
        </caption>
        <thead>
          {bands.some((b) => b.name) ? (
            <tr>
              <td className={cn(STICKY, 'border-b border-border')} />
              {bands.map((band) => (
                <td
                  key={band.key}
                  colSpan={band.span}
                  className="border-b border-border px-1 pt-2 pb-1"
                >
                  {band.name ? (
                    <span
                      className="block truncate rounded-[4px] bg-pri-soft px-2 py-0.5 text-xs font-semibold text-pri-ink ring-1 ring-pri-line"
                      title={band.name}
                    >
                      {band.name}
                    </span>
                  ) : null}
                </td>
              ))}
            </tr>
          ) : null}
          <tr className="border-b border-border text-xs text-text-3">
            <th scope="col" className={cn(STICKY, 'w-56 min-w-48 px-4 py-2 font-medium')}>
              Room type · plan
            </th>
            {dates.map((d) => {
              const today = d.date === calendar.businessDate
              return (
                <th
                  key={d.date}
                  scope="col"
                  className={cn(
                    'px-1 py-2 text-center font-medium',
                    d.weekend && 'bg-surface-2',
                    today && 'text-pri-ink',
                  )}
                >
                  {dayName(d.date)}
                  <span
                    className={cn(
                      'num block text-[13px] text-text',
                      today && 'font-semibold text-pri-ink',
                    )}
                  >
                    {formatRateDate(d.date, false)}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {calendar.roomTypes.map((type) => (
            <TypeRows key={type.id} name={type.name} span={dates.length + 1}>
              {type.rows.map((row) => {
                index += 1
                const r = index
                return (
                  <tr key={row.ratePlanId} className="border-b border-border last:border-0">
                    <th scope="row" className={cn(STICKY, 'max-w-56 px-4 py-1.5 font-normal')}>
                      <PlanLabel row={row} plan={plans.get(row.ratePlanId)} />
                    </th>
                    {row.cells.map((cell, c) => {
                      const ref = { typeId: type.id, planId: row.ratePlanId, date: cell.date }
                      const meta = dates[c]
                      return (
                        <td
                          key={cell.date}
                          className={cn('p-1', meta?.weekend && 'bg-surface-2/60')}
                        >
                          <CalendarCellView
                            typeName={type.name}
                            row={row}
                            cell={cell}
                            past={meta?.past ?? false}
                            canEdit={canEdit}
                            tabStop={stop.row === r && stop.col === c}
                            selected={
                              selected?.typeId === type.id &&
                              selected.planId === row.ratePlanId &&
                              selected.date === cell.date
                            }
                            pending={editing.isPending(ref)}
                            editing={editing.editingValue(ref)}
                            coords={{ row: r, col: c }}
                            onActivate={() => {
                              setStop({ row: r, col: c })
                              onSelect(ref)
                            }}
                            onEdit={(initial) => {
                              onSelect(ref)
                              editing.start(ref, initial)
                            }}
                            onCommit={(value, refocus) => {
                              editing.commit(ref, type.name, value)
                              if (refocus) focusCell({ row: r, col: c })
                            }}
                            onCancel={(refocus) => {
                              editing.cancel()
                              if (refocus) focusCell({ row: r, col: c })
                            }}
                            onNavigate={(event) => navigate(event, { row: r, col: c })}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </TypeRows>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TypeRows({ name, span, children }: { name: string; span: number; children: ReactNode }) {
  return (
    <>
      <tr className="border-b border-border bg-surface-2">
        <th scope="rowgroup" colSpan={span} className="px-0 py-2 text-left font-semibold">
          <span className="sticky left-0 px-4">{name}</span>
        </th>
      </tr>
      {children}
    </>
  )
}
