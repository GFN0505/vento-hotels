// What every taxes, payments and FX procedure does first: the feature switch, the permission, and
// the hotel the request is about (in the caller's organization and hotels, else NOT_FOUND). Also the
// group's hotels, for the scope rules: VAT covers every hotel, a state tax every hotel in its state.
import { calendarDateIn, DEFAULT_TIME_ZONE, stateCodeOf, stateShortName } from '@vento/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { entities, properties } from '../db/schema/tenancy.ts'
import { type Access, can, propertyScope, requireFeature } from '../tenancy/access.ts'
import { hotelArchived, hotelNotFound } from '../tenancy/errors.ts'
import { noPermission } from './errors.ts'

export type Reader = Pick<Database, 'select'>
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export const FINANCE_SETUP_ONLY =
  'Only finance or the owner can change taxes and payment setup. Ask your finance team.'
export const FX_ONLY = 'Only a GM, finance or the owner can enter FX rates.'

export function requireFinanceSetup(access: Access): void {
  requireFeature(access, 'front_desk')
  if (!can(access, 'finance.setup')) throw noPermission(FINANCE_SETUP_ONLY)
}

// Taxes are read by the people who price rooms.
export function requireTaxesRead(access: Access): void {
  requireFeature(access, 'front_desk')
  if (!['finance.setup', 'rates.edit', 'rooms.setup'].some((p) => can(access, p as never))) {
    throw noPermission(FINANCE_SETUP_ONLY)
  }
}

// Payment setup and FX rates are read by setup people and whoever enters the day's rates.
export function requirePaymentsRead(access: Access): void {
  requireFeature(access, 'front_desk')
  if (!['finance.setup', 'fx.enter', 'rooms.setup'].some((p) => can(access, p as never))) {
    throw noPermission(FINANCE_SETUP_ONLY)
  }
}

export type Hotel = {
  id: string
  name: string
  stateCode: string | null
  businessDate: string
  live: boolean
  archived: boolean
  timeZone: string
  entityId: string
  entityName: string
  pendingEntityId: string | null
  pendingEntityFrom: string | null
}

const hotelColumns = {
  id: properties.id,
  name: properties.name,
  state: properties.state,
  businessDate: properties.businessDate,
  liveSince: properties.liveSince,
  archivedAt: properties.archivedAt,
  timeZone: properties.timeZone,
  entityId: properties.entityId,
  entityName: entities.name,
  pendingEntityId: properties.pendingEntityId,
  pendingEntityFrom: properties.pendingEntityFrom,
}

type HotelRow = {
  id: string
  name: string
  state: string | null
  businessDate: string
  liveSince: string | null
  archivedAt: Date | null
  timeZone: string
  entityId: string
  entityName: string
  pendingEntityId: string | null
  pendingEntityFrom: string | null
}

function toHotel(row: HotelRow): Hotel {
  return {
    id: row.id,
    name: row.name,
    stateCode: stateCodeOf(row.state),
    businessDate: row.businessDate,
    live: row.liveSince !== null,
    archived: row.archivedAt !== null,
    timeZone: row.timeZone,
    entityId: row.entityId,
    entityName: row.entityName,
    pendingEntityId: row.pendingEntityId,
    pendingEntityFrom: row.pendingEntityFrom,
  }
}

// The hotel a request names: in the organization and the member's access, else "We couldn't find
// that hotel"; archived says so. With `hold`, the row is held FOR SHARE until the transaction ends
// so it can't be archived meanwhile.
export async function loadHotel(
  db: Reader | Tx,
  access: Access,
  propertyId: string,
  options: { hold?: boolean } = {},
): Promise<Hotel> {
  const query = db
    .select(hotelColumns)
    .from(properties)
    .innerJoin(entities, eq(entities.id, properties.entityId))
    .where(and(eq(properties.id, propertyId), propertyScope(access)))
  const [row] = options.hold ? await query.for('share', { of: properties }) : await query
  if (!row) throw hotelNotFound()
  if (row.archivedAt) throw hotelArchived()
  return toHotel(row)
}

// Every hotel of the group, archived ones included (for scope rules and names).
export async function groupHotels(db: Reader, organizationId: string): Promise<Hotel[]> {
  const rows = await db
    .select(hotelColumns)
    .from(properties)
    .innerJoin(entities, eq(entities.id, properties.entityId))
    .where(eq(properties.organizationId, organizationId))
    .orderBy(asc(properties.name))
  return rows.map(toHotel)
}

export const sees = (access: Access, hotelId: string) =>
  access.allProperties || access.propertyIds.includes(hotelId)

export const today = () => calendarDateIn(DEFAULT_TIME_ZONE)

// "25 Nov 2026"
export function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function clockIn(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(at)
}

export const stateName = (code: string | null) => (code ? stateShortName(code) : null)

// Serialises writes that check "at least one", "only one" or "nothing scheduled" across rows, so two
// people saving at once can't both pass the check.
export async function lockKey(tx: Tx, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
}
