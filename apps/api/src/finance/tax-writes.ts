// Taxes and charges, the write side. Nothing changes in place: the only changes are set up, add a
// tax, rename or change "paid to", schedule a change (or a stop), cancel a scheduled change, and mark
// a rate verified. Each runs in one transaction with its audit event; changes that cover a live
// hotel carry the "setup changed" exception for the owner's daily report.
import { ORPCError } from '@orpc/server'
import { newId, type TaxableCategory, type TaxBase, type TaxSetup } from '@vento/shared'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { type AuditEvent, recordAudit, recordAuditMany } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isUniqueViolation } from '../db/errors.ts'
import { taxes, taxRates, taxTemplates } from '../db/schema/finance.ts'
import type { Access } from '../tenancy/access.ts'
import { staleVersion } from '../tenancy/errors.ts'
import { lastChangeBy } from '../tenancy/last-change.ts'
import {
  dateLabel,
  groupHotels,
  type Hotel,
  loadHotel,
  lockKey,
  requireFinanceSetup,
  stateName,
  type Tx,
  today,
} from './context.ts'
import {
  alreadyScheduled,
  groupAccessNeeded,
  noState,
  notScheduled,
  rateNotFound,
  reasonRequired,
  startTooEarly,
  taxesAlreadySetUp,
  taxNotFound,
} from './errors.ts'
import {
  changeRule,
  coveredHotels,
  earliestStart,
  type TaxRow,
  taxesFor,
  taxSetupFor,
} from './taxes.ts'

const SET_UP_SOURCE_NOTE = 'Vento default'

// The flags the owner's daily report reads, when a hotel the change covers is live.
function liveFlags(covered: Hotel[]) {
  const live = covered.filter((hotel) => hotel.live)
  return live.length > 0
    ? { liveProperty: true, exception: 'setup_changed', liveHotelIds: live.map((h) => h.id) }
    : { liveProperty: false }
}

const auditScope = (tax: Pick<TaxRow, 'kind' | 'propertyId'>, hotel: Hotel) => ({
  propertyId: tax.kind === 'service_charge' ? tax.propertyId : null,
  businessDate: hotel.businessDate,
})

const rateWords = (rate: { stop: boolean; ratePercent: string | null }) =>
  rate.stop ? 'stop' : `${rate.ratePercent}%`

async function lockTax(tx: Tx, access: Access, id: string): Promise<TaxRow> {
  const [row] = await tx
    .select()
    .from(taxes)
    .where(and(eq(taxes.id, id), eq(taxes.organizationId, access.organizationId)))
    .for('update')
  if (!row) throw taxNotFound()
  return row
}

// The tax must apply to the hotel the page is for, and the member must be allowed to change it.
async function requireChangeable(tx: Tx, access: Access, tax: TaxRow, hotel: Hotel) {
  const applies =
    tax.kind === 'vat' ||
    (tax.kind === 'state_tax' && tax.stateCode === hotel.stateCode) ||
    tax.propertyId === hotel.id
  if (!applies) throw taxNotFound()
  const hotels = await groupHotels(tx, access.organizationId)
  const rule = changeRule(access, tax, hotels)
  if (!rule.canChange) throw groupAccessNeeded(rule.reason ?? "You can't change this tax.")
  const covered = coveredHotels(tax, hotels)
  return { covered, start: earliestStart(covered, hotel) }
}

async function requireVersion(tx: Tx, access: Access, tax: TaxRow, hotel: Hotel, version: number) {
  if (tax.version === version) return
  throw staleVersion(
    tax.name,
    await lastChangeBy(tx, {
      organizationId: access.organizationId,
      entityType: 'tax',
      entityId: tax.id,
      actions: ['tax.changed', 'tax_rate.scheduled', 'tax_rate.cancelled'],
      timeZone: hotel.timeZone,
    }),
  )
}

async function bumpVersion(tx: Tx, tax: TaxRow) {
  await tx
    .update(taxes)
    .set({ version: tax.version + 1 })
    .where(eq(taxes.id, tax.id))
}

type NewRate = {
  stop: boolean
  ratePercent: string | null
  categories: TaxableCategory[]
  base: TaxBase
  effectiveFrom: string
  source: string
  reason: string | null
  setByName: string
}

async function insertRate(tx: Tx, access: Access, taxId: string, rate: NewRate) {
  const [row] = await tx
    .insert(taxRates)
    .values({
      organizationId: access.organizationId,
      taxId,
      ratePercent: rate.ratePercent,
      stop: rate.stop,
      categories: rate.stop ? [] : rate.categories,
      base: rate.base,
      effectiveFrom: rate.effectiveFrom,
      source: rate.source,
      reason: rate.reason,
      setByMemberId: access.memberId,
      setByName: rate.setByName,
    })
    .returning({ id: taxRates.id })
  if (!row) throw new Error('tax rate insert returned nothing')
  return row.id
}

// --- Set up for … ---------------------------------------------------------------------------------

// Adds what is missing for a hotel, in one go: the group's VAT (keeping its history), the state's
// consumption tax from Vento's template, and a service charge for the hotel. Every rate starts
// To verify, sourced "Vento default · illustrative · …".
export async function setUpTaxes(
  db: Database,
  access: Access,
  propertyId: string,
): Promise<TaxSetup> {
  requireFinanceSetup(access)
  return db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, propertyId, { hold: true })
    if (!hotel.stateCode) throw noState(hotel.name)
    await lockKey(tx, `taxes:${access.organizationId}`)
    const existing = await taxesFor(tx, access, hotel)
    if (existing.some((tax) => tax.kind === 'service_charge')) throw taxesAlreadySetUp(hotel.name)
    const hotels = await groupHotels(tx, access.organizationId)
    const templates = await tx.select().from(taxTemplates)
    const wanted = templates.filter(
      (template) =>
        (template.kind === 'vat' && !existing.some((tax) => tax.kind === 'vat')) ||
        (template.kind === 'state_tax' &&
          template.stateCode === hotel.stateCode &&
          !existing.some((tax) => tax.kind === 'state_tax')) ||
        template.kind === 'service_charge',
    )
    const batchId = newId()
    const events: AuditEvent[] = []
    const added: string[] = []
    let flags: ReturnType<typeof liveFlags> = { liveProperty: false }
    for (const template of wanted) {
      const shape = {
        kind: template.kind,
        stateCode: template.kind === 'state_tax' ? hotel.stateCode : null,
        propertyId: template.kind === 'service_charge' ? hotel.id : null,
        name: template.name,
      }
      const rule = changeRule(access, shape, hotels)
      if (!rule.canChange && template.kind !== 'service_charge') {
        throw groupAccessNeeded(
          template.kind === 'vat'
            ? "VAT isn't set up for the group yet. Ask someone with whole-group access to set up taxes."
            : `${template.name} covers hotels outside your access. Ask someone with access to all of them.`,
        )
      }
      const [tax] = await tx
        .insert(taxes)
        .values({ organizationId: access.organizationId, ...shape, paidTo: template.paidTo })
        .returning()
      if (!tax) throw new Error('tax insert returned nothing')
      const effectiveFrom = template.effectiveFrom ?? hotel.businessDate
      const rateId = await insertRate(tx, access, tax.id, {
        stop: false,
        ratePercent: template.ratePercent,
        categories: template.categories as TaxableCategory[],
        base: template.base,
        effectiveFrom,
        source: template.source,
        reason: null,
        setByName: SET_UP_SOURCE_NOTE,
      })
      const covered = coveredHotels(tax, hotels)
      const taxFlags = liveFlags(covered)
      if (taxFlags.liveProperty) flags = taxFlags
      added.push(tax.name)
      events.push({
        action: 'tax.created',
        entityType: 'tax',
        entityId: tax.id,
        ...auditScope(tax, hotel),
        after: {
          kind: tax.kind,
          name: tax.name,
          paidTo: tax.paidTo,
          stateCode: tax.stateCode,
          rateId,
          ratePercent: template.ratePercent,
          categories: template.categories,
          base: template.base,
          effectiveFrom,
          source: template.source,
          batchId,
          ...taxFlags,
        },
      })
    }
    await recordAuditMany(tx, access, events)
    await recordAudit(tx, access, {
      action: 'taxes.set_up',
      entityType: 'property',
      entityId: hotel.id,
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
      after: { stateCode: hotel.stateCode, added, batchId, ...flags },
    })
    return taxSetupFor(tx, access, hotel)
  })
}

// --- Add a tax or charge ----------------------------------------------------------------------------

export async function createTax(
  db: Database,
  access: Access,
  input: {
    propertyId: string
    kind: 'state_tax' | 'service_charge'
    name: string
    paidTo?: string | undefined
    ratePercent: string
    categories: TaxableCategory[]
    base: TaxBase
    startsOn: string
    source: string
    reason: string
  },
): Promise<TaxSetup> {
  requireFinanceSetup(access)
  return db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    if (input.kind === 'state_tax' && !hotel.stateCode) throw noState(hotel.name)
    await lockKey(tx, `taxes:${access.organizationId}`)
    const shape = {
      kind: input.kind,
      stateCode: input.kind === 'state_tax' ? hotel.stateCode : null,
      propertyId: input.kind === 'service_charge' ? hotel.id : null,
      name: input.name,
    }
    const existing = await taxesFor(tx, access, hotel)
    if (input.kind === 'service_charge' && existing.some((tax) => tax.kind === 'service_charge')) {
      throw new ORPCError('CONFLICT', {
        message: `${hotel.name} already has a service charge. Schedule a change to it instead.`,
        data: { code: 'SERVICE_CHARGE_EXISTS' },
      })
    }
    const hotels = await groupHotels(tx, access.organizationId)
    const rule = changeRule(access, shape, hotels)
    if (!rule.canChange) throw groupAccessNeeded(rule.reason ?? "You can't add this here.")
    const covered = coveredHotels(shape, hotels)
    const start = earliestStart(covered, hotel)
    if (input.startsOn < start.date) throw startTooEarly(dateLabel(start.date))
    let tax: TaxRow | undefined
    try {
      ;[tax] = await tx
        .insert(taxes)
        .values({
          organizationId: access.organizationId,
          ...shape,
          paidTo: input.kind === 'service_charge' ? null : input.paidTo || null,
        })
        .returning()
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ORPCError('CONFLICT', {
          message: `${input.name} is already set up for ${stateName(hotel.stateCode)}.`,
          data: { code: 'TAX_NAME_TAKEN', field: 'name' },
        })
      }
      throw error
    }
    if (!tax) throw new Error('tax insert returned nothing')
    const rateId = await insertRate(tx, access, tax.id, {
      stop: false,
      ratePercent: input.ratePercent,
      categories: input.categories,
      base: input.kind === 'service_charge' ? 'net' : input.base,
      effectiveFrom: input.startsOn,
      source: input.source,
      reason: input.reason,
      setByName: access.userName,
    })
    await recordAudit(tx, access, {
      action: 'tax.created',
      entityType: 'tax',
      entityId: tax.id,
      ...auditScope(tax, hotel),
      reason: input.reason,
      after: {
        kind: tax.kind,
        name: tax.name,
        paidTo: tax.paidTo,
        stateCode: tax.stateCode,
        rateId,
        ratePercent: input.ratePercent,
        categories: input.categories,
        base: input.base,
        effectiveFrom: input.startsOn,
        source: input.source,
        ...liveFlags(covered),
      },
    })
    return taxSetupFor(tx, access, hotel)
  })
}

// --- Rename or change "paid to" ---------------------------------------------------------------------

export async function updateTax(
  db: Database,
  access: Access,
  input: {
    propertyId: string
    id: string
    version: number
    name: string
    paidTo: string | null
    reason?: string | undefined
  },
): Promise<TaxSetup> {
  requireFinanceSetup(access)
  return db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    const tax = await lockTax(tx, access, input.id)
    const { covered } = await requireChangeable(tx, access, tax, hotel)
    await requireVersion(tx, access, tax, hotel, input.version)
    if (covered.some((h) => h.live) && !input.reason) throw reasonRequired()
    const paidTo = tax.kind === 'service_charge' ? null : input.paidTo || null
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    if (input.name !== tax.name) {
      before.name = tax.name
      after.name = input.name
    }
    if (paidTo !== tax.paidTo) {
      before.paidTo = tax.paidTo
      after.paidTo = paidTo
    }
    if (Object.keys(after).length === 0) return taxSetupFor(tx, access, hotel)
    try {
      await tx
        .update(taxes)
        .set({ name: input.name, paidTo, version: tax.version + 1 })
        .where(eq(taxes.id, tax.id))
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ORPCError('CONFLICT', {
          message: `${input.name} is already set up for ${stateName(tax.stateCode)}.`,
          data: { code: 'TAX_NAME_TAKEN', field: 'name' },
        })
      }
      throw error
    }
    await recordAudit(tx, access, {
      action: 'tax.changed',
      entityType: 'tax',
      entityId: tax.id,
      ...auditScope(tax, hotel),
      reason: input.reason ?? null,
      before,
      after: { ...after, liveProperty: covered.some((h) => h.live) },
    })
    return taxSetupFor(tx, access, hotel)
  })
}

// --- Schedule a change ------------------------------------------------------------------------------

// The change waiting to start, if any: a live version after the latest business date it covers.
async function scheduledRate(tx: Tx, taxId: string, latestBusinessDate: string) {
  const [row] = await tx
    .select()
    .from(taxRates)
    .where(
      and(
        eq(taxRates.taxId, taxId),
        isNull(taxRates.cancelledAt),
        gt(taxRates.effectiveFrom, latestBusinessDate),
      ),
    )
    .limit(1)
  return row
}

export async function scheduleTaxRate(
  db: Database,
  access: Access,
  input: {
    propertyId: string
    taxId: string
    version: number
    startsOn: string
    source: string
    reason: string
  } & (
    | { stop: true }
    | { stop: false; ratePercent: string; categories: TaxableCategory[]; base: TaxBase }
  ),
): Promise<TaxSetup> {
  requireFinanceSetup(access)
  return db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    const tax = await lockTax(tx, access, input.taxId)
    const { covered, start } = await requireChangeable(tx, access, tax, hotel)
    await requireVersion(tx, access, tax, hotel, input.version)
    const waiting = await scheduledRate(tx, tax.id, start.latestBusinessDate)
    if (waiting) throw alreadyScheduled(tax.name, dateLabel(waiting.effectiveFrom))
    if (input.startsOn < start.date) throw startTooEarly(dateLabel(start.date))
    const rate = input.stop
      ? {
          stop: true,
          ratePercent: null,
          categories: [] as TaxableCategory[],
          base: 'net' as TaxBase,
        }
      : {
          stop: false,
          ratePercent: input.ratePercent,
          categories: input.categories,
          base: tax.kind === 'service_charge' ? ('net' as TaxBase) : input.base,
        }
    const rateId = await insertRate(tx, access, tax.id, {
      ...rate,
      effectiveFrom: input.startsOn,
      source: input.source,
      reason: input.reason,
      setByName: access.userName,
    })
    await bumpVersion(tx, tax)
    await recordAudit(tx, access, {
      action: 'tax_rate.scheduled',
      entityType: 'tax',
      entityId: tax.id,
      ...auditScope(tax, hotel),
      reason: input.reason,
      after: {
        taxName: tax.name,
        rateId,
        rate: rateWords(rate),
        ...rate,
        effectiveFrom: input.startsOn,
        source: input.source,
        ...liveFlags(covered),
      },
    })
    return taxSetupFor(tx, access, hotel)
  })
}

// --- Cancel a scheduled change ------------------------------------------------------------------

async function lockRate(tx: Tx, access: Access, rateId: string) {
  const [rate] = await tx
    .select()
    .from(taxRates)
    .where(and(eq(taxRates.id, rateId), eq(taxRates.organizationId, access.organizationId)))
  if (!rate) throw rateNotFound()
  return rate
}

export async function cancelTaxRate(
  db: Database,
  access: Access,
  input: { propertyId: string; rateId: string; version: number; reason: string },
): Promise<TaxSetup> {
  requireFinanceSetup(access)
  return db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    const found = await lockRate(tx, access, input.rateId)
    const tax = await lockTax(tx, access, found.taxId)
    const { covered, start } = await requireChangeable(tx, access, tax, hotel)
    await requireVersion(tx, access, tax, hotel, input.version)
    const rate = await lockRate(tx, access, input.rateId)
    if (rate.cancelledAt || rate.effectiveFrom <= start.latestBusinessDate) throw notScheduled()
    await tx
      .update(taxRates)
      .set({
        cancelledAt: sql`now()`,
        cancelledByName: access.userName,
        cancelReason: input.reason,
      })
      .where(eq(taxRates.id, rate.id))
    await bumpVersion(tx, tax)
    await recordAudit(tx, access, {
      action: 'tax_rate.cancelled',
      entityType: 'tax',
      entityId: tax.id,
      ...auditScope(tax, hotel),
      reason: input.reason,
      before: {
        taxName: tax.name,
        rateId: rate.id,
        rate: rateWords(rate),
        effectiveFrom: rate.effectiveFrom,
      },
      after: { cancelled: true, ...liveFlags(covered) },
    })
    return taxSetupFor(tx, access, hotel)
  })
}

// --- Mark verified ---------------------------------------------------------------------------------

// Records who checked a rate against the law, with the source, and today's date. Audited only.
export async function verifyTaxRate(
  db: Database,
  access: Access,
  input: { propertyId: string; rateId: string; source: string },
): Promise<TaxSetup> {
  requireFinanceSetup(access)
  return db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    const found = await lockRate(tx, access, input.rateId)
    const tax = await lockTax(tx, access, found.taxId)
    await requireChangeable(tx, access, tax, hotel)
    if (found.cancelledAt || found.stop) throw rateNotFound()
    // Vento's placeholder isn't a legal source: verifying means naming the real one.
    if (/^vento default/i.test(input.source.trim())) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Name the act, law or decision and its section, not the Vento default.',
        data: { code: 'SOURCE_REQUIRED', field: 'source' },
      })
    }
    const verifiedOn = today()
    await tx
      .update(taxRates)
      .set({
        verifiedByMemberId: access.memberId,
        verifiedByName: access.userName,
        verifiedOn,
        verifiedSource: input.source,
      })
      .where(eq(taxRates.id, found.id))
    await recordAudit(tx, access, {
      action: 'tax_rate.verified',
      entityType: 'tax',
      entityId: tax.id,
      ...auditScope(tax, hotel),
      before: {
        rateId: found.id,
        source: found.verifiedSource ?? found.source,
        verifiedByName: found.verifiedByName,
      },
      after: {
        taxName: tax.name,
        rateId: found.id,
        rate: rateWords(found),
        source: input.source,
        verifiedOn,
      },
    })
    return taxSetupFor(tx, access, hotel)
  })
}
