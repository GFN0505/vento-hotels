// How a hotel is read: one query with its owning company, any scheduled company change, its logo
// and its active room count, so the list and the settings page never need a second round trip.
import type { Property } from '@vento/shared'
import { and, asc, count, eq, isNotNull, isNull, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database } from '../db/client.ts'
import { rooms } from '../db/schema/rooms.ts'
import { entities, fileUploads, properties } from '../db/schema/tenancy.ts'
import type { StorageProvider } from '../providers/storage.ts'
import { containsPattern } from '../team/rules.ts'
import { type Access, propertyScope } from './access.ts'

export type Reader = Pick<Database, 'select'>
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
export type HotelDeps = { db: Database; storage?: StorageProvider | undefined }

// Logos are shown for an hour per link; the settings page and list fetch fresh links on load.
const LOGO_LINK_SECONDS = 60 * 60

const pendingEntities = alias(entities, 'pending_entities')

// Written with an alias: Drizzle leaves columns unqualified in subqueries.
const activeRooms = sql<number>`(select count(*) from ${rooms} r where r.property_id = ${properties}.id and r.archived_at is null)::int`

const viewColumns = {
  id: properties.id,
  entityId: properties.entityId,
  entityName: entities.name,
  entityRcNumber: entities.rcNumber,
  entityTin: entities.tin,
  pendingEntityId: properties.pendingEntityId,
  pendingEntityName: pendingEntities.name,
  pendingEntityFrom: properties.pendingEntityFrom,
  name: properties.name,
  addressLine1: properties.addressLine1,
  area: properties.area,
  lga: properties.lga,
  state: properties.state,
  country: properties.country,
  timeZone: properties.timeZone,
  checkInTime: properties.checkInTime,
  checkOutTime: properties.checkOutTime,
  businessDate: properties.businessDate,
  liveSince: properties.liveSince,
  archivedAt: properties.archivedAt,
  version: properties.version,
  logoUploadId: properties.logoUploadId,
  logoKey: fileUploads.storageKey,
  roomCount: activeRooms.mapWith(Number),
}

function viewQuery(db: Reader) {
  return db
    .select(viewColumns)
    .from(properties)
    .innerJoin(entities, eq(entities.id, properties.entityId))
    .leftJoin(pendingEntities, eq(pendingEntities.id, properties.pendingEntityId))
    .leftJoin(fileUploads, eq(fileUploads.id, properties.logoUploadId))
}

type ViewRow = Awaited<ReturnType<typeof viewQuery>>[number]

// Postgres returns `time` as HH:MM:SS; the API speaks HH:MM.
const hhmm = (time: string) => time.slice(0, 5)

async function toView(row: ViewRow, storage: StorageProvider | undefined): Promise<Property> {
  const logoUrl =
    row.logoUploadId && row.logoKey && storage
      ? await storage.signedDownload(row.logoKey, LOGO_LINK_SECONDS)
      : null
  return {
    id: row.id,
    entityId: row.entityId,
    entityName: row.entityName,
    entityDetailsMissing: !row.entityRcNumber || !row.entityTin,
    pendingEntity:
      row.pendingEntityId && row.pendingEntityName && row.pendingEntityFrom
        ? { id: row.pendingEntityId, name: row.pendingEntityName, from: row.pendingEntityFrom }
        : null,
    name: row.name,
    addressLine1: row.addressLine1,
    area: row.area,
    lga: row.lga,
    state: row.state,
    country: row.country,
    timeZone: row.timeZone,
    checkInTime: hhmm(row.checkInTime),
    checkOutTime: hhmm(row.checkOutTime),
    businessDate: row.businessDate,
    liveSince: row.liveSince,
    status: row.archivedAt ? 'archived' : row.liveSince ? 'live' : 'setting_up',
    archivedAt: row.archivedAt?.toISOString() ?? null,
    logo: row.logoUploadId && logoUrl ? { uploadId: row.logoUploadId, url: logoUrl } : null,
    roomCount: row.roomCount,
    version: row.version,
  }
}

// One hotel the caller may see, archived or not; undefined when it isn't theirs to see.
export async function readProperty(
  deps: { db: Reader; storage?: StorageProvider | undefined },
  access: Access,
  id: string,
): Promise<Property | undefined> {
  const [row] = await viewQuery(deps.db).where(and(propertyScope(access), eq(properties.id, id)))
  return row ? toView(row, deps.storage) : undefined
}

export async function readProperties(
  deps: { db: Reader; storage?: StorageProvider | undefined },
  access: Access,
  query: { status: 'active' | 'archived'; q?: string | undefined; limit: number; offset: number },
): Promise<{ items: Property[]; total: number }> {
  const where = and(
    propertyScope(access),
    query.status === 'archived' ? isNotNull(properties.archivedAt) : isNull(properties.archivedAt),
    query.q ? (sql`${properties.name} ilike ${containsPattern(query.q)}` as SQL) : undefined,
  )
  const [rows, [total]] = await Promise.all([
    viewQuery(deps.db)
      .where(where)
      .orderBy(asc(properties.name))
      .limit(query.limit)
      .offset(query.offset),
    deps.db.select({ value: count() }).from(properties).where(where),
  ])
  return {
    items: await Promise.all(rows.map((row) => toView(row, deps.storage))),
    total: total?.value ?? 0,
  }
}
