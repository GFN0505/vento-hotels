// Hotels (properties): list, read, add and edit (spec: stage-1-hotels-and-companies.md).
// organizationId always comes from `access`; a hotel outside the caller's scope is NOT_FOUND.
// Every write runs in one transaction with its audit event.
import { ORPCError } from '@orpc/server'
import {
  addDays,
  calendarDateIn,
  isLgaOf,
  newId,
  type Page,
  type PageQuery,
  type Property,
  pageOffset,
  suggestBookingPrefix,
  toPage,
} from '@vento/shared'
import { and, eq, ne, sql } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import { createFirstDrawer } from '../cash/drawers/service.ts'
import { isUniqueViolation } from '../db/errors.ts'
import { reservations } from '../db/schema/reservations.ts'
import { entities, memberProperties, properties } from '../db/schema/tenancy.ts'
import { type Access, can, propertyScope, requirePermission } from './access.ts'
import {
  bookingPrefixLocked,
  bookingPrefixTaken,
  chooseCompany,
  companyArchived,
  hotelArchived,
  hotelIsArchived,
  hotelNameTaken,
  hotelNotFound,
  reasonRequired,
  SETUP_ONLY,
  staleVersion,
} from './errors.ts'
import { lastChangeBy } from './last-change.ts'
import {
  type HotelDeps,
  type Reader,
  readProperties,
  readProperty,
  type Tx,
} from './property-views.ts'

export async function listProperties(
  deps: HotelDeps,
  access: Access,
  query: PageQuery & { status: 'active' | 'archived'; q?: string | undefined },
): Promise<Page<Property>> {
  if (query.status === 'archived') requirePermission(access, 'setup.manage', SETUP_ONLY)
  const { items, total } = await readProperties(deps, access, {
    status: query.status,
    q: query.q,
    limit: query.pageSize,
    offset: pageOffset(query),
  })
  return toPage(items, total, query)
}

// Archived hotels stay readable for people who manage setup; others are told it was archived.
export async function getProperty(deps: HotelDeps, access: Access, id: string): Promise<Property> {
  const property = await readProperty(deps, access, id)
  if (!property) throw hotelNotFound()
  if (property.status === 'archived' && !can(access, 'setup.manage')) throw hotelArchived()
  return property
}

// Hotel names are unique in the group whatever the capitals, archived hotels included.
export async function requireHotelNameFree(
  db: Reader,
  access: Access,
  name: string,
  exceptId?: string,
): Promise<void> {
  const [taken] = await db
    .select({ name: properties.name, archivedAt: properties.archivedAt })
    .from(properties)
    .where(
      and(
        eq(properties.organizationId, access.organizationId),
        sql`lower(${properties.name}) = lower(${name})`,
        exceptId ? ne(properties.id, exceptId) : undefined,
      ),
    )
  if (taken) throw hotelNameTaken({ name: taken.name, archived: taken.archivedAt !== null })
}

// The company a hotel will belong to, held FOR SHARE so it can't be archived until this commits.
// Selected by id alone: after waiting for a lock, Postgres re-checks the WHERE clause, and an
// "active only" filter would turn "just archived" into "not found".
export async function lockActiveEntity(
  tx: Tx,
  access: Access,
  entityId: string,
): Promise<{ id: string; name: string }> {
  const [entity] = await tx
    .select({ id: entities.id, name: entities.name, archivedAt: entities.archivedAt })
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.organizationId, access.organizationId)))
    .for('share')
  if (!entity) throw chooseCompany()
  if (entity.archivedAt) throw companyArchived(entity.name)
  return { id: entity.id, name: entity.name }
}

type CreateInput = {
  entityId: string
  name: string
  bookingPrefix?: string | undefined
  addressLine1?: string | undefined
  area?: string | undefined
  lga?: string | undefined
  state?: string | undefined
  timeZone: string
  checkInTime?: string | undefined
  checkOutTime?: string | undefined
}

// Onboarding creates the group's first hotel with just a name and state. Every later hotel needs
// its full address (registration cards, invoices and guest messages use it).
async function requireAddressUnlessFirst(tx: Tx, access: Access, input: CreateInput) {
  if (input.addressLine1 && input.area && input.state && input.lga) return
  const [existing] = await tx
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.organizationId, access.organizationId))
    .limit(1)
  if (existing) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Add the street, area, state and LGA.',
      data: { code: 'ADDRESS_REQUIRED' },
    })
  }
}

export async function createProperty(
  deps: HotelDeps,
  access: Access,
  input: CreateInput,
): Promise<Property> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  try {
    return await deps.db.transaction(async (tx) => {
      const entity = await lockActiveEntity(tx, access, input.entityId)
      await requireHotelNameFree(tx, access, input.name)
      await requireAddressUnlessFirst(tx, access, input)
      const id = newId()
      const businessDate = calendarDateIn(input.timeZone)
      const bookingPrefix = await choosePrefix(tx, access, input)
      const [row] = await tx
        .insert(properties)
        .values({
          id,
          organizationId: access.organizationId,
          entityId: entity.id,
          name: input.name,
          bookingPrefix,
          addressLine1: input.addressLine1 ?? null,
          area: input.area ?? null,
          lga: input.lga ?? null,
          state: input.state ?? null,
          timeZone: input.timeZone,
          ...(input.checkInTime ? { checkInTime: input.checkInTime } : {}),
          ...(input.checkOutTime ? { checkOutTime: input.checkOutTime } : {}),
          // A new hotel starts on today's date in its own time zone; night audit moves it after.
          businessDate,
        })
        .returning({ checkInTime: properties.checkInTime, checkOutTime: properties.checkOutTime })
      const eventId = newId()
      await recordAudit(tx, access, {
        id: eventId,
        action: 'property.created',
        entityType: 'property',
        entityId: id,
        propertyId: id,
        businessDate,
        after: {
          name: input.name,
          bookingPrefix,
          entityId: entity.id,
          entityName: entity.name,
          addressLine1: input.addressLine1 ?? null,
          area: input.area ?? null,
          lga: input.lga ?? null,
          state: input.state ?? null,
          timeZone: input.timeZone,
          checkInTime: row?.checkInTime.slice(0, 5),
          checkOutTime: row?.checkOutTime.slice(0, 5),
          businessDate,
          liveProperty: false,
        },
      })
      // Every hotel has a cash drawer from the start (cashier shifts spec).
      await createFirstDrawer(tx, access, { id, businessDate })
      // Someone limited to some hotels gets the one they add, so nobody adds a hotel they can't see.
      if (!access.allProperties) {
        await tx.insert(memberProperties).values({
          organizationId: access.organizationId,
          memberId: access.memberId,
          propertyId: id,
        })
        await recordAudit(tx, access, {
          action: 'member.access_changed',
          entityType: 'member',
          entityId: access.memberId,
          propertyId: id,
          businessDate,
          before: { allProperties: false, propertyIds: access.propertyIds },
          after: {
            allProperties: false,
            propertyIds: [...access.propertyIds, id],
            causedBy: eventId,
          },
        })
      }
      const created = await readProperty(
        { db: tx, storage: deps.storage },
        withHotel(access, id),
        id,
      )
      if (!created) throw new Error('created hotel not readable')
      return created
    })
  } catch (error) {
    if (isUniqueViolation(error)) await requireHotelNameFree(deps.db, access, input.name)
    throw error
  }
}

// The prefix asked for (if free in the group) or one suggested from the name.
async function choosePrefix(tx: Tx, access: Access, input: CreateInput): Promise<string> {
  const taken = await tx
    .select({ prefix: properties.bookingPrefix, name: properties.name })
    .from(properties)
    .where(eq(properties.organizationId, access.organizationId))
  if (!input.bookingPrefix) {
    return suggestBookingPrefix(
      input.name,
      taken.map((row) => row.prefix),
    )
  }
  const clash = taken.find((row) => row.prefix === input.bookingPrefix)
  if (clash) throw bookingPrefixTaken(input.bookingPrefix, clash.name)
  return input.bookingPrefix
}

// The caller's access including a hotel they were just given, for reading it back.
function withHotel(access: Access, id: string): Access {
  return access.allProperties ? access : { ...access, propertyIds: [...access.propertyIds, id] }
}

// --- Editing ---------------------------------------------------------------------------------------

type Locked = {
  id: string
  name: string
  bookingPrefix: string
  entityId: string
  pendingEntityId: string | null
  addressLine1: string | null
  area: string | null
  lga: string | null
  state: string | null
  timeZone: string
  checkInTime: string
  checkOutTime: string
  businessDate: string
  liveSince: string | null
  archivedAt: Date | null
  version: number
}

export async function lockProperty(tx: Tx, access: Access, id: string): Promise<Locked> {
  const [row] = await tx
    .select({
      id: properties.id,
      name: properties.name,
      bookingPrefix: properties.bookingPrefix,
      entityId: properties.entityId,
      pendingEntityId: properties.pendingEntityId,
      addressLine1: properties.addressLine1,
      area: properties.area,
      lga: properties.lga,
      state: properties.state,
      timeZone: properties.timeZone,
      checkInTime: properties.checkInTime,
      checkOutTime: properties.checkOutTime,
      businessDate: properties.businessDate,
      liveSince: properties.liveSince,
      archivedAt: properties.archivedAt,
      version: properties.version,
    })
    .from(properties)
    .where(and(eq(properties.id, id), propertyScope(access)))
    .for('update')
  if (!row) throw hotelNotFound()
  return {
    ...row,
    checkInTime: row.checkInTime.slice(0, 5),
    checkOutTime: row.checkOutTime.slice(0, 5),
  }
}

export async function requireVersion(
  tx: Tx,
  access: Access,
  property: Locked,
  version: number,
): Promise<void> {
  if (property.version === version) return
  const by = await lastChangeBy(tx, {
    organizationId: access.organizationId,
    entityType: 'property',
    entityId: property.id,
    actions: [
      'property.changed',
      'property.entity_change_scheduled',
      'property.entity_change_cancelled',
    ],
    timeZone: property.timeZone,
  })
  throw staleVersion(property.name, by)
}

const isLive = (property: Pick<Locked, 'liveSince'>) => property.liveSince !== null

type EditableField =
  | 'name'
  | 'bookingPrefix'
  | 'addressLine1'
  | 'area'
  | 'state'
  | 'lga'
  | 'timeZone'
  | 'checkInTime'
  | 'checkOutTime'
const EDITABLE: readonly EditableField[] = [
  'name',
  'bookingPrefix',
  'addressLine1',
  'area',
  'state',
  'lga',
  'timeZone',
  'checkInTime',
  'checkOutTime',
]
// What a GM with `property.operating_times` may change.
const TIMES: readonly EditableField[] = ['checkInTime', 'checkOutTime']

type UpdateInput = {
  id: string
  version: number
  entityId?: string | undefined
  reason?: string | undefined
} & {
  [K in EditableField]?: string | undefined
}

// Changed fields only, as before/after pairs.
function changedFields(current: Locked, input: UpdateInput) {
  const before: Partial<Record<EditableField | 'businessDate', string | null>> = {}
  const after: Partial<Record<EditableField | 'businessDate', string>> = {}
  for (const field of EDITABLE) {
    const value = input[field]
    if (value !== undefined && value !== current[field]) {
      before[field] = current[field]
      after[field] = value
    }
  }
  return { before, after }
}

function requireCanChange(access: Access, fields: readonly string[], changesEntity: boolean) {
  if (can(access, 'setup.manage')) return
  const onlyTimes = !changesEntity && fields.every((f) => TIMES.includes(f as EditableField))
  if (!onlyTimes || !can(access, 'property.operating_times')) {
    throw new ORPCError('FORBIDDEN', { message: SETUP_ONLY })
  }
}

export async function updateProperty(
  deps: HotelDeps,
  access: Access,
  input: UpdateInput,
): Promise<Property> {
  if (!can(access, 'setup.manage') && !can(access, 'property.operating_times')) {
    throw new ORPCError('FORBIDDEN', { message: SETUP_ONLY })
  }
  try {
    return await deps.db.transaction(async (tx) => {
      const current = await lockProperty(tx, access, input.id)
      if (current.archivedAt) throw hotelIsArchived(current.name)
      await requireVersion(tx, access, current, input.version)
      const { before, after } = changedFields(current, input)
      // The company the hotel is heading for: a scheduled one, or the current one.
      const entityTarget = input.entityId ?? current.entityId
      const changesEntity =
        input.entityId !== undefined &&
        input.entityId !== (current.pendingEntityId ?? current.entityId)
      requireCanChange(access, Object.keys(after), changesEntity)

      await checkFields(tx, access, current, after)
      if (after.timeZone) {
        // Nothing has posted before go-live, so the business date follows the new zone.
        const businessDate = calendarDateIn(after.timeZone)
        if (businessDate !== current.businessDate) {
          before.businessDate = current.businessDate
          after.businessDate = businessDate
        }
      }

      const entityChange = changesEntity
        ? await changeEntity(tx, access, current, entityTarget, input.reason)
        : undefined
      if (Object.keys(after).length === 0 && !entityChange) {
        return (await readProperty(
          { db: tx, storage: deps.storage },
          access,
          current.id,
        )) as Property
      }
      await tx
        .update(properties)
        .set({ ...after, ...entityChange?.set, version: current.version + 1 })
        .where(eq(properties.id, current.id))

      if (entityChange?.event) await recordAudit(tx, access, entityChange.event)
      const changedHere = Object.keys(after).length > 0 || entityChange?.immediate
      if (changedHere) {
        await recordAudit(tx, access, {
          action: 'property.changed',
          entityType: 'property',
          entityId: current.id,
          propertyId: current.id,
          businessDate: after.businessDate ?? current.businessDate,
          before: { ...before, ...entityChange?.immediate?.before },
          after: { ...after, ...entityChange?.immediate?.after, liveProperty: isLive(current) },
          reason: input.reason ?? null,
        })
      }
      return (await readProperty({ db: tx, storage: deps.storage }, access, current.id)) as Property
    })
  } catch (error) {
    if (isUniqueViolation(error) && input.name) {
      await requireHotelNameFree(deps.db, access, input.name, input.id)
    }
    throw error
  }
}

// Field rules that need the stored hotel: the LGA belongs to the state, the time zone is fixed
// once live, and the name is free.
async function checkFields(
  tx: Tx,
  access: Access,
  current: Locked,
  after: Partial<Record<EditableField, string>>,
): Promise<void> {
  const state = after.state ?? current.state
  const lga = after.lga ?? current.lga
  if ((after.state || after.lga) && lga && !(state && isLgaOf(state, lga))) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Choose an LGA in ${state ?? 'the state'}`,
      data: { code: 'LGA_NOT_IN_STATE', field: 'lga' },
    })
  }
  if (after.timeZone && isLive(current)) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'The time zone is fixed once a hotel is live.',
      data: { code: 'TIME_ZONE_FIXED', field: 'timeZone' },
    })
  }
  if (after.name) await requireHotelNameFree(tx, access, after.name, current.id)
  if (after.bookingPrefix) await requirePrefixFree(tx, access, current, after.bookingPrefix)
}

// Reservation numbers already given out carry the prefix, so it changes only before the first.
async function requirePrefixFree(tx: Tx, access: Access, current: Locked, prefix: string) {
  const [booked] = await tx
    .select({ id: reservations.id })
    .from(reservations)
    .where(eq(reservations.propertyId, current.id))
    .limit(1)
  if (booked) throw bookingPrefixLocked(current.name)
  const [clash] = await tx
    .select({ name: properties.name })
    .from(properties)
    .where(
      and(
        eq(properties.organizationId, access.organizationId),
        eq(properties.bookingPrefix, prefix),
        ne(properties.id, current.id),
      ),
    )
  if (clash) throw bookingPrefixTaken(prefix, clash.name)
}

// Before go-live the hotel moves company at once. After it, the move waits for the next business
// date (night audit applies it), so a business date is never split between two companies' books.
async function changeEntity(
  tx: Tx,
  access: Access,
  current: Locked,
  targetId: string,
  reason: string | undefined,
) {
  const [from] = await tx
    .select({ name: entities.name })
    .from(entities)
    .where(eq(entities.id, current.entityId))
  if (targetId === current.entityId) {
    // Choosing the current company again cancels a scheduled change.
    return {
      set: { pendingEntityId: null, pendingEntityFrom: null },
      event: cancelEvent(current, requireLiveReason(current, reason)),
    }
  }
  const target = await lockActiveEntity(tx, access, targetId)
  if (!isLive(current)) {
    return {
      set: { entityId: target.id, pendingEntityId: null, pendingEntityFrom: null },
      immediate: {
        before: { entityId: current.entityId, entityName: from?.name ?? null },
        after: { entityId: target.id, entityName: target.name },
      },
    }
  }
  const why = requireLiveReason(current, reason)
  const effectiveFrom = addDays(current.businessDate, 1)
  return {
    set: { pendingEntityId: target.id, pendingEntityFrom: effectiveFrom },
    event: {
      action: 'property.entity_change_scheduled',
      entityType: 'property',
      entityId: current.id,
      propertyId: current.id,
      businessDate: current.businessDate,
      before: { entityId: current.entityId, entityName: from?.name ?? null },
      after: {
        entityId: target.id,
        entityName: target.name,
        effectiveFrom,
        liveProperty: true,
        exception: 'setup_changed',
      },
      reason: why,
    },
  }
}

function requireLiveReason(current: Locked, reason: string | undefined): string {
  if (!reason) {
    throw reasonRequired(
      `Give a reason. ${current.name} is live, so this shows in the owner's daily report.`,
    )
  }
  return reason
}

// A scheduled change exists only on a live hotel, so cancelling one is as reportable as making it.
function cancelEvent(current: Locked, reason: string) {
  return {
    action: 'property.entity_change_cancelled',
    entityType: 'property',
    entityId: current.id,
    propertyId: current.id,
    businessDate: current.businessDate,
    before: { pendingEntityId: current.pendingEntityId },
    after: { pendingEntityId: null, liveProperty: isLive(current), exception: 'setup_changed' },
    reason,
  }
}

// "Cancel change" on a scheduled owning-company change.
export async function cancelEntityChange(
  deps: HotelDeps,
  access: Access,
  input: { id: string; version: number; reason: string },
): Promise<Property> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  return deps.db.transaction(async (tx) => {
    const current = await lockProperty(tx, access, input.id)
    if (current.archivedAt) throw hotelIsArchived(current.name)
    await requireVersion(tx, access, current, input.version)
    if (current.pendingEntityId) {
      await tx
        .update(properties)
        .set({ pendingEntityId: null, pendingEntityFrom: null, version: current.version + 1 })
        .where(eq(properties.id, current.id))
      await recordAudit(tx, access, cancelEvent(current, input.reason))
    }
    return (await readProperty({ db: tx, storage: deps.storage }, access, current.id)) as Property
  })
}
