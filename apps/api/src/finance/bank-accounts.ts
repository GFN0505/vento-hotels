// Bank accounts belong to a company and are shared by every hotel it owns. A member limited to some
// hotels may change them only when every active hotel the company owns is within access. One NGN
// account per hotel is its guest transfer account; changing it on a live hotel emails the owners at
// once, because a diverted transfer account can cost a day's deposits before the morning report.
import { ORPCError } from '@orpc/server'
import {
  type BankAccountView,
  bankAccountLabel,
  maskAccountNumber,
  type PageQuery,
  pageOffset,
  type SupportedCurrency,
  toPage,
} from '@vento/shared'
import { and, asc, count, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isUniqueViolation } from '../db/errors.ts'
import { members, users } from '../db/schema/auth.ts'
import { bankAccounts, paymentMethodSettings, posTerminals } from '../db/schema/finance.ts'
import { entities } from '../db/schema/tenancy.ts'
import { logger } from '../observability/log.ts'
import type { EmailProvider } from '../providers/email.ts'
import { type Access, can } from '../tenancy/access.ts'
import { staleVersion } from '../tenancy/errors.ts'
import { lastChangeBy } from '../tenancy/last-change.ts'
import {
  clockIn,
  dateLabel,
  groupHotels,
  type Hotel,
  loadHotel,
  lockKey,
  type Reader,
  requireFinanceSetup,
  requirePaymentsRead,
  sees,
  type Tx,
} from './context.ts'
import { bankAccountNotFound, groupAccessNeeded, reasonRequired } from './errors.ts'
import { methodSettings, saveMethod } from './payment-methods.ts'

export type Deps = { db: Database; email: EmailProvider; webOrigin: string }
type Row = typeof bankAccounts.$inferSelect

// Whether this member may change a company's accounts, and whether it owns a live hotel.
export async function companyRule(db: Reader, access: Access, entityId: string) {
  const hotels = (await groupHotels(db, access.organizationId)).filter(
    (hotel) => hotel.entityId === entityId && !hotel.archived,
  )
  return {
    hotels,
    canEdit: hotels.every((hotel) => sees(access, hotel.id)),
    live: hotels.filter((hotel) => hotel.live),
  }
}

export async function bankAccountViews(
  db: Reader,
  access: Access,
  hotel: Hotel,
  ids: string[],
): Promise<BankAccountView[]> {
  if (ids.length === 0) return []
  const [rows, rule, transfers, terminals] = await Promise.all([
    db
      .select({ account: bankAccounts, entityName: entities.name })
      .from(bankAccounts)
      .innerJoin(entities, eq(entities.id, bankAccounts.entityId))
      .where(
        and(eq(bankAccounts.organizationId, access.organizationId), inArray(bankAccounts.id, ids)),
      ),
    companyRule(db, access, hotel.entityId),
    db
      .select({
        accountId: paymentMethodSettings.guestTransferAccountId,
        propertyId: paymentMethodSettings.propertyId,
      })
      .from(paymentMethodSettings)
      .where(
        and(
          eq(paymentMethodSettings.organizationId, access.organizationId),
          inArray(paymentMethodSettings.guestTransferAccountId, ids),
        ),
      ),
    db
      .select({ accountId: posTerminals.bankAccountId, value: count() })
      .from(posTerminals)
      .where(and(inArray(posTerminals.bankAccountId, ids), isNull(posTerminals.archivedAt)))
      .groupBy(posTerminals.bankAccountId),
  ])
  const editable = can(access, 'finance.setup') && rule.canEdit
  const byId = new Map(rows.map((row) => [row.account.id, row]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    if (!row) return []
    const { account } = row
    return [
      {
        id: account.id,
        entityId: account.entityId,
        entityName: row.entityName,
        bankName: account.bankName,
        accountNumber: editable ? account.accountNumber : maskAccountNumber(account.accountNumber),
        last4: account.accountNumber.slice(-4),
        accountName: account.accountName,
        currency: account.currency as SupportedCurrency,
        status: account.archivedAt ? ('archived' as const) : ('active' as const),
        version: account.version,
        guestTransferFor: rule.hotels
          .filter((h) => transfers.some((t) => t.accountId === id && t.propertyId === h.id))
          .map((h) => ({ id: h.id, name: h.name })),
        alsoUsedBy: rule.hotels.filter((h) => h.id !== hotel.id).map((h) => h.name),
        activeTerminals: terminals.find((t) => t.accountId === id)?.value ?? 0,
        canEdit: editable && account.entityId === hotel.entityId,
      },
    ]
  })
}

// The hotel's company's accounts.
export async function listBankAccounts(
  db: Reader,
  access: Access,
  query: PageQuery & { propertyId: string; status: 'active' | 'archived' },
) {
  requirePaymentsRead(access)
  const hotel = await loadHotel(db, access, query.propertyId)
  const where = and(
    eq(bankAccounts.organizationId, access.organizationId),
    eq(bankAccounts.entityId, hotel.entityId),
    query.status === 'archived'
      ? isNotNull(bankAccounts.archivedAt)
      : isNull(bankAccounts.archivedAt),
  )
  const [rows, [total]] = await Promise.all([
    db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(where)
      .orderBy(asc(bankAccounts.bankName), asc(bankAccounts.accountNumber))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db.select({ value: count() }).from(bankAccounts).where(where),
  ])
  const items = await bankAccountViews(
    db,
    access,
    hotel,
    rows.map((row) => row.id),
  )
  return toPage(items, total?.value ?? 0, query)
}

// --- Writes ------------------------------------------------------------------------------------

async function requireCompanyAccess(tx: Tx, access: Access, hotel: Hotel) {
  const rule = await companyRule(tx, access, hotel.entityId)
  if (!rule.canEdit) {
    throw groupAccessNeeded(
      `${hotel.entityName} also owns hotels outside your access. Ask someone with access to all of them.`,
    )
  }
  return rule
}

async function lockAccount(tx: Tx, access: Access, hotel: Hotel, id: string): Promise<Row> {
  const [row] = await tx
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, id),
        eq(bankAccounts.organizationId, access.organizationId),
        eq(bankAccounts.entityId, hotel.entityId),
      ),
    )
    .for('update')
  if (!row) throw bankAccountNotFound()
  return row
}

async function explainTaken(
  tx: Tx,
  access: Access,
  bankName: string,
  accountNumber: string,
  exceptId?: string,
) {
  const [taken] = await tx
    .select({ entityName: entities.name, storedBank: bankAccounts.bankName })
    .from(bankAccounts)
    .innerJoin(entities, eq(entities.id, bankAccounts.entityId))
    .where(
      and(
        eq(bankAccounts.organizationId, access.organizationId),
        sql`lower(${bankAccounts.bankName}) = lower(${bankName})`,
        eq(bankAccounts.accountNumber, accountNumber),
        exceptId ? ne(bankAccounts.id, exceptId) : undefined,
      ),
    )
  if (taken) {
    throw new ORPCError('CONFLICT', {
      message: `${bankAccountLabel({ bankName: taken.storedBank, accountNumber })} is already set up for ${taken.entityName}.`,
      data: { code: 'BANK_ACCOUNT_TAKEN', field: 'accountNumber' },
    })
  }
}

const masked = (row: Pick<Row, 'bankName' | 'accountNumber'>) => bankAccountLabel(row)

const transferNgnOnly = () =>
  new ORPCError('BAD_REQUEST', {
    message: 'Guests transfer in naira. Choose an NGN account for guest transfers.',
    data: { code: 'TRANSFER_ACCOUNT_NGN', field: 'currency' },
  })

// What to email once the transaction has committed.
type TransferNotice = {
  hotel: Hotel
  before: string | null
  after: string | null
  reason: string | null
}

// Points (or un-points) the hotel's guest transfers at an account, with its own audit event.
async function setTransferAccount(
  tx: Tx,
  access: Access,
  hotel: Hotel,
  account: Row | null,
  reason: string | null,
): Promise<TransferNotice | null> {
  await lockKey(tx, `payment-methods:${hotel.id}`)
  const settings = await methodSettings(tx, hotel.id)
  const current = settings.bank_transfer.guestTransferAccountId
  if ((account?.id ?? null) === current) return null
  const [previous] = current
    ? await tx.select().from(bankAccounts).where(eq(bankAccounts.id, current))
    : []
  await saveMethod(tx, access, hotel.id, 'bank_transfer', {
    ...settings.bank_transfer,
    guestTransferAccountId: account?.id ?? null,
  })
  const before = previous ? masked(previous) : null
  const after = account ? masked(account) : null
  await recordAudit(tx, access, {
    action: 'property.transfer_account_set',
    entityType: 'property',
    entityId: hotel.id,
    propertyId: hotel.id,
    businessDate: hotel.businessDate,
    reason,
    before: { accountId: previous?.id ?? null, account: before },
    after: {
      accountId: account?.id ?? null,
      account: after,
      ...(hotel.live
        ? { liveProperty: true, exception: 'setup_changed' }
        : { liveProperty: false }),
    },
  })
  return hotel.live ? { hotel, before, after, reason } : null
}

// The owners' email (and group admins'), sent after the change is saved. Email goes through the
// queued provider in production, so a provider hiccup is retried.
async function notifyOwners(deps: Deps, access: Access, notices: TransferNotice[]) {
  if (notices.length === 0) return
  const recipients = await deps.db
    .select({ email: users.email })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(
      and(
        eq(members.organizationId, access.organizationId),
        inArray(members.role, ['owner', 'group_admin']),
      ),
    )
  for (const notice of notices) {
    const { hotel } = notice
    const link = `${deps.webOrigin}/settings/payments?hotel=${hotel.id}`
    const text = `${access.userName} changed the account ${hotel.name}'s guests pay transfers into, at ${clockIn(hotel.timeZone)} on ${dateLabel(hotel.businessDate)}: ${notice.before ?? 'none'} → ${notice.after ?? 'none'}. Reason: ${notice.reason ?? 'none given'}. See Payments: ${link}`
    for (const { email } of recipients) {
      try {
        await deps.email.send({
          to: email,
          subject: `Guest transfer account changed at ${hotel.name}`,
          text,
        })
      } catch (error) {
        // The change is saved and audited; the morning report still shows it.
        logger.error({ err: error }, 'Transfer account email not queued')
      }
    }
  }
}

type AccountInput = {
  propertyId: string
  bankName: string
  accountNumber: string
  accountName: string
  currency: SupportedCurrency
  guestTransfer: boolean
  reason?: string | undefined
}

export async function createBankAccount(deps: Deps, access: Access, input: AccountInput) {
  requireFinanceSetup(access)
  const { view, notices } = await deps.db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    const rule = await requireCompanyAccess(tx, access, hotel)
    const liveCompany = rule.live.length > 0
    if ((liveCompany || (input.guestTransfer && hotel.live)) && !input.reason)
      throw reasonRequired()
    if (input.guestTransfer && input.currency !== 'NGN') throw transferNgnOnly()
    await explainTaken(tx, access, input.bankName, input.accountNumber)
    let row: Row | undefined
    try {
      ;[row] = await tx
        .insert(bankAccounts)
        .values({
          organizationId: access.organizationId,
          entityId: hotel.entityId,
          bankName: input.bankName,
          accountNumber: input.accountNumber,
          accountName: input.accountName,
          currency: input.currency,
        })
        .returning()
    } catch (error) {
      if (isUniqueViolation(error))
        await explainTaken(tx, access, input.bankName, input.accountNumber)
      throw error
    }
    if (!row) throw new Error('bank account insert returned nothing')
    await recordAudit(tx, access, {
      action: 'bank_account.created',
      entityType: 'bank_account',
      entityId: row.id,
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
      reason: input.reason ?? null,
      after: {
        entityId: hotel.entityId,
        entityName: hotel.entityName,
        account: masked(row),
        accountName: row.accountName,
        currency: row.currency,
        ...liveFlags(rule.live),
      },
    })
    const notice = input.guestTransfer
      ? await setTransferAccount(tx, access, hotel, row, input.reason ?? null)
      : null
    const [view] = await bankAccountViews(tx, access, hotel, [row.id])
    return { view, notices: notice ? [notice] : [] }
  })
  await notifyOwners(deps, access, notices)
  if (!view) throw bankAccountNotFound()
  return view
}

function liveFlags(live: Hotel[]) {
  return live.length > 0
    ? { liveProperty: true, exception: 'setup_changed', liveHotelIds: live.map((h) => h.id) }
    : { liveProperty: false }
}

// Hotels whose guests transfer into an account.
async function transferHotels(tx: Tx, access: Access, accountId: string) {
  const rows = await tx
    .select({ propertyId: paymentMethodSettings.propertyId })
    .from(paymentMethodSettings)
    .where(
      and(
        eq(paymentMethodSettings.organizationId, access.organizationId),
        eq(paymentMethodSettings.guestTransferAccountId, accountId),
      ),
    )
  const hotels = await groupHotels(tx, access.organizationId)
  return hotels.filter((hotel) => rows.some((row) => row.propertyId === hotel.id))
}

async function firstTerminal(tx: Tx, accountId: string) {
  const [terminal] = await tx
    .select({ provider: posTerminals.provider, name: posTerminals.name })
    .from(posTerminals)
    .where(and(eq(posTerminals.bankAccountId, accountId), isNull(posTerminals.archivedAt)))
    .limit(1)
  return terminal
}

export async function updateBankAccount(
  deps: Deps,
  access: Access,
  input: AccountInput & { id: string; version: number },
) {
  requireFinanceSetup(access)
  const { view, notices } = await deps.db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    const rule = await requireCompanyAccess(tx, access, hotel)
    const account = await lockAccount(tx, access, hotel, input.id)
    if (account.version !== input.version) {
      throw staleVersion(
        masked(account),
        await lastChangeBy(tx, {
          organizationId: access.organizationId,
          entityType: 'bank_account',
          entityId: account.id,
          actions: ['bank_account.changed', 'bank_account.archived', 'bank_account.restored'],
          timeZone: hotel.timeZone,
        }),
      )
    }
    if (account.archivedAt) {
      throw new ORPCError('CONFLICT', {
        message: `${masked(account)} is archived. Restore it first.`,
        data: { code: 'ACCOUNT_IN_USE' },
      })
    }
    const fields = ['bankName', 'accountNumber', 'accountName', 'currency'] as const
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const field of fields) {
      if (input[field] !== account[field]) {
        before[field] =
          field === 'accountNumber' ? maskAccountNumber(account[field]) : account[field]
        after[field] = field === 'accountNumber' ? maskAccountNumber(input[field]) : input[field]
      }
    }
    const settings = await methodSettings(tx, hotel.id)
    const isTransferHere = settings.bank_transfer.guestTransferAccountId === account.id
    const transferChange = input.guestTransfer !== isTransferHere
    const usedFor = await transferHotels(tx, access, account.id)
    const changed = Object.keys(after).length > 0
    const liveTransfer = usedFor.filter((h) => h.live)
    if (
      (rule.live.length > 0 || (transferChange && hotel.live)) &&
      (changed || transferChange) &&
      !input.reason
    ) {
      throw reasonRequired()
    }
    if (input.currency !== 'NGN') {
      if (input.guestTransfer || usedFor.some((h) => h.id !== hotel.id)) throw transferNgnOnly()
      const terminal = await firstTerminal(tx, account.id)
      if (terminal) {
        throw new ORPCError('BAD_REQUEST', {
          message: `${terminal.provider} · ${terminal.name} settles into this account, so it stays in naira.`,
          data: { code: 'SETTLEMENT_ACCOUNT', field: 'currency' },
        })
      }
    }
    const notices: TransferNotice[] = []
    if (changed) {
      await explainTaken(tx, access, input.bankName, input.accountNumber, account.id)
      await tx
        .update(bankAccounts)
        .set({
          bankName: input.bankName,
          accountNumber: input.accountNumber,
          accountName: input.accountName,
          currency: input.currency,
          version: account.version + 1,
        })
        .where(eq(bankAccounts.id, account.id))
      await recordAudit(tx, access, {
        action: 'bank_account.changed',
        entityType: 'bank_account',
        entityId: account.id,
        propertyId: hotel.id,
        businessDate: hotel.businessDate,
        reason: input.reason ?? null,
        before,
        after: { ...after, ...liveFlags(rule.live) },
      })
      // An account that is a live hotel's guest transfer account changed under it.
      if (after.bankName !== undefined || after.accountNumber !== undefined) {
        const updated = { bankName: input.bankName, accountNumber: input.accountNumber }
        for (const live of liveTransfer) {
          notices.push({
            hotel: live,
            before: masked(account),
            after: masked(updated),
            reason: input.reason ?? null,
          })
        }
      }
    }
    if (transferChange) {
      const fresh = await lockAccount(tx, access, hotel, account.id)
      const notice = await setTransferAccount(
        tx,
        access,
        hotel,
        input.guestTransfer ? fresh : null,
        input.reason ?? null,
      )
      if (notice) notices.push(notice)
    }
    const [view] = await bankAccountViews(tx, access, hotel, [account.id])
    return { view, notices }
  })
  await notifyOwners(deps, access, notices)
  if (!view) throw bankAccountNotFound()
  return view
}

export async function archiveBankAccount(
  deps: Deps,
  access: Access,
  input: { propertyId: string; id: string; reason?: string | undefined },
) {
  requireFinanceSetup(access)
  return deps.db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    const rule = await requireCompanyAccess(tx, access, hotel)
    const account = await lockAccount(tx, access, hotel, input.id)
    if (rule.live.length > 0 && !input.reason) throw reasonRequired()
    const [usedBy] = await transferHotels(tx, access, account.id)
    if (usedBy) {
      throw new ORPCError('CONFLICT', {
        message: `${masked(account)} is where ${usedBy.name}'s guests pay transfers. Choose another account first.`,
        data: { code: 'ACCOUNT_IN_USE' },
      })
    }
    const terminal = await firstTerminal(tx, account.id)
    if (terminal) {
      throw new ORPCError('CONFLICT', {
        message: `${terminal.provider} · ${terminal.name} settles into this account. Point it to another account first.`,
        data: { code: 'ACCOUNT_IN_USE' },
      })
    }
    if (!account.archivedAt) {
      await tx
        .update(bankAccounts)
        .set({ archivedAt: sql`now()`, version: account.version + 1 })
        .where(eq(bankAccounts.id, account.id))
      await recordAudit(tx, access, {
        action: 'bank_account.archived',
        entityType: 'bank_account',
        entityId: account.id,
        propertyId: hotel.id,
        businessDate: hotel.businessDate,
        reason: input.reason ?? null,
        after: { account: masked(account), ...liveFlags(rule.live) },
      })
    }
    const [view] = await bankAccountViews(tx, access, hotel, [account.id])
    if (!view) throw bankAccountNotFound()
    return view
  })
}

export async function restoreBankAccount(
  deps: Deps,
  access: Access,
  input: { propertyId: string; id: string; reason?: string | undefined },
) {
  requireFinanceSetup(access)
  return deps.db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    const rule = await requireCompanyAccess(tx, access, hotel)
    const account = await lockAccount(tx, access, hotel, input.id)
    if (account.archivedAt) {
      await tx
        .update(bankAccounts)
        .set({ archivedAt: null, version: account.version + 1 })
        .where(eq(bankAccounts.id, account.id))
      await recordAudit(tx, access, {
        action: 'bank_account.restored',
        entityType: 'bank_account',
        entityId: account.id,
        propertyId: hotel.id,
        businessDate: hotel.businessDate,
        reason: input.reason ?? null,
        after: { account: masked(account), liveProperty: rule.live.length > 0 },
      })
    }
    const [view] = await bankAccountViews(tx, access, hotel, [account.id])
    if (!view) throw bankAccountNotFound()
    return view
  })
}
