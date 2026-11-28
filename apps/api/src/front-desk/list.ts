// frontDesk.list and frontDesk.hotels (spec: "Front desk lists (#30)"). One hotel, its business
// date: Arrivals (to come, then checked in today), Departures (checked in and leaving today, or
// overdue until check-out exists) and In house (checked in over tonight or leaving today), with
// search, pills, counts and the Tonight figures the tape chart shows. A hotel has at most a few
// hundred such stays, so they're read in one query and paged here; the page is the shared shape.
import {
  addDays,
  type FrontDeskHotel,
  type FrontDeskList,
  type FrontDeskListInput,
  type FrontDeskRow,
  frontDeskListInputSchema,
  isForeign,
  nightsBetween,
  type Readiness,
  shortGuestName,
  type Tonight,
} from '@vento/shared'
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { guestRegistrations } from '../db/schema/front-desk.ts'
import { guests, reservations, stays } from '../db/schema/reservations.ts'
import { roomOutOfOrder, rooms, roomTypes } from '../db/schema/rooms.ts'
import { properties } from '../db/schema/tenancy.ts'
import { CHECK_IN_ONLY } from '../guests/registration/messages.ts'
import { checkInProblem } from '../reservations/check-in/rules.ts'
import { type Reader, readBookingHotel, requireReservationRead } from '../reservations/context.ts'
import { type Access, can, propertyScope } from '../tenancy/access.ts'

type StayLine = Awaited<ReturnType<typeof loadStays>>[number]

async function loadStays(
  db: Reader,
  scope: { organizationId: string; propertyId: string },
  businessDate: string,
) {
  const tomorrow = addDays(businessDate, 1)
  return db
    .select({
      id: stays.id,
      reservationId: stays.reservationId,
      number: reservations.number,
      source: reservations.source,
      reservationStatus: reservations.status,
      notes: reservations.notes,
      status: stays.status,
      version: stays.version,
      guestId: stays.guestId,
      firstName: guests.firstName,
      lastName: guests.lastName,
      nationality: guests.nationality,
      roomTypeId: stays.roomTypeId,
      roomTypeName: roomTypes.name,
      roomId: stays.roomId,
      roomNumber: rooms.number,
      roomStatus: rooms.housekeepingStatus,
      roomStatusBy: rooms.housekeepingStatusByName,
      roomStatusAt: rooms.housekeepingStatusAt,
      arrival: stays.arrival,
      departure: stays.departure,
      adults: stays.adults,
      children: stays.children,
      terms: stays.terms,
      checkedInAt: stays.checkedInAt,
      checkedInByName: stays.checkedInByName,
      checkedInBusinessDate: stays.checkedInBusinessDate,
      cardPrintedAt: stays.cardPrintedAt,
    })
    .from(stays)
    .innerJoin(reservations, eq(reservations.id, stays.reservationId))
    .innerJoin(guests, eq(guests.id, stays.guestId))
    .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
    .leftJoin(rooms, eq(rooms.id, stays.roomId))
    .where(
      and(
        eq(stays.organizationId, scope.organizationId),
        eq(stays.propertyId, scope.propertyId),
        or(
          and(eq(stays.status, 'checked_in'), lte(stays.arrival, businessDate)),
          and(
            eq(stays.status, 'confirmed'),
            lte(stays.arrival, tomorrow),
            sql`${stays.departure} > ${businessDate}`,
          ),
        ),
      ),
    )
}

const READY_ORDER: Record<Readiness, number> = {
  inspected: 0,
  clean: 0,
  dirty: 1,
  due_out: 1,
  out_of_order: 1,
  none: 2,
}

export async function frontDeskList(
  db: Pick<Database, 'select'>,
  access: Access,
  input: FrontDeskListInput,
): Promise<FrontDeskList> {
  requireReservationRead(access)
  const ask = frontDeskListInputSchema.parse(input)
  const hotel = await readBookingHotel(db, access, ask.propertyId)
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  const bd = hotel.businessDate
  const day = ask.day === 'tomorrow' ? addDays(bd, 1) : bd
  const [all, periods, roomCount] = await Promise.all([
    loadStays(db, scope, bd),
    db
      .select({ roomId: roomOutOfOrder.roomId })
      .from(roomOutOfOrder)
      .innerJoin(rooms, eq(rooms.id, roomOutOfOrder.roomId))
      .where(
        and(
          eq(roomOutOfOrder.propertyId, hotel.id),
          eq(roomOutOfOrder.status, 'active'),
          lte(roomOutOfOrder.fromDate, bd),
          sql`${roomOutOfOrder.backInService} > ${bd}`,
          isNull(rooms.archivedAt),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .where(
        and(eq(rooms.propertyId, hotel.id), isNull(rooms.archivedAt), isNull(roomTypes.archivedAt)),
      ),
  ])
  const outOfOrder = new Set(periods.map((p) => p.roomId))
  // Rooms whose in-house guest leaves today: free tonight, not ready yet.
  const leaving = new Map(
    all
      .filter((s) => s.status === 'checked_in' && s.departure === bd && s.roomId)
      .map((s) => [s.roomId as string, s]),
  )
  const leadDocs = await registrationFlags(
    db,
    access,
    all.filter((s) => s.status === 'checked_in').map((s) => s.id),
  )

  const arriving = (s: StayLine) =>
    s.arrival === day &&
    (s.status === 'confirmed' || (ask.day === 'today' && s.checkedInBusinessDate === bd))
  const inHouse = (s: StayLine) => s.status === 'checked_in' && s.departure >= bd
  const departing = (s: StayLine) => s.status === 'checked_in' && s.departure <= bd

  const canCheckIn = can(access, 'stay.check_in') && !hotel.archived
  const rowOf = (s: StayLine): FrontDeskRow => {
    let readiness: Readiness = 'none'
    let readinessText: string | null = null
    if (s.roomId && s.roomNumber) {
      const out = leaving.get(s.roomId)
      if (outOfOrder.has(s.roomId)) {
        readiness = 'out_of_order'
        readinessText = `${s.roomNumber} is out of order`
      } else if (out && out.id !== s.id && s.status === 'confirmed') {
        readiness = 'due_out'
        readinessText = `Due out · ${shortGuestName(out.firstName, out.lastName)}`
      } else {
        readiness = (s.roomStatus ?? 'dirty') as Readiness
      }
    }
    const nights = nightsBetween(s.arrival, s.departure)
    const flags = leadDocs.get(s.id)
    const problem =
      s.status === 'confirmed'
        ? checkInProblem(
            { status: s.status, arrival: s.arrival, checkedInAt: null, checkedInByName: null },
            s.reservationStatus,
            { businessDate: bd, timeZone: hotel.timeZone },
          )
        : null
    return {
      stayId: s.id,
      reservationId: s.reservationId,
      number: s.number,
      source: s.source,
      status: s.status === 'checked_in' ? 'checked_in' : 'confirmed',
      version: s.version,
      guestId: s.guestId,
      guestName: `${s.firstName} ${s.lastName}`,
      guestShort: shortGuestName(s.firstName, s.lastName),
      nationality: s.nationality,
      foreign: isForeign(s.nationality),
      roomTypeId: s.roomTypeId,
      roomTypeName: s.roomTypeName,
      room:
        s.roomId && s.roomNumber
          ? {
              id: s.roomId,
              number: s.roomNumber,
              status: (s.roomStatus ?? 'dirty') as 'clean' | 'inspected' | 'dirty',
              statusBy: s.roomStatusBy,
              statusAt: s.roomStatusAt?.toISOString() ?? null,
            }
          : null,
      readiness,
      readinessText,
      arrival: s.arrival,
      departure: s.departure,
      nights,
      adults: s.adults,
      children: s.children,
      notes: s.notes,
      planName: (s.terms as { planName: string }).planName,
      checkedIn:
        s.status === 'checked_in' && s.checkedInAt
          ? { at: s.checkedInAt.toISOString(), byName: s.checkedInByName ?? '' }
          : null,
      waitingForRoom:
        s.status === 'checked_in' && s.checkedInBusinessDate === bd && s.roomStatus === 'dirty',
      idPhotoMissing: s.status === 'checked_in' && Boolean(flags?.photoMissing),
      cardPrinted: s.cardPrintedAt !== null,
      night:
        s.status === 'checked_in'
          ? { n: Math.min(nights, nightsBetween(s.arrival, bd) + 1), of: nights }
          : null,
      checkInBlocked:
        s.status !== 'confirmed'
          ? null
          : !can(access, 'stay.check_in')
            ? CHECK_IN_ONLY
            : hotel.archived
              ? 'This hotel was archived.'
              : (problem?.message ?? null),
    }
  }

  const q = ask.search?.toLowerCase().trim()
  const matches = (row: FrontDeskRow) =>
    !q ||
    row.guestName.toLowerCase().includes(q) ||
    row.number.toLowerCase().includes(q) ||
    (row.room?.number.toLowerCase() ?? '') === q ||
    (row.room?.number.toLowerCase().startsWith(q) ?? false)

  const arrivals = all.filter(arriving).map(rowOf)
  const toCome = arrivals.filter((row) => row.status === 'confirmed')
  const checkedToday = arrivals.filter((row) => row.status === 'checked_in')
  const notReady = (row: FrontDeskRow) => row.room !== null && READY_ORDER[row.readiness] === 1
  let rows: FrontDeskRow[]
  if (ask.tab === 'arrivals') {
    const pill = (row: FrontDeskRow) =>
      ask.pill === 'unassigned'
        ? row.room === null
        : ask.pill === 'not_ready'
          ? notReady(row)
          : true
    const sorted = [...toCome]
      .sort(
        (a, b) =>
          READY_ORDER[a.readiness] - READY_ORDER[b.readiness] ||
          a.guestName.localeCompare(b.guestName),
      )
      .concat(
        ask.pill === 'all'
          ? [...checkedToday].sort((a, b) =>
              (b.checkedIn?.at ?? '').localeCompare(a.checkedIn?.at ?? ''),
            )
          : [],
      )
    rows = sorted.filter(pill)
  } else if (ask.tab === 'departures') {
    rows = all.filter(departing).map(rowOf)
  } else {
    rows = all.filter(inHouse).map(rowOf)
  }
  if (ask.tab !== 'arrivals') {
    rows.sort((a, b) =>
      (a.room?.number ?? '').localeCompare(b.room?.number ?? '', 'en', { numeric: true }),
    )
  }
  const filtered = rows.filter(matches)
  const start = (ask.page - 1) * ask.pageSize
  const housed = all.filter(inHouse)
  return {
    items: filtered.slice(start, start + ask.pageSize),
    page: ask.page,
    pageSize: ask.pageSize,
    total: filtered.length,
    hotel: {
      id: hotel.id,
      name: hotel.name,
      businessDate: bd,
      timeZone: hotel.timeZone,
      checkInTime: hotel.checkInTime,
      archived: hotel.archived,
    },
    day,
    counts: {
      toCome: toCome.length,
      checkedInToday: checkedToday.length,
      departures: all.filter(departing).length,
      inHouse: housed.length,
      inHouseGuests: housed.reduce((sum, s) => sum + s.adults + s.children, 0),
      unassigned: toCome.filter((row) => row.room === null).length,
      notReady: toCome.filter(notReady).length,
      tomorrow: all.filter((s) => s.status === 'confirmed' && s.arrival === addDays(bd, 1)).length,
    },
    tonight: tonightOf(all, outOfOrder, roomCount[0]?.n ?? 0, bd),
    can: {
      checkIn: canCheckIn,
      walkIn: canCheckIn && can(access, 'reservation.manage'),
      move: can(access, 'room.move') && !hotel.archived,
      manage: can(access, 'reservation.manage') && !hotel.archived,
      reverse: can(access, 'stay.check_in_reverse') && !hotel.archived,
      viewId: can(access, 'guest.id_view'),
    },
  }
}

// The Tonight strip (spec: "Tape chart and Tonight strip"): out of order first, then rooms with a
// confirmed stay arriving tonight, then rooms with a checked-in stay over tonight; the rest vacant;
// and confirmed stays over tonight with no room. Occupied + arriving + not in a room yet = the stays
// booked over tonight.
export function tonightOf(
  all: readonly Pick<StayLine, 'status' | 'arrival' | 'departure' | 'roomId'>[],
  outOfOrder: ReadonlySet<string>,
  roomCount: number,
  date: string,
): Tonight {
  const over = all.filter((s) => s.arrival <= date && date < s.departure)
  const arriving = new Set(
    over
      .filter((s) => s.status === 'confirmed' && s.roomId && !outOfOrder.has(s.roomId))
      .map((s) => s.roomId as string),
  )
  const occupied = new Set(
    over
      .filter(
        (s) =>
          s.status === 'checked_in' &&
          s.roomId &&
          !outOfOrder.has(s.roomId) &&
          !arriving.has(s.roomId),
      )
      .map((s) => s.roomId as string),
  )
  const unassigned = over.filter((s) => s.status === 'confirmed' && !s.roomId).length
  return {
    date,
    occupied: occupied.size,
    arriving: arriving.size,
    outOfOrder: outOfOrder.size,
    vacant: Math.max(0, roomCount - occupied.size - arriving.size - outOfOrder.size),
    unassigned,
  }
}

// Per checked-in stay: whether its lead guest's registration still needs the ID photo.
async function registrationFlags(db: Reader, access: Access, stayIds: readonly string[]) {
  const map = new Map<string, { photoMissing: boolean }>()
  if (stayIds.length === 0) return map
  const rows = await db
    .select({
      stayId: guestRegistrations.stayId,
      required: guestRegistrations.idDocumentRequired,
      documentId: guestRegistrations.idDocumentId,
      createdAt: guestRegistrations.createdAt,
    })
    .from(guestRegistrations)
    .where(
      and(
        eq(guestRegistrations.organizationId, access.organizationId),
        eq(guestRegistrations.lead, true),
        inArray(guestRegistrations.stayId, [...stayIds]),
      ),
    )
  for (const row of rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    map.set(row.stayId, { photoMissing: row.required && row.documentId === null })
  }
  return map
}

// The Pick a hotel panel with All hotels: each hotel within access with today's arrivals (to come
// and checked in today) and in-house stays.
export async function frontDeskHotels(
  db: Pick<Database, 'select'>,
  access: Access,
): Promise<FrontDeskHotel[]> {
  requireReservationRead(access)
  const hotels = await db
    .select({
      id: properties.id,
      name: properties.name,
      businessDate: properties.businessDate,
      archivedAt: properties.archivedAt,
    })
    .from(properties)
    .where(propertyScope(access))
    .orderBy(properties.name)
  if (hotels.length === 0) return []
  const counts = await db
    .select({
      propertyId: stays.propertyId,
      arrivals: sql<number>`count(*) filter (where ${stays.arrival} = ${properties.businessDate} and (${stays.status} = 'confirmed' or ${stays.checkedInBusinessDate} = ${properties.businessDate}))::int`,
      inHouse: sql<number>`count(*) filter (where ${stays.status} = 'checked_in' and ${stays.departure} >= ${properties.businessDate})::int`,
    })
    .from(stays)
    .innerJoin(properties, eq(properties.id, stays.propertyId))
    .where(
      and(
        eq(stays.organizationId, access.organizationId),
        inArray(
          stays.propertyId,
          hotels.map((h) => h.id),
        ),
        inArray(stays.status, ['confirmed', 'checked_in']),
        lte(stays.arrival, properties.businessDate),
      ),
    )
    .groupBy(stays.propertyId)
  const byHotel = new Map(counts.map((row) => [row.propertyId, row]))
  return hotels.map((hotel) => ({
    id: hotel.id,
    name: hotel.name,
    businessDate: hotel.businessDate,
    arrivals: byHotel.get(hotel.id)?.arrivals ?? 0,
    inHouse: byHotel.get(hotel.id)?.inHouse ?? 0,
    archived: hotel.archivedAt !== null,
  }))
}
