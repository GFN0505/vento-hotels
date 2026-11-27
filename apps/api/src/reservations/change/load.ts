// Reading a reservation for a change: the reservation in the member's organization and hotels, its
// stays, their stored nights and the guest. `lock` takes the reservation row FOR UPDATE (lock step
// 2b in locks.ts): one change per reservation at a time. Bookings never lock existing reservations,
// so there is no cycle with them.
import type { StayTerms } from '@vento/shared'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import {
  guests,
  reservationChanges,
  reservations,
  stayNights,
  stays,
} from '../../db/schema/reservations.ts'
import { roomTypes } from '../../db/schema/rooms.ts'
import { type Access, scopeToProperties } from '../../tenancy/access.ts'
import { hotelNotFound } from '../../tenancy/errors.ts'
import type { Reader } from '../context.ts'
import { reservationNotFound } from '../errors.ts'
import { reservationChanged } from './errors.ts'

export type StoredTerms = StayTerms & { penaltyAmount: string }
export type ReservationRow = typeof reservations.$inferSelect
export type StayRow = typeof stays.$inferSelect & { roomTypeName: string }
export type NightRow = typeof stayNights.$inferSelect

export type Loaded = {
  reservation: ReservationRow
  stays: StayRow[]
  nights: NightRow[]
  guest: { firstName: string; lastName: string; nationality: string }
}

const inScope = (access: Access) =>
  and(
    eq(reservations.organizationId, access.organizationId),
    scopeToProperties(access, reservations.propertyId),
  )

// The reservation's hotel, read without a lock, so the caller can take the hotel's locks first.
// Another group's reservation is not found; one at a hotel of the group the member can't see
// answers as the hotel switch does (PROPERTY_NOT_FOUND).
export async function reservationHotel(db: Reader, access: Access, reservationId: string) {
  const [row] = await db
    .select({ propertyId: reservations.propertyId })
    .from(reservations)
    .where(
      and(
        eq(reservations.id, reservationId),
        eq(reservations.organizationId, access.organizationId),
      ),
    )
  if (!row) throw reservationNotFound()
  if (!access.allProperties && !access.propertyIds.includes(row.propertyId)) throw hotelNotFound()
  return row.propertyId
}

export async function loadForChange(
  db: Reader,
  access: Access,
  reservationId: string,
  lock = false,
): Promise<Loaded> {
  const query = db
    .select()
    .from(reservations)
    .where(and(eq(reservations.id, reservationId), inScope(access)))
  const [reservation] = lock ? await query.for('update') : await query
  if (!reservation) throw reservationNotFound()
  const stayRows = await db
    .select({ stay: stays, roomTypeName: roomTypes.name })
    .from(stays)
    .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
    .where(eq(stays.reservationId, reservation.id))
    .orderBy(asc(stays.arrival), asc(stays.id))
  const nights = stayRows.length
    ? await db
        .select()
        .from(stayNights)
        .where(
          inArray(
            stayNights.stayId,
            stayRows.map((row) => row.stay.id),
          ),
        )
        .orderBy(asc(stayNights.date))
    : []
  const [guest] = await db
    .select({
      firstName: guests.firstName,
      lastName: guests.lastName,
      nationality: guests.nationality,
    })
    .from(guests)
    .where(eq(guests.id, reservation.guestId))
  if (!guest) throw reservationNotFound()
  return {
    reservation,
    stays: stayRows.map((row) => ({ ...row.stay, roomTypeName: row.roomTypeName })),
    nights,
    guest,
  }
}

// The reservation's version as cancel and no-show see it: the sum of its stays' versions.
export const versionOf = (loaded: Pick<Loaded, 'stays'>) =>
  loaded.stays.reduce((sum, stay) => sum + stay.version, 0)

export const termsOf = (stay: StayRow) => stay.terms as StoredTerms

// Refuses a change made on an older version, naming who changed it and when.
export async function requireVersion(
  db: Reader,
  loaded: Loaded,
  sent: number,
  actual: number,
  timeZone: string,
) {
  if (sent === actual) return
  const [last] = await db
    .select({
      byName: reservationChanges.byName,
      at: reservationChanges.createdAt,
      kind: reservationChanges.kind,
    })
    .from(reservationChanges)
    .where(eq(reservationChanges.reservationId, loaded.reservation.id))
    .orderBy(desc(reservationChanges.createdAt))
    .limit(1)
  throw reservationChanged(last, timeZone)
}
