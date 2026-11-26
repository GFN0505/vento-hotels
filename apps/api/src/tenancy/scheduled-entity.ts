// The other half of a scheduled owning-company change: night audit (brick 13) calls this while it
// rolls a live hotel's business date, in the same transaction, so the new company takes over from
// the first moment of the new date and a business date is never split between two companies.
import { and, eq, lte } from 'drizzle-orm'
import { type Actor, recordAudit } from '../audit/record.ts'
import { entities, properties } from '../db/schema/tenancy.ts'
import type { Tx } from './property-views.ts'

export async function applyScheduledEntityChange(
  tx: Tx,
  actor: Actor,
  property: { id: string; newBusinessDate: string },
): Promise<boolean> {
  const [due] = await tx
    .select({
      entityId: properties.entityId,
      pendingEntityId: properties.pendingEntityId,
      from: properties.pendingEntityFrom,
    })
    .from(properties)
    .where(
      and(
        eq(properties.id, property.id),
        eq(properties.organizationId, actor.organizationId),
        lte(properties.pendingEntityFrom, property.newBusinessDate),
      ),
    )
    .for('update')
  if (!due?.pendingEntityId) return false
  const [target] = await tx
    .select({ name: entities.name })
    .from(entities)
    .where(eq(entities.id, due.pendingEntityId))
  await tx
    .update(properties)
    .set({ entityId: due.pendingEntityId, pendingEntityId: null, pendingEntityFrom: null })
    .where(eq(properties.id, property.id))
  await recordAudit(tx, actor, {
    action: 'property.entity_changed',
    entityType: 'property',
    entityId: property.id,
    propertyId: property.id,
    businessDate: property.newBusinessDate,
    before: { entityId: due.entityId },
    after: {
      entityId: due.pendingEntityId,
      entityName: target?.name ?? null,
      effectiveFrom: due.from,
      liveProperty: true,
      exception: 'setup_changed',
    },
  })
  return true
}
