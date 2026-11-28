// Check-in errors with the spec's words and a `data.code` (CHECK_IN_ERROR_CODES in @vento/shared).
import { ORPCError } from '@orpc/server'
import { clockAt, formatRateDate } from '@vento/shared'

const make = (
  status: 'BAD_REQUEST' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND',
  code: string,
  message: string,
  data: Record<string, unknown> = {},
) => new ORPCError(status, { message, data: { code, ...data } })

export const notCheckable = (problem: { code: string; message: string }) =>
  make('CONFLICT', problem.code, problem.message)

// "Chiamaka Eze checked in Daniel Mensah at 11:35."
export const alreadyCheckedIn = (by: string, guest: string, at: Date, timeZone: string) =>
  make('CONFLICT', 'ALREADY_CHECKED_IN', `${by} checked in ${guest} at ${clockAt(at, timeZone)}.`, {
    byName: by,
    at: at.toISOString(),
  })

export const notCheckedIn = () =>
  make('CONFLICT', 'NOT_CHECKED_IN', 'This guest is not checked in.')

export const undoExpired = () =>
  make(
    'CONFLICT',
    'UNDO_EXPIRED',
    'Undo has expired. A GM can reverse the check-in from the reservation.',
  )

export const reverseNotSameDay = (date: string) =>
  make(
    'CONFLICT',
    'REVERSE_NOT_SAME_DAY',
    `Checked in on ${formatRateDate(date)}. After night audit this is a check-out.`,
  )

export const selfReverse = (guest: string) =>
  make('FORBIDDEN', 'SELF_REVERSE', `You checked ${guest} in. Ask another manager to reverse it.`)

export const businessDateMoved = (date: string) =>
  make(
    'CONFLICT',
    'BUSINESS_DATE_MOVED',
    `The business date moved to ${formatRateDate(date, false)} before this check-in synced. Ask the night auditor.`,
    { businessDate: date },
  )

export const checkInAlreadySaved = () =>
  make('CONFLICT', 'IDEMPOTENCY_CONFLICT', 'This check-in was already saved.')

export const roomTypeDiffers = (number: string) =>
  make(
    'BAD_REQUEST',
    'ROOM_WRONG_TYPE',
    `${number} is another room type. Use Room move to upgrade the guest first.`,
  )
