// The quote for one stay on one plan, as Room & rate's summary and Review show it: nightly plan and
// sold prices with tax lines, totals, deposit due, cancellation, the discount check against the
// member's limit, the foreign equivalent for a foreign guest, and the same guest's overlapping
// bookings at this hotel. A read: Book prices again inside its locks and compares the hash.
import {
  fxEquivalent,
  nationalityCurrency,
  type quoteInputSchema,
  type StayQuote as StayQuoteView,
} from '@vento/shared'
import { and, eq, gt, lt } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database } from '../db/client.ts'
import { reservations } from '../db/schema/reservations.ts'
import { fxRateFor } from '../finance/fx-rates.ts'
import { rulesByNight } from '../finance/taxes.ts'
import { quoteStay } from '../rates/quote.ts'
import type { Access } from '../tenancy/access.ts'
import {
  type BookingHotel,
  loadBookingHotel,
  type Reader,
  requireReservationManage,
} from './context.ts'
import { planCorporateOnly } from './errors.ts'
import { discountCheck, priceStay, quoteView } from './pricing.ts'

type Input = z.output<typeof quoteInputSchema>

async function overlaps(
  db: Reader,
  access: Access,
  hotel: BookingHotel,
  input: Input,
): Promise<StayQuoteView['overlaps']> {
  if (!input.guestId) return []
  return db
    .select({
      id: reservations.id,
      number: reservations.number,
      arrival: reservations.arrival,
      departure: reservations.departure,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.organizationId, access.organizationId),
        eq(reservations.propertyId, hotel.id),
        eq(reservations.guestId, input.guestId),
        eq(reservations.status, 'confirmed'),
        lt(reservations.arrival, input.departure),
        gt(reservations.departure, input.arrival),
      ),
    )
    .limit(3)
}

export async function foreignEquivalent(
  db: Reader,
  access: Access,
  hotel: BookingHotel,
  nationality: string | undefined,
  total: string,
): Promise<StayQuoteView['fx']> {
  const currency = nationality ? nationalityCurrency(nationality) : null
  if (!currency) return null
  const rate = await fxRateFor(db, access.organizationId, currency, hotel.businessDate)
  return rate ? fxEquivalent(total, rate) : null
}

export async function quoteReservation(
  db: Database,
  access: Access,
  input: Input,
): Promise<StayQuoteView> {
  requireReservationManage(access)
  const hotel = await loadBookingHotel(db, access, input.propertyId)
  const quote = await quoteStay(db, access, {
    propertyId: hotel.id,
    roomTypeId: input.roomTypeId,
    ratePlanId: input.ratePlanId,
    arrival: input.arrival,
    departure: input.departure,
    adults: input.adults,
    children: input.children,
  })
  if (quote.terms.bookableBy === 'corporate_only') throw planCorporateOnly(quote.planName)
  const rules = await rulesByNight(
    db,
    access,
    hotel,
    quote.nights.map((night) => night.date),
  )
  const priced = priceStay(quote, input.discount, rules, hotel, new Date())
  return quoteView(priced, {
    discount: discountCheck(access, priced),
    fx: await foreignEquivalent(db, access, hotel, input.nationality, priced.totals.total),
    overlaps: await overlaps(db, access, hotel, input),
  })
}
