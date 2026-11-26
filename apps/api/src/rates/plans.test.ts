// Rate plans on the real test database through the real HTTP flow
// (spec: docs/specs/stage-1-rate-plans.md).
import type {
  AuditEventView,
  HomeSummary,
  RatePlanView,
  RatesOverview,
  RoomTypeView,
} from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { switchFeature } from '../features/switches.ts'
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
  TERMS,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('rate plans', () => {
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

  const get = async (id: string, cookie = kora.gm.cookie) =>
    (await t.rpc<RatePlanView>(cookie, 'ratePlans/get', { id })).data
  const events = async (entityId: string) =>
    (
      await t.rpc<Page<AuditEventView>>(kora.owner.cookie, 'audit/list', {
        entityType: 'rate_plan',
        entityId,
      })
    ).data.items

  it('creates Best available and Bed & breakfast from the first-rate table', async () => {
    expect(await get(bar.id)).toMatchObject({
      name: 'Best available',
      code: 'BAR',
      pricing: 'own',
      mealPlan: 'room_only',
      cancellation: TERMS.cancellation,
      deposit: TERMS.deposit,
      bookableBy: 'anyone',
      pricesIncludeTaxes: false,
      currency: 'NGN',
      followers: [
        { id: bb.id, name: 'Bed & breakfast' },
        { id: nrf.id, name: 'Non-refundable' },
      ],
    })
    expect(bar.roomTypes.map((row) => row.weekday)).toEqual([
      '120000.00',
      '150000.00',
      '210000.00',
      '320000.00',
    ])
    expect(bb).toMatchObject({
      code: 'BB',
      pricing: 'derived',
      parent: { id: bar.id, name: 'Best available' },
      adjustment: { kind: 'amount', value: '18000.00' },
      mealPlan: 'bed_breakfast',
      mealAllocation: '18000.00',
      cancellation: TERMS.cancellation,
    })
    expect(bb.roomTypes.every((row) => row.weekday === null)).toBe(true)
    expect((await events(bar.id))[0]).toMatchObject({
      action: 'rate_plan.created',
      actorName: 'Tunde Bello',
      after: expect.objectContaining({ code: 'BAR', firstRate: true, liveProperty: false }),
    })
  })

  it('refuses the first-rate table once the hotel has plans', async () => {
    const again = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/createFirst', {
      propertyId: kora.vi.id,
      prices: [{ roomTypeId: kora.types.stq.id, weekday: '100000' }],
    })
    expect(again.status).toBe(409)
    expect(again.data.data?.code).toBe('PLANS_EXIST')
  })

  it('creates a derived plan following its parent', async () => {
    expect(nrf).toMatchObject({
      pricing: 'derived',
      adjustment: { kind: 'percent', value: '-10.00' },
      cancellation: { kind: 'non_refundable' },
      deposit: { kind: 'full_stay', due: { kind: 'at_booking' } },
      mealAllocation: null,
      extraAdult: null,
    })
    expect(nrf.roomTypes).toHaveLength(4)
  })

  it('refuses to archive a plan others follow, in the spec’s words', async () => {
    const response = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/archive', { id: bar.id })
    expect(response.status).toBe(409)
    expect(response.data).toMatchObject({
      message:
        'Bed & breakfast and Non-refundable follow Best available. Archive them first, or point them to another plan.',
      data: { code: 'HAS_DERIVED_PLANS', plans: ['Bed & breakfast', 'Non-refundable'] },
    })
  })

  it('refuses a name or code the hotel already uses, in the spec’s words', async () => {
    const name = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/create', {
      ...formOf(nrf),
      id: undefined,
      version: undefined,
      propertyId: kora.vi.id,
      name: 'non-refundable',
      code: 'NR2',
    })
    expect(name.data).toMatchObject({
      message: 'Non-refundable already exists at this hotel.',
      data: { code: 'PLAN_NAME_TAKEN' },
    })
    const code = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/create', {
      ...formOf(nrf),
      id: undefined,
      version: undefined,
      propertyId: kora.vi.id,
      name: 'Pay now',
      code: 'nrf',
    })
    expect(code.data).toMatchObject({
      message: 'Code NRF is used by Non-refundable.',
      data: { code: 'PLAN_CODE_TAKEN' },
    })
  })

  it('keeps derived plans one level deep and within their parent’s room types', async () => {
    const grandchild = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/create', {
      ...formOf(nrf),
      id: undefined,
      version: undefined,
      propertyId: kora.vi.id,
      name: 'Deeper',
      code: 'DEEP',
      parentId: bb.id,
    })
    expect(grandchild.data).toMatchObject({
      message:
        "Bed & breakfast follows another plan, so it can't be a parent. Choose a plan with its own prices.",
      data: { code: 'PARENT_NOT_OWN' },
    })
    const solo = await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/create', {
      propertyId: kora.vi.id,
      name: 'Suites only',
      code: 'STE',
      pricing: 'own',
      roomTypes: [{ roomTypeId: kora.types.jrs.id, weekday: '300000' }],
      ...TERMS,
    })
    const outside = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/create', {
      propertyId: kora.vi.id,
      name: 'Suites B&B',
      code: 'STE-BB',
      pricing: 'derived',
      parentId: solo.data.id,
      adjustment: { kind: 'amount', value: '18000' },
      roomTypes: [{ roomTypeId: kora.types.jrs.id }, { roomTypeId: kora.types.stq.id }],
      ...TERMS,
    })
    expect(outside.data).toMatchObject({
      message: "Suites only doesn't sell Standard Queen. Add it to Suites only first.",
      data: { code: 'ROOM_TYPE_NOT_ON_PARENT' },
    })
  })

  it('refuses a derived plan that would cost ₦0 or less, and records nothing', async () => {
    const response = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/create', {
      propertyId: kora.vi.id,
      name: 'Giveaway',
      code: 'GIVE',
      pricing: 'derived',
      parentId: bar.id,
      adjustment: { kind: 'amount', value: '-130000' },
      roomTypes: [{ roomTypeId: kora.types.stq.id }, { roomTypeId: kora.types.dlk.id }],
      ...TERMS,
    })
    expect(response.data).toMatchObject({
      message:
        'Giveaway would be ₦0 or less for Standard Queen on 25 Nov 2026. Use a smaller offset.',
      data: { code: 'DERIVED_NOT_POSITIVE', date: '2026-11-25' },
    })
    const list = await t.rpc<Page<RatePlanView>>(kora.gm.cookie, 'ratePlans/list', {
      propertyId: kora.vi.id,
    })
    expect(list.data.items.map((plan) => plan.code)).not.toContain('GIVE')
  })

  it('refuses a meal allocation above the price it is part of', async () => {
    const response = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/create', {
      propertyId: kora.vi.id,
      name: 'Half board',
      code: 'HB',
      pricing: 'own',
      mealPlan: 'half_board',
      mealAllocation: '125000',
      roomTypes: [
        { roomTypeId: kora.types.stq.id, weekday: '120000' },
        { roomTypeId: kora.types.dlk.id, weekday: '150000' },
      ],
      ...TERMS,
    })
    expect(response.data).toMatchObject({
      message:
        "Half board's meal allocation (₦125,000) would be more than its price for Standard Queen on 25 Nov 2026. Lower the allocation or raise the price.",
      data: { code: 'MEAL_ALLOCATION_ABOVE_PRICE' },
    })
  })

  it('saves standard prices with before and after, and refuses a stale save', async () => {
    const current = await get(bar.id)
    const form = formOf(current)
    form.roomTypes[1] = {
      ...form.roomTypes[1],
      roomTypeId: kora.types.dlk.id,
      weekday: '155000',
      weekend: '170000',
    }
    const saved = await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/update', form)
    expect(saved.status).toBe(200)
    expect(saved.data.version).toBe(current.version + 1)
    expect(saved.data.roomTypes[1]).toMatchObject({ weekday: '155000.00', weekend: '170000.00' })
    const [event] = await events(bar.id)
    expect(event).toMatchObject({
      action: 'rate_plan.prices_changed',
      before: {
        prices: [expect.objectContaining({ roomTypeName: 'Deluxe King', weekday: '150000.00' })],
      },
      after: expect.objectContaining({
        prices: [expect.objectContaining({ weekday: '155000.00', weekend: '170000.00' })],
        liveProperty: false,
      }),
    })
    const stale = await t.rpc<Problem>(kora.sade.cookie, 'ratePlans/update', form)
    expect(stale.status).toBe(409)
    expect(stale.data.message).toMatch(
      /^Tunde changed Best available at \d\d:\d\d\. Reload to see the change, then save again\.$/,
    )
    expect(stale.data.data?.code).toBe('STALE_VERSION')
    // Put Deluxe King back for the other tests.
    const back = formOf(saved.data)
    back.roomTypes[1] = { roomTypeId: kora.types.dlk.id, weekday: '150000', weekend: null }
    expect((await t.rpc(kora.gm.cookie, 'ratePlans/update', back)).status).toBe(200)
  })

  it('removes a room type from the plans that follow when it leaves the parent', async () => {
    const parent = (
      await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/create', {
        propertyId: kora.vi.id,
        name: 'Weekend escape',
        code: 'WKND',
        pricing: 'own',
        roomTypes: [
          { roomTypeId: kora.types.dlk.id, weekday: '140000' },
          { roomTypeId: kora.types.exk.id, weekday: '190000' },
        ],
        ...TERMS,
      })
    ).data
    const child = (
      await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/create', {
        propertyId: kora.vi.id,
        name: 'Weekend escape B&B',
        code: 'WKND-BB',
        pricing: 'derived',
        parentId: parent.id,
        adjustment: { kind: 'amount', value: '18000' },
        mealPlan: 'bed_breakfast',
        roomTypes: [{ roomTypeId: kora.types.dlk.id }, { roomTypeId: kora.types.exk.id }],
        ...TERMS,
      })
    ).data
    const form = formOf(parent)
    form.roomTypes = form.roomTypes.filter((row) => row.roomTypeId !== kora.types.dlk.id)
    expect((await t.rpc(kora.gm.cookie, 'ratePlans/update', form)).status).toBe(200)
    expect((await get(child.id)).roomTypes.map((row) => row.roomTypeId)).toEqual([
      kora.types.exk.id,
    ])
    expect((await events(child.id))[0]).toMatchObject({
      action: 'rate_plan.changed',
      before: { roomTypesRemoved: [{ roomTypeName: 'Deluxe King' }] },
      after: expect.objectContaining({ followsRemovalFrom: 'Weekend escape' }),
    })
  })

  it('switches to derived only when nothing follows, dropping date prices from the business date', async () => {
    const refused = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/update', {
      ...formOf(await get(bar.id)),
      pricing: 'derived',
      parentId: nrf.id,
      adjustment: { kind: 'percent', value: '5' },
      roomTypes: bar.roomTypes.map((row) => ({ roomTypeId: row.roomTypeId })),
    })
    expect(refused.data).toMatchObject({
      message:
        'Bed & breakfast and Non-refundable follow Best available. Point them to another plan first.',
      data: { code: 'HAS_DERIVED_PLANS' },
    })
    const copy = (
      await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/create', {
        ...formOf(await get(bar.id)),
        id: undefined,
        version: undefined,
        propertyId: kora.vi.id,
        name: 'Best available copy',
        code: 'BAR2',
      })
    ).data
    await t.rpc(kora.gm.cookie, 'rates/setDates', {
      ratePlanId: copy.id,
      batchId: batch(),
      roomTypeIds: [kora.types.stq.id],
      from: '2026-12-01',
      to: '2026-12-12',
      prices: [{ roomTypeId: kora.types.stq.id, price: '99000' }],
    })
    expect((await get(copy.id)).datedFromBusinessDate).toBe(12)
    const switched = await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/update', {
      ...formOf(await get(copy.id)),
      pricing: 'derived',
      parentId: bar.id,
      adjustment: { kind: 'percent', value: '5' },
      roomTypes: copy.roomTypes.map((row) => ({ roomTypeId: row.roomTypeId })),
    })
    expect(switched.data).toMatchObject({ pricing: 'derived', datedFromBusinessDate: 0 })
    expect((await events(copy.id))[0]?.after).toMatchObject({ datePricesRemoved: 12 })
  })

  it('archives, restores and deletes for good from Archived', async () => {
    const plan = await nonRefundable(t, kora, bar.id, { name: 'Pay now', code: 'PAY' })
    const live = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/delete', { id: plan.id })
    expect(live.data.data?.code).toBe('NOT_ARCHIVED')
    const archived = await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/archive', {
      id: plan.id,
    })
    expect(archived.data).toMatchObject({ canDelete: true })
    expect(archived.data.archivedAt).not.toBeNull()
    const archivedList = await t.rpc<Page<RatePlanView>>(kora.gm.cookie, 'ratePlans/list', {
      propertyId: kora.vi.id,
      archived: true,
    })
    expect(archivedList.data.items.map((p) => p.code)).toContain('PAY')
    const restored = await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/restore', {
      id: plan.id,
    })
    expect(restored.data.archivedAt).toBeNull()
    await t.rpc(kora.gm.cookie, 'ratePlans/archive', { id: plan.id })
    expect((await t.rpc(kora.gm.cookie, 'ratePlans/delete', { id: plan.id })).status).toBe(200)
    expect((await t.rpc(kora.gm.cookie, 'ratePlans/get', { id: plan.id })).status).toBe(404)
    expect((await events(plan.id)).map((e) => e.action)).toEqual([
      'rate_plan.deleted',
      'rate_plan.archived',
      'rate_plan.restored',
      'rate_plan.archived',
      'rate_plan.created',
    ])
    const code = await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/create', {
      ...formOf(plan),
      id: undefined,
      version: undefined,
      propertyId: kora.vi.id,
    })
    expect(code.status).toBe(200)
  })

  it('tells an archived plan’s code apart', async () => {
    const plan = await nonRefundable(t, kora, bar.id, { name: 'Old promo', code: 'OLD' })
    await t.rpc(kora.gm.cookie, 'ratePlans/archive', { id: plan.id })
    const clash = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/create', {
      ...formOf(plan),
      id: undefined,
      version: undefined,
      propertyId: kora.vi.id,
      name: 'New promo',
    })
    expect(clash.data.message).toBe(
      'Code OLD belongs to an archived plan. Restore it, or pick another code.',
    )
  })

  it('reorders only with every active plan named', async () => {
    const list = await t.rpc<Page<RatePlanView>>(kora.gm.cookie, 'ratePlans/list', {
      propertyId: kora.vi.id,
    })
    const ids = list.data.items.map((plan) => plan.id)
    const partial = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/reorder', {
      propertyId: kora.vi.id,
      ids: ids.slice(1),
    })
    expect(partial.data.data?.code).toBe('LIST_CHANGED')
    const reversed = [...ids].reverse()
    expect(
      (await t.rpc(kora.gm.cookie, 'ratePlans/reorder', { propertyId: kora.vi.id, ids: reversed }))
        .status,
    ).toBe(200)
    const after = await t.rpc<Page<RatePlanView>>(kora.gm.cookie, 'ratePlans/list', {
      propertyId: kora.vi.id,
    })
    expect(after.data.items.map((plan) => plan.id)).toEqual(reversed)
    await t.rpc(kora.gm.cookie, 'ratePlans/reorder', { propertyId: kora.vi.id, ids })
  })

  it('lets the front desk read plans but not change them', async () => {
    expect((await get(bar.id, kora.frontDesk.cookie)).code).toBe('BAR')
    const denied = await t.rpc<Problem>(kora.frontDesk.cookie, 'ratePlans/update', {
      ...formOf(await get(bar.id)),
      minStay: 2,
    })
    expect(denied.status).toBe(403)
    expect(denied.data.message).toBe(
      'Only a revenue manager, GM or the owner can change rates. Ask your GM.',
    )
    const overview = await t.rpc<RatesOverview>(kora.frontDesk.cookie, 'ratePlans/overview', {
      propertyId: kora.vi.id,
    })
    expect(overview.data.canEdit).toBe(false)
  })

  it('lets the revenue manager change plans, and keeps out roles without rates', async () => {
    const created = await nonRefundable(t, kora, bar.id, { name: 'Early bird', code: 'EARLY' })
    const sade = await t.rpc<RatePlanView>(kora.sade.cookie, 'ratePlans/update', {
      ...formOf(created),
      minStay: 3,
    })
    expect(sade.data.minStay).toBe(3)
    const attendant = await t.rpc<Problem>(kora.attendant.cookie, 'ratePlans/list', {
      propertyId: kora.vi.id,
    })
    expect(attendant.status).toBe(403)
  })

  it('answers FEATURE_OFF when front desk is switched off', async () => {
    await switchFeature(t.db, kora.orgId, { feature: 'front_desk', to: 'off', reason: 'Test' })
    const off = await t.rpc<Problem>(kora.owner.cookie, 'ratePlans/list', {
      propertyId: kora.vi.id,
    })
    await switchFeature(t.db, kora.orgId, { feature: 'front_desk', to: 'on', reason: 'Test' })
    expect(off.data.data?.code).toBe('FEATURE_OFF')
  })

  it('keeps another group’s plans and hotels out of reach', async () => {
    expect((await t.rpc(kora.outsider.cookie, 'ratePlans/get', { id: bar.id })).status).toBe(404)
    const list = await t.rpc<Problem>(kora.outsider.cookie, 'ratePlans/list', {
      propertyId: kora.vi.id,
    })
    expect(list.data.data?.code).toBe('PROPERTY_NOT_FOUND')
    const write = await t.rpc<Problem>(kora.outsider.cookie, 'ratePlans/archive', { id: bar.id })
    expect(write.status).toBe(404)
  })

  it('keeps a GM to their own hotel’s plans', async () => {
    const abujaPlan = await t.rpc<RatePlanView>(kora.owner.cookie, 'ratePlans/create', {
      propertyId: kora.abuja.id,
      name: 'Best available',
      code: 'BAR',
      pricing: 'own',
      roomTypes: [{ roomTypeId: kora.abujaType.id, weekday: '110000' }],
      ...TERMS,
    })
    expect(abujaPlan.status).toBe(200)
    expect((await t.rpc(kora.gm.cookie, 'ratePlans/get', { id: abujaPlan.data.id })).status).toBe(
      404,
    )
    const list = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/list', {
      propertyId: kora.abuja.id,
    })
    expect(list.data.data?.code).toBe('PROPERTY_NOT_FOUND')
    const create = await t.rpc<Problem>(kora.gm.cookie, 'ratePlans/create', {
      ...formOf(abujaPlan.data),
      id: undefined,
      version: undefined,
      propertyId: kora.abuja.id,
      code: 'GM',
    })
    expect(create.data.data?.code).toBe('PROPERTY_NOT_FOUND')
    // A room type from another hotel is not found either.
    const crossType = await t.rpc<Problem>(kora.owner.cookie, 'ratePlans/create', {
      ...formOf(abujaPlan.data),
      id: undefined,
      version: undefined,
      propertyId: kora.vi.id,
      code: 'CROSS',
      name: 'Cross',
    })
    expect(crossType.status).toBe(404)
  })

  it('shows unpriced room types, the base plan, the Rooms base rate and Home’s step', async () => {
    const suite = await t.rpc<RoomTypeView>(kora.owner.cookie, 'roomTypes/create', {
      propertyId: kora.vi.id,
      name: 'Executive Suite',
      code: 'EXS',
      bed: 'king',
    })
    const overview = await t.rpc<RatesOverview>(kora.gm.cookie, 'ratePlans/overview', {
      propertyId: kora.vi.id,
    })
    expect(overview.data).toMatchObject({
      property: { businessDate: '2026-11-25', lastRateDate: '2028-11-25', live: false },
      unpricedRoomTypes: [{ id: suite.data.id, name: 'Executive Suite' }],
      basePlan: { id: bar.id, name: 'Best available' },
      canEdit: true,
    })
    const types = await t.rpc<Page<RoomTypeView>>(kora.owner.cookie, 'roomTypes/list', {
      propertyId: kora.vi.id,
    })
    const rateOf = (code: string) => types.data.items.find((type) => type.code === code)?.baseRate
    expect(rateOf('DLK')).toEqual({
      ratePlanId: bar.id,
      ratePlanName: 'Best available',
      amount: '150000.00',
    })
    expect(rateOf('EXS')).toMatchObject({ ratePlanId: bar.id, amount: null })
    const home = async () =>
      (await t.rpc<HomeSummary>(kora.owner.cookie, 'organization/home')).data.byHotel.find(
        (hotel) => hotel.propertyId === kora.vi.id,
      )?.ratesSet
    expect(await home()).toBe(false)
    await t.rpc(kora.owner.cookie, 'roomTypes/archive', { id: suite.data.id })
    expect(await home()).toBe(true)
  })

  it('puts a restored room type back on its plans and on plans derived from them', async () => {
    const villa = (
      await t.rpc<RoomTypeView>(kora.owner.cookie, 'roomTypes/create', {
        propertyId: kora.vi.id,
        name: 'Garden Villa',
        code: 'GVL',
        bed: 'king',
      })
    ).data
    const parent = (
      await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/create', {
        propertyId: kora.vi.id,
        name: 'Villas',
        code: 'VILLA',
        pricing: 'own',
        roomTypes: [
          { roomTypeId: kora.types.jrs.id, weekday: '300000' },
          { roomTypeId: villa.id, weekday: '400000' },
        ],
        ...TERMS,
      })
    ).data
    await t.rpc(kora.owner.cookie, 'roomTypes/archive', { id: villa.id })
    const child = (
      await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/create', {
        propertyId: kora.vi.id,
        name: 'Villas B&B',
        code: 'VILLA-BB',
        pricing: 'derived',
        parentId: parent.id,
        adjustment: { kind: 'amount', value: '18000' },
        mealPlan: 'bed_breakfast',
        roomTypes: [{ roomTypeId: kora.types.jrs.id }],
        ...TERMS,
      })
    ).data
    expect(child.roomTypes.map((row) => row.roomTypeId)).toEqual([kora.types.jrs.id])
    expect((await t.rpc(kora.owner.cookie, 'roomTypes/restore', { id: villa.id })).status).toBe(200)
    expect((await get(parent.id)).roomTypes.find((row) => row.roomTypeId === villa.id)).toEqual({
      roomTypeId: villa.id,
      weekday: '400000.00',
      weekend: null,
    })
    expect((await get(child.id)).roomTypes.map((row) => row.roomTypeId)).toContain(villa.id)
    expect((await events(child.id))[0]).toMatchObject({
      action: 'rate_plan.changed',
      after: expect.objectContaining({ followsRestoreOf: 'Garden Villa' }),
    })
    await t.rpc(kora.owner.cookie, 'roomTypes/archive', { id: villa.id })
  })

  it('shows the last three events on a plan for its Change history card', async () => {
    const history = await t.rpc<{ items: { action: string }[] }>(
      kora.gm.cookie,
      'ratePlans/history',
      { id: bar.id },
    )
    expect(history.data.items).toHaveLength(3)
    const frontDesk = await t.rpc(kora.frontDesk.cookie, 'ratePlans/history', { id: bar.id })
    expect(frontDesk.status).toBe(403)
  })
})
