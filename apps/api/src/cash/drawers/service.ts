// Cash drawers (spec: stage-1-cashier-shifts.md, "Drawers"): a hotel's named places for cash, with
// the POS terminals at each. Every hotel keeps at least one active drawer; a drawer with a shift not
// closed can't be archived. Set up with `finance.setup` (refused in a PIN session); read by whoever
// reads Settings › Payments. Archived, never deleted.
import {
  type DrawerView,
  type PageQuery,
  pageOffset,
  type TerminalRef,
  terminalLabel,
  toPage,
} from '@vento/shared'
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { recordAudit } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { isUniqueViolation } from '../../db/errors.ts'
import { cashDrawers, cashDrawerTerminals, cashierShifts } from '../../db/schema/cash.ts'
import { posTerminals } from '../../db/schema/finance.ts'
import { requireFinanceSetup, requirePaymentsRead } from '../../finance/context.ts'
import { reasonRequired } from '../../finance/errors.ts'
import type { Access } from '../../tenancy/access.ts'
import { staleVersion } from '../../tenancy/errors.ts'
import { lastChangeBy } from '../../tenancy/last-change.ts'
import {
  type CashHotel,
  cashHotel,
  type ListReader,
  lockKey,
  type Reader,
  type Tx,
} from '../context.ts'
import {
  drawerHasShift,
  drawerLastActive,
  drawerNameTaken,
  drawerNotFound,
  drawerWrongHotel,
} from '../errors.ts'

type Row = typeof cashDrawers.$inferSelect

export const DEFAULT_DRAWER = 'Desk 1'

// The terminals at each drawer, with their labels ("Moniepoint · Desk 1").
export async function terminalsAt(
  db: Reader,
  drawerIds: readonly string[],
): Promise<Map<string, TerminalRef[]>> {
  const map = new Map<string, TerminalRef[]>()
  if (drawerIds.length === 0) return map
  const rows = await db
    .select({
      drawerId: cashDrawerTerminals.drawerId,
      id: posTerminals.id,
      provider: posTerminals.provider,
      name: posTerminals.name,
      archivedAt: posTerminals.archivedAt,
    })
    .from(cashDrawerTerminals)
    .innerJoin(posTerminals, eq(posTerminals.id, cashDrawerTerminals.posTerminalId))
    .where(inArray(cashDrawerTerminals.drawerId, [...drawerIds]))
    .orderBy(asc(posTerminals.provider), asc(posTerminals.name))
  for (const row of rows) {
    const list = map.get(row.drawerId) ?? []
    list.push({ id: row.id, label: terminalLabel(row), archived: row.archivedAt !== null })
    map.set(row.drawerId, list)
  }
  return map
}

// Who has each drawer now, or the float its last shift left.
async function nowAt(db: ListReader, drawerIds: readonly string[]) {
  const map = new Map<string, DrawerView['now']>()
  if (drawerIds.length === 0) return map
  const busy = await db
    .select({
      drawerId: cashierShifts.drawerId,
      number: cashierShifts.number,
      memberName: cashierShifts.memberName,
    })
    .from(cashierShifts)
    .where(and(inArray(cashierShifts.drawerId, [...drawerIds]), ne(cashierShifts.status, 'closed')))
  for (const row of busy) {
    map.set(row.drawerId, { kind: 'busy', number: row.number, memberName: row.memberName })
  }
  const last = await db
    .selectDistinctOn([cashierShifts.drawerId], {
      drawerId: cashierShifts.drawerId,
      floatKept: cashierShifts.floatKept,
    })
    .from(cashierShifts)
    .where(and(inArray(cashierShifts.drawerId, [...drawerIds]), eq(cashierShifts.status, 'closed')))
    .orderBy(cashierShifts.drawerId, desc(cashierShifts.closedAt))
  for (const row of last) {
    if (!map.has(row.drawerId)) {
      map.set(row.drawerId, { kind: 'free', floatLeft: row.floatKept ?? '0.00' })
    }
  }
  for (const id of drawerIds) if (!map.has(id)) map.set(id, { kind: 'free', floatLeft: '0.00' })
  return map
}

async function views(db: ListReader, rows: Row[]): Promise<DrawerView[]> {
  const ids = rows.map((row) => row.id)
  const [terminals, now] = await Promise.all([terminalsAt(db, ids), nowAt(db, ids)])
  return rows.map((row) => ({
    id: row.id,
    propertyId: row.propertyId,
    name: row.name,
    terminals: terminals.get(row.id) ?? [],
    status: row.archivedAt ? 'archived' : 'active',
    version: row.version,
    now: now.get(row.id) ?? { kind: 'free', floatLeft: '0.00' },
  }))
}

async function view(db: ListReader, id: string): Promise<DrawerView> {
  const [row] = await db.select().from(cashDrawers).where(eq(cashDrawers.id, id))
  if (!row) throw drawerNotFound()
  const [one] = await views(db, [row])
  if (!one) throw drawerNotFound()
  return one
}

export async function listDrawers(
  db: ListReader,
  access: Access,
  query: PageQuery & { propertyId: string; status: 'active' | 'archived' },
) {
  requirePaymentsRead(access)
  // A read: an archived hotel's drawers stay readable.
  const hotel = await cashHotel(db, access, query.propertyId)
  const where = and(
    eq(cashDrawers.organizationId, access.organizationId),
    eq(cashDrawers.propertyId, hotel.id),
    query.status === 'archived'
      ? isNotNull(cashDrawers.archivedAt)
      : isNull(cashDrawers.archivedAt),
  )
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(cashDrawers)
      .where(where)
      .orderBy(asc(cashDrawers.name), asc(cashDrawers.id))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db.select({ value: count() }).from(cashDrawers).where(where),
  ])
  return toPage(await views(db, rows), total?.value ?? 0, query)
}

const liveFlags = (hotel: CashHotel) =>
  hotel.live ? { liveProperty: true, exception: 'setup_changed' } : { liveProperty: false }

// The terminals must be active terminals of this hotel.
async function requireTerminals(tx: Tx, access: Access, hotel: CashHotel, ids: readonly string[]) {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return [] as { id: string; label: string }[]
  const rows = await tx
    .select({ id: posTerminals.id, provider: posTerminals.provider, name: posTerminals.name })
    .from(posTerminals)
    .where(
      and(
        inArray(posTerminals.id, unique),
        eq(posTerminals.organizationId, access.organizationId),
        eq(posTerminals.propertyId, hotel.id),
        isNull(posTerminals.archivedAt),
      ),
    )
    .for('share')
  if (rows.length !== unique.length) throw drawerWrongHotel()
  return rows.map((row) => ({ id: row.id, label: terminalLabel(row) }))
}

async function setTerminals(
  tx: Tx,
  access: Access,
  hotel: CashHotel,
  drawerId: string,
  ids: readonly string[],
) {
  await tx.delete(cashDrawerTerminals).where(eq(cashDrawerTerminals.drawerId, drawerId))
  if (ids.length === 0) return
  await tx.insert(cashDrawerTerminals).values(
    ids.map((posTerminalId) => ({
      organizationId: access.organizationId,
      propertyId: hotel.id,
      drawerId,
      posTerminalId,
    })),
  )
}

async function explainName(tx: Tx, hotel: CashHotel, name: string, exceptId?: string) {
  const [taken] = await tx
    .select({ id: cashDrawers.id })
    .from(cashDrawers)
    .where(
      and(
        eq(cashDrawers.propertyId, hotel.id),
        isNull(cashDrawers.archivedAt),
        sql`lower(${cashDrawers.name}) = lower(${name})`,
        exceptId ? ne(cashDrawers.id, exceptId) : undefined,
      ),
    )
  if (taken) throw drawerNameTaken(hotel.name, name)
}

async function lockDrawer(tx: Tx, access: Access, hotel: CashHotel, id: string): Promise<Row> {
  const [row] = await tx
    .select()
    .from(cashDrawers)
    .where(
      and(
        eq(cashDrawers.id, id),
        eq(cashDrawers.organizationId, access.organizationId),
        eq(cashDrawers.propertyId, hotel.id),
      ),
    )
    .for('update')
  if (!row) throw drawerNotFound()
  return row
}

type DrawerInput = {
  propertyId: string
  name: string
  posTerminalIds: string[]
  reason?: string | undefined
}

export async function createDrawer(db: Database, access: Access, input: DrawerInput) {
  requireFinanceSetup(access)
  return db.transaction(async (tx) => {
    const hotel = await cashHotel(tx, access, input.propertyId, { write: true, hold: true })
    if (hotel.live && !input.reason) throw reasonRequired()
    const terminals = await requireTerminals(tx, access, hotel, input.posTerminalIds)
    await explainName(tx, hotel, input.name)
    let row: Row | undefined
    try {
      ;[row] = await tx
        .insert(cashDrawers)
        .values({ organizationId: access.organizationId, propertyId: hotel.id, name: input.name })
        .returning()
    } catch (error) {
      if (isUniqueViolation(error)) throw drawerNameTaken(hotel.name, input.name)
      throw error
    }
    if (!row) throw new Error('drawer insert returned nothing')
    await setTerminals(
      tx,
      access,
      hotel,
      row.id,
      terminals.map((t) => t.id),
    )
    await recordAudit(tx, access, {
      action: 'cash_drawer.created',
      entityType: 'cash_drawer',
      entityId: row.id,
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
      reason: input.reason ?? null,
      after: { name: row.name, terminals: terminals.map((t) => t.label), ...liveFlags(hotel) },
    })
    return view(tx, row.id)
  })
}

// A new hotel's first drawer, in the hotel's own transaction (no terminals yet).
export async function createFirstDrawer(
  tx: Tx,
  access: Access,
  hotel: { id: string; businessDate: string },
) {
  const [row] = await tx
    .insert(cashDrawers)
    .values({ organizationId: access.organizationId, propertyId: hotel.id, name: DEFAULT_DRAWER })
    .returning({ id: cashDrawers.id })
  await recordAudit(tx, access, {
    action: 'cash_drawer.created',
    entityType: 'cash_drawer',
    entityId: row?.id ?? null,
    propertyId: hotel.id,
    businessDate: hotel.businessDate,
    after: { name: DEFAULT_DRAWER, terminals: [], liveProperty: false },
  })
}

export async function updateDrawer(
  db: Database,
  access: Access,
  input: DrawerInput & { id: string; version: number },
) {
  requireFinanceSetup(access)
  return db.transaction(async (tx) => {
    const hotel = await cashHotel(tx, access, input.propertyId, { write: true, hold: true })
    const drawer = await lockDrawer(tx, access, hotel, input.id)
    if (drawer.version !== input.version) {
      throw staleVersion(
        drawer.name,
        await lastChangeBy(tx, {
          organizationId: access.organizationId,
          entityType: 'cash_drawer',
          entityId: drawer.id,
          actions: ['cash_drawer.changed', 'cash_drawer.archived', 'cash_drawer.restored'],
          timeZone: hotel.timeZone,
        }),
      )
    }
    const before = (await terminalsAt(tx, [drawer.id])).get(drawer.id) ?? []
    const terminals = await requireTerminals(tx, access, hotel, input.posTerminalIds)
    const sameTerminals =
      before.length === terminals.length &&
      before.every((t) => terminals.some((next) => next.id === t.id))
    if (drawer.name === input.name && sameTerminals) return view(tx, drawer.id)
    if (hotel.live && !input.reason) throw reasonRequired()
    if (drawer.name.toLowerCase() !== input.name.toLowerCase()) {
      await explainName(tx, hotel, input.name, drawer.id)
    }
    try {
      await tx
        .update(cashDrawers)
        .set({ name: input.name, version: drawer.version + 1 })
        .where(eq(cashDrawers.id, drawer.id))
    } catch (error) {
      if (isUniqueViolation(error)) throw drawerNameTaken(hotel.name, input.name)
      throw error
    }
    await setTerminals(
      tx,
      access,
      hotel,
      drawer.id,
      terminals.map((t) => t.id),
    )
    await recordAudit(tx, access, {
      action: 'cash_drawer.changed',
      entityType: 'cash_drawer',
      entityId: drawer.id,
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
      reason: input.reason ?? null,
      before: { name: drawer.name, terminals: before.map((t) => t.label) },
      after: { name: input.name, terminals: terminals.map((t) => t.label), ...liveFlags(hotel) },
    })
    return view(tx, drawer.id)
  })
}

async function setArchived(
  db: Database,
  access: Access,
  input: { propertyId: string; id: string; reason?: string | undefined },
  archive: boolean,
) {
  requireFinanceSetup(access)
  return db.transaction(async (tx) => {
    const hotel = await cashHotel(tx, access, input.propertyId, { write: true, hold: true })
    // "At least one active drawer" is checked across rows: one archive at a time per hotel.
    await lockKey(tx, `cash-drawers:${hotel.id}`)
    const drawer = await lockDrawer(tx, access, hotel, input.id)
    if ((drawer.archivedAt !== null) === archive) return view(tx, drawer.id)
    if (hotel.live && !input.reason) throw reasonRequired()
    if (archive) {
      const [busy] = await tx
        .select({ memberName: cashierShifts.memberName })
        .from(cashierShifts)
        .where(and(eq(cashierShifts.drawerId, drawer.id), ne(cashierShifts.status, 'closed')))
      if (busy) throw drawerHasShift(drawer.name, busy.memberName)
      const [active] = await tx
        .select({ value: count() })
        .from(cashDrawers)
        .where(and(eq(cashDrawers.propertyId, hotel.id), isNull(cashDrawers.archivedAt)))
      if ((active?.value ?? 0) <= 1) throw drawerLastActive()
    } else {
      await explainName(tx, hotel, drawer.name, drawer.id)
    }
    const floatLeft = archive ? ((await nowAt(tx, [drawer.id])).get(drawer.id) ?? null) : null
    await tx
      .update(cashDrawers)
      .set({ archivedAt: archive ? sql`now()` : null, version: drawer.version + 1 })
      .where(eq(cashDrawers.id, drawer.id))
    await recordAudit(tx, access, {
      action: archive ? 'cash_drawer.archived' : 'cash_drawer.restored',
      entityType: 'cash_drawer',
      entityId: drawer.id,
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
      reason: input.reason ?? null,
      after: {
        name: drawer.name,
        ...(floatLeft?.kind === 'free' ? { floatLeft: floatLeft.floatLeft } : {}),
        ...liveFlags(hotel),
      },
    })
    return view(tx, drawer.id)
  })
}

export const archiveDrawer = (
  db: Database,
  access: Access,
  input: { propertyId: string; id: string; reason?: string | undefined },
) => setArchived(db, access, input, true)

export const restoreDrawer = (
  db: Database,
  access: Access,
  input: { propertyId: string; id: string; reason?: string | undefined },
) => setArchived(db, access, input, false)

// Archiving a POS terminal (brick 3) takes it off every drawer; open shifts keep their own list.
export async function removeTerminalFromDrawers(tx: Tx, terminalId: string) {
  await tx.delete(cashDrawerTerminals).where(eq(cashDrawerTerminals.posTerminalId, terminalId))
}
