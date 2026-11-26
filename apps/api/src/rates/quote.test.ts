// The seam brick 4 reads: quoteStay and listBookablePlans, called as the booking service will call
// them (spec: "What brick 4 reads").
import type { RatePlanView } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Access, loadAccess } from '../tenancy/access.ts'
import { createTestApp } from '../test/harness.ts'
import { listBookablePlans, quoteStay } from './quote.ts'
import { batch, firstRate, type Kora, koraWithRates, nonRefundable, TERMS } from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('quoting a stay', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let kora: Kora
  let bar: RatePlanView
  let bb: RatePlanView
  let desk: Access
  let attendant: Access
  let outsider: Access

  const accessOf = async (orgId: string, userId: string, name: string) => {
    const access = await loadAccess(t.db, orgId, { id: userId, name })
    if (!access) throw new Error(`${name} has no access`)
    return access
  }

  beforeAll(async () => {
    kora = await koraWithRates(t)
    ;({ bar, bb } = await firstRate(t, kora))
    await nonRefundable(t, kora, bar.id)
    await t.rpc(kora.gm.cookie, 'ratePlans/create', {
      propertyId: kora.vi.id,
      name: 'Acme Energy',
      code: 'ACME',
      pricing: 'own',
      bookableBy: 'corporate_only',
      roomTypes: [{ roomTypeId: kora.types.exk.id, weekday: '180000' }],
      ...TERMS,
    })
    await t.rpc(kora.gm.cookie, 'rates/setDates', {
      ratePlanId: bar.id,
      batchId: batch(),
      roomTypeIds: [kora.types.dlk.id],
      from: '2026-12-05',
      to: '2026-12-05',
      prices: [{ roomTypeId: kora.types.dlk.id, price: '165000' }],
      minStay: 2,
    })
    const extra = (await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/get', { id: bar.id })).data
    await t.rpc(kora.gm.cookie, 'ratePlans/update', {
      id: extra.id,
      version: extra.version,
      name: extra.name,
      code: extra.code,
      pricing: 'own',
      roomTypes: extra.roomTypes.map((row) => ({
        roomTypeId: row.roomTypeId,
        weekday: row.weekday,
      })),
      extraAdult: '25000',
      ...TERMS,
    })
    desk = await accessOf(kora.orgId, kora.frontDesk.userId, 'Chiamaka Eze')
    attendant = await accessOf(kora.orgId, kora.attendant.userId, 'Blessing Udo')
    outsider = await accessOf(
      (await t.rpc<{ organization: { id: string } }>(kora.outsider.cookie, 'organization/current'))
        .data.organization.id,
      kora.outsider.userId,
      'Other Owner',
    )
  })

  const stay = (overrides: Record<string, unknown> = {}) => ({
    propertyId: kora.vi.id,
    ratePlanId: bb.id,
    roomTypeId: kora.types.dlk.id,
    arrival: '2026-12-04',
    departure: '2026-12-07',
    adults: 2,
    children: 1,
    ...overrides,
  })

  it('prices each night of a derived plan from its parent, with its terms and version', async () => {
    const quote = await quoteStay(t.db, desk, stay())
    expect(quote.nights.map((n) => [n.date, n.price, n.from, n.mealAllocation])).toEqual([
      ['2026-12-04', '168000.00', 'standard', '18000.00'],
      ['2026-12-05', '183000.00', 'date', '18000.00'],
      ['2026-12-06', '168000.00', 'standard', '18000.00'],
    ])
    expect(quote).toMatchObject({
      total: '519000.00',
      currency: 'NGN',
      ratePlanVersion: bb.version,
      terms: {
        mealPlan: 'bed_breakfast',
        mealAllocation: '18000.00',
        cancellation: TERMS.cancellation,
        deposit: TERMS.deposit,
        pricesIncludeTaxes: false,
        bookableBy: 'anyone',
      },
      breaks: [],
    })
  })

  it("charges the parent's extra adult price, unadjusted, and nothing for children", async () => {
    const quote = await quoteStay(
      t.db,
      desk,
      stay({ roomTypeId: kora.types.jrs.id, adults: 3, children: 1, departure: '2026-12-05' }),
    )
    expect(quote.nights[0]).toMatchObject({
      price: '338000.00',
      extraAdult: '25000.00',
      total: '363000.00',
    })
  })

  it("reports the parent's min stay on the arrival date", async () => {
    const quote = await quoteStay(
      t.db,
      desk,
      stay({ arrival: '2026-12-05', departure: '2026-12-06' }),
    )
    expect(quote.breaks).toEqual([
      {
        kind: 'min_stay',
        date: '2026-12-05',
        message: 'Bed & breakfast needs a stay of at least 2 nights from 5 Dec 2026.',
      },
    ])
  })

  it('refuses too many guests, a type the plan doesn’t sell and an archived plan', async () => {
    await expect(quoteStay(t.db, desk, stay({ adults: 3 }))).rejects.toMatchObject({
      data: { code: 'TOO_MANY_GUESTS' },
    })
    const acme = (
      await t.rpc<{ items: RatePlanView[] }>(kora.gm.cookie, 'ratePlans/list', {
        propertyId: kora.vi.id,
      })
    ).data.items.find((plan) => plan.code === 'ACME')
    await expect(quoteStay(t.db, desk, stay({ ratePlanId: acme?.id }))).rejects.toMatchObject({
      data: { code: 'ROOM_TYPE_NOT_ON_PLAN' },
    })
    await expect(quoteStay(t.db, desk, stay({ departure: '2026-12-04' }))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('quotes only from the business date, within 2 years, for up to 365 nights', async () => {
    await expect(
      quoteStay(t.db, desk, stay({ arrival: '2026-11-24', departure: '2026-11-26' })),
    ).rejects.toMatchObject({ data: { code: 'PAST_DATE' } })
    await expect(
      quoteStay(t.db, desk, stay({ arrival: '2028-11-25', departure: '2028-11-27' })),
    ).rejects.toMatchObject({ data: { code: 'TOO_FAR_AHEAD' } })
    await expect(
      quoteStay(t.db, desk, stay({ arrival: '2026-12-01', departure: '2027-12-02' })),
    ).rejects.toMatchObject({ data: { code: 'STAY_TOO_LONG' } })
    const year = await quoteStay(
      t.db,
      desk,
      stay({ arrival: '2026-12-01', departure: '2027-12-01' }),
    )
    expect(year.nights).toHaveLength(365)
  })

  it("changes the quote hash, not the plan's version, when the parent's dates change", async () => {
    const before = await quoteStay(t.db, desk, stay())
    await t.rpc(kora.gm.cookie, 'rates/setDates', {
      ratePlanId: bar.id,
      batchId: batch(),
      roomTypeIds: [kora.types.dlk.id],
      from: '2026-12-06',
      to: '2026-12-06',
      prices: [{ roomTypeId: kora.types.dlk.id, price: '160000' }],
    })
    const after = await quoteStay(t.db, desk, stay())
    expect(after.ratePlanVersion).toBe(before.ratePlanVersion)
    expect(after.quoteHash).not.toBe(before.quoteHash)
    expect(after.total).toBe('529000.00')
    expect((await quoteStay(t.db, desk, stay())).quoteHash).toBe(after.quoteHash)
  })

  it('offers plans open to anyone that sell the room type, in plan order', async () => {
    const plans = await listBookablePlans(t.db, desk, {
      propertyId: kora.vi.id,
      roomTypeId: kora.types.exk.id,
      arrival: '2026-12-09',
      departure: '2026-12-11',
      adults: 2,
      children: 0,
    })
    expect(plans.map((p) => [p.code, p.total, p.mealPlan])).toEqual([
      ['BAR', '420000.00', 'room_only'],
      ['BB', '456000.00', 'bed_breakfast'],
      ['NRF', '378000.00', 'room_only'],
    ])
  })

  it('keeps rates from roles without access and from other groups', async () => {
    await expect(quoteStay(t.db, attendant, stay())).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(quoteStay(t.db, outsider, stay())).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
