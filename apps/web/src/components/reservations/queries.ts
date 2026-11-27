// The Reservations list's URL state and query, shared by the route, the page and the booking sheet
// (which refreshes the list after a booking).
import type { ReservationSource, ReservationStatus } from '@vento/shared'

export const PAGE_SIZE = 50

export type ReservationsSearch = {
  view?: 'booked_today' | 'all' | undefined
  q?: string | undefined
  status?: ReservationStatus | undefined
  roomTypeId?: string | undefined
  source?: ReservationSource | undefined
  arrivalFrom?: string | undefined
  arrivalTo?: string | undefined
  depositDue?: boolean | undefined
  page?: number | undefined
  sheet?: 'new' | undefined
  // With the sheet: the approval request whose booking reopens at Review ("Continue booking").
  approval?: string | undefined
}

export type OnReservationsSearch = (
  patch: Partial<ReservationsSearch>,
  options?: { push?: boolean },
) => void

export const FILTER_KEYS = [
  'status',
  'roomTypeId',
  'source',
  'arrivalFrom',
  'arrivalTo',
  'depositDue',
] as const

export const hasFilters = (search: ReservationsSearch) =>
  FILTER_KEYS.some((key) => search[key] !== undefined)

export const NO_FILTERS = Object.fromEntries(
  FILTER_KEYS.map((key) => [key, undefined]),
) as Partial<ReservationsSearch>

// The oRPC paths a new booking changes.
export const RESERVATION_KEYS = [['reservations'], ['properties']] as const

export const NEEDS_LIVE = 'Needs a connection to check live availability'
