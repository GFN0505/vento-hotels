// reservations.quoteChange: the Modify dialog's figures, asked on each edit. A read: modify prices
// again inside its locks and compares the hash. Rooms left are read without a lock.
import {
  type ChangeQuote,
  nightLines,
  type quoteChangeInputSchema,
  signedDifference,
} from '@vento/shared'
import type { z } from 'zod'
import type { Database } from '../../db/client.ts'
import { typesOnPlan } from '../../rates/quote.ts'
import { type Access, can } from '../../tenancy/access.ts'
import { type BookingHotel, loadBookingHotel, type Reader } from '../context.ts'
import { bookedFor, capacityOf, keyOf, leftOn, type Scope } from '../locks.ts'
import { foreignEquivalent } from '../quote.ts'
import { loadForChange, requireVersion, reservationHotel } from './load.ts'
import { changeDiscountCheck, type PricedChange, priceChange } from './price-change.ts'
import { quoteRoom } from './room.ts'
import { nightKeysOf, requireAllowed, requireChange } from './rules.ts'

type Input = z.output<typeof quoteChangeInputSchema>

// Rooms left on each new night of the changed stay's room type.
export async function newNightRooms(db: Reader, scope: Scope, priced: PricedChange) {
  const fresh = priced.nights.filter((night) => !night.kept)
  if (fresh.length === 0) return []
  const type = priced.input.roomTypeId
  const capacity = (await capacityOf(db, scope, [type])).get(type)
  const booked = await bookedFor(
    db,
    scope,
    [type],
    fresh[0]?.date ?? priced.input.arrival,
    fresh.at(-1)?.date ?? priced.input.arrival,
  )
  return fresh.map((night) => {
    const room = leftOn(
      capacity,
      booked.get(keyOf({ roomTypeId: type, date: night.date })) ?? 0,
      night.date,
    )
    return { date: night.date, left: room.left, bookable: room.bookable >= 1 }
  })
}

// The room types the stay's plan sells, whether the party fits, and the first night each is sold
// out on (for the stay's own type, only nights it doesn't hold already).
async function offeredTypes(
  db: Pick<Database, 'select' | 'execute'>,
  access: Access,
  hotel: BookingHotel,
  priced: PricedChange,
): Promise<ChangeQuote['roomTypes']> {
  const { input, stay } = priced
  const lastNight = priced.nights.at(-1)?.date ?? priced.from
  const types = await typesOnPlan(db, access, {
    propertyId: hotel.id,
    ratePlanId: stay.ratePlanId,
    from: priced.from,
    to: lastNight,
  })
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  const ids = types.map((type) => type.id)
  const capacity = await capacityOf(db, scope, ids)
  const booked = await bookedFor(db, scope, ids, priced.from, lastNight)
  const stayDates = new Set(nightKeysOf(stay).map((key) => key.date))
  return types.map((type) => {
    const cap = capacity.get(type.id)
    let soldOutOn: string | null = null
    for (const night of priced.nights) {
      if (night.date < priced.from) continue
      if (type.id === stay.roomTypeId && stayDates.has(night.date)) continue
      const room = leftOn(
        cap,
        booked.get(keyOf({ roomTypeId: type.id, date: night.date })) ?? 0,
        night.date,
      )
      if (room.bookable < 1) {
        soldOutOn = night.date
        break
      }
    }
    return {
      id: type.id,
      name: type.name,
      maxAdults: type.maxAdults,
      maxChildren: type.maxChildren,
      fits: input.adults <= type.maxAdults && input.children <= type.maxChildren,
      soldOutOn,
    }
  })
}

export function nightsView(priced: PricedChange) {
  return priced.nights.map((night, index) => {
    const taxes = priced.taxes[index]
    return {
      date: night.date,
      kept: night.kept,
      planPrice: night.planPrice,
      soldPrice: night.soldPrice,
      extraAdult: night.extraAdult,
      mealAllocation: night.mealAllocation,
      net: taxes?.net ?? '0.00',
      lines: taxes ? nightLines(taxes) : [],
      rounding: taxes?.rounding ?? '0.00',
      gross: taxes?.gross ?? '0.00',
    }
  })
}

const money = (value: { amount: string; dueAt: Date } | null) =>
  value ? { amount: value.amount, dueAt: value.dueAt.toISOString() } : null

export async function quoteChange(
  db: Pick<Database, 'select' | 'execute'>,
  access: Access,
  input: Input,
): Promise<ChangeQuote> {
  requireChange(access, input)
  const propertyId = await reservationHotel(db, access, input.reservationId)
  const hotel = await loadBookingHotel(db, access, propertyId)
  const loaded = await loadForChange(db, access, input.reservationId)
  const stay = loaded.stays.find((s) => s.id === input.stayId)
  if (stay) await requireVersion(db, loaded, input.version, stay.version, hotel.timeZone)
  requireAllowed(loaded, hotel, 'modify')
  const priced = await priceChange(db, access, hotel, loaded, input, new Date())
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  const terms = priced.stay.terms as { planName: string }
  const room = await quoteRoom(db, scope, priced.stay, input, priced.from)
  const keptFrom =
    input.keepBookedPrice && input.roomTypeId !== priced.stay.roomTypeId
      ? loaded.nights.find((night) => night.stayId === priced.stay.id)
      : undefined
  return {
    ...room,
    keptPrice: keptFrom
      ? { fromRoomTypeName: priced.stay.roomTypeName, perNight: keptFrom.soldPrice }
      : null,
    changeHash: priced.hash,
    changed: priced.changed,
    reservationId: loaded.reservation.id,
    number: loaded.reservation.number,
    stayId: priced.stay.id,
    version: priced.stay.version,
    guestName: `${loaded.guest.firstName} ${loaded.guest.lastName}`,
    planName: terms.planName,
    roomTypeId: input.roomTypeId,
    roomTypeName: priced.roomTypeName,
    nightsBefore: loaded.nights.filter((n) => n.stayId === priced.stay.id).length,
    nights: nightsView(priced),
    totals: priced.totals,
    before: {
      total: priced.beforeTotal,
      deposit: money(priced.deposit.before),
      deadline: priced.deadline.before?.toISOString() ?? null,
      penalty: priced.penalty.before,
    },
    after: {
      deposit: money(priced.deposit.after),
      depositChanged: priced.deposit.changed,
      deadline: priced.deadline.after?.toISOString() ?? null,
      penalty: priced.penalty.after,
    },
    difference: signedDifference(priced.beforeTotal, priced.totals.total),
    latePenalty: priced.latePenalty
      ? {
          ...priced.latePenalty,
          deadline: priced.deadline.before?.toISOString() ?? null,
          nonRefundable:
            (priced.stay.terms as { cancellation: { kind: string } }).cancellation.kind ===
            'non_refundable',
        }
      : null,
    newNights: await newNightRooms(db, scope, priced),
    roomTypes: await offeredTypes(db, access, hotel, priced),
    breaks: priced.breaks,
    breakAlreadyAllowed: priced.breakAlreadyAllowed,
    discount: changeDiscountCheck(access, priced),
    existingDiscount: priced.existingPercent
      ? { percent: priced.existingPercent.toDecimalPlaces(2).toString() }
      : null,
    fx: await foreignEquivalent(db, access, hotel, loaded.guest.nationality, priced.totals.total),
    canWaive: can(access, 'penalty.waive'),
  }
}
