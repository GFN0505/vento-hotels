// stays.roomOptions: the Room move dialog's lists (spec: "Room move dialog"). Rooms free for every
// night of the stay: the stay's own type first (ready rooms first when it arrives today), then other
// types its plan sells and its party fits, cheapest first, with the plan price difference a night.
// A read: the move itself checks again under the room's lock.
import {
  compareRoomOptions,
  dec,
  nightsOf,
  type RoomOption,
  type RoomOptions,
  roomOptionsInputSchema,
  toAmount,
} from '@vento/shared'
import type { z } from 'zod'
import type { Database } from '../../db/client.ts'
import { typesOnPlan } from '../../rates/quote.ts'
import { hotelRooms } from '../../tape-chart/hotel-rooms.ts'
import { planPricesFor } from '../../tape-chart/prices.ts'
import { type Access, can } from '../../tenancy/access.ts'
import { loadForChange, requireVersion, termsOf } from '../change/load.ts'
import { loadBookingHotel } from '../context.ts'
import { bookedFor, capacityOf, keyOf, leftOn } from '../locks.ts'
import { discountLimitOf } from '../pricing.ts'
import { movableProblem, requireRoomMove, stayHotel } from './assign.ts'
import { stayNotFound } from './errors.ts'
import { busyRooms } from './room-check.ts'

type Input = z.output<typeof roomOptionsInputSchema>

export async function roomOptions(
  db: Pick<Database, 'select' | 'execute'>,
  access: Access,
  input: Input,
): Promise<RoomOptions> {
  requireRoomMove(access)
  const parsed = roomOptionsInputSchema.parse(input)
  const where = await stayHotel(db, access, parsed.stayId)
  const hotel = await loadBookingHotel(db, access, where.propertyId)
  const loaded = await loadForChange(db, access, where.reservationId)
  const stay = loaded.stays.find((s) => s.id === parsed.stayId)
  if (!stay) throw stayNotFound()
  await requireVersion(db, loaded, parsed.version, stay.version, hotel.timeZone)
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  const dates = nightsOf(stay.arrival, stay.departure)
  const arrivesToday = stay.arrival === hotel.businessDate
  const [all, busy] = await Promise.all([
    hotelRooms(db, scope),
    busyRooms(db, hotel.id, stay.arrival, stay.departure, stay.id),
  ])
  const option = (room: (typeof all)[number]): RoomOption => ({
    id: room.id,
    number: room.number,
    floor: room.floor,
    features: room.features,
    connectsTo: room.connectsTo,
    accessible: room.accessible,
    status: room.status,
  })
  const free = all.filter((room) => !busy.has(room.id) && room.id !== stay.roomId)
  const ofType = (typeId: string) =>
    free
      .filter((room) => room.roomTypeId === typeId)
      .sort((a, b) => compareRoomOptions(a, b, arrivesToday))
      .map(option)

  // Other room types: sold by the plan, fit the party, a room left every night.
  const planTypes = await typesOnPlan(db, access, {
    propertyId: hotel.id,
    ratePlanId: stay.ratePlanId,
    from: stay.arrival,
    to: dates.at(-1) ?? stay.arrival,
  }).catch(() => [])
  const others = planTypes.filter(
    (type) =>
      type.id !== stay.roomTypeId &&
      stay.adults <= type.maxAdults &&
      stay.children <= type.maxChildren,
  )
  const ids = others.map((type) => type.id)
  const [capacity, booked, prices] = await Promise.all([
    capacityOf(db, scope, ids),
    bookedFor(db, scope, ids, stay.arrival, dates.at(-1) ?? stay.arrival),
    planPricesFor(db, scope, stay.ratePlanId, [stay.roomTypeId, ...ids], dates),
  ])
  const own = prices.get(stay.roomTypeId)
  const otherTypes = others
    .filter((type) =>
      dates.every(
        (date) =>
          leftOn(capacity.get(type.id), booked.get(keyOf({ roomTypeId: type.id, date })) ?? 0, date)
            .bookable >= 1,
      ),
    )
    .map((type) => {
      const price = prices.get(type.id)
      return {
        roomTypeId: type.id,
        name: type.name,
        difference: price && own ? toAmount(dec(price).minus(own)) : '0.00',
        rooms: ofType(type.id),
      }
    })
    .filter((type) => type.rooms.length > 0)
    .sort((a, b) => dec(a.difference).comparedTo(dec(b.difference)))

  const room = all.find((r) => r.id === stay.roomId)
  const firstNight = loaded.nights.find((night) => night.stayId === stay.id)
  return {
    stay: {
      id: stay.id,
      reservationId: loaded.reservation.id,
      number: loaded.reservation.number,
      version: stay.version,
      guestName: `${loaded.guest.firstName} ${loaded.guest.lastName}`,
      roomTypeId: stay.roomTypeId,
      roomTypeName: stay.roomTypeName,
      planName: termsOf(stay).planName,
      arrival: stay.arrival,
      departure: stay.departure,
      adults: stay.adults,
      children: stay.children,
      room: room ? { id: room.id, number: room.number } : null,
      soldPerNight: firstNight?.soldPrice ?? '0.00',
      nationality: loaded.guest.nationality,
    },
    arrivesToday,
    sameType: ofType(stay.roomTypeId),
    otherTypes,
    blocked: movableProblem(loaded, stay, hotel),
    discountLimit: can(access, 'stay.rate_override') ? discountLimitOf(access) : '0',
    canDiscount: can(access, 'stay.rate_override'),
  }
}
