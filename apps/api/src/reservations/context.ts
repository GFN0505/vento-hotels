// What every reservations procedure does first: the feature switch, the permission, and the hotel
// (in the caller's organization and hotels, else "We couldn't find that hotel").
import { RESERVATION_READERS, stateCodeOf } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { entities, properties } from '../db/schema/tenancy.ts'
import type { Hotel } from '../finance/context.ts'
import { type Access, can, propertyScope, requireFeature } from '../tenancy/access.ts'
import { hotelArchived, hotelNotFound } from '../tenancy/errors.ts'
import { MANAGE_ONLY, noPermission, READ_ONLY } from './errors.ts'

export type Reader = Pick<Database, 'select'>
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

// Availability, quotes, bookings and guest search: works in a PIN session on the front desk PC.
export function requireReservationManage(access: Access): void {
  requireFeature(access, 'front_desk')
  if (!can(access, 'reservation.manage')) throw noPermission(MANAGE_ONLY)
}

// The list and the detail: also finance and the night auditor, read-only.
export function requireReservationRead(access: Access): void {
  requireFeature(access, 'front_desk')
  if (!RESERVATION_READERS.some((permission) => can(access, permission))) {
    throw noPermission(READ_ONLY)
  }
}

// The finance view of a hotel (for tax rules) plus what a booking needs.
export type BookingHotel = Hotel & {
  checkInTime: string
  bookingPrefix: string
  liveSince: string | null
  address: string | null
}

const columns = {
  id: properties.id,
  name: properties.name,
  state: properties.state,
  businessDate: properties.businessDate,
  liveSince: properties.liveSince,
  archivedAt: properties.archivedAt,
  timeZone: properties.timeZone,
  checkInTime: properties.checkInTime,
  bookingPrefix: properties.bookingPrefix,
  addressLine1: properties.addressLine1,
  area: properties.area,
  entityId: properties.entityId,
  entityName: entities.name,
  pendingEntityId: properties.pendingEntityId,
  pendingEntityFrom: properties.pendingEntityFrom,
}

function query(db: Reader, access: Access, propertyId: string) {
  return db
    .select(columns)
    .from(properties)
    .innerJoin(entities, eq(entities.id, properties.entityId))
    .where(and(eq(properties.id, propertyId), propertyScope(access)))
}

function toHotel(row: Awaited<ReturnType<typeof query>>[number]): BookingHotel {
  return {
    id: row.id,
    name: row.name,
    stateCode: stateCodeOf(row.state),
    businessDate: row.businessDate,
    live: row.liveSince !== null,
    liveSince: row.liveSince,
    archived: row.archivedAt !== null,
    timeZone: row.timeZone,
    checkInTime: row.checkInTime.slice(0, 5),
    bookingPrefix: row.bookingPrefix,
    address: [row.addressLine1, row.area].filter(Boolean).join(', ') || null,
    entityId: row.entityId,
    entityName: row.entityName,
    pendingEntityId: row.pendingEntityId,
    pendingEntityFrom: row.pendingEntityFrom,
  }
}

// A hotel to read a reservation at: in scope; archived hotels' reservations stay readable.
export async function readBookingHotel(
  db: Reader,
  access: Access,
  propertyId: string,
): Promise<BookingHotel> {
  const [row] = await query(db, access, propertyId)
  if (!row) throw hotelNotFound()
  return toHotel(row)
}

// A hotel to read or quote at: in scope, not archived.
export async function loadBookingHotel(
  db: Reader,
  access: Access,
  propertyId: string,
): Promise<BookingHotel> {
  const [row] = await query(db, access, propertyId)
  if (!row) throw hotelNotFound()
  if (row.archivedAt) throw hotelArchived()
  return toHotel(row)
}

// The hotel a booking is for, held FOR SHARE until the transaction ends, so it can't be archived
// or its business date rolled by night audit meanwhile (lock step 2).
export async function holdBookingHotel(
  tx: Tx,
  access: Access,
  propertyId: string,
): Promise<BookingHotel> {
  const [row] = await query(tx, access, propertyId).for('share', { of: properties })
  if (!row) throw hotelNotFound()
  if (row.archivedAt) throw hotelArchived()
  return toHotel(row)
}
