// POS terminals belong to a hotel and settle into one of its company's naira accounts. Terminal IDs
// are unique in the group, archived terminals included. From brick 10 a POS payment must name an
// active terminal of the hotel, so a terminal nobody registered can't take the hotel's money.
import { ORPCError } from '@orpc/server'
import {
  bankAccountLabel,
  type PageQuery,
  type PosTerminalView,
  pageOffset,
  terminalLabel,
  toPage,
} from '@vento/shared'
import { and, asc, count, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isUniqueViolation } from '../db/errors.ts'
import { bankAccounts, posTerminals } from '../db/schema/finance.ts'
import { properties } from '../db/schema/tenancy.ts'
import type { Access } from '../tenancy/access.ts'
import { staleVersion } from '../tenancy/errors.ts'
import { lastChangeBy } from '../tenancy/last-change.ts'
import {
  type Hotel,
  loadHotel,
  type Reader,
  requireFinanceSetup,
  requirePaymentsRead,
  type Tx,
} from './context.ts'
import { reasonRequired, terminalNotFound } from './errors.ts'

type Row = typeof posTerminals.$inferSelect

const columns = {
  terminal: posTerminals,
  bankName: bankAccounts.bankName,
  accountNumber: bankAccounts.accountNumber,
}

function toView(row: { terminal: Row; bankName: string; accountNumber: string }): PosTerminalView {
  const { terminal } = row
  return {
    id: terminal.id,
    propertyId: terminal.propertyId,
    provider: terminal.provider,
    name: terminal.name,
    terminalId: terminal.terminalId,
    bankAccountId: terminal.bankAccountId,
    settlesInto: bankAccountLabel(row),
    status: terminal.archivedAt ? 'archived' : 'active',
    version: terminal.version,
  }
}

async function view(db: Reader, id: string): Promise<PosTerminalView> {
  const [row] = await db
    .select(columns)
    .from(posTerminals)
    .innerJoin(bankAccounts, eq(bankAccounts.id, posTerminals.bankAccountId))
    .where(eq(posTerminals.id, id))
  if (!row) throw terminalNotFound()
  return toView(row)
}

export async function listPosTerminals(
  db: Reader,
  access: Access,
  query: PageQuery & { propertyId: string; status: 'active' | 'archived' },
) {
  requirePaymentsRead(access)
  const hotel = await loadHotel(db, access, query.propertyId)
  const where = and(
    eq(posTerminals.organizationId, access.organizationId),
    eq(posTerminals.propertyId, hotel.id),
    query.status === 'archived'
      ? isNotNull(posTerminals.archivedAt)
      : isNull(posTerminals.archivedAt),
  )
  const [rows, [total]] = await Promise.all([
    db
      .select(columns)
      .from(posTerminals)
      .innerJoin(bankAccounts, eq(bankAccounts.id, posTerminals.bankAccountId))
      .where(where)
      .orderBy(asc(posTerminals.provider), asc(posTerminals.name))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db.select({ value: count() }).from(posTerminals).where(where),
  ])
  return toPage(rows.map(toView), total?.value ?? 0, query)
}

const liveFlags = (hotel: Hotel) =>
  hotel.live ? { liveProperty: true, exception: 'setup_changed' } : { liveProperty: false }

// The account must be an active NGN account of the hotel's company.
async function requireSettlement(tx: Tx, access: Access, hotel: Hotel, bankAccountId: string) {
  const [account] = await tx
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, bankAccountId),
        eq(bankAccounts.organizationId, access.organizationId),
        eq(bankAccounts.entityId, hotel.entityId),
        isNull(bankAccounts.archivedAt),
        eq(bankAccounts.currency, 'NGN'),
      ),
    )
    .for('share')
  if (!account) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Choose one of ${hotel.entityName}'s naira accounts.`,
      data: { code: 'SETTLEMENT_ACCOUNT', field: 'bankAccountId' },
    })
  }
  return account
}

async function explainTerminalId(tx: Tx, access: Access, terminalId: string, exceptId?: string) {
  const [taken] = await tx
    .select({ archivedAt: posTerminals.archivedAt, hotelName: properties.name })
    .from(posTerminals)
    .innerJoin(properties, eq(properties.id, posTerminals.propertyId))
    .where(
      and(
        eq(posTerminals.organizationId, access.organizationId),
        eq(posTerminals.terminalId, terminalId),
        exceptId ? ne(posTerminals.id, exceptId) : undefined,
      ),
    )
  if (!taken) return
  throw new ORPCError('CONFLICT', {
    message: taken.archivedAt
      ? `Terminal ${terminalId} belongs to an archived terminal. Restore it.`
      : `Terminal ${terminalId} is already set up at ${taken.hotelName}.`,
    data: {
      code: taken.archivedAt ? 'TERMINAL_ID_ARCHIVED' : 'TERMINAL_ID_TAKEN',
      field: 'terminalId',
    },
  })
}

async function lockTerminal(tx: Tx, access: Access, hotel: Hotel, id: string): Promise<Row> {
  const [row] = await tx
    .select()
    .from(posTerminals)
    .where(
      and(
        eq(posTerminals.id, id),
        eq(posTerminals.organizationId, access.organizationId),
        eq(posTerminals.propertyId, hotel.id),
      ),
    )
    .for('update')
  if (!row) throw terminalNotFound()
  return row
}

type TerminalInput = {
  propertyId: string
  provider: string
  name: string
  terminalId: string
  bankAccountId: string
  reason?: string | undefined
}

const described = (terminal: Pick<Row, 'provider' | 'name' | 'terminalId'>) =>
  `${terminalLabel(terminal)} (TID ${terminal.terminalId})`

export async function createPosTerminal(db: Database, access: Access, input: TerminalInput) {
  requireFinanceSetup(access)
  return db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    if (hotel.live && !input.reason) throw reasonRequired()
    const account = await requireSettlement(tx, access, hotel, input.bankAccountId)
    await explainTerminalId(tx, access, input.terminalId)
    let row: Row | undefined
    try {
      ;[row] = await tx
        .insert(posTerminals)
        .values({
          organizationId: access.organizationId,
          propertyId: hotel.id,
          provider: input.provider,
          name: input.name,
          terminalId: input.terminalId,
          bankAccountId: account.id,
        })
        .returning()
    } catch (error) {
      if (isUniqueViolation(error)) await explainTerminalId(tx, access, input.terminalId)
      throw error
    }
    if (!row) throw new Error('terminal insert returned nothing')
    await recordAudit(tx, access, {
      action: 'pos_terminal.created',
      entityType: 'pos_terminal',
      entityId: row.id,
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
      reason: input.reason ?? null,
      after: {
        terminal: described(row),
        settlesInto: bankAccountLabel(account),
        ...liveFlags(hotel),
      },
    })
    return view(tx, row.id)
  })
}

export async function updatePosTerminal(
  db: Database,
  access: Access,
  input: TerminalInput & { id: string; version: number },
) {
  requireFinanceSetup(access)
  return db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    const terminal = await lockTerminal(tx, access, hotel, input.id)
    if (terminal.version !== input.version) {
      throw staleVersion(
        terminalLabel(terminal),
        await lastChangeBy(tx, {
          organizationId: access.organizationId,
          entityType: 'pos_terminal',
          entityId: terminal.id,
          actions: ['pos_terminal.changed', 'pos_terminal.archived', 'pos_terminal.restored'],
          timeZone: hotel.timeZone,
        }),
      )
    }
    const fields = ['provider', 'name', 'terminalId', 'bankAccountId'] as const
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const field of fields) {
      if (input[field] !== terminal[field]) {
        before[field] = terminal[field]
        after[field] = input[field]
      }
    }
    if (Object.keys(after).length === 0) return view(tx, terminal.id)
    if (hotel.live && !input.reason) throw reasonRequired()
    const account = await requireSettlement(tx, access, hotel, input.bankAccountId)
    await explainTerminalId(tx, access, input.terminalId, terminal.id)
    await tx
      .update(posTerminals)
      .set({
        provider: input.provider,
        name: input.name,
        terminalId: input.terminalId,
        bankAccountId: account.id,
        version: terminal.version + 1,
      })
      .where(eq(posTerminals.id, terminal.id))
    await recordAudit(tx, access, {
      action: 'pos_terminal.changed',
      entityType: 'pos_terminal',
      entityId: terminal.id,
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
      reason: input.reason ?? null,
      before,
      after: { ...after, terminal: described({ ...terminal, ...input }), ...liveFlags(hotel) },
    })
    return view(tx, terminal.id)
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
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    const terminal = await lockTerminal(tx, access, hotel, input.id)
    if ((terminal.archivedAt !== null) === archive) return view(tx, terminal.id)
    if (hotel.live && !input.reason) throw reasonRequired()
    if (!archive) {
      await requireSettlement(tx, access, hotel, terminal.bankAccountId)
      await explainTerminalId(tx, access, terminal.terminalId, terminal.id)
    }
    await tx
      .update(posTerminals)
      .set({ archivedAt: archive ? sql`now()` : null, version: terminal.version + 1 })
      .where(eq(posTerminals.id, terminal.id))
    await recordAudit(tx, access, {
      action: archive ? 'pos_terminal.archived' : 'pos_terminal.restored',
      entityType: 'pos_terminal',
      entityId: terminal.id,
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
      reason: input.reason ?? null,
      after: {
        terminal: described(terminal),
        ...liveFlags(hotel),
      },
    })
    return view(tx, terminal.id)
  })
}

export const archivePosTerminal = (
  db: Database,
  access: Access,
  input: { propertyId: string; id: string; reason?: string | undefined },
) => setArchived(db, access, input, true)

export const restorePosTerminal = (
  db: Database,
  access: Access,
  input: { propertyId: string; id: string; reason?: string | undefined },
) => setArchived(db, access, input, false)
