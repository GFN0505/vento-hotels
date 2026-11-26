// The rate calendar's pure parts (design #8, Rates tab): what each cell says to a screen reader,
// the season bands over the dates, arrow-key moves between cells, and paging by nights.
import { addDays, type CalendarCell, type CalendarDate, type RateCalendar } from '@vento/shared'
import { formatNaira, formatRateDate, shortDate } from './format'

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

export type Band = {
  key: string
  span: number
  // The season over these dates (its whole range, which may run past the view), or a gap.
  season: { name: string; from: CalendarDate; to: CalendarDate; minStay: number | null } | null
}

// The min stay every own-price cell in the season shares, or null when they differ or have none.
function seasonMinStay(
  calendar: RateCalendar,
  from: CalendarDate,
  to: CalendarDate,
): number | null {
  const values = new Set<number | null>()
  for (const type of calendar.roomTypes) {
    for (const row of type.rows) {
      if (row.pricing !== 'own') continue
      for (const cell of row.cells) {
        if (cell.date >= from && cell.date <= to) values.add(cell.dateMinStay)
      }
    }
  }
  const [only] = [...values]
  return values.size === 1 && typeof only === 'number' && only > 1 ? only : null
}

// Runs of dates under the same season, for one header row of colSpans.
export function seasonBands(calendar: RateCalendar): Band[] {
  const bands: Band[] = []
  for (const { date } of calendar.dates) {
    const found = calendar.seasons.find((s) => s.from <= date && date <= s.to)
    const last = bands.at(-1)
    if (last && last.season?.name === found?.name && last.season?.from === found?.from) {
      last.span += 1
      continue
    }
    bands.push({
      key: `${date}-${found?.name ?? ''}`,
      span: 1,
      season: found ? { ...found, minStay: seasonMinStay(calendar, found.from, found.to) } : null,
    })
  }
  return bands
}

// "Festive season · 18 Dec–2 Jan · min 2".
export function bandLabel(season: NonNullable<Band['season']>): string {
  const range = `${formatRateDate(season.from, false)}–${formatRateDate(season.to, false)}`
  return [season.name, range, season.minStay ? `min ${season.minStay}` : null]
    .filter(Boolean)
    .join(' · ')
}

// What a cell marks on its own: the dot for a date price outside any season (inside one, the band
// says it), and MIN only when it differs from the season's (or is above 1 outside one).
export function cellMarks(cell: CalendarCell, season: Band['season'] | undefined) {
  return {
    dot: cell.from === 'date' && !season,
    min: cell.minStay > 1 && cell.minStay !== (season?.minStay ?? 1) ? cell.minStay : null,
  }
}

// The season (if any) over each date in view.
export function seasonByDate(bands: readonly Band[], dates: readonly CalendarDate[]) {
  const out = new Map<CalendarDate, Band['season']>()
  let i = 0
  for (const band of bands) {
    for (let n = 0; n < band.span; n++) {
      const date = dates[i++]
      if (date) out.set(date, band.season)
    }
  }
  return out
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
