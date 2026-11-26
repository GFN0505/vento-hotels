// Room & rate: rooms left per room type per night and the plans that sell each type for a stay, with
// prices excl. and incl. taxes. A read (no locks): the final check is always the locked one at
// Book. One load of prices, tax rules and inventory whatever the number of types and nights.
import {
  type Availability,
  type AvailabilityInput,
  type AvailabilityRoomType,
  addDays,
  type BookablePlan,
  dec,
  formatNaira,
  MAX_NIGHT_BADGES,
  nightsBetween,
  nightTaxes,
  stayNights,
  stayTotals,
  type TaxRuleInForce,
  toAmount,
} from '@vento/shared'
import type { Database } from '../db/client.ts'
import { rulesByNight } from '../finance/taxes.ts'
import { type BookableOption, type BookableType, bookableByType } from '../rates/quote.ts'
import { type Access, can } from '../tenancy/access.ts'
import { loadBookingHotel, requireReservationManage } from './context.ts'
import { bookedFor, type Capacity, capacityOf, keyOf, leftOn, type Scope } from './locks.ts'
import { discountLimitOf } from './pricing.ts'

// How far either side of a fully booked night to look for free rooms.
const FREE_SCAN_DAYS = 14

function derivedLabel(option: BookableOption): string | null {
  const { adjustment } = option.plan
  if (!adjustment || !option.parentCode) return null
  const value = dec(adjustment.value)
  const sign = value.isNegative() ? '−' : '+'
  const amount =
    adjustment.kind === 'percent'
      ? `${value.abs().toString()}%`
      : formatNaira(value.abs().toString())
  return `${option.parentCode} ${sign} ${amount}`
}

function planView(
  option: BookableOption,
  rules: ReadonlyMap<string, TaxRuleInForce[]>,
): BookablePlan {
  const inclusive = option.terms.pricesIncludeTaxes
  const taxes = option.nights.map((line) =>
    nightTaxes(
      { soldPrice: line.price, extraAdult: line.extraAdult, mealAllocation: line.mealAllocation },
      rules.get(line.date) ?? [],
      inclusive,
    ),
  )
  const totals = stayTotals(taxes)
  const count = Math.max(1, option.nights.length)
  const first = option.nights[0]?.total
  return {
    ratePlanId: option.plan.id,
    name: option.plan.name,
    code: option.plan.code,
    mealPlan: option.plan.mealPlan,
    derivedLabel: derivedLabel(option),
    terms: {
      planName: option.plan.name,
      planCode: option.plan.code,
      mealPlan: option.terms.mealPlan,
      mealAllocation: option.terms.mealAllocation,
      cancellation: option.terms.cancellation,
      deposit: option.terms.deposit,
      pricesIncludeTaxes: inclusive,
    },
    perNightExcl: toAmount(dec(totals.net).plus(totals.rounding).dividedBy(count)),
    perNightIncl: toAmount(dec(totals.total).dividedBy(count)),
    varies: option.nights.some((line) => line.total !== first),
    totalIncl: totals.total,
    breaks: option.breaks,
  }
}

function typeView(
  entry: BookableType,
  capacity: Capacity,
  dates: readonly string[],
  booked: ReadonlyMap<string, number>,
  rules: ReadonlyMap<string, TaxRuleInForce[]>,
): AvailabilityRoomType {
  const nights = dates.map((date) => {
    const night = leftOn(capacity, booked.get(keyOf({ roomTypeId: entry.type.id, date })) ?? 0)
    return { date, left: night.left, bookable: night.bookable }
  })
  const lowest = nights.reduce(
    (low, night) => (night.left < low.left ? night : low),
    nights[0] ?? {
      date: dates[0] ?? '',
      left: 0,
      bookable: 0,
    },
  )
  const soldOut = nights.filter((night) => night.bookable < 1).map((night) => night.date)
  const plans = entry.plans.map((option) => planView(option, rules))
  const firstPrices = entry.plans.flatMap((option) =>
    option.nights[0] ? [dec(option.nights[0].price)] : [],
  )
  const reason = !entry.fits
    ? 'too_many_guests'
    : plans.length === 0
      ? 'not_priced'
      : soldOut.length > 0
        ? 'sold_out'
        : null
  return {
    id: entry.type.id,
    name: entry.type.name,
    code: entry.type.code,
    maxAdults: entry.type.maxAdults,
    maxChildren: entry.type.maxChildren,
    nights:
      dates.length <= MAX_NIGHT_BADGES
        ? nights.map((night) => ({ date: night.date, left: night.left }))
        : [],
    lowest: { date: lowest.date, left: lowest.left },
    soldOut,
    sellable: reason === null,
    reason,
    from:
      firstPrices.length > 0
        ? toAmount(firstPrices.reduce((low, price) => (price.lessThan(low) ? price : low)))
        : null,
    plans,
  }
}

// The first night of the stay with nothing bookable in any type, and the nearest free nights
// either side ("Rooms are free from 12 Dec.").
async function fullyBooked(
  db: Pick<Database, 'select'>,
  scope: Scope,
  capacity: ReadonlyMap<string, Capacity>,
  input: AvailabilityInput,
  businessDate: string,
): Promise<Availability['fullyBooked']> {
  const ids = [...capacity.keys()]
  const from = addDays(input.arrival, -FREE_SCAN_DAYS)
  const to = addDays(input.departure, FREE_SCAN_DAYS)
  const booked = await bookedFor(db, scope, ids, from, to)
  const free = (date: string) =>
    ids.some(
      (id) =>
        leftOn(capacity.get(id), booked.get(keyOf({ roomTypeId: id, date })) ?? 0).bookable >= 1,
    )
  const nights = stayNights(input.arrival, nightsBetween(input.arrival, input.departure))
  const full = nights.find((date) => !free(date))
  if (!full) return null
  let freeFrom: string | null = null
  for (let day = 1; day <= FREE_SCAN_DAYS && !freeFrom; day++) {
    if (free(addDays(full, day))) freeFrom = addDays(full, day)
  }
  let freeBefore: string | null = null
  for (let day = 1; day <= FREE_SCAN_DAYS && !freeBefore; day++) {
    const date = addDays(full, -day)
    if (date < businessDate) break
    if (free(date)) freeBefore = date
  }
  return { date: full, freeBefore, freeFrom }
}

export async function availability(
  db: Database,
  access: Access,
  input: AvailabilityInput,
): Promise<Availability> {
  requireReservationManage(access)
  const hotel = await loadBookingHotel(db, access, input.propertyId)
  const { types, anyPlans } = await bookableByType(db, access, input)
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  const capacity = await capacityOf(
    db,
    scope,
    types.map((entry) => entry.type.id),
  )
  // Types with no active rooms aren't listed.
  const listed = types.filter((entry) => (capacity.get(entry.type.id)?.rooms ?? 0) > 0)
  const base: Availability = {
    property: {
      id: hotel.id,
      name: hotel.name,
      businessDate: hotel.businessDate,
      checkInTime: hotel.checkInTime,
      timeZone: hotel.timeZone,
    },
    setup: 'ready',
    roomTypes: [],
    fullyBooked: null,
    canDiscount: can(access, 'stay.rate_override'),
    discountLimit: can(access, 'stay.rate_override') ? discountLimitOf(access) : '0',
  }
  if (listed.length === 0) return { ...base, setup: 'no_rooms' }
  if (!anyPlans) return { ...base, setup: 'no_rates' }
  const dates = stayNights(input.arrival, nightsBetween(input.arrival, input.departure))
  const rules = await rulesByNight(db, access, hotel, dates)
  const ids = listed.map((entry) => entry.type.id)
  const booked = await bookedFor(db, scope, ids, input.arrival, addDays(input.departure, -1))
  const capacityOfType = (id: string): Capacity =>
    capacity.get(id) ?? { name: '', rooms: 0, limit: 0 }
  const listedCapacity = new Map(ids.map((id) => [id, capacityOfType(id)]))
  return {
    ...base,
    roomTypes: listed.map((entry) =>
      typeView(entry, capacityOfType(entry.type.id), dates, booked, rules),
    ),
    fullyBooked: await fullyBooked(db, scope, listedCapacity, input, hotel.businessDate),
  }
}
