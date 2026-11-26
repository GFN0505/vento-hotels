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

export async function loadProperty(
  db: Reader,
  access: Access,
  propertyId: string,
): Promise<RoomsProperty> {
  const [property] = await db
    .select({
      id: properties.id,
      name: properties.name,
      businessDate: properties.businessDate,
      liveSince: properties.liveSince,
    })
    .from(properties)
    .where(and(eq(properties.id, propertyId), propertyScope(access), isNull(properties.archivedAt)))
  if (!property) throw new ORPCError('NOT_FOUND', { message: "We couldn't find that hotel" })
  return property
}

// The fields every rooms audit event carries.
export function auditAt(property: RoomsProperty) {
  return { propertyId: property.id, businessDate: property.businessDate }
}
