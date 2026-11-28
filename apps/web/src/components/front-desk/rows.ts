// How a front desk row reads (spec: "Front desk lists"): the Ready column and the Stay column.
import { type FrontDeskRow, rangeLabel } from '@vento/shared'

type Tone = 'emerald' | 'amber' | 'rose' | 'slate'

export function readinessOf(row: Pick<FrontDeskRow, 'readiness' | 'readinessText' | 'room'>): {
  words: string
  tone: Tone
} | null {
  switch (row.readiness) {
    case 'inspected':
      return { words: 'Inspected', tone: 'emerald' }
    case 'clean':
      return { words: 'Clean', tone: 'emerald' }
    case 'dirty':
      return { words: 'Dirty', tone: 'amber' }
    case 'due_out':
      return { words: row.readinessText ?? 'Due out', tone: 'amber' }
    case 'out_of_order':
      return { words: row.readinessText ?? 'Out of order', tone: 'rose' }
    default:
      return null
  }
}

// "25–27 Nov · 2 nights · 2 adults, 1 child"
export function stayWords(
  row: Pick<FrontDeskRow, 'arrival' | 'departure' | 'nights' | 'adults' | 'children'>,
): string {
  const party = [
    `${row.adults} ${row.adults === 1 ? 'adult' : 'adults'}`,
    ...(row.children ? [`${row.children} ${row.children === 1 ? 'child' : 'children'}`] : []),
  ].join(', ')
  return `${rangeLabel(row.arrival, row.departure)} · ${row.nights === 1 ? '1 night' : `${row.nights} nights`} · ${party}`
}
