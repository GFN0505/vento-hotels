// Companies: the group's legal entities (decision 0003; shown as "companies", spec:
// stage-1-hotels-and-companies.md). Group-level, so no property scope of their own; a member
// limited to some hotels may change a company only when every active hotel it owns is theirs.
import {
  DEFAULT_TIME_ZONE,
  type Entity,
  type Page,
  type PageQuery,
  pageOffset,
  tinDigits,
  toPage,
} from '@vento/shared'
import { and, asc, count, eq, inArray, isNotNull, isNull, ne, or, type SQL, sql } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isUniqueViolation } from '../db/errors.ts'
import { entities, properties } from '../db/schema/tenancy.ts'
import { type Access, can, propertyScope, requirePermission } from './access.ts'
import {
  companyIsArchived,
  companyNameTaken,
  companyNotFound,
  companyOwnsHotels,
  hotelNotFound,
  numberTaken,
  outsideAccess,
  reasonRequired,
  SETUP_ONLY,
  staleVersion,
} from './errors.ts'
import { lastChangeBy } from './last-change.ts'
import type { Reader, Tx } from './property-views.ts'

const baseColumns = {
  id: entities.id,
  name: entities.name,
  rcNumber: entities.rcNumber,
  tin: entities.tin,
  vatRegistered: entities.vatRegistered,
  baseCurrency: entities.baseCurrency,
  archivedAt: entities.archivedAt,
  version: entities.version,
}
type EntityRow = {
  id: string
  name: string
  rcNumber: string | null
  tin: string | null
  vatRegistered: boolean
  baseCurrency: string
  archivedAt: Date | null
  version: number
}

type OwnedHotel = { id: string; name: string; entityId: string; live: boolean }

// The active hotels each company owns, in one query.
async function ownedHotels(db: Reader, access: Access, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, OwnedHotel[]>()
  const rows = await db
    .select({
      id: properties.id,
      name: properties.name,
      entityId: properties.entityId,
      liveSince: properties.liveSince,
    })
    .from(properties)
    .where(
      and(
        eq(properties.organizationId, access.organizationId),
        inArray(properties.entityId, [...ids]),
        isNull(properties.archivedAt),
      ),
    )
    .orderBy(asc(properties.name))
  const byEntity = new Map<string, OwnedHotel[]>()
  for (const row of rows) {
    const list = byEntity.get(row.entityId) ?? []
    list.push({ id: row.id, name: row.name, entityId: row.entityId, live: row.liveSince !== null })
    byEntity.set(row.entityId, list)
  }
  return byEntity
}

const sees = (access: Access, hotelId: string) =>
  access.allProperties || access.propertyIds.includes(hotelId)

function toView(row: EntityRow, owned: readonly OwnedHotel[], access: Access): Entity {
  const visible = owned.filter((hotel) => sees(access, hotel.id))
  return {
    id: row.id,
    name: row.name,
    rcNumber: row.rcNumber,
    tin: row.tin,
    vatRegistered: row.vatRegistered,
    baseCurrency: row.baseCurrency as Entity['baseCurrency'],
    status: row.archivedAt ? 'archived' : 'active',
    version: row.version,
    hotels: visible.map(({ id, name }) => ({ id, name })),
    otherHotels: owned.length - visible.length,
    canEdit: can(access, 'setup.manage') && visible.length === owned.length,
    ownsLiveHotel: owned.some((hotel) => hotel.live),
  }
}

async function views(db: Reader, access: Access, rows: EntityRow[]): Promise<Entity[]> {
  const owned = await ownedHotels(
    db,
    access,
    rows.map((row) => row.id),
  )
  return rows.map((row) => toView(row, owned.get(row.id) ?? [], access))
}

async function readEntity(db: Reader, access: Access, id: string): Promise<Entity> {
  const [row] = await db
    .select(baseColumns)
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.organizationId, access.organizationId)))
  if (!row) throw companyNotFound()
  const [view] = await views(db, access, [row])
  if (!view) throw companyNotFound()
  return view
}

export async function listEntities(
  db: Database,
  access: Access,
  query: PageQuery & { status: 'active' | 'archived'; propertyId?: string | undefined },
): Promise<Page<Entity>> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  let owner: string | undefined
  if (query.propertyId) {
    const [hotel] = await db
      .select({ entityId: properties.entityId })
      .from(properties)
      .where(and(eq(properties.id, query.propertyId), propertyScope(access)))
    if (!hotel) throw hotelNotFound()
    owner = hotel.entityId
  }
  const where = and(
    eq(entities.organizationId, access.organizationId),
    query.status === 'archived' ? isNotNull(entities.archivedAt) : isNull(entities.archivedAt),
    owner ? eq(entities.id, owner) : undefined,
  )
  const [rows, [total]] = await Promise.all([
    db
      .select(baseColumns)
      .from(entities)
      .where(where)
      .orderBy(asc(entities.name))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db.select({ value: count() }).from(entities).where(where),
  ])
  return toPage(await views(db, access, rows), total?.value ?? 0, query)
}

export async function getEntity(db: Database, access: Access, id: string): Promise<Entity> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  return readEntity(db, access, id)
}

type Identity = {
  name?: string | undefined
  rcNumber?: string | null | undefined
  tin?: string | null | undefined
}

// Name (whatever the capitals, archived included), RC number and TIN (by its digits) are each
// unique in the group.
async function requireUnique(db: Reader, access: Access, fields: Identity, exceptId?: string) {
  const checks: SQL[] = []
  if (fields.name) checks.push(sql`lower(${entities.name}) = lower(${fields.name})`)
  if (fields.rcNumber) checks.push(eq(entities.rcNumber, fields.rcNumber))
  if (fields.tin) {
    checks.push(sql`regexp_replace(${entities.tin}, '[^0-9]', '', 'g') = ${tinDigits(fields.tin)}`)
  }
  if (checks.length === 0) return
  const clashes = await db
    .select({
      name: entities.name,
      rcNumber: entities.rcNumber,
      tin: entities.tin,
      archivedAt: entities.archivedAt,
    })
    .from(entities)
    .where(
      and(
        eq(entities.organizationId, access.organizationId),
        exceptId ? ne(entities.id, exceptId) : undefined,
        or(...checks),
      ),
    )
  for (const clash of clashes) {
    if (fields.name && clash.name.toLowerCase() === fields.name.toLowerCase()) {
      throw companyNameTaken({ name: clash.name, archived: clash.archivedAt !== null })
    }
  }
  for (const clash of clashes) {
    if (fields.rcNumber && clash.rcNumber === fields.rcNumber) {
      throw numberTaken('rcNumber', fields.rcNumber, clash.name)
    }
    if (fields.tin && clash.tin && tinDigits(clash.tin) === tinDigits(fields.tin)) {
      throw numberTaken('tin', fields.tin, clash.name)
    }
  }
}

// A lost race on the unique indexes: explain it the way the pre-check would.
async function explainClash(
  db: Reader,
  access: Access,
  error: unknown,
  fields: Identity,
  id?: string,
): Promise<never> {
  if (isUniqueViolation(error)) await requireUnique(db, access, fields, id)
  throw error
}

export async function createEntity(
  db: Database,
  access: Access,
  input: {
    name: string
    rcNumber?: string | undefined
    tin?: string | undefined
    vatRegistered: boolean
  },
): Promise<Entity> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  try {
    return await db.transaction(async (tx) => {
      await requireUnique(tx, access, input)
      const [row] = await tx
        .insert(entities)
        .values({
          organizationId: access.organizationId,
          name: input.name,
          rcNumber: input.rcNumber ?? null,
          tin: input.tin ?? null,
          vatRegistered: input.vatRegistered,
        })
        .returning({ id: entities.id })
      if (!row) throw new Error('company insert returned nothing')
      await recordAudit(tx, access, {
        action: 'entity.created',
        entityType: 'entity',
        entityId: row.id,
        after: {
          name: input.name,
          rcNumber: input.rcNumber ?? null,
          tin: input.tin ?? null,
          vatRegistered: input.vatRegistered,
          baseCurrency: 'NGN',
        },
      })
      return readEntity(tx, access, row.id)
    })
  } catch (error) {
    return explainClash(db, access, error, input)
  }
}

// The company, locked FOR UPDATE, which the caller may change: every active hotel it owns is
// within their access.
async function lockEditable(tx: Tx, access: Access, id: string) {
  const [row] = await tx
    .select(baseColumns)
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.organizationId, access.organizationId)))
    .for('update')
  if (!row) throw companyNotFound()
  const view = toView(row, (await ownedHotels(tx, access, [row.id])).get(row.id) ?? [], access)
  if (!view.canEdit) throw outsideAccess(row.name)
  return { row, view }
}

// Companies are group-level, so the time is Lagos time (every hotel is in Nigeria).
async function staleCompany(tx: Tx, row: EntityRow) {
  const by = await lastChangeBy(tx, {
    entityType: 'entity',
    entityId: row.id,
    actions: ['entity.changed'],
    timeZone: DEFAULT_TIME_ZONE,
  })
  return staleVersion(row.name, by)
}

export async function updateEntity(
  db: Database,
  access: Access,
  input: {
    id: string
    version: number
    name?: string | undefined
    rcNumber?: string | null | undefined
    tin?: string | null | undefined
    vatRegistered?: boolean | undefined
    reason?: string | undefined
  },
): Promise<Entity> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  try {
    return await db.transaction(async (tx) => {
      const { row, view } = await lockEditable(tx, access, input.id)
      if (row.archivedAt) throw companyIsArchived(row.name)
      if (row.version !== input.version) throw await staleCompany(tx, row)
      const before: Record<string, unknown> = {}
      const after: Record<string, unknown> = {}
      for (const field of ['name', 'rcNumber', 'tin', 'vatRegistered'] as const) {
        const value = input[field]
        if (value !== undefined && value !== row[field]) {
          before[field] = row[field]
          after[field] = value
        }
      }
      if (Object.keys(after).length === 0) return view
      await requireUnique(
        tx,
        access,
        {
          name: after.name as string | undefined,
          rcNumber: after.rcNumber as string | null | undefined,
          tin: after.tin as string | null | undefined,
        },
        row.id,
      )
      // TIN and VAT changes on a live hotel's company reach the owner's daily report.
      const taxChange = 'tin' in after || 'vatRegistered' in after
      const exception = taxChange && view.ownsLiveHotel
      if (exception && !input.reason) {
        throw reasonRequired(
          `Give a reason. ${row.name} owns a live hotel, so this shows in the owner's daily report.`,
        )
      }
      await tx
        .update(entities)
        .set({ ...after, version: row.version + 1 })
        .where(eq(entities.id, row.id))
      const liveHotels = ((await ownedHotels(tx, access, [row.id])).get(row.id) ?? [])
        .filter((hotel) => hotel.live)
        .map(({ id, name }) => ({ id, name }))
      await recordAudit(tx, access, {
        action: 'entity.changed',
        entityType: 'entity',
        entityId: row.id,
        before,
        after: {
          ...after,
          liveProperty: view.ownsLiveHotel,
          ...(exception
            ? {
                exception: 'setup_changed',
                // Brick 16 lists the change in each of these hotels' reports. A VAT change applies
                // from each hotel's next business date (bricks 3 and 13).
                liveProperties: liveHotels,
              }
            : {}),
        },
        reason: input.reason ?? null,
      })
      return readEntity(tx, access, row.id)
    })
  } catch (error) {
    return explainClash(db, access, error, input, input.id)
  }
}

// Only a company that owns no active hotel (and none scheduled to move to it) can be archived.
export async function archiveEntity(
  db: Database,
  access: Access,
  input: { id: string; reason: string },
): Promise<Entity> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  return db.transaction(async (tx) => {
    const { row, view } = await lockEditable(tx, access, input.id)
    if (row.archivedAt) return view
    // Counted after the lock: a hotel being moved to this company holds it FOR SHARE.
    const [owning] = await tx
      .select({ value: count() })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, access.organizationId),
          isNull(properties.archivedAt),
          or(eq(properties.entityId, row.id), eq(properties.pendingEntityId, row.id)),
        ),
      )
    if (owning && owning.value > 0) throw companyOwnsHotels(row.name, owning.value)
    await tx.update(entities).set({ archivedAt: new Date() }).where(eq(entities.id, row.id))
    await recordAudit(tx, access, {
      action: 'entity.archived',
      entityType: 'entity',
      entityId: row.id,
      before: { archived: false },
      after: { archived: true, name: row.name },
      reason: input.reason,
    })
    return readEntity(tx, access, row.id)
  })
}

export async function restoreEntity(
  db: Database,
  access: Access,
  input: { id: string; reason: string },
): Promise<Entity> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  return db.transaction(async (tx) => {
    const { row, view } = await lockEditable(tx, access, input.id)
    if (!row.archivedAt) return view
    await tx.update(entities).set({ archivedAt: null }).where(eq(entities.id, row.id))
    await recordAudit(tx, access, {
      action: 'entity.restored',
      entityType: 'entity',
      entityId: row.id,
      before: { archived: true },
      after: { archived: false, name: row.name },
      reason: input.reason,
    })
    return readEntity(tx, access, row.id)
  })
}
