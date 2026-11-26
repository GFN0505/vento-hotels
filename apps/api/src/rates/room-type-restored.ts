// Restoring an archived room type (rooms module) brings its prices back: its rows on plans are
// never removed while it is archived, so every plan that sold it sells it again. Plans derived from
// a parent that sells it also get it, including those created while it was archived, so a derived
// plan always follows its parent's room types after a restore. Runs in the restore's transaction.
// The caller holds the hotel rates lock (lockHotelRates), so plan rows are taken in the same order
// as plan writes.
import { and, eq, inArray, isNotNull, isNull, notExists, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { type AuditEvent, recordAuditMany } from '../audit/record.ts'
import { ratePlanRoomTypes, ratePlans } from '../db/schema/rates.ts'
import type { Access } from '../tenancy/access.ts'
import type { Tx } from './context.ts'
import { requireValidPrices } from './guards.ts'

export async function roomTypeRestored(
  tx: Tx,
  access: Access,
  property: { id: string; businessDate: string; liveSince: string | null },
  roomType: { id: string; name: string },
): Promise<void> {
  const parentRow = alias(ratePlanRoomTypes, 'parent_row')
  const own = alias(ratePlanRoomTypes, 'own_row')
  const followers = await tx
    .select({ id: ratePlans.id, version: ratePlans.version })
    .from(ratePlans)
    .innerJoin(
      parentRow,
      and(
        eq(parentRow.ratePlanId, ratePlans.parentId),
        eq(parentRow.roomTypeId, roomType.id),
        isNotNull(parentRow.weekdayPrice),
      ),
    )
    .where(
      and(
        eq(ratePlans.organizationId, access.organizationId),
        eq(ratePlans.propertyId, property.id),
        eq(ratePlans.pricing, 'derived'),
        isNull(ratePlans.archivedAt),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(own)
            .where(and(eq(own.ratePlanId, ratePlans.id), eq(own.roomTypeId, roomType.id))),
        ),
      ),
    )
    .orderBy(ratePlans.id)
    .for('update', { of: ratePlans })
  if (followers.length > 0) {
    await tx.insert(ratePlanRoomTypes).values(
      followers.map((plan) => ({
        organizationId: access.organizationId,
        propertyId: property.id,
        ratePlanId: plan.id,
        roomTypeId: roomType.id,
      })),
    )
  }
  // Every active plan the type is back on has changed what its editor shows, so a form opened
  // while the type was archived gets STALE_VERSION instead of silently dropping it on save.
  await tx
    .update(ratePlans)
    .set({ version: sql`${ratePlans.version} + 1` })
    .where(
      and(
        eq(ratePlans.propertyId, property.id),
        isNull(ratePlans.archivedAt),
        inArray(
          ratePlans.id,
          tx
            .select({ id: ratePlanRoomTypes.ratePlanId })
            .from(ratePlanRoomTypes)
            .where(eq(ratePlanRoomTypes.roomTypeId, roomType.id)),
        ),
      ),
    )
  if (followers.length === 0) return
  // A derived price must still be above ₦0 and its meal allocation for the type now added.
  await requireValidPrices(tx, access, property)
  const events: AuditEvent[] = followers.map((plan) => ({
    action: 'rate_plan.changed',
    entityType: 'rate_plan',
    entityId: plan.id,
    propertyId: property.id,
    businessDate: property.businessDate,
    before: {},
    after: {
      roomTypesAdded: [{ roomTypeId: roomType.id, roomTypeName: roomType.name }],
      followsRestoreOf: roomType.name,
      liveProperty: property.liveSince !== null,
    },
  }))
  await recordAuditMany(tx, access, events)
}
