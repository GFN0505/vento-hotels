// Errors for availability and reservations, with the spec's wording and a `data.code` the web app
// can react to (RESERVATION_ERROR_CODES in @vento/shared). Rates errors (PAST_DATE, TOO_FAR_AHEAD,
// STAY_TOO_LONG, TOO_MANY_GUESTS, PLAN_ARCHIVED, ROOM_TYPE_NOT_FOUND) and finance's TAXES_NOT_SET_UP
// are reused as they are.
import { ORPCError } from '@orpc/server'
import { formatPercent, formatRateDate, type RestrictionKind } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import { roomTypes } from '../db/schema/rooms.ts'
import type { Reader } from './context.ts'

const conflict = (code: string, message: string, data: Record<string, unknown> = {}) =>
  new ORPCError('CONFLICT', { message, data: { code, ...data } })
const bad = (code: string, message: string, data: Record<string, unknown> = {}) =>
  new ORPCError('BAD_REQUEST', { message, data: { code, ...data } })

export const MANAGE_ONLY =
  'Only front desk, revenue managers, GMs and the owner can make reservations. Ask your GM.'
export const READ_ONLY = "You don't have access to reservations. Ask your GM."

export const noPermission = (message: string) => new ORPCError('FORBIDDEN', { message })

export const reservationNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that reservation" })
export const guestNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that guest" })

export type Alternative = { roomTypeId: string; name: string; left: number }

// "Deluxe King was just sold for 11 Dec. 2 Executive King rooms are free for these nights."
export function soldOut(
  type: { id: string; name: string },
  date: string,
  left: number,
  alternatives: Alternative[],
) {
  const best = alternatives[0]
  const tail = best
    ? ` ${best.left} ${best.name} ${best.left === 1 ? 'room is' : 'rooms are'} free for these nights.`
    : ''
  return conflict(
    'SOLD_OUT',
    `${type.name} was just sold for ${formatRateDate(date, false)}.${tail}`,
    { roomTypeId: type.id, roomTypeName: type.name, date, left, alternatives },
  )
}

export const priceChanged = (stayIndex: number, message: string) =>
  conflict('PRICE_CHANGED', message, { stayIndex })

export const discountOverLimit = (requested: string, limit: string) =>
  new ORPCError('FORBIDDEN', {
    message: `${formatPercent(requested)}% is over your ${formatPercent(limit)}% discount limit. Use up to ${formatPercent(limit)}%, or ask a manager with a higher limit to make this booking.`,
    data: { code: 'DISCOUNT_OVER_LIMIT', requested: formatPercent(requested), limit },
  })

export const discountProblem = (
  code: 'DISCOUNT_ABOVE_PLAN' | 'DISCOUNT_ZERO' | 'DISCOUNT_BELOW_MEAL',
  message: string,
) => bad(code, message, { field: 'discount' })

const RESTRICTION_WORDS: Record<RestrictionKind, string> = {
  closed: 'the closure',
  closed_to_arrival: 'the closed-to-arrival day',
  min_stay: 'the min stay',
}

export const restrictionReasonRequired = (kind: RestrictionKind, date: string) =>
  bad(
    'RESTRICTION_REASON_REQUIRED',
    `Give a reason for booking through ${RESTRICTION_WORDS[kind]}.`,
    {
      kind,
      date,
      field: 'restrictionReason',
    },
  )

export const planCorporateOnly = (plan: string) =>
  bad(
    'PLAN_CORPORATE_ONLY',
    `${plan} is for corporate accounts. Corporate bookings come with corporate accounts.`,
  )

export const idempotencyConflict = (existing: { id: string; number: string }) =>
  conflict('IDEMPOTENCY_CONFLICT', `This booking was already made as ${existing.number}.`, existing)

// "Deluxe King would be 1 room short on 11 Dec (48 booked, 47 rooms). Move or cancel a booking first."
export function roomsBooked(
  type: string,
  date: string,
  booked: number,
  rooms: number,
  limit: number,
) {
  const short = booked - rooms - limit
  return conflict(
    'ROOMS_BOOKED',
    `${type} would be ${short} ${short === 1 ? 'room' : 'rooms'} short on ${formatRateDate(date, false)} (${booked} booked, ${rooms} ${rooms === 1 ? 'room' : 'rooms'}). Move or cancel a booking first.`,
    { date, booked, rooms },
  )
}

// A room type archived (or never at this hotel) while the sheet was open.
export async function roomTypeRemoved(
  db: Reader,
  scope: { organizationId: string; propertyId: string },
  roomTypeId: string,
) {
  const [type] = await db
    .select({ name: roomTypes.name })
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.id, roomTypeId),
        eq(roomTypes.organizationId, scope.organizationId),
        eq(roomTypes.propertyId, scope.propertyId),
      ),
    )
  return new ORPCError('NOT_FOUND', {
    message: type
      ? `${type.name} was removed a moment ago. Pick another room type.`
      : "We couldn't find that room type",
    data: { code: 'ROOM_TYPE_NOT_FOUND' },
  })
}
