// What every rooms procedure does first: the feature switch, the permission, and the property the
// change is for (in the caller's organization and hotels, or NOT_FOUND).
import { ORPCError } from '@orpc/server'
import { and, eq, isNull } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { properties } from '../db/schema/tenancy.ts'
import { type Access, propertyScope, requireFeature, requirePermission } from '../tenancy/access.ts'

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
export type Reader = Pick<Database, 'select'>

export function requireRoomsSetup(access: Access): void {
  requireFeature(access, 'front_desk')
  requirePermission(access, 'rooms.setup', 'Only a GM or the owner can set up rooms. Ask your GM.')
}

export type RoomsProperty = {
  id: string
  name: string
  businessDate: string
  liveSince: string | null
}

const propertyColumns = {
  id: properties.id,
  name: properties.name,
  businessDate: properties.businessDate,
  liveSince: properties.liveSince,
}

const inScope = (access: Access, propertyId: string) =>
  and(eq(properties.id, propertyId), propertyScope(access), isNull(properties.archivedAt))

const hotelNotFound = () => new ORPCError('NOT_FOUND', { message: "We couldn't find that hotel" })

export async function loadProperty(
  db: Reader,
  access: Access,
  propertyId: string,
): Promise<RoomsProperty> {
  const [property] = await db
    .select(propertyColumns)
    .from(properties)
    .where(inScope(access, propertyId))
  if (!property) throw hotelNotFound()
  return property
}

// For writes: the hotel, held FOR SHARE until the transaction ends, so it can't be archived
// meanwhile (archiving takes it FOR UPDATE). If an archive got there first, Postgres re-checks the
// row after the wait and the hotel is not found.
export async function holdProperty(
  tx: Tx,
  access: Access,
  propertyId: string,
): Promise<RoomsProperty> {
  const [property] = await tx
    .select(propertyColumns)
    .from(properties)
    .where(inScope(access, propertyId))
    .for('share')
  if (!property) throw hotelNotFound()
  return property
}

// The fields every rooms audit event carries.
export function auditAt(property: RoomsProperty) {
  return { propertyId: property.id, businessDate: property.businessDate }
}
