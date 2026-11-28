// Rooms left per night on the rate calendar (spec: stage-1-rooms-left.md). Coloured as on the tape
// chart's Available row (owner, 2026-11-28): sold out or overbooked in red, 1–2 in amber.
import type { CalendarLeft } from '@vento/shared'

export function leftTone(left: number): 'text-ro' | 'text-am' | 'text-text-2' {
  return left <= 0 ? 'text-ro' : left <= 2 ? 'text-am' : 'text-text-2'
}

// What the cell shows: "4", "0", or "−1" for an overbooked night.
export function leftFigure(left: number): string {
  return left < 0 ? `−${-left}` : String(left)
}

// In words, for phones, hover and screen readers: "4 left", "Sold out", "1 more booking than rooms".
export function leftWords(night: Pick<CalendarLeft, 'left' | 'outOfOrder'>): string {
  const { left, outOfOrder } = night
  const base =
    left < 0
      ? `${-left} more booking${left === -1 ? '' : 's'} than rooms`
      : left === 0
        ? 'Sold out'
        : `${left} left`
  return outOfOrder > 0 ? `${base}, ${outOfOrder} out of order` : base
}
