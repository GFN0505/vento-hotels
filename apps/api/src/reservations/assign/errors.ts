// Errors for assigning and moving rooms, with the spec's wording (stage-1-tape-chart.md, "UI copy")
// and a `data.code` the web app reacts to (ROOM_MOVE_ERROR_CODES in @vento/shared).
import { ORPCError } from '@orpc/server'
import { formatRateDate, rangeLabel } from '@vento/shared'

const make = (
  status: 'BAD_REQUEST' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND',
  code: string,
  message: string,
  data: Record<string, unknown> = {},
) => new ORPCError(status, { message, data: { code, ...data } })

export const MOVE_ONLY =
  'Only front desk, revenue managers, GMs and the owner can move rooms. Ask your GM.'

export const roomNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that room" })

export const stayNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that stay" })

// "402 was just taken for 26 Nov."
export const roomTaken = (room: { id: string; number: string }, date: string) =>
  make(
    'CONFLICT',
    'ROOM_TAKEN',
    date
      ? `${room.number} was just taken for ${formatRateDate(date, false)}.`
      : `${room.number} was just taken.`,
    {
      roomId: room.id,
      number: room.number,
      date,
    },
  )

// Undo when the old room went meanwhile: "404 was just taken, so Ngozi Okafor stays in 401."
export const undoRoomTaken = (
  room: { id: string; number: string },
  date: string,
  guestName: string,
  current: string | null,
) =>
  make(
    'CONFLICT',
    'ROOM_TAKEN',
    current
      ? `${room.number} was just taken, so ${guestName} stays in ${current}.`
      : `${room.number} was just taken, so ${guestName} stays without a room.`,
    { roomId: room.id, number: room.number, date },
  )

// A booking from a chart cell: "Room 506 was just taken for 26 Nov. Book without a room, or pick
// another."
export const cellRoomTaken = (room: { id: string; number: string }, date: string) =>
  make(
    'CONFLICT',
    'ROOM_TAKEN',
    `Room ${room.number} was just taken for ${formatRateDate(date, false)}. Book without a room, or pick another.`,
    { roomId: room.id, number: room.number, date, bookWithoutRoom: true },
  )

// "503 is out of order 25–27 Nov."
export const roomOutOfOrder = (room: { id: string; number: string }, from: string, to: string) =>
  make('CONFLICT', 'ROOM_OUT_OF_ORDER', `${room.number} is out of order ${rangeLabel(from, to)}.`, {
    roomId: room.id,
    number: room.number,
    from,
    backInService: to,
  })

const people = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)

// "506 sleeps 2 adults and 1 child."
export const roomTooSmall = (number: string, maxAdults: number, maxChildren: number) =>
  make(
    'CONFLICT',
    'ROOM_TOO_SMALL',
    maxChildren > 0
      ? `${number} sleeps ${people(maxAdults, 'adult', 'adults')} and ${people(maxChildren, 'child', 'children')}.`
      : `${number} sleeps ${people(maxAdults, 'adult', 'adults')}.`,
  )

// "Room 412 was removed."
export const roomRemoved = (number: string) =>
  make('CONFLICT', 'ROOM_ARCHIVED', `Room ${number} was removed.`)

export const roomWrongHotel = () =>
  make('BAD_REQUEST', 'ROOM_WRONG_HOTEL', 'That room is at another hotel.')

// A same-type move given a room of another type: that's a modify (the price changes).
export const roomWrongType = (number: string, typeName: string) =>
  make(
    'BAD_REQUEST',
    'ROOM_WRONG_TYPE',
    `${number} is ${typeName}. A move to another room type is priced: use Room move.`,
  )

export const notMovable = (message: string) => make('CONFLICT', 'NOT_MOVABLE', message)
export const noNightLeft = (message: string) => make('CONFLICT', 'NO_NIGHT_LEFT', message)
export const moveReasonRequired = () =>
  make('BAD_REQUEST', 'MOVE_REASON_REQUIRED', 'Pick why the guest is moving.')

// A move to another type while the booked type still has a room: "A Deluxe King room is free for
// these nights. Assign one of those: other room types are for when Deluxe King is full."
export const bookedTypeFree = (typeName: string) =>
  make(
    'CONFLICT',
    'BOOKED_TYPE_FREE',
    `A ${typeName} room is free for these nights. Assign one of those: other room types are for when ${typeName} is full.`,
  )
