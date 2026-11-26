// The seam brick 4 reads (spec, "What brick 4 reads"): the nightly prices of a stay on a plan, and
// the plans a stay can be booked on. Server functions, not procedures: brick 4 calls quoteStay
// inside its booking transaction (pass the transaction as `db`), so a closure applied a moment
// earlier is respected, and stores the result on the stay as the plan price.

import { createHash } from 'node:crypto'
import { ORPCError } from '@orpc/server'
import {
  addDays,
  type CalendarDate,
  type CancellationPolicy,
  type DepositRule,
  lastRateDate,
  type MealPlan,
  nightsBetween,
  type QuoteLine,
  quoteNights,
  type RestrictionBreak,
} from '@vento/shared'
import { sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import type { Access } from '../tenancy/access.ts'
import { loadRatesProperty, type Reader, requireRatesRead } from './context.ts'

// Brick 4 passes its booking transaction; reads plus the shared rates lock.
export type QuoteReader = Reader & Pick<Database, 'execute'>

import {
  notOnPlan,
  pastDate,
  planArchived,
  planNotFound,
  roomTypeNotFound,
  stayTooLong,
  tooFarAhead,
  tooManyGuests,
} from './errors.ts'
import { loadRoomTypes, type PropertyRoomType } from './guards.ts'
import { termsOf } from './plan-model.ts'
import { findPlan } from './plan-reads.ts'
import { loadPricing, type Pricing, sourceFor } from './pricing-data.ts'

export type StayRequest = {
  propertyId: string
  roomTypeId: string
  arrival: CalendarDate
  departure: CalendarDate
  adults: number
  children: number
}

export type StayQuote = {
  ratePlanId: string
  // The plan's version the quote was made at; brick 4 stores it on the stay.
  ratePlanVersion: number
  // A hash of everything priced (nights, total, terms, breaks). The plan's version doesn't move when
  // date prices or the parent change, so brick 4 compares this, not the version, to tell whether
  // what the guest was shown is still the price.
  quoteHash: string
  roomTypeId: string
  currency: 'NGN'
  nights: QuoteLine[]
  // Sum of the nights (room + extra adults), before taxes and service charge (brick 3).
  total: string
  terms: {
    mealPlan: MealPlan
    mealAllocation: string | null
    cancellation: CancellationPolicy
    deposit: DepositRule
    pricesIncludeTaxes: boolean
    bookableBy: 'anyone' | 'corporate_only'
  }
  // Restrictions the stay breaks (closed, closed to arrival, min stay), each with its date and a
  // message. The front desk may book through them with a reason (brick 4); channels never.
  breaks: RestrictionBreak[]
}

export const MAX_STAY_NIGHTS = 365

function requireStay(
  request: StayRequest,
  type: PropertyRoomType,
  property: { businessDate: string },
): void {
  if (request.departure <= request.arrival) {
    throw new ORPCError('BAD_REQUEST', { message: 'Departure must be after arrival' })
  }
  // Rates exist from the business date to 2 years ahead; nothing is quoted outside them.
  if (request.arrival < property.businessDate) throw pastDate(request.arrival)
  const last = lastRateDate(property.businessDate)
  if (addDays(request.departure, -1) > last) throw tooFarAhead(last)
  if (nightsBetween(request.arrival, request.departure) > MAX_STAY_NIGHTS) throw stayTooLong()
  if (
    request.adults < 1 ||
    request.adults > type.maxAdults ||
    request.children < 0 ||
    request.children > type.maxChildren
  ) {
    throw tooManyGuests(type.name)
  }
}

async function loadStayPricing(db: QuoteReader, access: Access, request: StayRequest) {
  requireRatesRead(access)
  const property = await loadRatesProperty(db, access, request.propertyId)
  // Shared with other quotes, exclusive with rates writes at this hotel: inside a booking
  // transaction the prices read here can't change until it commits.
  await db.execute(
    sql`select pg_advisory_xact_lock_shared(hashtextextended(${`rates:${property.id}`}, 0))`,
  )
  const scope = { organizationId: access.organizationId, propertyId: property.id }
  const types = await loadRoomTypes(db, scope)
  const type = types.find((t) => t.id === request.roomTypeId)
  if (!type) throw roomTypeNotFound()
  requireStay(request, type, property)
  const pricing = await loadPricing(db, scope, {
    from: request.arrival,
    to: addDays(request.departure, -1),
  })
  return { property, type, pricing }
}

function quoteOne(
  pricing: Pricing,
  planId: string,
  type: PropertyRoomType,
  request: StayRequest,
): Omit<StayQuote, 'terms' | 'ratePlanVersion' | 'quoteHash'> | null {
  const plan = pricing.byId.get(planId)
  if (!plan) return null
  const source = sourceFor(plan, type.id, pricing)
  if (!source) return null
  const quote = quoteNights({
    source,
    adjustment: plan.adjustment,
    planName: plan.name,
    planMinStay: plan.minStay,
    mealAllocation: plan.mealAllocation,
    baseOccupancy: type.baseOccupancy,
    adults: request.adults,
    arrival: request.arrival,
    departure: request.departure,
  })
  return {
    ratePlanId: plan.id,
    roomTypeId: type.id,
    currency: 'NGN',
    nights: quote.lines,
    total: quote.total,
    breaks: quote.breaks,
  }
}

// One plan, one room type, one stay: a line per night, the total before taxes, the plan's terms
// as they stand, its version, and any restriction broken.
export async function quoteStay(
  db: QuoteReader,
  access: Access,
  request: StayRequest & { ratePlanId: string },
): Promise<StayQuote> {
  requireRatesRead(access)
  const plan = await findPlan(db, access, request.ratePlanId)
  if (plan.propertyId !== request.propertyId) throw planNotFound()
  if (plan.archivedAt) throw planArchived(plan.name)
  const { type, pricing } = await loadStayPricing(db, access, request)
  const quote = quoteOne(pricing, plan.id, type, request)
  if (!quote) throw notOnPlan(plan.name)
  const terms = termsOf(plan)
  const priced = {
    ...quote,
    terms: {
      mealPlan: terms.mealPlan,
      mealAllocation: terms.mealAllocation,
      cancellation: terms.cancellation,
      deposit: terms.deposit,
      pricesIncludeTaxes: terms.pricesIncludeTaxes,
      bookableBy: terms.bookableBy,
    },
  }
  return {
    ...priced,
    ratePlanVersion: plan.version,
    quoteHash: createHash('sha256').update(JSON.stringify(priced)).digest('hex'),
  }
}

export type BookablePlan = {
  ratePlanId: string
  name: string
  code: string
  mealPlan: MealPlan
  total: string
  breaks: RestrictionBreak[]
}

// The plans a stay can be booked on, in the hotel's plan order: active, selling the room type,
// open to anyone. Corporate-only plans join with a linked corporate account (brick 12).
export async function listBookablePlans(
  db: QuoteReader,
  access: Access,
  request: StayRequest,
): Promise<BookablePlan[]> {
  const { type, pricing } = await loadStayPricing(db, access, request)
  const plans: BookablePlan[] = []
  for (const plan of pricing.plans) {
    if (plan.bookableBy !== 'anyone') continue
    const quote = quoteOne(pricing, plan.id, type, request)
    if (!quote) continue
    plans.push({
      ratePlanId: plan.id,
      name: plan.name,
      code: plan.code,
      mealPlan: plan.mealPlan,
      total: quote.total,
      breaks: quote.breaks,
    })
  }
  return plans
}
