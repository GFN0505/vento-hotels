// Test fixtures for rates: Kora Hotels Group from the rooms fixtures (owner, Tunde the GM and
// Chiamaka at the front desk, both limited to Victoria Island, Kora Abuja, and another group),
// plus Sade the revenue manager and a room attendant at Victoria Island, Victoria Island's four
// room types, and a business date of 25 Nov 2026 (the spec's examples).
import type { RatePlanView } from '@vento/shared'
import { newId } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { properties } from '../db/schema/tenancy.ts'
import { createType, koraWithRooms, type Person } from '../rooms/testing.ts'
import type { createTestApp } from '../test/harness.ts'

type TestApp = ReturnType<typeof createTestApp>

export type { Page, Problem } from '../rooms/testing.ts'

export const BUSINESS_DATE = '2026-11-25'

async function member(
  t: TestApp,
  owner: Person,
  orgId: string,
  name: string,
  role: string,
  hotelId: string,
) {
  const person = await t.signUp(name)
  await t.addMember(orgId, person, role)
  const current = await t.rpc<{ member: { id: string } }>(person.cookie, 'organization/current')
  await t.rpc(owner.cookie, 'members/setPropertyAccess', {
    memberId: current.data.member.id,
    allProperties: false,
    propertyIds: [hotelId],
  })
  return person
}

export async function setBusinessDate(t: TestApp, propertyId: string, businessDate: string) {
  await t.db.update(properties).set({ businessDate }).where(eq(properties.id, propertyId))
}

export async function koraWithRates(t: TestApp) {
  const kora = await koraWithRooms(t)
  await setBusinessDate(t, kora.vi.id, BUSINESS_DATE)
  await setBusinessDate(t, kora.abuja.id, BUSINESS_DATE)
  const sade = await member(t, kora.owner, kora.orgId, 'Sade Bakare', 'revenue_manager', kora.vi.id)
  const attendant = await member(
    t,
    kora.owner,
    kora.orgId,
    'Blessing Udo',
    'room_attendant',
    kora.vi.id,
  )
  const make = (name: string, code: string, extra: Record<string, unknown> = {}) =>
    createType(t, kora.owner.cookie, kora.vi.id, { name, code, ...extra })
  const types = {
    stq: await make('Standard Queen', 'STQ', { bed: 'queen' }),
    dlk: await make('Deluxe King', 'DLK', { maxChildren: 1 }),
    exk: await make('Executive King', 'EXK', { maxChildren: 1 }),
    jrs: await make('Junior Suite', 'JRS', { maxAdults: 3, maxChildren: 1 }),
  }
  const abujaType = await createType(t, kora.owner.cookie, kora.abuja.id, {
    name: 'Abuja Deluxe',
    code: 'ADL',
  })
  return { ...kora, sade, attendant, types, abujaType }
}

export type Kora = Awaited<ReturnType<typeof koraWithRates>>

export const PRICES = {
  stq: '120000',
  dlk: '150000',
  exk: '210000',
  jrs: '320000',
} as const

// The first-rate table: Best available and Bed & breakfast at Victoria Island.
export async function firstRate(t: TestApp, kora: Kora, cookie = kora.gm.cookie) {
  const response = await t.rpc<{ plans: RatePlanView[] }>(cookie, 'ratePlans/createFirst', {
    propertyId: kora.vi.id,
    prices: (['stq', 'dlk', 'exk', 'jrs'] as const).map((key) => ({
      roomTypeId: kora.types[key].id,
      weekday: PRICES[key],
    })),
    withBreakfast: true,
  })
  if (response.status !== 200) throw new Error(`first rate failed: ${response.data.message}`)
  const [bar, bb] = response.data.plans
  if (!bar || !bb) throw new Error('first rate made no plans')
  return { bar, bb }
}

export const TERMS = {
  cancellation: { kind: 'free_until', hours: 48, penalty: { kind: 'first_night' } },
  deposit: { kind: 'first_night', due: { kind: 'within_hours', hours: 48 } },
}

// Non-refundable: Best available − 10% on every room type.
export async function nonRefundable(t: TestApp, kora: Kora, parentId: string, overrides = {}) {
  const response = await t.rpc<RatePlanView>(kora.gm.cookie, 'ratePlans/create', {
    propertyId: kora.vi.id,
    name: 'Non-refundable',
    code: 'NRF',
    pricing: 'derived',
    parentId,
    adjustment: { kind: 'percent', value: '-10' },
    roomTypes: Object.values(kora.types).map((type) => ({ roomTypeId: type.id })),
    cancellation: { kind: 'non_refundable' },
    deposit: { kind: 'full_stay', due: { kind: 'at_booking' } },
    ...overrides,
  })
  if (response.status !== 200) throw new Error(`NRF failed: ${response.data.message}`)
  return response.data
}

// The editor's whole form for a plan, as the web app sends it on save.
export function formOf(plan: RatePlanView) {
  return {
    id: plan.id,
    version: plan.version,
    name: plan.name,
    code: plan.code,
    pricing: plan.pricing,
    parentId: plan.parent?.id ?? null,
    adjustment: plan.adjustment,
    roomTypes: plan.roomTypes.map((row) =>
      plan.pricing === 'own'
        ? { roomTypeId: row.roomTypeId, weekday: row.weekday, weekend: row.weekend }
        : { roomTypeId: row.roomTypeId },
    ),
    mealPlan: plan.mealPlan,
    mealAllocation: plan.mealAllocation,
    cancellation: plan.cancellation,
    deposit: plan.deposit,
    minStay: plan.minStay,
    extraAdult: plan.extraAdult,
    bookableBy: plan.bookableBy,
    pricesIncludeTaxes: plan.pricesIncludeTaxes,
  }
}

export const batch = () => newId()
