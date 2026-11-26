// One night of one plan for one room type: the price (whole naira; the header says ₦ and excl.
// taxes), MIN / CTA / Closed tags, muted with a link for derived plans, locked before the business
// date. Own-price cells open an inline price field: Enter saves, Esc cancels.
import type { CalendarCell as Cell } from '@vento/shared'
import { Loader2, Lock } from 'lucide-react'
import { type KeyboardEvent, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { type Band, type CalendarRow, cellLabel, cellMarks, editable } from './calendar-model'
import { priceProblem } from './first-rate-model'
import { nairaDigits } from './format'

type Props = {
  typeName: string
  row: CalendarRow
  cell: Cell
  past: boolean
  canEdit: boolean
  // Roving focus: only one cell in the grid is a tab stop.
  tabStop: boolean
  selected: boolean
  pending: boolean
  editing: string | undefined
  coords?: { row: number; col: number }
  // The season over this night: its band says the date price and min stay, so the cell doesn't.
  season?: Band['season'] | undefined
  onActivate: () => void
  onEdit: (initial: string) => void
  // `refocus`: put focus back on the cell (Enter or Esc), not when the person clicked elsewhere.
  onCommit: (value: string, refocus: boolean) => void
  onCancel: (refocus: boolean) => void
  onNavigate?: (event: KeyboardEvent<HTMLElement>) => void
}

function Tag({ children, tone }: { children: string; tone?: 'rose' }) {
  return (
    <span
      className={cn(
        'rounded-[4px] px-1 text-[10px] leading-4 font-semibold tracking-wide',
        tone === 'rose' ? 'bg-ro-bg text-ro' : 'bg-surface-3 text-text-2',
      )}
    >
      {children}
    </span>
  )
}

export function CalendarCellView(props: Props) {
  const { row, cell, past, canEdit, selected, pending, editing, coords } = props
  const open = editable(row, past, canEdit)
  const derived = row.pricing === 'derived'
  const marks = cellMarks(cell, props.season)
  if (editing !== undefined) return <CellInput {...props} initial={editing} />
  return (
    <button
      type="button"
      tabIndex={props.tabStop ? 0 : -1}
      data-row={coords?.row}
      data-col={coords?.col}
      aria-label={cellLabel(props.typeName, row, cell, past)}
      aria-pressed={selected}
      aria-busy={pending || undefined}
      onClick={() =>
        open ? props.onEdit(nairaDigits(cell.price).replace(/,/g, '')) : props.onActivate()
      }
      onKeyDown={(event) => {
        if (open && /^\d$/.test(event.key)) {
          event.preventDefault()
          props.onEdit(event.key)
          return
        }
        props.onNavigate?.(event)
      }}
      // Arrow keys select as they move; a tap selects on click, so the line above the calendar
      // never grows under a finger mid-tap.
      onFocus={(event) => {
        if (event.currentTarget.matches(':focus-visible')) props.onActivate()
      }}
      className={cn(
        'relative flex min-h-12 w-full min-w-[84px] flex-col items-end justify-center gap-0.5 rounded-md border px-2 py-1 text-right',
        open
          ? 'cursor-text border-border bg-surface hover:border-pri-line'
          : 'border-transparent bg-surface-2/70 text-text-2',
        selected && 'ring-2 ring-pri-line',
        past && 'opacity-60',
      )}
    >
      {marks.dot && !derived ? (
        <span aria-hidden="true" className="absolute top-1 left-1.5 size-1.5 rounded-full bg-pri" />
      ) : null}
      <span className={cn('num flex items-center gap-1', !derived && 'font-medium text-text')}>
        {pending ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : null}
        {past ? <Lock className="size-3 text-text-3" aria-hidden="true" /> : null}
        {cell.closed ? (
          <span className="font-medium text-ro">Closed</span>
        ) : (
          nairaDigits(cell.price)
        )}
      </span>
      <span className="flex gap-0.5" aria-hidden="true">
        {cell.closedToArrival ? <Tag>CTA</Tag> : null}
        {marks.min ? <Tag>{`MIN ${marks.min}`}</Tag> : null}
      </span>
    </button>
  )
}

function CellInput(props: Props & { initial: string }) {
  const [value, setValue] = useState(props.initial)
  const [problem, setProblem] = useState<string>()
  // Enter saves and closes the field; the blur that follows mustn't save again.
  const done = useRef(false)
  function commit(refocus: boolean) {
    if (done.current) return true
    const found = priceProblem(value, true)
    if (found) {
      setProblem(found)
      toast.error(found, { id: 'cell-price' })
      return false
    }
    done.current = true
    props.onCommit(value, refocus)
    return true
  }
  return (
    <input
      // Opened by the person where they clicked: focus it without scrolling the grid.
      ref={(el) => el?.focus({ preventScroll: true })}
      inputMode="numeric"
      aria-label={`New price, ${cellLabel(props.typeName, props.row, props.cell, false)}`}
      aria-invalid={problem ? true : undefined}
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        setValue(event.target.value)
        setProblem(undefined)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit(true)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          done.current = true
          props.onCancel(true)
        }
      }}
      onBlur={() => {
        if (done.current) return
        // Typed something new: keep it (save); nothing typed: just close.
        if (value.replace(/,/g, '') === props.initial.replace(/,/g, '')) props.onCancel(false)
        else if (!commit(false)) props.onCancel(false)
      }}
      className={cn(
        'num h-12 w-full min-w-[84px] rounded-md border border-ring bg-surface px-2 text-right text-[16px] font-medium ring-3 ring-pri-line focus-visible:outline-none lg:text-base',
        problem && 'border-ro-dot ring-ro-bg',
      )}
    />
  )
}
