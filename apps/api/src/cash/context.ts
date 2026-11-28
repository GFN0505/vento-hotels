// What every cash procedure does first: the feature switch, the permission, and the hotel the
// request is about (in the caller's organization and hotels, else NOT_FOUND). Shifts of an archived
// hotel stay readable; nothing is written there.
import { dec, toAmount } from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { properties } from '../db/schema/tenancy.ts'
import { type Access, can, propertyScope, requireFeature } from '../tenancy/access.ts'
import { hotelArchived, hotelNotFound } from '../tenancy/errors.ts'
import { noPermission, RUN_SHIFT_ONLY } from './errors.ts'

export type Reader = Pick<Database, 'select'>
// Reads that take the latest row per drawer.
export type ListReader = Pick<Database, 'select' | 'selectDistinctOn'>
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export function requireOperate(access: Access): void {
  requireFeature(access, 'front_desk')
  if (!can(access, 'cashier_shift.operate')) throw noPermission(RUN_SHIFT_ONLY)
}

// Every shift of a hotel: GM, finance, owner and group admin.
export const readsAll = (access: Access) => can(access, 'leakage.view')

export function requireShiftReader(access: Access): void {
  requireFeature(access, 'front_desk')
  if (!can(access, 'cashier_shift.operate') && !readsAll(access)) {
    throw noPermission(RUN_SHIFT_ONLY)
  }
}

// The person's own limit for a difference, in naira: null = any; '0.00' without the permission.
export function varianceLimit(access: Access): string | null {
  const rule = access.rules['cashier_shift.variance']
  if (!rule.allowed) return '0.00'
  return rule.limit === null ? null : toAmount(rule.limit)
}

// Above the limit, a manager signs. Any difference needs a reason; only this decides who signs.
export function needsApproval(access: Access, value: string): boolean {
  if (dec(value).isZero()) return false
  const limit = varianceLimit(access)
  return limit !== null && dec(value).greaterThan(limit)
}

export type CashHotel = {
  id: string
  name: string
  businessDate: string
  timeZone: string
  live: boolean
  archived: boolean
}

const hotelColumns = {
  id: properties.id,
  name: properties.name,
  businessDate: properties.businessDate,
  timeZone: properties.timeZone,
  liveSince: properties.liveSince,
  archivedAt: properties.archivedAt,
}

function toHotel(row: {
  id: string
  name: string
  businessDate: string
  timeZone: string
  liveSince: string | null
  archivedAt: Date | null
}): CashHotel {
  return {
    id: row.id,
    name: row.name,
    businessDate: row.businessDate,
    timeZone: row.timeZone,
    live: row.liveSince !== null,
    archived: row.archivedAt !== null,
  }
}

// The hotel a request names. Writes (`write`) refuse an archived hotel and, with `hold`, keep the
// row FOR SHARE so it can't be archived (or its business date rolled) meanwhile.
export async function cashHotel(
  db: Reader | Tx,
  access: Access,
  propertyId: string,
  options: { write?: boolean; hold?: boolean } = {},
): Promise<CashHotel> {
  const query = db
    .select(hotelColumns)
    .from(properties)
    .where(and(eq(properties.id, propertyId), propertyScope(access)))
  const [row] = options.hold ? await query.for('share', { of: properties }) : await query
  if (!row) throw hotelNotFound()
  if (options.write && row.archivedAt) throw hotelArchived()
  return toHotel(row)
}

// Serialises "only one" checks that span rows (a person's one shift, a hotel's shift numbers).
export async function lockKey(tx: Tx, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
}
