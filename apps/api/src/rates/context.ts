// What every rates procedure does first: the feature switch, the permission, and the hotel (in the
// caller's organization and hotels, or "We couldn't find that hotel").

import { ORPCError } from '@orpc/server'
import { RATES_READERS } from '@vento/shared'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { ratePlans } from '../db/schema/rates.ts'
import { properties } from '../db/schema/tenancy.ts'
import {
  type Access,
  can,
  propertyScope,
  requireFeature,
  requireListableHotel,
  requirePermission,
  scopeToProperties,
} from '../tenancy/access.ts'
import { hotelNotFound } from '../tenancy/errors.ts'
import { planNotFound } from './errors.ts'

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
export type Reader = Pick<Database, 'select'>

export const EDIT_ONLY = 'Only a revenue manager, GM or the owner can change rates. Ask your GM.'

// Plans and the calendar: rates.edit, rooms.setup or reservation.manage (read-only for the last two).
export function requireRatesRead(access: Access): void {
  requireFeature(access, 'front_desk')
  if (!RATES_READERS.some((permission) => can(access, permission))) {
    throw new ORPCError('FORBIDDEN', { message: "You don't have access to rates. Ask your GM." })
  }
}

export function requireRatesEdit(access: Access): void {
  requireFeature(access, 'front_desk')
  requirePermission(access, 'rates.edit', EDIT_ONLY)
}

export type RatesProperty = {
  id: string
  name: string
  businessDate: string
  liveSince: string | null
  timeZone: string
  checkInTime: string
}

const columns = {
  id: properties.id,
  name: properties.name,
  businessDate: properties.businessDate,
  liveSince: properties.liveSince,
  timeZone: properties.timeZone,
  checkInTime: properties.checkInTime,
}

const tidy = (row: RatesProperty): RatesProperty => ({
  ...row,
  checkInTime: row.checkInTime.slice(0, 5),
})

// For reads that name a hotel: the hotel switch's rule (requireListableHotel), then its details.
export async function loadRatesProperty(
  db: Reader,
  access: Access,
  propertyId: string,
): Promise<RatesProperty> {
  await requireListableHotel(db, access, propertyId)
  const [row] = await db.select(columns).from(properties).where(eq(properties.id, propertyId))
  if (!row) throw hotelNotFound()
  return tidy(row)
}

// For writes: the hotel, held FOR SHARE until the transaction ends, so it can't be archived (or
// its business date rolled by night audit) meanwhile.
export async function holdRatesProperty(
  tx: Tx,
  access: Access,
  propertyId: string,
): Promise<RatesProperty> {
  const [row] = await tx
    .select(columns)
    .from(properties)
    .where(and(eq(properties.id, propertyId), propertyScope(access), isNull(properties.archivedAt)))
    .for('share')
  if (!row) throw hotelNotFound()
  return tidy(row)
}

export function isLive(property: Pick<RatesProperty, 'liveSince'>): boolean {
  return property.liveSince !== null
}

// The fields every rates audit event carries.
export function auditAt(property: RatesProperty) {
  return { propertyId: property.id, businessDate: property.businessDate }
}

// One lock per hotel for everything that changes its rates, taken first, before any plan or room
// type row: rate plan writes, date changes, undo, the first-rate table and room type restore (which
// adds the type to derived plans). With one order for all of them (this lock → plans → room types)
// a plan save and a room type restore can't deadlock; they queue. Rates change a few times a day,
// so serialising them per hotel costs nothing. Held until the transaction ends.
export async function lockHotelRates(tx: Tx, propertyId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`rates:${propertyId}`}, 0))`)
}

// The same lock in shared mode, for bookings: many quotes and bookings at once, but no rates write
// until they commit, so the prices a booking stores are the prices in force. Taken first, before
// any row lock (lock order in reservations/locks.ts).
export async function lockHotelRatesShared(tx: Pick<Database, 'execute'>, propertyId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock_shared(hashtextextended(${`rates:${propertyId}`}, 0))`,
  )
}

// The hotel rates lock for a plan named by id. A plan the caller can't see is not found.
export async function lockRatesOfPlan(tx: Tx, access: Access, planId: string): Promise<void> {
  const [plan] = await tx
    .select({ propertyId: ratePlans.propertyId })
    .from(ratePlans)
    .where(
      and(
        eq(ratePlans.id, planId),
        eq(ratePlans.organizationId, access.organizationId),
        scopeToProperties(access, ratePlans.propertyId),
      ),
    )
  if (!plan) throw planNotFound()
  await lockHotelRates(tx, plan.propertyId)
}
