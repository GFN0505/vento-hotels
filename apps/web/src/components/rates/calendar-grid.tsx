// The rate calendar on wider screens (design #8, Rates tab): dates across, room types down with one
// row per plan under a Rooms left row, a sticky first column, season bands over the dates and Fri
// and Sat shaded. One tab stop for the grid; arrows move between price cells (Rooms left is read
// only and not in the way), Enter or a digit opens an own-price cell.
import type { CalendarLeft, RateCalendar, RatePlanView } from '@vento/shared'
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { CalendarCellView } from './calendar-cell'
import {
  type Band,
  bandLabel,
  type CellRef,
  moveCell,
  seasonBands,
  seasonByDate,
} from './calendar-model'
import { PlanLabel } from './calendar-plan-label'
import { dayName, formatRateDate } from './format'
import { leftFigure, leftTone, leftWords } from './rooms-left'
import type { CellEditing } from './use-cell-editing'

type Props = {
  calendar: RateCalendar
  plans: ReadonlyMap<string, RatePlanView>
  canEdit: boolean
  selected: CellRef | undefined
  editing: CellEditing
  onSelect: (ref: CellRef) => void
  // A season band opens Change dates on its range.
  onSeason?: ((from: string, to: string) => void) | undefined
}

const STICKY = 'sticky left-0 z-10 bg-surface'

export function CalendarGrid(props: Props) {
  const { calendar, plans, canEdit, selected, editing, onSelect, onSeason } = props
  const grid = useRef<HTMLDivElement>(null)
  const [stop, setStop] = useState({ row: 0, col: 0 })
  const dates = calendar.dates
  const bands = seasonBands(calendar)
  const seasons = seasonByDate(
    bands,
    dates.map((d) => d.date),
  )
  // A new page opens at its first night (the business date), not where the last one was scrolled.
  const first = dates[0]?.date
  useEffect(() => {
    if (first && grid.current) grid.current.scrollLeft = 0
  }, [first])
  const rows = calendar.roomTypes.flatMap((type) => type.rows.map((row) => ({ type, row })))
  const size = { rows: rows.length, cols: dates.length }
  const focusCell = (at: { row: number; col: number }) => {
    setStop(at)
    requestAnimationFrame(() => {
      const el = grid.current?.querySelector<HTMLElement>(
        `[data-row="${at.row}"][data-col="${at.col}"]`,
      )
      // Scroll only when the cell is out of view, and only as far as needed.
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
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
      // Its own scroll area, so the dates stay at the top while the room types scroll by.
      className="max-h-[calc(100dvh-13rem)] overflow-auto rounded-md border border-border bg-surface shadow-card"
    >
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Rooms left and prices per night, excl. taxes and service charge. Arrow keys move between
          nights and plans.
        </caption>
        <thead className="sticky top-0 z-20 bg-surface">
          {bands.some((b) => b.season) ? (
            <tr>
              <td className={cn(STICKY, 'z-30 border-b border-border')} />
              {bands.map((band) => (
                <td
                  key={band.key}
                  colSpan={band.span}
                  className="border-b border-border px-1 pt-2 pb-1"
                >
                  {band.season ? <SeasonBand season={band.season} onOpen={onSeason} /> : null}
                </td>
              ))}
            </tr>
          ) : null}
          <tr className="border-b border-border text-xs text-text-3">
            <th scope="col" className={cn(STICKY, 'z-30 w-56 min-w-48 px-4 py-2 font-medium')}>
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
                    d.weekend && 'bg-weekend text-pri-ink',
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
                  {d.weekend ? <span className="sr-only">, weekend</span> : null}
                  {today ? (
                    <span className="block text-[10px] font-semibold tracking-wide uppercase">
                      Tonight
                    </span>
                  ) : null}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {calendar.roomTypes.map((type) => (
            <TypeRows key={type.id} name={type.name} span={dates.length + 1}>
              <RoomsLeftRow left={type.left} weekend={dates.map((d) => d.weekend)} />
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
                        <td key={cell.date} className={cn('p-1', meta?.weekend && 'bg-weekend')}>
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
                            season={seasons.get(cell.date)}
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

// Rooms left per night for the type, as on the tape chart's Available row. Plain cells: the column
// header gives the date, the words give sold out, overbooked and out of order.
function RoomsLeftRow({ left, weekend }: { left: CalendarLeft[]; weekend: boolean[] }) {
  return (
    <tr className="border-b border-border">
      <th scope="row" className={cn(STICKY, 'px-4 py-1.5 text-sm font-normal text-text-3')}>
        Rooms left
      </th>
      {left.map((night, c) => {
        const words = leftWords(night)
        const plain = night.left > 0 && night.outOfOrder === 0
        return (
          <td
            key={night.date}
            title={plain ? undefined : words}
            className={cn(
              // relative: keeps the sr-only words inside the grid's scroll area, not the page's.
              'num relative px-1 py-1.5 text-center text-sm',
              leftTone(night.left),
              night.left <= 2 && 'font-semibold',
              weekend[c] && 'bg-weekend',
            )}
          >
            <span aria-hidden="true">{leftFigure(night.left)}</span>
            <span className="sr-only">{words}</span>
          </td>
        )
      })}
    </tr>
  )
}

// "Festive season · 18 Dec–2 Jan · min 2": opens Change dates on the season's dates for editors.
function SeasonBand({
  season,
  onOpen,
}: {
  season: NonNullable<Band['season']>
  onOpen: ((from: string, to: string) => void) | undefined
}) {
  const label = bandLabel(season)
  const style =
    'block w-full truncate rounded-[4px] bg-pri-soft px-2 py-0.5 text-left text-xs font-semibold text-pri-ink ring-1 ring-pri-line'
  if (!onOpen) {
    return (
      <span className={style} title={label}>
        {label}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={cn(style, 'hover:bg-pri-line/40')}
      title={`${label}. Change these dates`}
      aria-label={`${label}. Change these dates`}
      onClick={() => onOpen(season.from, season.to)}
    >
      {label}
    </button>
  )
}
