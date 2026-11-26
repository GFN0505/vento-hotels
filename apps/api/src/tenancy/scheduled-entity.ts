// The other half of scheduled changes on live hotels: night audit (brick 13) calls these while it
// rolls a hotel's business date, in the same transaction, so a new owning company or VAT
// registration takes over from the first moment of the new date and a business date is never
// split between two companies' books or two VAT rules.
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
      version: properties.version,
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
    .set({
      entityId: due.pendingEntityId,
      pendingEntityId: null,
      pendingEntityFrom: null,
      // An open settings page saved after this must reload, not undo the move.
      version: due.version + 1,
    })
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

// The VAT registration of the company that owns this hotel, when its scheduled change is due.
export async function applyScheduledVatChange(
  tx: Tx,
  actor: Actor,
  property: { id: string; newBusinessDate: string },
): Promise<boolean> {
  const [due] = await tx
    .select({
      id: entities.id,
      vatRegistered: entities.vatRegistered,
      pending: entities.pendingVatRegistered,
      from: entities.pendingVatFrom,
      version: entities.version,
    })
    .from(entities)
    .innerJoin(properties, eq(properties.entityId, entities.id))
    .where(
      and(
        eq(properties.id, property.id),
        eq(entities.organizationId, actor.organizationId),
        lte(entities.pendingVatFrom, property.newBusinessDate),
      ),
    )
    .for('update', { of: entities })
  if (!due || due.pending === null) return false
  await tx
    .update(entities)
    .set({
      vatRegistered: due.pending,
      pendingVatRegistered: null,
      pendingVatFrom: null,
      version: due.version + 1,
    })
    .where(eq(entities.id, due.id))
  await recordAudit(tx, actor, {
    action: 'entity.vat_changed',
    entityType: 'entity',
    entityId: due.id,
    propertyId: property.id,
    businessDate: property.newBusinessDate,
    before: { vatRegistered: due.vatRegistered },
    after: {
      vatRegistered: due.pending,
      effectiveFrom: due.from,
      liveProperty: true,
      exception: 'setup_changed',
    },
  })
  return true
}
