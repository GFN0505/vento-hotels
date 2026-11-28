// tapeChart.get: the one read behind the tape chart and the phone day list (spec: "The chart"). For
// one hotel and a window of 1, 7, 14 or 30 nights: room types in sort order with tonight's price
// and rooms left, booked, out of order and unassigned per night; active rooms with their status;
// out-of-order periods and stays (confirmed, and checked in from brick 8) overlapping the window.
// Bounded by rooms × nights, so not paginated. Readers: reservation readers, room.status or
// room.out_of_order (housekeeping and maintenance see bars without opening reservations).
import { ORPCError } from '@orpc/server'
import {
  addDays,
  chartStartFor,
  nightsOf,
  RESERVATION_READERS,
  shortGuestName,
  TAPE_CHART_READERS,
  type TapeChart,
  type TapeChartInput,
  tapeChartInputSchema,
} from '@vento/shared'
import { and, asc, eq, gt, inArray, isNull, lt } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { guests, reservations, stays } from '../db/schema/reservations.ts'
import { roomOutOfOrder, rooms, roomTypes } from '../db/schema/rooms.ts'
import { loadBookingHotel } from '../reservations/context.ts'
import { segmentsForStays } from '../reservations/in-house.ts'
import { bookedFor, capacityOf, keyOf, roomsOn } from '../reservations/locks.ts'
import { type Access, can, requireFeature } from '../tenancy/access.ts'
import { hotelRooms } from './hotel-rooms.ts'
import { tonightPrices } from './prices.ts'

export function requireChartRead(access: Access): void {
  requireFeature(access, 'front_desk')
  if (!TAPE_CHART_READERS.some((permission) => can(access, permission))) {
    throw new ORPCError('FORBIDDEN', {
      message: "You don't have access to the tape chart. Ask your GM.",
    })
  }
}

export async function getTapeChart(
  db: Pick<Database, 'select'>,
  access: Access,
  input: TapeChartInput,
): Promise<TapeChart> {
  requireChartRead(access)
  const ask = tapeChartInputSchema.parse(input)
  const hotel = await loadBookingHotel(db, access, ask.propertyId)
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  const from = ask.from ?? chartStartFor(hotel.businessDate)
  const to = addDays(from, ask.days)
  const dates = nightsOf(from, to)

  const types = await db
    .select({
      id: roomTypes.id,
      name: roomTypes.name,
      code: roomTypes.code,
      maxAdults: roomTypes.maxAdults,
      maxChildren: roomTypes.maxChildren,
    })
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.organizationId, scope.organizationId),
        eq(roomTypes.propertyId, scope.propertyId),
        isNull(roomTypes.archivedAt),
      ),
    )
    .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.name))
  const typeIds = types.map((type) => type.id)
  const [allRooms, capacity, booked, prices, stayRows, periods] = await Promise.all([
    hotelRooms(db, scope),
    capacityOf(db, scope, typeIds),
    bookedFor(db, scope, typeIds, from, addDays(to, -1)),
    tonightPrices(db, scope, hotel.businessDate, typeIds),
    db
      .select({
        id: stays.id,
        reservationId: stays.reservationId,
        number: reservations.number,
        firstName: guests.firstName,
        lastName: guests.lastName,
        roomTypeId: stays.roomTypeId,
        terms: stays.terms,
        arrival: stays.arrival,
        departure: stays.departure,
        adults: stays.adults,
        children: stays.children,
        roomId: stays.roomId,
        roomFrom: stays.roomFrom,
        version: stays.version,
        status: stays.status,
        depositDue: reservations.depositDue,
        depositDueAt: reservations.depositDueAt,
      })
      .from(stays)
      .innerJoin(reservations, eq(reservations.id, stays.reservationId))
      .innerJoin(guests, eq(guests.id, stays.guestId))
      .where(
        and(
          eq(stays.organizationId, scope.organizationId),
          eq(stays.propertyId, scope.propertyId),
          inArray(stays.status, ['confirmed', 'checked_in']),
          lt(stays.arrival, to),
          gt(stays.departure, from),
        ),
      )
      .orderBy(asc(stays.arrival), asc(stays.id)),
    db
      .select({ period: roomOutOfOrder, number: rooms.number })
      .from(roomOutOfOrder)
      .innerJoin(rooms, eq(rooms.id, roomOutOfOrder.roomId))
      .where(
        and(
          eq(roomOutOfOrder.organizationId, scope.organizationId),
          eq(roomOutOfOrder.propertyId, scope.propertyId),
          eq(roomOutOfOrder.status, 'active'),
          lt(roomOutOfOrder.fromDate, to),
          gt(roomOutOfOrder.backInService, from),
        ),
      )
      .orderBy(asc(roomOutOfOrder.fromDate)),
  ])

  // The rooms in-house guests used before a move (decision 0030), drawn muted in those rooms.
  const segments = await segmentsForStays(
    db,
    scope,
    stayRows.filter((stay) => stay.roomFrom !== null).map((stay) => stay.id),
  )
  const unassigned = new Map<string, number>()
  for (const stay of stayRows) {
    if (stay.roomId) continue
    for (const date of nightsOf(stay.arrival, stay.departure)) {
      const key = keyOf({ roomTypeId: stay.roomTypeId, date })
      unassigned.set(key, (unassigned.get(key) ?? 0) + 1)
    }
  }
  const open = RESERVATION_READERS.some((permission) => can(access, permission))
  return {
    hotel: {
      id: hotel.id,
      name: hotel.name,
      businessDate: hotel.businessDate,
      timeZone: hotel.timeZone,
      live: hotel.live,
    },
    from,
    days: ask.days,
    can: {
      open,
      move: can(access, 'room.move'),
      manage: can(access, 'reservation.manage'),
      status: can(access, 'room.status'),
      outOfOrder: can(access, 'room.out_of_order'),
      setUpRooms: can(access, 'rooms.setup'),
    },
    roomTypes: types.map((type) => {
      const cap = capacity.get(type.id)
      return {
        ...type,
        tonightPrice: prices.prices.get(type.id) ?? null,
        tonightIncludesTaxes: prices.includesTaxes,
        nights: dates.map((date) => {
          const key = keyOf({ roomTypeId: type.id, date })
          const sold = booked.get(key) ?? 0
          const sellable = roomsOn(cap, date)
          const rooms = cap?.rooms ?? 0
          return {
            date,
            rooms,
            outOfOrder: rooms - sellable,
            booked: sold,
            left: sellable - sold,
            unassigned: unassigned.get(key) ?? 0,
          }
        }),
      }
    }),
    rooms: allRooms.map((room) => ({
      ...room,
      statusAt: room.statusAt?.toISOString() ?? null,
    })),
    outOfOrder: periods.map(({ period, number }) => ({
      id: period.id,
      roomId: period.roomId,
      roomNumber: number,
      from: period.fromDate,
      backInService: period.backInService,
      reason: period.reason,
      reasonText: period.reasonText,
      note: period.note,
      byName: period.byName,
      status: period.status,
      version: period.version,
    })),
    stays: stayRows.map((stay) => ({
      id: stay.id,
      reservationId: stay.reservationId,
      number: stay.number,
      guestName: `${stay.firstName} ${stay.lastName}`,
      guestShort: shortGuestName(stay.firstName, stay.lastName),
      roomTypeId: stay.roomTypeId,
      planName: (stay.terms as { planName: string }).planName,
      arrival: stay.arrival,
      departure: stay.departure,
      adults: stay.adults,
      children: stay.children,
      roomId: stay.roomId,
      roomFrom: stay.roomFrom ?? stay.arrival,
      segments: segments
        .filter((segment) => segment.stayId === stay.id)
        .map((segment) => ({ roomId: segment.roomId, from: segment.fromDate, to: segment.toDate })),
      version: stay.version,
      status: stay.status === 'checked_in' ? ('checked_in' as const) : ('confirmed' as const),
      movable:
        stay.status === 'confirmed'
          ? stay.arrival >= hotel.businessDate
          : stay.departure > hotel.businessDate,
      depositDue:
        stay.depositDue && stay.depositDueAt
          ? { amount: stay.depositDue, dueAt: stay.depositDueAt.toISOString() }
          : null,
    })),
  }
}
