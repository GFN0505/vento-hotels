// Taxes and charges, the read side: the Taxes and charges page for a hotel, the rules in force for
// a hotel on a business date (the seam for quotes, postings and night audit), and quotes through
// the shared `taxLines`. Rates are only ever read from the group's own rules, never templates.
import {
  addDays,
  dec,
  orderTaxRules,
  type Pricing,
  type TaxableCategory,
  type TaxBreakdown,
  type TaxCategory,
  type TaxRuleInForce,
  type TaxSetup,
  type TaxView,
  taxLines,
  taxRateStatus,
  versionInForce,
} from '@vento/shared'
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm'
import { taxes, taxRates, taxTemplates } from '../db/schema/finance.ts'
import { entities } from '../db/schema/tenancy.ts'
import type { Access } from '../tenancy/access.ts'
import { can } from '../tenancy/access.ts'
import {
  groupHotels,
  type Hotel,
  loadHotel,
  type Reader,
  requireTaxesRead,
  sees,
  stateName,
} from './context.ts'
import { taxesNotSetUp } from './errors.ts'

export type TaxRow = typeof taxes.$inferSelect
export type RateRow = typeof taxRates.$inferSelect

// --- Scope rules ----------------------------------------------------------------------------------

// The active hotels a tax covers.
export function coveredHotels(
  tax: Pick<TaxRow, 'kind' | 'stateCode' | 'propertyId'>,
  hotels: Hotel[],
) {
  const active = hotels.filter((hotel) => !hotel.archived)
  if (tax.kind === 'vat') return active
  if (tax.kind === 'state_tax') return active.filter((hotel) => hotel.stateCode === tax.stateCode)
  return hotels.filter((hotel) => hotel.id === tax.propertyId)
}

// Whether this member may change a tax, and if not (while they could change taxes), why.
export function changeRule(
  access: Access,
  tax: Pick<TaxRow, 'kind' | 'stateCode' | 'propertyId' | 'name'>,
  hotels: Hotel[],
): { canChange: boolean; reason: string | null } {
  if (!can(access, 'finance.setup')) return { canChange: false, reason: null }
  if (tax.kind === 'vat') {
    return access.allProperties
      ? { canChange: true, reason: null }
      : {
          canChange: false,
          reason:
            'VAT applies to every hotel in the group. Only someone with whole-group access can change it.',
        }
  }
  const covered = coveredHotels(tax, hotels)
  if (tax.kind === 'state_tax') {
    return covered.every((hotel) => sees(access, hotel.id))
      ? { canChange: true, reason: null }
      : {
          canChange: false,
          reason: `${tax.name} applies to every hotel in ${stateName(tax.stateCode)}. Only someone with access to all of them can change it.`,
        }
  }
  const hotel = covered[0]
  if (!hotel || hotel.archived) {
    return { canChange: false, reason: 'This hotel is archived. Its charges stay as they were.' }
  }
  return { canChange: sees(access, hotel.id), reason: null }
}

// A change starts after the business date of every hotel it covers, so no day is charged at two
// rates. The hotel with the latest business date is named when they differ.
export function earliestStart(covered: Hotel[], fallback: Hotel) {
  const hotels = covered.length > 0 ? covered : [fallback]
  const latest = hotels.reduce((a, b) => (b.businessDate > a.businessDate ? b : a))
  const differ = hotels.some((hotel) => hotel.businessDate !== latest.businessDate)
  return {
    date: addDays(latest.businessDate, 1),
    latestBusinessDate: latest.businessDate,
    latestHotel: differ ? latest.name : null,
  }
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

// The selected hotel first, then the others by name.
function scopeWords(tax: TaxRow, hotels: Hotel[], here: Hotel): string {
  if (tax.kind === 'vat') return 'Every hotel in the group'
  const covered = coveredHotels(tax, hotels)
  if (tax.kind === 'service_charge') return `${covered[0]?.name ?? 'This hotel'} only`
  if (covered.length === 0) return `Hotels in ${stateName(tax.stateCode)}`
  covered.sort((a, b) => Number(b.id === here.id) - Number(a.id === here.id))
  return covered.length === 1 ? `${covered[0]?.name} only` : listNames(covered.map((h) => h.name))
}

// --- Loading ----------------------------------------------------------------------------------------

// The taxes that apply to a hotel: the group's VAT, its state's taxes, its service charge.
export async function taxesFor(db: Reader, access: Access, hotel: Hotel): Promise<TaxRow[]> {
  return db
    .select()
    .from(taxes)
    .where(
      and(
        eq(taxes.organizationId, access.organizationId),
        or(
          eq(taxes.kind, 'vat'),
          hotel.stateCode
            ? and(eq(taxes.kind, 'state_tax'), eq(taxes.stateCode, hotel.stateCode))
            : undefined,
          and(eq(taxes.kind, 'service_charge'), eq(taxes.propertyId, hotel.id)),
        ),
      ),
    )
}

// Live versions (not cancelled), oldest first.
export async function liveRates(db: Reader, organizationId: string, taxIds: string[]) {
  if (taxIds.length === 0) return new Map<string, RateRow[]>()
  const rows = await db
    .select()
    .from(taxRates)
    .where(
      and(
        eq(taxRates.organizationId, organizationId),
        inArray(taxRates.taxId, taxIds),
        isNull(taxRates.cancelledAt),
      ),
    )
    .orderBy(asc(taxRates.effectiveFrom))
  const byTax = new Map<string, RateRow[]>()
  for (const row of rows) byTax.set(row.taxId, [...(byTax.get(row.taxId) ?? []), row])
  return byTax
}

// Whether the hotel's owning company is VAT registered on a date, counting a scheduled change of
// company or of registration (both applied by night audit from their date).
export async function vatRegisteredOn(db: Reader, hotel: Hotel, date: string) {
  const entityId =
    hotel.pendingEntityId && hotel.pendingEntityFrom && hotel.pendingEntityFrom <= date
      ? hotel.pendingEntityId
      : hotel.entityId
  const [entity] = await db
    .select({
      name: entities.name,
      vatRegistered: entities.vatRegistered,
      pendingVatRegistered: entities.pendingVatRegistered,
      pendingVatFrom: entities.pendingVatFrom,
    })
    .from(entities)
    .where(eq(entities.id, entityId))
  if (!entity) return { registered: false, entityName: hotel.entityName }
  const registered =
    entity.pendingVatFrom && entity.pendingVatRegistered !== null && entity.pendingVatFrom <= date
      ? entity.pendingVatRegistered
      : entity.vatRegistered
  return { registered, entityName: entity.name }
}

const isSetUp = (rows: TaxRow[], hotel: Hotel) =>
  rows.some((tax) => tax.kind === 'service_charge' && tax.propertyId === hotel.id)

// --- Rules in force -------------------------------------------------------------------------------

// The rates in force for a hotel on a business date: VAT (when the owning company is VAT registered
// that day), the hotel's state taxes and its service charge. Throws TAXES_NOT_SET_UP for a hotel
// whose taxes were never set up: nothing is quoted or posted without taxes.
export async function rulesInForceFor(
  db: Reader,
  access: Access,
  hotel: Hotel,
  date: string,
): Promise<TaxRuleInForce[]> {
  const rows = await taxesFor(db, access, hotel)
  if (!isSetUp(rows, hotel)) throw taxesNotSetUp(hotel.name)
  const [rates, vat] = await Promise.all([
    liveRates(
      db,
      access.organizationId,
      rows.map((tax) => tax.id),
    ),
    vatRegisteredOn(db, hotel, date),
  ])
  const rules: TaxRuleInForce[] = []
  for (const tax of rows) {
    if (tax.kind === 'vat' && !vat.registered) continue
    const version = versionInForce(rates.get(tax.id) ?? [], date)
    if (!version?.ratePercent) continue
    rules.push({
      taxId: tax.id,
      rateId: version.id,
      kind: tax.kind,
      name: tax.name,
      ratePercent: dec(version.ratePercent).toString(),
      categories: version.categories as TaxableCategory[],
      base: version.base,
    })
  }
  return orderTaxRules(rules)
}

export async function taxRulesInForce(
  db: Reader,
  access: Access,
  input: { propertyId: string; date?: string | undefined },
) {
  requireTaxesRead(access)
  const hotel = await loadHotel(db, access, input.propertyId)
  const date = input.date ?? hotel.businessDate
  return { propertyId: hotel.id, date, rules: await rulesInForceFor(db, access, hotel, date) }
}

// The server's quote: the rules in force on the date (the hotel's business date unless given; a
// future night uses that night's rules) through the shared calculation.
export async function quoteTaxLines(
  db: Reader,
  access: Access,
  input: {
    propertyId: string
    date?: string | undefined
    category: TaxCategory
    amount: string
    pricing: Pricing
  },
): Promise<TaxBreakdown> {
  const { rules } = await taxRulesInForce(db, access, input)
  return taxLines({
    amount: input.amount,
    currency: 'NGN',
    pricing: input.pricing,
    category: input.category,
    rules,
  })
}

// --- The page ---------------------------------------------------------------------------------------

function rateViews(rates: RateRow[], businessDate: string): TaxView['rates'] {
  const versions = rates.map((rate) => ({ effectiveFrom: rate.effectiveFrom, stop: rate.stop }))
  const views = rates.map((rate, index) => {
    const next = rates[index + 1]
    const status = taxRateStatus(versions[index] ?? rate, versions, businessDate)
    return {
      id: rate.id,
      ratePercent: rate.ratePercent === null ? null : dec(rate.ratePercent).toString(),
      stop: rate.stop,
      categories: rate.categories as TaxableCategory[],
      base: rate.base,
      effectiveFrom: rate.effectiveFrom,
      effectiveTo: next ? addDays(next.effectiveFrom, -1) : null,
      first: index === 0,
      source: rate.verifiedSource ?? rate.source,
      reason: rate.reason,
      setByName: rate.setByName,
      setAt: rate.createdAt.toISOString(),
      verifiedByName: rate.verifiedByName,
      verifiedOn: rate.verifiedOn,
      status,
      toVerify:
        !rate.stop && !rate.verifiedByName && (status === 'current' || status === 'scheduled'),
    }
  })
  // Newest first, as in the design.
  return views.reverse()
}

export async function taxSetupFor(db: Reader, access: Access, hotel: Hotel): Promise<TaxSetup> {
  const [rows, hotels, templates] = await Promise.all([
    taxesFor(db, access, hotel),
    groupHotels(db, access.organizationId),
    db
      .select({
        kind: taxTemplates.kind,
        stateCode: taxTemplates.stateCode,
        name: taxTemplates.name,
      })
      .from(taxTemplates),
  ])
  const [rates, vat] = await Promise.all([
    liveRates(
      db,
      access.organizationId,
      rows.map((tax) => tax.id),
    ),
    vatRegisteredOn(db, hotel, hotel.businessDate),
  ])
  const ordered = orderTaxRules(rows)
  const hasStateTax = rows.some((tax) => tax.kind === 'state_tax')
  const stateTemplate = templates.find(
    (template) => template.kind === 'state_tax' && template.stateCode === hotel.stateCode,
  )
  const views: TaxView[] = ordered.map((tax) => {
    const covered = coveredHotels(tax, hotels)
    const start = earliestStart(covered, hotel)
    const rule = changeRule(access, tax, hotels)
    return {
      id: tax.id,
      kind: tax.kind,
      name: tax.name,
      paidTo: tax.paidTo,
      stateCode: tax.stateCode,
      version: tax.version,
      scope: scopeWords(tax, hotels, hotel),
      canChange: rule.canChange,
      readOnlyReason: rule.reason,
      earliestStart: start.date,
      latestHotel: start.latestHotel,
      notCharged:
        tax.kind === 'vat' && !vat.registered
          ? `Not charged at ${hotel.name}: ${vat.entityName} isn't VAT registered`
          : null,
      rates: rateViews(rates.get(tax.id) ?? [], hotel.businessDate),
    }
  })
  return {
    property: {
      id: hotel.id,
      name: hotel.name,
      stateCode: hotel.stateCode,
      stateName: stateName(hotel.stateCode),
      businessDate: hotel.businessDate,
      live: hotel.live,
      archived: hotel.archived,
      entityName: hotel.entityName,
    },
    setUp: isSetUp(rows, hotel),
    plan: {
      vat: !rows.some((tax) => tax.kind === 'vat'),
      stateTax: !hasStateTax && stateTemplate ? stateTemplate.name : null,
      serviceCharge: !isSetUp(rows, hotel),
      noStateTemplate: Boolean(hotel.stateCode) && !hasStateTax && !stateTemplate,
    },
    canEdit: can(access, 'finance.setup') && !hotel.archived,
    taxes: views,
  }
}

export async function getTaxSetup(db: Reader, access: Access, propertyId: string) {
  requireTaxesRead(access)
  return taxSetupFor(db, access, await loadHotel(db, access, propertyId))
}
