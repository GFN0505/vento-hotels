// The frame every change runs in: one transaction, the change's key lock (twins of one request queue
// here, so the second finds the first's result), the hotel's rates lock (shared), the hotel row
// (FOR SHARE: not archived, business date can't roll meanwhile), then the replay check, then the
// change itself, which locks the reservation row next (lock step 2b). A key reused with a different
// change is refused; a key from another hotel or group is never revealed.
import { createHash } from 'node:crypto'
import type { ChangedReservation } from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { isUniqueViolation, violatedConstraint } from '../../db/errors.ts'
import { penalties, reservationChanges, reservations } from '../../db/schema/reservations.ts'
import { lockHotelRatesShared } from '../../rates/context.ts'
import { type Access, scopeToProperties } from '../../tenancy/access.ts'
import { type BookingHotel, holdBookingHotel, type Reader, type Tx } from '../context.ts'
import { changeAlreadySaved } from './errors.ts'
import { reservationHotel } from './load.ts'

export function requestHashOf(input: { idempotencyKey: string }): string {
  const { idempotencyKey: _key, ...rest } = input
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex')
}

async function existingChange(db: Reader, access: Access, key: string) {
  const [row] = await db
    .select({
      id: reservationChanges.id,
      reservationId: reservationChanges.reservationId,
      hash: reservationChanges.requestHash,
    })
    .from(reservationChanges)
    .where(
      and(
        eq(reservationChanges.organizationId, access.organizationId),
        eq(reservationChanges.idempotencyKey, key),
        scopeToProperties(access, reservationChanges.propertyId),
      ),
    )
  return row
}

// The reservation as a change leaves it, with the penalties that change recorded.
export async function changedView(
  db: Reader,
  reservationId: string,
  changeId: string,
): Promise<ChangedReservation> {
  const [row] = await db
    .select({ id: reservations.id, number: reservations.number, status: reservations.status })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
  const recorded = await db
    .select({ id: penalties.id, amount: penalties.amount, status: penalties.status })
    .from(penalties)
    .where(eq(penalties.changeId, changeId))
  return {
    id: row?.id ?? reservationId,
    number: row?.number ?? '',
    status: row?.status ?? 'confirmed',
    penalties: recorded,
  }
}

async function replay(
  db: Reader,
  existing: { id: string; reservationId: string; hash: string },
  hash: string,
): Promise<ChangedReservation> {
  if (existing.hash !== hash) throw changeAlreadySaved()
  return changedView(db, existing.reservationId, existing.id)
}

export type ChangeWork = (tx: Tx, hotel: BookingHotel) => Promise<ChangedReservation>

export async function inChangeTransaction(
  db: Database,
  access: Access,
  request: { idempotencyKey: string; reservationId: string; hash: string },
  work: ChangeWork,
): Promise<ChangedReservation> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`change:${access.organizationId}:${request.idempotencyKey}`}, 0))`,
      )
      const propertyId = await reservationHotel(tx, access, request.reservationId)
      await lockHotelRatesShared(tx, propertyId)
      const hotel = await holdBookingHotel(tx, access, propertyId)
      const existing = await existingChange(tx, access, request.idempotencyKey)
      if (existing) return replay(tx, existing, request.hash)
      return work(tx, hotel)
    })
  } catch (error) {
    if (
      isUniqueViolation(error) &&
      violatedConstraint(error) === 'reservation_changes_organization_id_idempotency_key_unique'
    ) {
      const existing = await existingChange(db, access, request.idempotencyKey)
      if (existing) return replay(db, existing, request.hash)
      throw changeAlreadySaved()
    }
    throw error
  }
}
