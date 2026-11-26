// Taxes and charges on the real test database through the real HTTP flow
// (spec: docs/specs/stage-1-taxes-and-payment-methods.md).
import {
  dec,
  type TaxBreakdown,
  type TaxRulesInForce,
  type TaxSetup,
  toAmount,
} from '@vento/shared'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { taxRates } from '../db/schema/finance.ts'
import { entities } from '../db/schema/tenancy.ts'
import { switchFeature } from '../features/switches.ts'
import { createTestApp } from '../test/harness.ts'
import {
  events,
  type KoraFinance,
  koraFinance,
  type Problem,
  setHotel,
  taxNamed,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL
const DAY = '2026-11-25'

describe.skipIf(!url)('taxes and charges', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraFinance
  let setup: TaxSetup

  const get = async (cookie: string, propertyId: string) =>
    (await t.rpc<TaxSetup>(cookie, 'taxes/get', { propertyId })).data
  const quote = async (input: Record<string, unknown>) =>
    t.rpc<TaxBreakdown>(k.finance.cookie, 'taxes/quote', { propertyId: k.vi.id, ...input })

  beforeAll(async () => {
    k = await koraFinance(t)
    for (const hotel of [k.vi, k.ikeja, k.ph]) await setHotel(t, hotel.id, { businessDate: DAY })
    const result = await t.rpc<TaxSetup>(k.finance.cookie, 'taxes/setUp', { propertyId: k.vi.id })
    expect(result.status).toBe(200)
    setup = result.data
  })

  it('shows an empty hotel what Set up for Lagos would add', async () => {
    const empty = await get(k.finance.cookie, k.ikeja.id)
    expect(empty).toMatchObject({
      setUp: false,
      plan: { vat: false, stateTax: null, serviceCharge: true, noStateTemplate: false },
      property: { stateCode: 'LA', stateName: 'Lagos' },
    })
  })

  it('sets up VAT, Lagos consumption tax and a service charge, every rate To verify', () => {
    expect(setup.setUp).toBe(true)
    expect(setup.taxes.map((tax) => [tax.name, tax.paidTo, tax.scope])).toEqual([
      ['Service charge', null, 'Kora Victoria Island only'],
      ['VAT', 'NRS', 'Every hotel in the group'],
      ['Lagos consumption tax', 'Lagos State IRS', 'Kora Victoria Island and Kora Ikeja GRA'],
    ])
    const vat = taxNamed(setup, 'VAT').rates[0]
    expect(vat).toMatchObject({
      ratePercent: '7.5',
      effectiveFrom: '2020-02-01',
      status: 'current',
    })
    expect(taxNamed(setup, 'Service charge').rates[0]).toMatchObject({
      ratePercent: '10',
      effectiveFrom: DAY,
      setByName: 'Vento default',
    })
    for (const tax of setup.taxes) {
      expect(tax.rates[0]).toMatchObject({ toVerify: true, verifiedByName: null })
      expect(tax.rates[0]?.source).toMatch(/^Vento default · illustrative/)
    }
  })

  it('records the set-up and each tax added, with one batch id', async () => {
    const [setUp] = await events(t, k.owner, { entityType: 'property', entityId: k.vi.id })
    expect(setUp).toMatchObject({
      action: 'taxes.set_up',
      actorName: 'Kunle Ade',
      after: { stateCode: 'LA', added: ['VAT', 'Lagos consumption tax', 'Service charge'] },
    })
    const vatId = taxNamed(setup, 'VAT').id
    const [created] = await events(t, k.owner, { entityType: 'tax', entityId: vatId })
    expect(created).toMatchObject({
      action: 'tax.created',
      after: { batchId: (setUp?.after as { batchId?: string } | undefined)?.batchId },
    })
  })

  it('adds only a service charge for a second Lagos hotel', async () => {
    const second = await t.rpc<TaxSetup>(k.finance.cookie, 'taxes/setUp', {
      propertyId: k.ikeja.id,
    })
    expect(second.data.taxes.map((tax) => tax.name)).toEqual([
      'Service charge',
      'VAT',
      'Lagos consumption tax',
    ])
    const again = await t.rpc<Problem>(k.finance.cookie, 'taxes/setUp', { propertyId: k.ikeja.id })
    expect(again.data.data?.code).toBe('TAXES_ALREADY_SET_UP')
  })

  it('has no consumption tax template for Rivers, and shows VAT not charged for an unregistered company', async () => {
    const before = await get(k.finance.cookie, k.ph.id)
    expect(before.plan).toMatchObject({ noStateTemplate: true, stateTax: null })
    const after = await t.rpc<TaxSetup>(k.finance.cookie, 'taxes/setUp', { propertyId: k.ph.id })
    expect(after.data.taxes.map((tax) => tax.name)).toEqual(['Service charge', 'VAT'])
    expect(taxNamed(after.data, 'VAT').notCharged).toBe(
      "Not charged at Kora Port Harcourt: Kora PH Ltd isn't VAT registered",
    )
    const rules = await t.rpc<TaxRulesInForce>(k.finance.cookie, 'taxes/inForce', {
      propertyId: k.ph.id,
    })
    expect(rules.data.rules.map((rule) => rule.kind)).toEqual(['service_charge'])
  })

  it('quotes ₦150,000 of rooms excl. taxes at ₦183,750.00, and ₦5,000 of food incl. taxes with ₦0.01 rounding', async () => {
    const rooms = await quote({ category: 'accommodation', amount: '150000', pricing: 'exclusive' })
    expect(rooms.data).toMatchObject({ gross: '183750.00', rounding: '0.00' })
    expect(rooms.data.lines.map((line) => line.amount)).toEqual(['15000.00', '11250.00', '7500.00'])
    const food = await quote({ category: 'food', amount: '5000', pricing: 'inclusive' })
    expect(food.data).toMatchObject({ net: '4081.63', rounding: '0.01', gross: '5000.00' })
    const exempt = await quote({ category: 'exempt', amount: '5000', pricing: 'exclusive' })
    expect(exempt.data.lines).toEqual([])
  })

  it('refuses to quote for a hotel whose taxes are not set up', async () => {
    const other = await t.rpc<Problem>(k.other.cookie, 'taxes/quote', {
      propertyId: k.otherHotel.id,
      category: 'food',
      amount: '100',
      pricing: 'exclusive',
    })
    expect(other.status).toBe(409)
    expect(other.data).toMatchObject({
      message: "Other Hotel's taxes aren't set up yet. Ask finance to set them up.",
      data: { code: 'TAXES_NOT_SET_UP' },
    })
  })

  it('schedules a service charge change that quotes for that night use at once, then cancels it', async () => {
    const sc = taxNamed(setup, 'Service charge')
    const scheduled = await t.rpc<TaxSetup>(k.finance.cookie, 'taxes/schedule', {
      propertyId: k.vi.id,
      taxId: sc.id,
      version: sc.version,
      stop: false,
      ratePercent: '12.5',
      categories: ['accommodation', 'food', 'beverage', 'events'],
      startsOn: '2027-01-01',
      source: 'Board meeting, 20 Oct 2026',
      reason: 'Staff pool review',
    })
    expect(scheduled.status).toBe(200)
    const rates = taxNamed(scheduled.data, 'Service charge').rates
    expect(rates.map((r) => [r.ratePercent, r.status, r.effectiveTo])).toEqual([
      ['12.5', 'scheduled', null],
      ['10', 'current', '2026-12-31'],
    ])
    const before = await quote({
      date: '2026-12-31',
      category: 'accommodation',
      amount: '150000',
      pricing: 'exclusive',
    })
    const from = await quote({
      date: '2027-01-01',
      category: 'accommodation',
      amount: '150000',
      pricing: 'exclusive',
    })
    expect(before.data.lines[0]?.amount).toBe('15000.00')
    expect(from.data.lines[0]?.amount).toBe('18750.00')
    // Inclusive prices break down exactly either side of the change.
    const incl = await quote({
      date: '2027-01-01',
      category: 'food',
      amount: '5000',
      pricing: 'inclusive',
    })
    const sum = incl.data.lines.reduce((s, l) => s.plus(l.amount), dec(incl.data.net))
    expect(toAmount(sum.plus(incl.data.rounding))).toBe('5000.00')

    const second = await t.rpc<Problem>(k.finance.cookie, 'taxes/schedule', {
      propertyId: k.vi.id,
      taxId: sc.id,
      version: sc.version + 1,
      stop: true,
      startsOn: '2027-02-01',
      source: 'Board',
      reason: 'Test',
    })
    expect(second.data.message).toBe(
      'Service charge already has a change scheduled for 1 Jan 2027. Cancel it first.',
    )
    const newRate = rates[0]
    const cancelled = await t.rpc<TaxSetup>(k.finance.cookie, 'taxes/cancel', {
      propertyId: k.vi.id,
      rateId: newRate?.id,
      version: sc.version + 1,
      reason: 'Board changed its mind',
    })
    expect(taxNamed(cancelled.data, 'Service charge').rates).toHaveLength(1)
    const [cancelEvent, scheduleEvent] = await events(t, k.owner, {
      entityType: 'tax',
      entityId: sc.id,
    })
    expect(cancelEvent).toMatchObject({
      action: 'tax_rate.cancelled',
      reason: 'Board changed its mind',
    })
    expect(scheduleEvent).toMatchObject({
      action: 'tax_rate.scheduled',
      actorName: 'Kunle Ade',
      reason: 'Staff pool review',
      after: { rate: '12.5%', effectiveFrom: '2027-01-01', liveProperty: false },
    })
  })

  it('refuses a start on or before the business date, and a stale version', async () => {
    const sc = taxNamed(await get(k.finance.cookie, k.vi.id), 'Service charge')
    const base = {
      propertyId: k.vi.id,
      taxId: sc.id,
      stop: false,
      ratePercent: '11',
      categories: ['food'],
      source: 'Board',
      reason: 'Test',
    }
    const early = await t.rpc<Problem>(k.finance.cookie, 'taxes/schedule', {
      ...base,
      version: sc.version,
      startsOn: DAY,
    })
    expect(early.data.message).toBe(
      'Changes start after the business date. The earliest is 26 Nov 2026.',
    )
    const stale = await t.rpc<Problem>(k.finance.cookie, 'taxes/schedule', {
      ...base,
      version: sc.version - 1,
      startsOn: '2026-11-26',
    })
    expect(stale.data.data?.code).toBe('STALE_VERSION')
    const zero = await t.rpc<Problem>(k.finance.cookie, 'taxes/schedule', {
      ...base,
      version: sc.version,
      ratePercent: '0',
      startsOn: '2026-11-26',
    })
    expect(zero.status).toBe(400)
  })

  it('flags a scheduled change on a live hotel as setup changed for the owner’s report', async () => {
    await setHotel(t, k.vi.id, { liveSince: '2026-11-16' })
    const lagos = taxNamed(await get(k.finance.cookie, k.vi.id), 'Lagos consumption tax')
    const stopped = await t.rpc<TaxSetup>(k.finance.cookie, 'taxes/schedule', {
      propertyId: k.vi.id,
      taxId: lagos.id,
      version: lagos.version,
      stop: true,
      startsOn: '2027-03-01',
      source: 'Lagos law, s. 1',
      reason: 'Repealed',
    })
    expect(taxNamed(stopped.data, 'Lagos consumption tax').rates[0]).toMatchObject({
      stop: true,
      status: 'scheduled',
    })
    const march = await quote({
      date: '2027-03-01',
      category: 'food',
      amount: '1000',
      pricing: 'exclusive',
    })
    expect(march.data.lines.map((l) => l.kind)).toEqual(['service_charge', 'vat'])
    const [event] = await events(t, k.owner, { entityType: 'tax', entityId: lagos.id })
    expect(event?.after).toMatchObject({
      liveProperty: true,
      exception: 'setup_changed',
      liveHotelIds: [k.vi.id],
    })
    await setHotel(t, k.vi.id, { liveSince: null })
  })

  it('records who verified a rate, with the source and the date', async () => {
    const vat = taxNamed(await get(k.finance.cookie, k.vi.id), 'VAT')
    const verified = await t.rpc<TaxSetup>(k.finance.cookie, 'taxes/verify', {
      propertyId: k.vi.id,
      rateId: vat.rates[0]?.id,
      source: 'Nigeria Tax Act 2025, s. 148',
    })
    expect(taxNamed(verified.data, 'VAT').rates[0]).toMatchObject({
      toVerify: false,
      verifiedByName: 'Kunle Ade',
      source: 'Nigeria Tax Act 2025, s. 148',
    })
    const [event] = await events(t, k.owner, { entityType: 'tax', entityId: vat.id })
    expect(event).toMatchObject({
      action: 'tax_rate.verified',
      after: { source: 'Nigeria Tax Act 2025, s. 148' },
    })
  })

  it('drops VAT lines from the date the owning company stops being VAT registered', async () => {
    await t.db
      .update(entities)
      .set({ pendingVatRegistered: false, pendingVatFrom: '2026-12-01' })
      .where(eq(entities.id, k.hospitality.id))
    const nov = await quote({
      date: '2026-11-30',
      category: 'food',
      amount: '1000',
      pricing: 'exclusive',
    })
    const dec = await quote({
      date: '2026-12-01',
      category: 'food',
      amount: '1000',
      pricing: 'exclusive',
    })
    expect(nov.data.lines.some((l) => l.kind === 'vat')).toBe(true)
    expect(dec.data.lines.some((l) => l.kind === 'vat')).toBe(false)
    await t.db
      .update(entities)
      .set({ pendingVatRegistered: null, pendingVatFrom: null })
      .where(eq(entities.id, k.hospitality.id))
  })

  it('uses the business date, not the clock, for a charge posted after midnight', async () => {
    // The clock is past 25 Nov 2026; Ikeja's business date is still 25 Nov (night audit hasn't
    // run), so a charge now uses 25 Nov's rules, not the change starting 26 Nov.
    expect(new Date().toISOString().slice(0, 10) > DAY).toBe(true)
    const ikejaSc = taxNamed(await get(k.finance.cookie, k.ikeja.id), 'Service charge')
    const scheduled = await t.rpc(k.finance.cookie, 'taxes/schedule', {
      propertyId: k.ikeja.id,
      taxId: ikejaSc.id,
      version: ikejaSc.version,
      stop: false,
      ratePercent: '15',
      categories: ['food'],
      startsOn: '2026-11-26',
      source: 'Board',
      reason: 'New rate',
    })
    expect(scheduled.status).toBe(200)
    const charge = await t.rpc<TaxBreakdown>(k.finance.cookie, 'taxes/quote', {
      propertyId: k.ikeja.id,
      category: 'food',
      amount: '1000',
      pricing: 'exclusive',
    })
    expect(charge.data.lines[0]).toMatchObject({ name: 'Service charge', amount: '100.00' })
  })

  it('lets GMs read taxes but not change them, and keeps front desk out', async () => {
    const read = await t.rpc<TaxSetup>(k.gm.cookie, 'taxes/get', { propertyId: k.vi.id })
    expect(read.status).toBe(200)
    expect(read.data.canEdit).toBe(false)
    const sc = taxNamed(read.data, 'Service charge')
    const change = await t.rpc<Problem>(k.gm.cookie, 'taxes/verify', {
      propertyId: k.vi.id,
      rateId: sc.rates[0]?.id,
      source: 'Board',
    })
    expect(change.status).toBe(403)
    expect(change.data.message).toBe(
      'Only finance or the owner can change taxes and payment setup. Ask your finance team.',
    )
    expect((await t.rpc(k.frontDesk.cookie, 'taxes/get', { propertyId: k.vi.id })).status).toBe(403)
  })

  it('lets finance limited to one hotel change its service charge but not VAT or the Lagos tax', async () => {
    const page = await get(k.viFinance.cookie, k.vi.id)
    expect(taxNamed(page, 'VAT')).toMatchObject({
      canChange: false,
      readOnlyReason:
        'VAT applies to every hotel in the group. Only someone with whole-group access can change it.',
    })
    expect(taxNamed(page, 'Lagos consumption tax').canChange).toBe(false)
    expect(taxNamed(page, 'Service charge').canChange).toBe(true)
    const vat = taxNamed(page, 'VAT')
    const refused = await t.rpc<Problem>(k.viFinance.cookie, 'taxes/schedule', {
      propertyId: k.vi.id,
      taxId: vat.id,
      version: vat.version,
      stop: false,
      ratePercent: '8',
      categories: ['food'],
      startsOn: '2026-12-01',
      source: 'NTA',
      reason: 'Test',
    })
    expect(refused.data.data?.code).toBe('GROUP_ACCESS_NEEDED')
    const abroad = await t.rpc<Problem>(k.viFinance.cookie, 'taxes/get', { propertyId: k.ikeja.id })
    expect(abroad.data.data?.code).toBe('PROPERTY_NOT_FOUND')
  })

  it('answers not found for another group’s hotel and taxes', async () => {
    const hotel = await t.rpc<Problem>(k.finance.cookie, 'taxes/get', {
      propertyId: k.otherHotel.id,
    })
    expect(hotel.data).toMatchObject({ data: { code: 'PROPERTY_NOT_FOUND' } })
    await t.rpc(k.other.cookie, 'taxes/setUp', { propertyId: k.otherHotel.id })
    const theirs = (await get(k.other.cookie, k.otherHotel.id)).taxes[0]
    const cross = await t.rpc<Problem>(k.finance.cookie, 'taxes/verify', {
      propertyId: k.vi.id,
      rateId: theirs?.rates[0]?.id,
      source: 'Nope',
    })
    expect(cross.status).toBe(404)
  })

  it('answers FEATURE_OFF while front desk is switched off', async () => {
    await switchFeature(t.db, k.orgId, { feature: 'front_desk', to: 'off', reason: 'Test' })
    const off = await t.rpc<Problem>(k.finance.cookie, 'taxes/get', { propertyId: k.vi.id })
    await switchFeature(t.db, k.orgId, { feature: 'front_desk', to: 'on', reason: 'Test' })
    expect(off.data).toMatchObject({ data: { code: 'FEATURE_OFF' } })
  })

  it('never lets a rate version be edited or deleted, even by hand', async () => {
    const rateId = taxNamed(setup, 'VAT').rates[0]?.id ?? ''
    await expect(
      t.db.update(taxRates).set({ ratePercent: '8' }).where(eq(taxRates.id, rateId)),
    ).rejects.toMatchObject({ cause: { code: '23001' } })
    await expect(t.db.delete(taxRates).where(eq(taxRates.id, rateId))).rejects.toMatchObject({
      cause: { code: '23001' },
    })
    await expect(t.db.execute(sql`select 1`)).resolves.toBeDefined()
  })
})
