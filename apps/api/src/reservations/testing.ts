// Test fixtures for reservations: Kora Hotels Group from the finance fixtures (owner, finance with
// every hotel, a GM and Chiamaka at the front desk limited to Victoria Island, Kora Ikeja GRA, Kora
// Port Harcourt, another group), plus Sade the revenue manager with Victoria Island and Ikeja, a
// cashier, and at Victoria Island: business date 25 Nov 2026, taxes set up, four room types with
// rooms (Junior Suite 8, Deluxe King 6, Standard Queen 4, Executive King 3), Best available and
// Bed & breakfast, a GBP rate and the front desk discount limit at 12% (as in the demo seed).
import type {
  Availability,
  CreateReservationInput,
  RatePlanView,
  RoomTypeView,
  StayQuote,
} from '@vento/shared'
import { newId } from '@vento/shared'
import { koraFinance, setHotel } from '../finance/testing.ts'
import { createType, floorRooms } from '../rooms/testing.ts'
import { limitTo, person } from '../tenancy/testing.ts'
import type { createTestApp } from '../test/harness.ts'

type TestApp = ReturnType<typeof createTestApp>
export type Problem = { message: string; code: string; data?: Record<string, unknown> }

export const DAY = '2026-11-25'

let floor = 1
async function addRooms(
  t: TestApp,
  cookie: string,
  propertyId: string,
  type: RoomTypeView,
  n: number,
) {
  const f = floor++
  const response = await t.rpc<{ message?: string }>(cookie, 'rooms/createMany', {
    propertyId,
    batchId: newId(),
    rooms: floorRooms(type.id, f, 1, n),
  })
  if (response.status !== 200) throw new Error(`rooms failed: ${response.data.message}`)
}

export async function koraBooking(t: TestApp) {
  const k = await koraFinance(t)
  for (const hotel of [k.vi, k.ikeja, k.ph]) await setHotel(t, hotel.id, { businessDate: DAY })
  // The demo's prefix (a new hotel's is suggested from its name: VIC).
  await t.rpc(k.owner.cookie, 'properties/update', {
    id: k.vi.id,
    version: k.vi.version,
    bookingPrefix: 'VI',
  })
  const setUp = await t.rpc<{ message?: string }>(k.finance.cookie, 'taxes/setUp', {
    propertyId: k.vi.id,
  })
  if (setUp.status !== 200) throw new Error(`taxes failed: ${setUp.data.message}`)
  const sade = await person(t, k.orgId, 'Sade Bakare', 'revenue_manager')
  await limitTo(t, k.owner, sade, [k.vi.id, k.ikeja.id])
  const cashier = await person(t, k.orgId, 'Halima Yusuf', 'cashier')
  await limitTo(t, k.owner, cashier, [k.vi.id])
  await t.rpc(k.owner.cookie, 'permissions/set', {
    role: 'front_desk',
    permission: 'stay.rate_override',
    allowed: true,
    limit: '12',
    reason: 'Weekend corporate guests ask for a little more',
  })
  const make = (name: string, code: string, extra: Record<string, unknown> = {}) =>
    createType(t, k.owner.cookie, k.vi.id, { name, code, ...extra })
  const types = {
    stq: await make('Standard Queen', 'STQ', { bed: 'queen' }),
    dlk: await make('Deluxe King', 'DLK', { maxChildren: 1 }),
    exk: await make('Executive King', 'EXK', { maxChildren: 1 }),
    jrs: await make('Junior Suite', 'JRS', { maxAdults: 3, maxChildren: 1 }),
  }
  await addRooms(t, k.owner.cookie, k.vi.id, types.stq, 4)
  await addRooms(t, k.owner.cookie, k.vi.id, types.dlk, 6)
  await addRooms(t, k.owner.cookie, k.vi.id, types.exk, 3)
  await addRooms(t, k.owner.cookie, k.vi.id, types.jrs, 8)
  const first = await t.rpc<{ plans: RatePlanView[]; message?: string }>(
    k.gm.cookie,
    'ratePlans/createFirst',
    {
      propertyId: k.vi.id,
      prices: [
        { roomTypeId: types.stq.id, weekday: '120000' },
        { roomTypeId: types.dlk.id, weekday: '150000' },
        { roomTypeId: types.exk.id, weekday: '210000' },
        { roomTypeId: types.jrs.id, weekday: '320000' },
      ],
      withBreakfast: true,
    },
  )
  if (first.status !== 200) throw new Error(`rates failed: ${first.data.message}`)
  const [bar, bb] = first.data.plans
  if (!bar || !bb) throw new Error('no plans')
  await t.rpc(k.finance.cookie, 'fxRates/enter', {
    rateDate: DAY,
    rates: [{ currency: 'GBP', rate: '1950' }],
  })
  return { ...k, sade, cashier, types, bar, bb }
}

export type KoraBooking = Awaited<ReturnType<typeof koraBooking>>

export type StayAsk = {
  roomTypeId: string
  ratePlanId: string
  arrival: string
  departure: string
  adults?: number
  children?: number
  discount?: Record<string, unknown>
}

export async function quote(
  t: TestApp,
  cookie: string,
  propertyId: string,
  stay: StayAsk,
  extra: Record<string, unknown> = {},
) {
  return t.rpc<StayQuote & { data?: { code?: string } }>(cookie, 'reservations/quote', {
    propertyId,
    adults: 1,
    children: 0,
    ...stay,
    ...extra,
  })
}

export const COLLINS = {
  kind: 'new',
  fields: {
    title: 'Ms',
    firstName: 'Sarah',
    lastName: 'Collins',
    phone: '+44 7700 900123',
    nationality: 'GB',
  },
} as const

// Quotes each stay, then books them with the quoted hashes, as the sheet does.
export async function book(
  t: TestApp,
  cookie: string,
  propertyId: string,
  stays: StayAsk[],
  extra: Partial<CreateReservationInput> & { restrictionReason?: string } = {},
) {
  const hashes: string[] = []
  for (const stay of stays) {
    const quoted = await quote(t, cookie, propertyId, stay)
    hashes.push(quoted.status === 200 ? quoted.data.quoteHash : 'unquoted')
  }
  const { restrictionReason, ...rest } = extra
  return t.rpc<{ id: string; number: string; data?: Record<string, unknown> & { code?: string } }>(
    cookie,
    'reservations/create',
    {
      idempotencyKey: newId(),
      propertyId,
      guest: COLLINS,
      source: 'phone',
      stays: stays.map((stay, index) => ({
        adults: 1,
        children: 0,
        ...stay,
        quoteHash: hashes[index],
        ...(restrictionReason ? { restrictionReason } : {}),
      })),
      ...rest,
    },
  )
}

export async function availabilityOf(
  t: TestApp,
  cookie: string,
  propertyId: string,
  arrival: string,
  departure: string,
  adults = 1,
) {
  return t.rpc<Availability & { data?: { code?: string } }>(cookie, 'reservations/availability', {
    propertyId,
    arrival,
    departure,
    adults,
    children: 0,
  })
}
