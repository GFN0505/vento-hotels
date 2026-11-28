// Errors for cashier shifts and cash drawers, with the spec's wording ("UI copy") and a `data.code`
// the web app can react to (CASH_ERROR_CODES in @vento/shared). None of them carries an expected
// figure: an error about an open shift is as blind as the shift.
import { ORPCError } from '@orpc/server'
import { clockAt, FX_SYMBOLS, type FxCurrency, formatMoney } from '@vento/shared'

const make = (
  status: 'BAD_REQUEST' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND',
  code: string,
  message: string,
  data: Record<string, unknown> = {},
) => new ORPCError(status, { message, data: { code, ...data } })

export const naira = (amount: string) => formatMoney({ amount, currency: 'NGN' })

export const RUN_SHIFT_ONLY =
  'Only front desk, cashiers and managers can run a cashier shift. Ask your GM.'

export const noPermission = (message: string) => new ORPCError('FORBIDDEN', { message })

export const shiftNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that shift" })
export const drawerNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that cash drawer" })

export const shiftAlreadyOpen = (number: number, hotel: string, drawer: string) =>
  make(
    'CONFLICT',
    'SHIFT_ALREADY_OPEN',
    `Your shift ${number} is still open at ${hotel} (${drawer}). Close it first.`,
  )

export const drawerBusy = (drawer: string, by: string) =>
  make('CONFLICT', 'DRAWER_BUSY', `${drawer} was just opened by ${by}. Pick another drawer.`)

export const drawerArchived = (drawer: string) =>
  make('CONFLICT', 'DRAWER_ARCHIVED', `${drawer} was archived. Pick another drawer.`)

export const drawerWrongHotel = () =>
  make('BAD_REQUEST', 'DRAWER_WRONG_HOTEL', 'Pick POS terminals of this hotel.', {
    field: 'posTerminalIds',
  })

export const drawerLastActive = () =>
  make('CONFLICT', 'DRAWER_LAST_ACTIVE', 'A hotel needs at least one cash drawer.')

export const drawerHasShift = (drawer: string, by: string) =>
  make(
    'CONFLICT',
    'DRAWER_HAS_SHIFT',
    `${drawer} has ${by}'s shift open. Archive it after the shift closes.`,
  )

export const drawerNameTaken = (hotel: string, name: string) =>
  make('CONFLICT', 'DRAWER_NAME_TAKEN', `${hotel} already has a drawer called ${name}.`, {
    field: 'name',
  })

export const handoverChanged = (drawer: string, by: string | null, at: Date | null, tz: string) =>
  make(
    'CONFLICT',
    'HANDOVER_CHANGED',
    by && at
      ? `${drawer} was just closed by ${by} at ${clockAt(at, tz)}. Check the hand-over.`
      : `${drawer}'s hand-over changed. Check it again.`,
  )

export const notYourShift = (name: string) =>
  make('FORBIDDEN', 'NOT_YOUR_SHIFT', `Only ${name} can count and close this shift.`)

export const shiftNotOpen = () =>
  make('CONFLICT', 'SHIFT_NOT_OPEN', "This shift isn't open, so there's nothing to count.")

export const shiftNotCounted = () =>
  make('CONFLICT', 'SHIFT_NOT_OPEN', 'Submit your count before closing the shift.')

export const shiftClosed = (number: number, at: Date, tz: string) =>
  make('CONFLICT', 'SHIFT_CLOSED', `Shift ${number} was closed at ${clockAt(at, tz)}.`)

export const countAlreadySubmitted = (at: Date, tz: string) =>
  make(
    'CONFLICT',
    'COUNT_ALREADY_SUBMITTED',
    `This count was submitted at ${clockAt(at, tz)} and can't be changed.`,
  )

export const countLinesChanged = () =>
  make(
    'CONFLICT',
    'COUNT_LINES_CHANGED',
    "The lines to count changed. Reload the count and enter what's on screen.",
  )

export const countTooLarge = () =>
  make('BAD_REQUEST', 'COUNT_TOO_LARGE', "That's more than a drawer can hold. Check the count.")

export const fxRateMissing = (currency: FxCurrency) =>
  make(
    'CONFLICT',
    'FX_RATE_MISSING',
    `There's no ${currency === 'USD' ? 'US$' : FX_SYMBOLS[currency]} rate yet. Ask your GM to enter today's FX rates, then submit.`,
    { currency },
  )

export const reasonRequired = () =>
  make('BAD_REQUEST', 'DIFFERENCE_REASON_REQUIRED', 'Add a reason for the difference.', {
    field: 'reason',
  })

export const overLimit = (value: string, limit: string | null, canAsk: boolean) =>
  make(
    'FORBIDDEN',
    'DIFFERENCE_OVER_LIMIT',
    limit === null || limit === '0.00'
      ? `${naira(value)} needs a manager's approval. A manager can approve it here.`
      : `${naira(value)} is over your ${naira(limit)} limit. A manager can approve it here.`,
    { canAsk, limit, value },
  )

export const floatMoreThanCash = (counted: string) =>
  make(
    'BAD_REQUEST',
    'FLOAT_MORE_THAN_CASH',
    `The float can't be more than the ${naira(counted)} counted.`,
    { field: 'floatKept' },
  )

export const bagNumberRequired = () =>
  make('BAD_REQUEST', 'BAG_NUMBER_REQUIRED', 'Enter the safe bag number.', { field: 'bagNumber' })

export const idempotencyConflict = () =>
  make('CONFLICT', 'IDEMPOTENCY_CONFLICT', 'This was already saved.')

export const noDifference = () =>
  make('BAD_REQUEST', 'APPROVAL_NOT_NEEDED', 'There is no difference to approve.')

export const withinLimit = (value: string) =>
  make(
    'BAD_REQUEST',
    'APPROVAL_NOT_NEEDED',
    `${naira(value)} is within your limit. Add a reason and carry on.`,
  )

export const hotelHasShifts = (hotel: string, count: number) =>
  make(
    'CONFLICT',
    'HOTEL_HAS_SHIFTS',
    `${hotel} has ${count} ${count === 1 ? 'shift' : 'shifts'} open. Close ${count === 1 ? 'it' : 'them'} first.`,
  )
