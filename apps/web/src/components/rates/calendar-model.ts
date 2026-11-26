// The rate calendar's pure parts (design #8, Rates tab): what each cell says to a screen reader,
// the season bands over the dates, arrow-key moves between cells, and paging by nights.
import { addDays, type CalendarCell, type CalendarDate, type RateCalendar } from '@vento/shared'
import { formatNaira, shortDate } from './format'

export type CalendarRow = RateCalendar['roomTypes'][number]['rows'][number]
export type CellRef = { typeId: string; planId: string; date: CalendarDate }

// "Deluxe King, Best available, Fri 27 Nov, ₦150,000, closed to arrival, min stay 2 nights".
export function cellLabel(
  typeName: string,
  row: CalendarRow,
  cell: CalendarCell,
  past: boolean,
): string {
  const parts = [typeName, row.name, shortDate(cell.date), formatNaira(cell.price)]
  if (cell.closed) parts.push('closed')
  if (cell.closedToArrival) parts.push('closed to arrival')
  if (cell.minStay > 1) parts.push(`min stay ${cell.minStay} nights`)
  if (cell.seasonName) parts.push(cell.seasonName)
  if (row.parent) parts.push(`follows ${row.parent.name}`)
  if (past) parts.push('past date')
  return parts.join(', ')
}

// Whether this cell can be typed into: own prices, not in the past, and the person may edit.
export function editable(row: CalendarRow, past: boolean, canEdit: boolean): boolean {
  return canEdit && !past && row.pricing === 'own'
}

export type Band = { key: string; name: string | null; span: number }

// Runs of dates under the same season name, for one header row of colSpans.
export function seasonBands(
  dates: readonly CalendarDate[],
  seasons: RateCalendar['seasons'],
): Band[] {
  const bands: Band[] = []
  for (const date of dates) {
    const name = seasons.find((s) => s.from <= date && date <= s.to)?.name ?? null
    const last = bands.at(-1)
    if (last && last.name === name) last.span += 1
    else bands.push({ key: `${date}-${name ?? ''}`, name, span: 1 })
  }
  return bands
}

// Arrow keys, Home and End move one cell (rows run down all room types, columns across dates).
export function moveCell(
  key: string,
  at: { row: number; col: number },
  size: { rows: number; cols: number },
): { row: number; col: number } | null {
  const clamp = (n: number, max: number) => Math.max(0, Math.min(max - 1, n))
  switch (key) {
    case 'ArrowRight':
      return { row: at.row, col: clamp(at.col + 1, size.cols) }
    case 'ArrowLeft':
      return { row: at.row, col: clamp(at.col - 1, size.cols) }
    case 'ArrowDown':
      return { row: clamp(at.row + 1, size.rows), col: at.col }
    case 'ArrowUp':
      return { row: clamp(at.row - 1, size.rows), col: at.col }
    case 'Home':
      return { row: at.row, col: 0 }
    case 'End':
      return { row: at.row, col: size.cols - 1 }
    default:
      return null
  }
}

// The first night of the next or previous page.
export function pageFrom(from: CalendarDate, nights: number, direction: 1 | -1): CalendarDate {
  return addDays(from, nights * direction)
}

// What one cell says on the detail line a front desk agent reads to a caller.
export function cellSummary(typeName: string, row: CalendarRow, cell: CalendarCell): string {
  const parts = [typeName, row.name, shortDate(cell.date), formatNaira(cell.price)]
  const tags: string[] = []
  if (cell.closed) tags.push('closed')
  if (cell.closedToArrival) tags.push('closed to arrival')
  if (cell.minStay > 1) tags.push(`min stay ${cell.minStay}`)
  return [...parts, ...tags].join(' · ')
}
