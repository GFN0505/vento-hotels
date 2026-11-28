// checkIn.prepare: what the check-in sheet opens with (spec: "The sheet"). The stay, its guest and
// room with readiness, the booked type's free rooms ready first, the registration rules in force,
// the guest's earlier registration to reuse (masked; the number stays on the server) and why it
// can't be checked in, if so. A read: checkIn.checkIn checks everything again under its locks.
import {
  type CheckInPrepare,
  compareRoomOptions,
  ECOWAS_NATIONS,
  nightsBetween,
  type RoomOption,
} from '@vento/shared'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { guestRegistrations } from '../../db/schema/front-desk.ts'
import { guests } from '../../db/schema/reservations.ts'
import { properties } from '../../db/schema/tenancy.ts'
import { reusableDocument } from '../../guests/registration/documents.ts'
import { fieldLists, ruleSetFor } from '../../guests/registration/rules.ts'
import { hotelRooms } from '../../tape-chart/hotel-rooms.ts'
import { type Access, can } from '../../tenancy/access.ts'
import { stayHotel } from '../assign/assign.ts'
import { stayNotFound } from '../assign/errors.ts'
import { busyRooms, roomConflict } from '../assign/room-check.ts'
import { loadForChange, termsOf } from '../change/load.ts'
import { loadBookingHotel, type Reader } from '../context.ts'
import { requireCheckIn } from './check-in.ts'
import { checkInProblem } from './rules.ts'

// The guest's latest registration in the group, for a returning guest, with an ID document that can
// be reused. It may be from a hotel this member can't see: only the reused fields leave the server.
export async function previousRegistration(
  db: Reader,
  access: Access,
  guestId: string,
  businessDate: string,
): Promise<CheckInPrepare['previous']> {
  const [earlier] = await db
    .select({ registration: guestRegistrations, hotelName: properties.name })
    .from(guestRegistrations)
    .innerJoin(properties, eq(properties.id, guestRegistrations.propertyId))
    .where(
      and(
        eq(guestRegistrations.organizationId, access.organizationId),
        eq(guestRegistrations.guestId, guestId),
        eq(guestRegistrations.lead, true),
      ),
    )
    .orderBy(desc(guestRegistrations.createdAt))
    .limit(1)
  if (!earlier) return null
  const document = await reusableDocument(db, access, guestId, businessDate)
  const r = earlier.registration
  return {
    id: r.id,
    title: r.title,
    dateOfBirth: r.dateOfBirth,
    addressLine: r.addressLine,
    addressCity: r.addressCity,
    addressRegion: r.addressRegion,
    addressCountry: r.addressCountry,
    purpose: r.purpose,
    vehiclePlate: r.vehiclePlate,
    occupation: r.occupation,
    idType: r.idType,
    idNumberMasked: r.idNumberMasked,
    idCountry: r.idCountry,
    idExpiry: r.idExpiry,
    hotelName: earlier.hotelName,
    reusableDocument: document
      ? {
          id: document.id,
          capturedAt: document.createdAt.toISOString(),
          contentType: document.contentType,
        }
      : null,
  }
}

export async function prepareCheckIn(
  db: Pick<Database, 'select' | 'execute'>,
  access: Access,
  input: { stayId: string },
): Promise<CheckInPrepare> {
  requireCheckIn(access)
  const where = await stayHotel(db, access, input.stayId)
  const hotel = await loadBookingHotel(db, access, where.propertyId)
  const loaded = await loadForChange(db, access, where.reservationId)
  const stay = loaded.stays.find((s) => s.id === input.stayId)
  if (!stay) throw stayNotFound()
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  const [guest] = await db
    .select({
      id: guests.id,
      title: guests.title,
      firstName: guests.firstName,
      lastName: guests.lastName,
      nationality: guests.nationality,
      phone: guests.phone,
      email: guests.email,
    })
    .from(guests)
    .where(eq(guests.id, stay.guestId))
  if (!guest) throw stayNotFound()
  const [all, busy, ruleSet, previous] = await Promise.all([
    hotelRooms(db, scope),
    busyRooms(db, hotel.id, stay.arrival, stay.departure, stay.id),
    ruleSetFor(db, { ...scope, stateCode: hotel.stateCode }, hotel.businessDate),
    previousRegistration(db, access, guest.id, hotel.businessDate),
  ])
  // Rooms whose checked-in guest leaves today: free from tonight, but not ready yet.
  const dueOut = await db.execute<{ room_id: string; first_name: string; last_name: string }>(sql`
    select s.room_id, g.first_name, g.last_name from stays s join guests g on g.id = s.guest_id
    where s.property_id = ${hotel.id}::uuid and s.status = 'checked_in'
      and s.departure = ${hotel.businessDate}::date and s.room_id is not null`)
  const leaving = new Map(dueOut.rows.map((row) => [row.room_id, row]))
  const option = (room: (typeof all)[number]): RoomOption => ({
    id: room.id,
    number: room.number,
    floor: room.floor,
    features: room.features,
    connectsTo: room.connectsTo,
    accessible: room.accessible,
    status: leaving.has(room.id) && room.status !== 'dirty' ? 'dirty' : room.status,
  })
  const rooms = all
    .filter(
      (room) =>
        room.roomTypeId === stay.roomTypeId && !busy.has(room.id) && room.id !== stay.roomId,
    )
    .sort((a, b) => compareRoomOptions(option(a), option(b), true))
    .map(option)
  const assigned = all.find((room) => room.id === stay.roomId)
  let roomView: CheckInPrepare['room'] = null
  if (stay.roomId) {
    const conflict = await roomConflict(db, stay.roomId, stay.arrival, stay.departure, {
      stay: stay.id,
    })
    const out = leaving.get(stay.roomId)
    const number = assigned?.number ?? ''
    roomView = {
      id: stay.roomId,
      number,
      status: assigned?.status ?? 'dirty',
      statusBy: assigned?.statusBy ?? null,
      statusAt: assigned?.statusAt?.toISOString() ?? null,
      notReady: out
        ? `${number}: ${out.first_name} ${out.last_name} is due out today and hasn't left yet.`
        : assigned?.status === 'dirty'
          ? `${number} is dirty${assigned.statusBy ? ` (${assigned.statusBy})` : ''}. The guest can register now and get the key when it's clean.`
          : null,
      problem: !assigned
        ? `Room ${number || 'assigned'} was removed. Pick another room.`
        : conflict?.kind === 'out_of_order'
          ? `${number} is out of order. Pick another room.`
          : conflict?.kind === 'stay'
            ? `${number} was given to ${conflict.guestShort}. Pick another room.`
            : null,
    }
  }
  const lists = fieldLists(ruleSet)
  const terms = termsOf(stay)
  const first = loaded.nights.find((night) => night.stayId === stay.id)
  const problem = checkInProblem(stay, loaded.reservation.status, hotel)
  const now = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: hotel.timeZone,
  }).format(new Date())
  return {
    stay: {
      id: stay.id,
      reservationId: loaded.reservation.id,
      number: loaded.reservation.number,
      version: stay.version,
      status: stay.status,
      arrival: stay.arrival,
      departure: stay.departure,
      nights: nightsBetween(stay.arrival, stay.departure),
      adults: stay.adults,
      children: stay.children,
      roomTypeId: stay.roomTypeId,
      roomTypeName: stay.roomTypeName,
      planName: terms.planName,
      pricePerNight: first?.soldPrice ?? '0.00',
      pricesIncludeTaxes: terms.pricesIncludeTaxes,
      notes: loaded.reservation.notes,
    },
    guest: {
      id: guest.id,
      title: guest.title,
      firstName: guest.firstName,
      lastName: guest.lastName,
      nationality: guest.nationality,
      hasContact: Boolean(guest.phone || guest.email),
    },
    hotel: {
      id: hotel.id,
      name: hotel.name,
      businessDate: hotel.businessDate,
      checkInTime: hotel.checkInTime,
      timeZone: hotel.timeZone,
    },
    room: roomView,
    rooms,
    bookedTypeFull: rooms.length === 0 && (!roomView || roomView.problem !== null),
    rules: {
      version: ruleSet.version,
      lead: lists.lead,
      foreign: lists.foreign,
      ecowas: [...ECOWAS_NATIONS],
    },
    previous,
    blocked: problem?.message ?? null,
    early: now < hotel.checkInTime,
    can: {
      changeRoom: can(access, 'room.move'),
      skipIdDocument: can(access, 'guest.id_skip'),
      swapGuest: can(access, 'reservation.manage'),
    },
  }
}
