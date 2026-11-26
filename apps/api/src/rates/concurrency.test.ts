// Races between people editing rates at the same time, on separate connections. Prices don't move
// inventory (no availability lock), but plans must never end up inconsistent: no active plan
// following an archived parent, no second set of first plans.
import type { Property, RatePlanView, RoomTypeView } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createType } from '../rooms/testing.ts'
import { ABUJA_ADDRESS } from '../test/addresses.ts'
import { createTestApp } from '../test/harness.ts'
import { type Kora, koraWithRates, setBusinessDate, TERMS } from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('rates under concurrent edits', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let kora: Kora
  let hotel: Property
  let type: RoomTypeView

  beforeAll(async () => {
    kora = await koraWithRates(t)
    hotel = (
      await t.rpc<Property>(kora.owner.cookie, 'properties/create', {
        entityId: kora.vi.entityId,
        name: 'Kora Lekki',
        ...ABUJA_ADDRESS,
      })
    ).data
    await setBusinessDate(t, hotel.id, '2026-11-25')
    type = await createType(t, kora.owner.cookie, hotel.id, { name: 'Deluxe King', code: 'DLK' })
  })

  it('creates the first plans once when two people press Create at the same moment', async () => {
    const press = () =>
      t.rpc<{ plans: RatePlanView[]; data?: { code?: string } }>(
        kora.owner.cookie,
        'ratePlans/createFirst',
        { propertyId: hotel.id, prices: [{ roomTypeId: type.id, weekday: '150000' }] },
      )
    const results = await Promise.all([press(), press(), press()])
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    expect(results.filter((r) => r.data.data?.code === 'PLANS_EXIST')).toHaveLength(2)
    const list = await t.rpc<{ items: RatePlanView[] }>(kora.owner.cookie, 'ratePlans/list', {
      propertyId: hotel.id,
    })
    expect(list.data.items.map((plan) => plan.code)).toEqual(['BAR', 'BB'])
  })

  it('never leaves an active plan following an archived parent', async () => {
    const parent = (
      await t.rpc<RatePlanView>(kora.owner.cookie, 'ratePlans/create', {
        propertyId: hotel.id,
        name: 'Long stay',
        code: 'LONG',
        pricing: 'own',
        roomTypes: [{ roomTypeId: type.id, weekday: '130000' }],
        ...TERMS,
      })
    ).data
    const [archive, follow] = await Promise.all([
      t.rpc<{ data?: { code?: string } }>(kora.owner.cookie, 'ratePlans/archive', {
        id: parent.id,
      }),
      t.rpc<{ data?: { code?: string } }>(kora.owner.cookie, 'ratePlans/create', {
        propertyId: hotel.id,
        name: 'Long stay B&B',
        code: 'LONG-BB',
        pricing: 'derived',
        parentId: parent.id,
        adjustment: { kind: 'amount', value: '18000' },
        mealPlan: 'bed_breakfast',
        roomTypes: [{ roomTypeId: type.id }],
        ...TERMS,
      }),
    ])
    expect([archive.status, follow.status].filter((status) => status === 200)).toHaveLength(1)
    const loser = archive.status === 200 ? follow : archive
    expect(['PARENT_ARCHIVED', 'HAS_DERIVED_PLANS']).toContain(loser.data.data?.code)
  })
})
