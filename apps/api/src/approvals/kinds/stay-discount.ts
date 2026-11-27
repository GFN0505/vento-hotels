// The one approval kind of Stage 1 brick 5: a discount over the member's limit on a new
// reservation. Declares its permission and feature, and turns the booking it is given into the
// value (the discount as a percent of the plan price), the binding hash and what the approver
// sees. Always priced here with the booking's own functions; the client sends no figures.
import { ORPCError } from '@orpc/server'
import {
  type ApprovalSubject,
  type approvalActionSchema,
  dec,
  formatPercent,
  nightsBetween,
  roleLabel,
  toAmount,
} from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database } from '../../db/client.ts'
import { guests } from '../../db/schema/reservations.ts'
import { rulesByNight } from '../../finance/taxes.ts'
import { quoteStay, requireStayDates } from '../../rates/quote.ts'
import {
  type BookingHotel,
  loadBookingHotel,
  requireReservationManage,
} from '../../reservations/context.ts'
import { guestNotFound, noPermission, planCorporateOnly } from '../../reservations/errors.ts'
import { discountLimitOf, type PricedStay, priceStay } from '../../reservations/pricing.ts'
import { type Access, can } from '../../tenancy/access.ts'
import { STAY_DISCOUNT, stayBinding } from './stay-discount-rule.ts'

export { STAY_DISCOUNT, stayBinding }

export const NO_DISCOUNTS = "You can't give discounts. Ask a manager to make this booking."

type Reader = Pick<Database, 'select' | 'execute'>
type Action = z.output<typeof approvalActionSchema>
type Stay = Action['booking']['stays'][number]

export const percentOf = (priced: PricedStay) =>
  priced.discount ? priced.discount.percent.toDecimalPlaces(4).toString() : '0'

async function guestName(db: Reader, access: Access, guest: Action['booking']['guest']) {
  if (guest.kind === 'new') return `${guest.fields.firstName} ${guest.fields.lastName}`.trim()
  const [row] = await db
    .select({ firstName: guests.firstName, lastName: guests.lastName })
    .from(guests)
    .where(and(eq(guests.id, guest.id), eq(guests.organizationId, access.organizationId)))
  if (!row) throw guestNotFound()
  const first = guest.corrections?.firstName ?? row.firstName
  const last = guest.corrections?.lastName ?? row.lastName
  return `${first} ${last}`
}

export type EvaluatedStay = {
  hotel: BookingHotel
  stay: Stay
  value: string
  bindingHash: string
  subject: ApprovalSubject
}

// Prices the stay as Book would, now, with and without the discount.
export async function evaluateStayDiscount(
  db: Reader,
  access: Access,
  action: Action,
  context: { now: Date; deviceName: string | null },
): Promise<EvaluatedStay> {
  requireReservationManage(access)
  if (!can(access, STAY_DISCOUNT.permission)) throw noPermission(NO_DISCOUNTS)
  const hotel = await loadBookingHotel(db, access, action.booking.propertyId)
  const stay = action.booking.stays[action.stayIndex]
  if (!stay?.discount) {
    throw new ORPCError('BAD_REQUEST', { message: 'There is no discount on this stay to approve.' })
  }
  requireStayDates(stay, hotel)
  const quote = await quoteStay(db, access, { propertyId: hotel.id, ...stay })
  if (quote.terms.bookableBy === 'corporate_only') throw planCorporateOnly(quote.planName)
  const rules = await rulesByNight(
    db,
    access,
    hotel,
    quote.nights.map((night) => night.date),
  )
  const priced = priceStay(quote, stay.discount, rules, hotel, context.now)
  const before = priceStay(quote, undefined, rules, hotel, context.now)
  const first = priced.nights[0]
  const off = priced.nights.reduce(
    (sum, night) => sum.plus(dec(night.planPrice).minus(night.soldPrice)),
    dec('0'),
  )
  const limit = discountLimitOf(access) ?? '0'
  const subject: ApprovalSubject = {
    hotelName: hotel.name,
    guestName: await guestName(db, access, action.booking.guest),
    roomTypeName: quote.roomTypeName,
    planName: quote.planName,
    arrival: stay.arrival,
    departure: stay.departure,
    nights: nightsBetween(stay.arrival, stay.departure),
    planPrice: first?.planPrice ?? '0.00',
    newPrice: first?.soldPrice ?? '0.00',
    varies: priced.nights.some((night) => night.soldPrice !== first?.soldPrice),
    percent: formatPercent(percentOf(priced)),
    discountTotal: toAmount(off),
    totalBefore: before.totals.total,
    totalAfter: priced.totals.total,
    depositAfter: priced.deposit?.amount ?? null,
    reason: stay.discount.reason,
    reasonText: stay.discount.reasonText ?? null,
    note: stay.discount.note ?? null,
    requesterName: access.userName,
    requesterLimit: formatPercent(limit),
    requesterRole: roleLabel(access.role).toLowerCase(),
    deviceName: context.deviceName,
  }
  return {
    hotel,
    stay,
    value: percentOf(priced),
    bindingHash: stayBinding(hotel.id, stay, priced.hash),
    subject,
  }
}
