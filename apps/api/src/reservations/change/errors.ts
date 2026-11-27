// Errors for modify, cancel, no-show and waivers, with the spec's wording (stage-1-modify-cancel.md,
// "UI copy") and a `data.code` the web app reacts to (RESERVATION_ERROR_CODES in @vento/shared).
import { ORPCError } from '@orpc/server'
import { clockAt, formatRateDate } from '@vento/shared'

const make = (
  status: 'BAD_REQUEST' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND',
  code: string,
  message: string,
  data: Record<string, unknown> = {},
) => new ORPCError(status, { message, data: { code, ...data } })

export const CHANGE_ONLY =
  'Only front desk, revenue managers, GMs and the owner can change reservations. Ask your GM.'

// "Sade Bakare changed this booking at 11:08. Check the new details." / "Chiamaka Eze cancelled
// this booking at 11:20."
export function reservationChanged(
  last: { byName: string; at: Date; kind: string } | undefined,
  timeZone: string,
) {
  if (!last) {
    return make('CONFLICT', 'RESERVATION_CHANGED', 'This booking changed. Check the new details.')
  }
  const did =
    last.kind === 'cancel'
      ? 'cancelled this booking'
      : last.kind === 'no_show'
        ? 'marked this booking no-show'
        : 'changed this booking'
  const tail = last.kind === 'modify' || last.kind === 'waive' ? ' Check the new details.' : ''
  return make(
    'CONFLICT',
    'RESERVATION_CHANGED',
    `${last.byName} ${did} at ${clockAt(last.at, timeZone)}.${tail}`,
    { byName: last.byName, at: last.at.toISOString() },
  )
}

export const notChangeable = (message: string) => make('CONFLICT', 'NOT_CHANGEABLE', message)

export const arrivalPassed = (arrival: string) =>
  make(
    'CONFLICT',
    'ARRIVAL_PASSED',
    `Arrival was ${formatRateDate(arrival)}. Mark it as a no-show.`,
  )

export const notArrivedYet = (number: string, arrival: string) =>
  make(
    'CONFLICT',
    'NOT_ARRIVED_YET',
    `${number} arrives on ${formatRateDate(arrival)}. It can't be a no-show yet.`,
  )

export const nothingChanged = () => make('BAD_REQUEST', 'NOTHING_CHANGED', 'Nothing to save yet.')

export const planDoesntSellType = (plan: string, type: string) =>
  make(
    'BAD_REQUEST',
    'PLAN_DOESNT_SELL_TYPE',
    `${plan} isn't sold for ${type}. Cancel and book again on another plan.`,
  )

export const planArchivedForNewNights = (plan: string) =>
  make(
    'CONFLICT',
    'PLAN_ARCHIVED',
    `${plan} was archived, so new nights can't be priced. Keep the dates or cancel and book again.`,
  )

export const waiverNeedsApproval = () =>
  make('FORBIDDEN', 'WAIVER_NEEDS_APPROVAL', 'Waiving needs a manager. Ask for approval.', {
    canAsk: true,
  })

export const penaltyNotOpen = (waived: { byName: string | null; at: Date | null }, tz: string) =>
  make(
    'CONFLICT',
    'PENALTY_NOT_OPEN',
    waived.byName && waived.at
      ? `This penalty was already waived by ${waived.byName} at ${clockAt(waived.at, tz)}.`
      : 'This penalty is no longer open.',
  )

export const penaltyNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that penalty" })

export const changePriceChanged = (message: string) => make('CONFLICT', 'PRICE_CHANGED', message)

export const changeAlreadySaved = () =>
  make('CONFLICT', 'IDEMPOTENCY_CONFLICT', 'This change was already saved.')

export const modifyDiscountOverLimit = (requested: string, limit: string) =>
  make(
    'FORBIDDEN',
    'DISCOUNT_OVER_LIMIT',
    `${requested}% is over your ${limit}% discount limit. A manager with a higher limit can approve it, or price the new night without the discount.`,
    { requested, limit, canAsk: true },
  )
