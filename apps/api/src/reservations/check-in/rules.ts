// When a stay can be checked in (spec: "Check-in"): a confirmed stay of a confirmed reservation
// arriving on the business date. Everything else says why not, in the spec's words.
import { clockAt, formatRateDate } from '@vento/shared'

export type CheckInCandidate = {
  status: string
  arrival: string
  checkedInAt: Date | null
  checkedInByName: string | null
}

export function checkInProblem(
  stay: CheckInCandidate,
  reservationStatus: string,
  hotel: { businessDate: string; timeZone: string },
): { code: string; message: string } | null {
  if (stay.status === 'checked_in') {
    const at = stay.checkedInAt ? clockAt(stay.checkedInAt, hotel.timeZone) : ''
    return {
      code: 'ALREADY_CHECKED_IN',
      message: `Checked in by ${stay.checkedInByName ?? 'someone'} at ${at}.`,
    }
  }
  if (reservationStatus === 'cancelled' || stay.status === 'cancelled') {
    return { code: 'NOT_CHECKABLE', message: 'This booking was cancelled.' }
  }
  if (reservationStatus === 'no_show' || stay.status === 'no_show') {
    return { code: 'NOT_CHECKABLE', message: 'This booking was marked no-show.' }
  }
  if (stay.status !== 'confirmed') return { code: 'NOT_CHECKABLE', message: 'This stay has ended.' }
  if (stay.arrival > hotel.businessDate) {
    return {
      code: 'NOT_ARRIVING_TODAY',
      message: `Arrives ${formatRateDate(stay.arrival)}. Check-in opens on the arrival day.`,
    }
  }
  if (stay.arrival < hotel.businessDate) {
    return {
      code: 'ARRIVAL_PASSED',
      message: `Arrival was ${formatRateDate(stay.arrival)}. Mark it as a no-show.`,
    }
  }
  return null
}

// Undo is the checker's own, within 8 seconds (plus a grace for a slow connection).
export const UNDO_WINDOW_MS = (8 + 30) * 1000
