// Errors for out of order, with the spec's wording (stage-1-tape-chart.md, "UI copy") and a
// `data.code` the web app reacts to (ROOM_MOVE_ERROR_CODES in @vento/shared).
import { ORPCError } from '@orpc/server'
import { formatRateDate, OOO_MAX_NIGHTS, rangeLabel } from '@vento/shared'

const make = (
  status: 'BAD_REQUEST' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND',
  code: string,
  message: string,
  data: Record<string, unknown> = {},
) => new ORPCError(status, { message, data: { code, ...data } })

export const OOO_ONLY =
  'Only a GM or housekeeping supervisor can put a room out of order. Ask your GM.'

export const periodNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that out-of-order period" })

// "Room 503 has Emeka Kalu on 25–27 Nov. Move the booking first."
export const roomHasBookings = (
  number: string,
  stays: { stayId: string; guestName: string; arrival: string; departure: string }[],
) => {
  const first = stays[0]
  const more = stays.length > 1 ? ` and ${stays.length - 1} more` : ''
  return make(
    'CONFLICT',
    'OOO_ROOM_HAS_BOOKINGS',
    first
      ? `Room ${number} has ${first.guestName} on ${rangeLabel(first.arrival, first.departure)}${more}. Move the booking first.`
      : `Room ${number} has a booking on those nights. Move it first.`,
    { stays },
  )
}

// "Executive King would be 1 room short on 26 Nov. Move or cancel a booking of that type, or
// choose other dates."
export const wouldOverbook = (typeName: string, roomTypeId: string, date: string, short: number) =>
  make(
    'CONFLICT',
    'OOO_WOULD_OVERBOOK',
    `${typeName} would be ${short} ${short === 1 ? 'room' : 'rooms'} short on ${formatRateDate(date, false)}. Move or cancel a booking of that type, or choose other dates.`,
    { date, short, roomTypeId },
  )

// "503 is already out of order 26–28 Nov. Change those dates instead."
export const overlaps = (number: string, from: string, to: string) =>
  make(
    'CONFLICT',
    'OOO_OVERLAPS',
    `${number} is already out of order ${rangeLabel(from, to)}. Change those dates instead.`,
    { from, backInService: to },
  )

export const pastDate = (businessDate: string) =>
  make(
    'BAD_REQUEST',
    'OOO_PAST_DATE',
    `Out of order can start on ${formatRateDate(businessDate)} at the earliest.`,
  )

export const tooLong = () =>
  make('BAD_REQUEST', 'OOO_TOO_LONG', `Out of order can last up to ${OOO_MAX_NIGHTS} nights.`)

export const reasonRequired = () => make('BAD_REQUEST', 'OOO_REASON_REQUIRED', 'Pick a reason.')

export const ended = (on: string) =>
  make('CONFLICT', 'OOO_ENDED', `This out-of-order already ended on ${formatRateDate(on)}.`)

export const startPassed = (from: string) =>
  make(
    'BAD_REQUEST',
    'OOO_PAST_DATE',
    `This out-of-order started on ${formatRateDate(from)}, so only Back in service can change.`,
  )

export const periodChanged = () =>
  make('CONFLICT', 'OOO_CHANGED', 'This out-of-order changed meanwhile. Check the new dates.')

export const keyUsed = () =>
  make('CONFLICT', 'IDEMPOTENCY_CONFLICT', 'This change was already saved.')
