// Companies: the group's legal entities (decision 0003; shown as "companies", spec:
// stage-1-hotels-and-companies.md). Group-level, so no property scope of their own; a member
// limited to some hotels may change a company only when every active hotel it owns is theirs.
import {
  addDays,
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
import { type Access, can, requireListableHotel, requirePermission } from './access.ts'
import {
  companyIsArchived,
  companyNameTaken,
  companyNotFound,
  companyOwnsHotels,
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
  pendingVatRegistered: entities.pendingVatRegistered,
  pendingVatFrom: entities.pendingVatFrom,
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
  pendingVatRegistered: boolean | null
  pendingVatFrom: string | null
  baseCurrency: string
  archivedAt: Date | null
  version: number
}

type OwnedHotel = {
  id: string
  name: string
  entityId: string
  live: boolean
  archived: boolean
  businessDate: string
}

// Every hotel each company owns, archived ones included, in one query. Archived hotels don't show
// in the list, but they still count for who may change the company: an admin limited to some
// hotels can't edit or archive a company that owns a hotel (even a closed one) outside them.
async function ownedHotels(db: Reader, access: Access, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, OwnedHotel[]>()
  const rows = await db
    .select({
      id: properties.id,
      name: properties.name,
      entityId: properties.entityId,
      liveSince: properties.liveSince,
      archivedAt: properties.archivedAt,
      businessDate: properties.businessDate,
    })
    .from(properties)
    .where(
      and(
        eq(properties.organizationId, access.organizationId),
        inArray(properties.entityId, [...ids]),
      ),
    )
    .orderBy(asc(properties.name))
  const byEntity = new Map<string, OwnedHotel[]>()
  for (const row of rows) {
    const list = byEntity.get(row.entityId) ?? []
    list.push({
      id: row.id,
      name: row.name,
      entityId: row.entityId,
      live: row.liveSince !== null,
      archived: row.archivedAt !== null,
      businessDate: row.businessDate,
    })
    byEntity.set(row.entityId, list)
  }
  return byEntity
}

const sees = (access: Access, hotelId: string) =>
  access.allProperties || access.propertyIds.includes(hotelId)

const activeHotels = (owned: readonly OwnedHotel[]) => owned.filter((hotel) => !hotel.archived)
const liveHotels = (owned: readonly OwnedHotel[]) =>
  activeHotels(owned).filter((hotel) => hotel.live)

function toView(row: EntityRow, owned: readonly OwnedHotel[], access: Access): Entity {
  const active = activeHotels(owned)
  const visible = active.filter((hotel) => sees(access, hotel.id))
  return {
    id: row.id,
    name: row.name,
    rcNumber: row.rcNumber,
    tin: row.tin,
    vatRegistered: row.vatRegistered,
    pendingVat:
      row.pendingVatRegistered !== null && row.pendingVatFrom
        ? { vatRegistered: row.pendingVatRegistered, from: row.pendingVatFrom }
        : null,
    baseCurrency: row.baseCurrency as Entity['baseCurrency'],
    status: row.archivedAt ? 'archived' : 'active',
    version: row.version,
    hotels: visible.map(({ id, name }) => ({ id, name })),
    otherHotels: active.length - visible.length,
    canEdit: can(access, 'setup.manage') && owned.every((hotel) => sees(access, hotel.id)),
    ownsLiveHotel: liveHotels(owned).length > 0,
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
  // One hotel chosen: only the company that owns it, for everyone who may see the hotel.
  const owner = query.propertyId
    ? (await requireListableHotel(db, access, query.propertyId)).entityId
    : undefined
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

// The company, locked FOR UPDATE, which the caller may change: every hotel it owns, archived ones
// included, is within their access.
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
async function staleCompany(tx: Tx, access: Access, row: EntityRow) {
  const by = await lastChangeBy(tx, {
    organizationId: access.organizationId,
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
      if (row.version !== input.version) throw await staleCompany(tx, access, row)
      const before: Record<string, unknown> = {}
      const after: Record<string, unknown> = {}
      for (const field of ['name', 'rcNumber', 'tin'] as const) {
        const value = input[field]
        if (value !== undefined && value !== row[field]) {
          before[field] = row[field]
          after[field] = value
        }
      }
      const owned = (await ownedHotels(tx, access, [row.id])).get(row.id) ?? []
      const vat = vatChange(row, owned, input.vatRegistered)
      if (Object.keys(after).length === 0 && !vat) return view
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
      const taxChange = 'tin' in after || vat !== undefined
      const exception = taxChange && view.ownsLiveHotel
      if (exception && !input.reason) {
        throw reasonRequired(
          `Give a reason. ${row.name} owns a live hotel, so this shows in the owner's daily report.`,
        )
      }
      await tx
        .update(entities)
        .set({ ...after, ...vat?.set, version: row.version + 1 })
        .where(eq(entities.id, row.id))
      await recordAudit(tx, access, {
        action: 'entity.changed',
        entityType: 'entity',
        entityId: row.id,
        before: { ...before, ...vat?.before },
        after: {
          ...after,
          ...vat?.after,
          liveProperty: view.ownsLiveHotel,
          ...(exception
            ? {
                exception: 'setup_changed',
                // Brick 16 lists the change in each of these hotels' reports.
                liveProperties: liveHotels(owned).map(({ id, name }) => ({ id, name })),
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

// VAT registration, like the owning company, changes at once while none of the company's hotels is
// live. Once one is, the change waits for the next business date (night audit applies it,
// brick 13), so tax lines on one business date never mix two rules; choosing the current value
// again cancels a waiting change.
function vatChange(row: EntityRow, owned: readonly OwnedHotel[], requested: boolean | undefined) {
  const heading = row.pendingVatRegistered ?? row.vatRegistered
  if (requested === undefined || requested === heading) return undefined
  const live = liveHotels(owned)
  if (live.length === 0) {
    return {
      set: { vatRegistered: requested, pendingVatRegistered: null, pendingVatFrom: null },
      before: { vatRegistered: row.vatRegistered },
      after: { vatRegistered: requested },
    }
  }
  if (requested === row.vatRegistered) {
    return {
      set: { pendingVatRegistered: null, pendingVatFrom: null },
      before: {
        pendingVatRegistered: row.pendingVatRegistered,
        pendingVatFrom: row.pendingVatFrom,
      },
      after: { pendingVatRegistered: null, pendingVatFrom: null },
    }
  }
  // The day after the latest business date among its live hotels, so no hotel's current date
  // is split (every Nigerian hotel is on Lagos time, so these are normally the same date).
  const latest =
    live
      .map((hotel) => hotel.businessDate)
      .sort()
      .at(-1) ?? live[0]?.businessDate
  const from = addDays(latest ?? '', 1)
  return {
    set: { pendingVatRegistered: requested, pendingVatFrom: from },
    before: { vatRegistered: row.vatRegistered },
    after: { pendingVatRegistered: requested, pendingVatFrom: from },
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
    await tx
      .update(entities)
      .set({ archivedAt: new Date(), version: row.version + 1 })
      .where(eq(entities.id, row.id))
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
    await tx
      .update(entities)
      .set({ archivedAt: null, version: row.version + 1 })
      .where(eq(entities.id, row.id))
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
