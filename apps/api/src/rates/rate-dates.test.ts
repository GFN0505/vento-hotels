// The rate calendar, Change dates, Undo, and the "Rate lowered for tonight" exception
// (spec: docs/specs/stage-1-rate-plans.md).
import type { AuditEventView, RateCalendar, RatePlanView } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditEvents } from '../db/schema/governance.ts'
import { setLive } from '../rooms/testing.ts'
import { createTestApp } from '../test/harness.ts'
import {
  batch,
  firstRate,
  formOf,
  type Kora,
  koraWithRates,
  nonRefundable,
  type Page,
  type Problem,
  setBusinessDate,
  TERMS,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL

type Result = {
  batchId: string
  dates: number
  roomTypes: number
  changed: number
  followers: string[]
}

describe.skipIf(!url)('rate calendar and date changes', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let kora: Kora
  let bar: RatePlanView
  let bb: RatePlanView
  let nrf: RatePlanView

  beforeAll(async () => {
    kora = await koraWithRates(t)
    ;({ bar, bb } = await firstRate(t, kora))
    nrf = await nonRefundable(t, kora, bar.id)
  })

  const setDates = (input: Record<string, unknown>, cookie = kora.gm.cookie) =>
    t.rpc<Result & Problem>(cookie, 'rates/setDates', {
      ratePlanId: bar.id,
      batchId: batch(),
      ...input,
    })
  const calendar = async (from: string, nights = 14, cookie = kora.gm.cookie) =>
    (
      await t.rpc<RateCalendar>(cookie, 'rates/calendar', {
        propertyId: kora.vi.id,
        from,
        nights,
        includeCorporate: true,
      })
    ).data
  const cellOf = (cal: RateCalendar, typeCode: string, planCode: string, date: string) =>
    cal.roomTypes
      .find((type) => type.code === typeCode)
      ?.rows.find((row) => row.code === planCode)
      ?.cells.find((cell) => cell.date === date)
  const lastEvent = async (entityId: string) =>
    (
      await t.rpc<Page<AuditEventView>>(kora.owner.cookie, 'audit/list', {
        entityType: 'rate_plan',
        entityId,
      })
    ).data.items[0]
  const allTypes = () => Object.values(kora.types).map((type) => type.id)

  it('opens at the business date with derived plans computed from their parent', async () => {
    const cal = await t.rpc<RateCalendar>(kora.frontDesk.cookie, 'rates/calendar', {
      propertyId: kora.vi.id,
    })
    expect(cal.data).toMatchObject({
      propertyName: 'Kora Victoria Island',
      businessDate: '2026-11-25',
      canEdit: false,
      live: false,
    })
    expect(cal.data.dates).toHaveLength(14)
    expect(cal.data.dates.slice(0, 4).map((d) => [d.date, d.weekend])).toEqual([
      ['2026-11-25', false],
      ['2026-11-26', false],
      ['2026-11-27', true],
      ['2026-11-28', true],
    ])
    const dlk = cal.data.roomTypes.find((type) => type.code === 'DLK')
    expect(dlk?.rows.map((row) => [row.code, row.cells[0]?.price])).toEqual([
      ['BAR', '150000.00'],
      ['BB', '168000.00'],
      ['NRF', '135000.00'],
    ])
    expect(dlk?.rows[1]?.parent).toEqual({ id: bar.id, name: 'Best available' })
  })

  it('enters the Festive season in one apply, and every derived plan follows', async () => {
    const response = await setDates({
      roomTypeIds: allTypes(),
      from: '2026-12-18',
      to: '2027-01-02',
      seasonName: 'Festive season',
      prices: [
        { roomTypeId: kora.types.stq.id, price: '140000' },
        { roomTypeId: kora.types.dlk.id, price: '175000' },
        { roomTypeId: kora.types.exk.id, price: '240000' },
        { roomTypeId: kora.types.jrs.id, price: '360000' },
      ],
      minStay: 2,
    })
    expect(response.data).toMatchObject({
      dates: 16,
      roomTypes: 4,
      changed: 64,
      followers: ['Bed & breakfast', 'Non-refundable'],
    })
    const cal = await calendar('2026-12-17', 18)
    expect(cal.seasons).toEqual([{ name: 'Festive season', from: '2026-12-18', to: '2027-01-02' }])
    expect(cellOf(cal, 'DLK', 'BAR', '2026-12-24')).toMatchObject({
      price: '175000.00',
      from: 'date',
      minStay: 2,
      datePrice: '175000.00',
      seasonName: 'Festive season',
    })
    expect(cellOf(cal, 'DLK', 'BB', '2026-12-24')).toMatchObject({ price: '193000.00', minStay: 2 })
    expect(cellOf(cal, 'JRS', 'NRF', '2027-01-02')?.price).toBe('324000.00')
    expect(cellOf(cal, 'DLK', 'BAR', '2026-12-17')).toMatchObject({
      price: '150000.00',
      minStay: 1,
    })
    const event = await lastEvent(bar.id)
    expect(event).toMatchObject({
      action: 'rates.dates_changed',
      after: expect.objectContaining({
        seasonName: 'Festive season',
        from: '2026-12-18',
        to: '2027-01-02',
        liveProperty: false,
      }),
    })
    expect((event?.after as { cells?: unknown[] } | undefined)?.cells).toHaveLength(64)
  })

  it('sets one cell inline, and a replayed batch changes nothing more', async () => {
    const batchId = batch()
    const input = {
      batchId,
      roomTypeIds: [kora.types.dlk.id],
      from: '2026-12-05',
      to: '2026-12-05',
      prices: [{ roomTypeId: kora.types.dlk.id, price: '165000' }],
    }
    const first = await setDates(input)
    const again = await setDates(input)
    expect(again.data).toEqual(first.data)
    const cal = await calendar('2026-12-05', 1)
    expect(cellOf(cal, 'DLK', 'BAR', '2026-12-05')?.price).toBe('165000.00')
    expect(cellOf(cal, 'DLK', 'BB', '2026-12-05')?.price).toBe('183000.00')
    const events = await t.rpc<Page<AuditEventView>>(kora.owner.cookie, 'audit/list', {
      entityType: 'rate_plan',
      entityId: bar.id,
    })
    const applies = events.data.items.filter(
      (e) => (e.after as { batchId?: string } | null)?.batchId === batchId,
    )
    expect(applies).toHaveLength(1)
  })

  it('sets closed to arrival and closed, and derived plans follow the closures', async () => {
    await setDates({
      roomTypeIds: [kora.types.exk.id],
      from: '2026-12-02',
      to: '2026-12-02',
      closedToArrival: true,
    })
    await setDates({
      roomTypeIds: [kora.types.stq.id],
      from: '2026-12-03',
      to: '2026-12-03',
      closed: true,
    })
    const cal = await calendar('2026-12-02', 2)
    expect(cellOf(cal, 'EXK', 'BAR', '2026-12-02')).toMatchObject({
      closedToArrival: true,
      price: '210000.00',
    })
    expect(cellOf(cal, 'EXK', 'NRF', '2026-12-02')?.closedToArrival).toBe(true)
    expect(cellOf(cal, 'STQ', 'BB', '2026-12-03')?.closed).toBe(true)
  })

  it('puts dates back to the standard price, season name included', async () => {
    await setDates({
      roomTypeIds: [kora.types.stq.id],
      from: '2027-01-01',
      to: '2027-01-02',
      backToStandard: true,
    })
    const cal = await calendar('2027-01-01', 2)
    expect(cellOf(cal, 'STQ', 'BAR', '2027-01-01')).toMatchObject({
      price: '120000.00',
      from: 'standard',
      datePrice: null,
      seasonName: null,
      minStay: 2,
    })
  })

  it('refuses past dates, dates over 2 years ahead and days that leave no dates', async () => {
    const past = await setDates({
      roomTypeIds: allTypes(),
      from: '2026-11-24',
      to: '2026-11-30',
      minStay: 2,
    })
    expect(past.data.message).toBe(
      "24 Nov 2026 is before the business date. Past rates can't change.",
    )
    const far = await setDates({
      roomTypeIds: allTypes(),
      from: '2028-11-20',
      to: '2028-11-26',
      minStay: 2,
    })
    expect(far.data).toMatchObject({
      message: 'Rates can be set up to 25 Nov 2028.',
      data: { code: 'TOO_FAR_AHEAD' },
    })
    const none = await setDates({
      roomTypeIds: allTypes(),
      from: '2026-12-07',
      to: '2026-12-10',
      days: [5],
      minStay: 2,
    })
    expect(none.data).toMatchObject({
      message: 'No Fridays between 7 and 10 Dec.',
      data: { code: 'NO_DATES' },
    })
  })

  it('sends date changes for a derived plan to its parent', async () => {
    const response = await setDates({
      ratePlanId: bb.id,
      roomTypeIds: allTypes(),
      from: '2026-12-10',
      to: '2026-12-10',
      closed: true,
    })
    expect(response.data).toMatchObject({
      message: "Bed & breakfast follows Best available. Change Best available's dates instead.",
      data: { code: 'PLAN_DERIVED' },
    })
  })

  it('refuses a date price that would take a derived plan to ₦0 or less', async () => {
    await t.rpc(kora.gm.cookie, 'ratePlans/create', {
      propertyId: kora.vi.id,
      name: 'Staff rate',
      code: 'STAFF',
      pricing: 'derived',
      parentId: bar.id,
      adjustment: { kind: 'amount', value: '-100000' },
      roomTypes: [{ roomTypeId: kora.types.stq.id }],
      ...TERMS,
    })
    const response = await setDates({
      roomTypeIds: [kora.types.stq.id],
      from: '2027-01-12',
      to: '2027-01-12',
      prices: [{ roomTypeId: kora.types.stq.id, price: '90000' }],
    })
    expect(response.data.message).toBe(
      'Staff rate would be ₦0 or less for Standard Queen on 12 Jan 2027. Use a smaller offset.',
    )
    const cal = await calendar('2027-01-12', 1)
    expect(cellOf(cal, 'STQ', 'BAR', '2027-01-12')?.price).toBe('120000.00')
  })

  it("refuses a date price below a meal plan's allocation", async () => {
    const plan = (
      await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/create', {
        propertyId: kora.vi.id,
        name: 'Acme Energy B&B',
        code: 'ACME-BB',
        pricing: 'own',
        bookableBy: 'corporate_only',
        mealPlan: 'bed_breakfast',
        mealAllocation: '18000',
        roomTypes: [{ roomTypeId: kora.types.dlk.id, weekday: '130000' }],
        ...TERMS,
      })
    ).data
    const response = await setDates({
      ratePlanId: plan.id,
      roomTypeIds: [kora.types.dlk.id],
      from: '2027-01-12',
      to: '2027-01-12',
      prices: [{ roomTypeId: kora.types.dlk.id, price: '15000' }],
    })
    expect(response.data).toMatchObject({
      message:
        "Acme Energy B&B's meal allocation (₦18,000) would be more than its price for Deluxe King on 12 Jan 2027. Lower the allocation or raise the price.",
      data: { code: 'MEAL_ALLOCATION_ABOVE_PRICE', date: '2027-01-12' },
    })
  })

  it('stops undo once night audit has moved the business date on', async () => {
    const applied = await setDates({
      roomTypeIds: [kora.types.jrs.id],
      from: '2027-03-01',
      to: '2027-03-01',
      closed: true,
    })
    await setBusinessDate(t, kora.vi.id, '2026-11-26')
    const undo = await t.rpc<Problem>(kora.gm.cookie, 'rates/undoDates', {
      ratePlanId: bar.id,
      batchId: applied.data.batchId,
    })
    await setBusinessDate(t, kora.vi.id, '2026-11-25')
    expect(undo.data).toMatchObject({
      message:
        "This change can't be undone any more: night audit has run since. Change the dates again instead.",
      data: { code: 'UNDO_EXPIRED' },
    })
  })

  it('undoes an apply, leaving dates someone changed since', async () => {
    const applied = await setDates({
      roomTypeIds: [kora.types.exk.id],
      from: '2027-02-01',
      to: '2027-02-05',
      prices: [{ roomTypeId: kora.types.exk.id, price: '230000' }],
    })
    await setDates(
      {
        roomTypeIds: [kora.types.exk.id],
        from: '2027-02-02',
        to: '2027-02-03',
        prices: [{ roomTypeId: kora.types.exk.id, price: '250000' }],
      },
      kora.sade.cookie,
    )
    const undo = await t.rpc<{ restored: number; skippedDates: number; message: string | null }>(
      kora.gm.cookie,
      'rates/undoDates',
      { ratePlanId: bar.id, batchId: applied.data.batchId },
    )
    expect(undo.data).toEqual({
      restored: 3,
      skippedDates: 2,
      message: '2 dates were changed by Sade since, so they were left as they are.',
    })
    const cal = await calendar('2027-02-01', 5)
    expect(
      ['2027-02-01', '2027-02-02', '2027-02-05'].map((d) => cellOf(cal, 'EXK', 'BAR', d)?.price),
    ).toEqual(['210000.00', '250000.00', '210000.00'])
    expect(await lastEvent(bar.id)).toMatchObject({
      action: 'rates.dates_changed',
      actorName: 'Tunde Bello',
      after: expect.objectContaining({ undoOf: applied.data.batchId }),
    })
    const twice = await t.rpc<Problem>(kora.gm.cookie, 'rates/undoDates', {
      ratePlanId: bar.id,
      batchId: applied.data.batchId,
    })
    expect(twice.data.data?.code).toBe('ALREADY_UNDONE')
  })

  it('keeps another group and a hotel outside the member’s access out of the calendar', async () => {
    const outsider = await t.rpc<Problem>(kora.outsider.cookie, 'rates/calendar', {
      propertyId: kora.vi.id,
    })
    expect(outsider.data.data?.code).toBe('PROPERTY_NOT_FOUND')
    const gm = await t.rpc<Problem>(kora.gm.cookie, 'rates/calendar', { propertyId: kora.abuja.id })
    expect(gm.data.data?.code).toBe('PROPERTY_NOT_FOUND')
    const write = await setDates(
      { roomTypeIds: allTypes(), from: '2026-12-01', to: '2026-12-01', closed: true },
      kora.outsider.cookie,
    )
    expect(write.status).toBe(404)
    const frontDesk = await setDates(
      { roomTypeIds: allTypes(), from: '2026-12-01', to: '2026-12-01', closed: true },
      kora.frontDesk.cookie,
    )
    expect(frontDesk.status).toBe(403)
  })

  describe('after go-live', () => {
    beforeAll(async () => {
      await setLive(t, kora.vi.id, '2026-11-16')
    })
    afterAll(async () => {
      await setLive(t, kora.vi.id, null)
      await setBusinessDate(t, kora.vi.id, '2026-11-25')
    })

    const tonight = (price: string, reason?: string) =>
      setDates({
        roomTypeIds: [kora.types.dlk.id],
        from: '2026-11-25',
        to: '2026-11-25',
        prices: [{ roomTypeId: kora.types.dlk.id, price }],
        ...(reason ? { reason } : {}),
      })

    it("asks for a reason to lower tonight's price, naming every plan it lowers", async () => {
      const response = await tonight('120000')
      expect(response.data).toMatchObject({ data: { code: 'REASON_REQUIRED' } })
      const lowered = (
        response.data.data as { lowered: { planName: string; before: string; after: string }[] }
      ).lowered
      expect(lowered.map((l) => [l.planName, l.before, l.after])).toEqual([
        ['Best available', '150000.00', '120000.00'],
        ['Bed & breakfast', '168000.00', '138000.00'],
        ['Non-refundable', '135000.00', '108000.00'],
      ])
      const cal = await calendar('2026-11-25', 1)
      expect(cellOf(cal, 'DLK', 'BAR', '2026-11-25')?.price).toBe('150000.00')
    })

    it('records the exception with the reason for the owner’s daily report', async () => {
      const response = await tonight('120000', 'Slow night, match Eko Hotel')
      expect(response.status).toBe(200)
      const event = await lastEvent(bar.id)
      const [stored] = await t.db
        .select({ businessDate: auditEvents.businessDate })
        .from(auditEvents)
        .where(eq(auditEvents.id, event?.id ?? ''))
      expect(stored?.businessDate).toBe('2026-11-25')
      expect(event).toMatchObject({
        action: 'rates.dates_changed',
        reason: 'Slow night, match Eko Hotel',
        after: expect.objectContaining({
          liveProperty: true,
          exception: 'rate_lowered_tonight',
          lowered: expect.arrayContaining([
            expect.objectContaining({
              roomTypeName: 'Deluxe King',
              before: '150000.00',
              after: '120000.00',
            }),
          ]),
        }),
      })
    })

    it('raises nothing for raising tonight or lowering a future date', async () => {
      expect((await tonight('150000')).status).toBe(200)
      expect((await lastEvent(bar.id))?.after).not.toHaveProperty('exception')
      const future = await setDates({
        roomTypeIds: [kora.types.dlk.id],
        from: '2026-11-26',
        to: '2026-11-26',
        prices: [{ roomTypeId: kora.types.dlk.id, price: '100000' }],
      })
      expect(future.status).toBe(200)
      expect((await lastEvent(bar.id))?.after).toMatchObject({ liveProperty: true })
      expect((await lastEvent(bar.id))?.after).not.toHaveProperty('exception')
    })

    it("needs a reason when a derived plan's offset lowers tonight", async () => {
      const current = (await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/get', { id: nrf.id }))
        .data
      const form = { ...formOf(current), adjustment: { kind: 'percent', value: '-15' } }
      const refused = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/update', form)
      expect(refused.data.data?.code).toBe('REASON_REQUIRED')
      const saved = await t.rpc(kora.gm.cookie, 'ratePlans/update', {
        ...form,
        reason: 'Push prepaid',
      })
      expect(saved.status).toBe(200)
      expect(await lastEvent(nrf.id)).toMatchObject({
        action: 'rate_plan.changed',
        reason: 'Push prepaid',
        before: { adjustment: { kind: 'percent', value: '-10.00' } },
        after: expect.objectContaining({ exception: 'rate_lowered_tonight', liveProperty: true }),
      })
    })

    it('treats tonight as the business date, even after midnight', async () => {
      await setBusinessDate(t, kora.vi.id, '2026-11-24')
      const response = await setDates({
        roomTypeIds: [kora.types.stq.id],
        from: '2026-11-25',
        to: '2026-11-25',
        prices: [{ roomTypeId: kora.types.stq.id, price: '110000' }],
      })
      expect(response.status).toBe(200)
      await setBusinessDate(t, kora.vi.id, '2026-11-25')
    })
  })
})
