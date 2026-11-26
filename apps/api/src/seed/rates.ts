// The demo group's rate plans and dates (spec: docs/specs/stage-1-rate-plans.md, "Demo seed").
// Kora Victoria Island has Best available, Bed & breakfast, Non-refundable and Acme's two corporate
// plans, the Festive season, Saturday 5 Dec and Wednesday 2 Dec as in RatesGrid; the other hotels
// have the first three plans at their own prices. Prices are illustrative, NGN, excl. taxes and
// service charge, with no Fri and Sat uplift (the walkthrough totals assume flat prices).
import {
  BREAKFAST_SUPPLEMENT,
  type CalendarDate,
  DEFAULT_CANCELLATION,
  DEFAULT_DEPOSIT,
  selectDates,
  toAmount,
} from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import { type Actor, type AuditEvent, recordAuditMany } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { rateDates, ratePlanRoomTypes, ratePlans } from '../db/schema/rates.ts'
import { roomTypes } from '../db/schema/rooms.ts'
import { type PlanTerms, termColumns } from '../rates/plan-model.ts'
import type { RoomHotel } from './rooms.ts'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type Code = 'STQ' | 'DLK' | 'EXK' | 'JRS'
// `businessDate` is the setup-week date the events are recorded on (before go-live).
type Hotel = { id: string; businessDate: string }

// Best available's weekday price per room type, per hotel.
const BAR_PRICES: Record<RoomHotel, Record<Code, string>> = {
  vi: { STQ: '120000', DLK: '150000', EXK: '210000', JRS: '320000' },
  ikeja: { STQ: '95000', DLK: '120000', EXK: '165000', JRS: '250000' },
  abuja: { STQ: '110000', DLK: '140000', EXK: '195000', JRS: '300000' },
  ph: { STQ: '100000', DLK: '130000', EXK: '180000', JRS: '280000' },
}

const BASE: Omit<PlanTerms, 'name' | 'code'> = {
  pricing: 'own',
  parentId: null,
  adjustment: null,
  mealPlan: 'room_only',
  mealAllocation: null,
  cancellation: DEFAULT_CANCELLATION,
  deposit: DEFAULT_DEPOSIT,
  minStay: 1,
  extraAdult: null,
  bookableBy: 'anyone',
  pricesIncludeTaxes: false,
}

const ACME_TERMS: Omit<PlanTerms, 'name' | 'code'> = {
  ...BASE,
  cancellation: { kind: 'free_until', hours: 24, penalty: { kind: 'first_night' } },
  deposit: { kind: 'none' },
  bookableBy: 'corporate_only',
}

type PlanSeed = {
  key: string
  terms: PlanTerms
  // Own-price plans: weekday price per room type. Derived plans: the room types they sell.
  prices?: Partial<Record<Code, string>>
  types?: Code[]
}

function plansFor(hotel: RoomHotel, ids: Record<string, string>): PlanSeed[] {
  const all: Code[] = ['STQ', 'DLK', 'EXK', 'JRS']
  const plans: PlanSeed[] = [
    {
      key: 'BAR',
      terms: { ...BASE, name: 'Best available', code: 'BAR' },
      prices: BAR_PRICES[hotel],
    },
    {
      key: 'BB',
      terms: {
        ...BASE,
        name: 'Bed & breakfast',
        code: 'BB',
        pricing: 'derived',
        parentId: ids.BAR ?? null,
        adjustment: { kind: 'amount', value: BREAKFAST_SUPPLEMENT },
        mealPlan: 'bed_breakfast',
        mealAllocation: BREAKFAST_SUPPLEMENT,
      },
      types: all,
    },
    {
      key: 'NRF',
      terms: {
        ...BASE,
        name: 'Non-refundable',
        code: 'NRF',
        pricing: 'derived',
        parentId: ids.BAR ?? null,
        adjustment: { kind: 'percent', value: '-10.00' },
        cancellation: { kind: 'non_refundable' },
        deposit: { kind: 'full_stay', due: { kind: 'at_booking' } },
      },
      types: all,
    },
  ]
  if (hotel !== 'vi') return plans
  return [
    ...plans,
    {
      key: 'ACME',
      terms: { ...ACME_TERMS, name: 'Acme Energy', code: 'ACME' },
      prices: { EXK: '180000' },
    },
    {
      key: 'ACME-BB',
      terms: {
        ...ACME_TERMS,
        name: 'Acme Energy B&B',
        code: 'ACME-BB',
        mealPlan: 'bed_breakfast',
        mealAllocation: BREAKFAST_SUPPLEMENT,
      },
      prices: { DLK: '130000' },
    },
  ]
}

type DateSeed = {
  label: string
  from: CalendarDate
  to: CalendarDate
  seasonName?: string
  prices?: Partial<Record<Code, string>>
  types: Code[]
  minStay?: number
  closedToArrival?: boolean
}

// Best available's dates at Kora Victoria Island (RatesGrid and the spec's walkthrough).
const VI_DATES: DateSeed[] = [
  {
    label: 'Festive season',
    from: '2026-12-18',
    to: '2027-01-02',
    seasonName: 'Festive season',
    prices: { STQ: '140000', DLK: '175000', EXK: '240000', JRS: '360000' },
    types: ['STQ', 'DLK', 'EXK', 'JRS'],
    minStay: 2,
  },
  {
    label: 'Saturday 5 Dec',
    from: '2026-12-05',
    to: '2026-12-05',
    prices: { DLK: '165000' },
    types: ['STQ', 'DLK', 'EXK', 'JRS'],
    minStay: 2,
  },
  {
    label: 'Wednesday 2 Dec',
    from: '2026-12-02',
    to: '2026-12-02',
    types: ['EXK'],
    closedToArrival: true,
  },
]

async function typeIdsOf(tx: Tx, organizationId: string, propertyId: string) {
  const rows = await tx
    .select({ id: roomTypes.id, code: roomTypes.code })
    .from(roomTypes)
    .where(and(eq(roomTypes.organizationId, organizationId), eq(roomTypes.propertyId, propertyId)))
  return Object.fromEntries(rows.map((row) => [row.code, row.id])) as Record<Code, string>
}

export async function seedRates(
  tx: Tx,
  actor: Actor,
  organizationId: string,
  hotels: Record<RoomHotel, Hotel>,
): Promise<number> {
  let planCount = 0
  for (const [key, hotel] of Object.entries(hotels) as [RoomHotel, Hotel][]) {
    const at = { propertyId: hotel.id, businessDate: hotel.businessDate }
    const types = await typeIdsOf(tx, organizationId, hotel.id)
    const planIds: Record<string, string> = {}
    const events: AuditEvent[] = []
    // Derived plans name their parent, so plans go in one at a time, in order.
    for (const [index, seed] of plansFor(key, planIds).entries()) {
      const terms =
        seed.terms.pricing === 'derived'
          ? { ...seed.terms, parentId: planIds.BAR ?? null }
          : seed.terms
      const [row] = await tx
        .insert(ratePlans)
        .values({
          ...termColumns(terms),
          organizationId,
          propertyId: hotel.id,
          sortOrder: index + 1,
        })
        .returning({ id: ratePlans.id })
      if (!row) throw new Error('rate plan insert returned nothing')
      planIds[seed.key] = row.id
      const sold = seed.prices
        ? (Object.entries(seed.prices) as [Code, string][])
        : (seed.types ?? []).map((code) => [code, null] as const)
      await tx.insert(ratePlanRoomTypes).values(
        sold.map(([code, price]) => ({
          organizationId,
          propertyId: hotel.id,
          ratePlanId: row.id,
          roomTypeId: types[code],
          weekdayPrice: price,
        })),
      )
      events.push({
        action: 'rate_plan.created',
        entityType: 'rate_plan',
        entityId: row.id,
        ...at,
        after: {
          ...terms,
          roomTypes: sold.map(([code, price]) => ({
            roomTypeId: types[code],
            ...(price ? { weekday: toAmount(price), weekend: null } : {}),
          })),
          liveProperty: false,
        },
      })
      planCount++
    }
    const barId = planIds.BAR
    if (key === 'vi' && barId) {
      events.push(...(await seedDates(tx, organizationId, hotel, barId, types)))
    }
    await recordAuditMany(tx, actor, events)
  }
  return planCount
}

async function seedDates(
  tx: Tx,
  organizationId: string,
  hotel: Hotel,
  barId: string,
  types: Record<Code, string>,
): Promise<AuditEvent[]> {
  const cells = new Map<string, typeof rateDates.$inferInsert>()
  const events: AuditEvent[] = []
  for (const seed of VI_DATES) {
    const applied: Record<string, unknown>[] = []
    for (const date of selectDates(seed.from, seed.to)) {
      for (const code of seed.types) {
        const key = `${code}|${date}`
        const cell = cells.get(key) ?? {
          organizationId,
          propertyId: hotel.id,
          ratePlanId: barId,
          roomTypeId: types[code],
          date,
        }
        const price = seed.prices?.[code]
        if (price) cell.price = price
        if (seed.seasonName) cell.seasonName = seed.seasonName
        if (seed.minStay) cell.minStay = seed.minStay
        if (seed.closedToArrival) cell.closedToArrival = true
        cells.set(key, cell)
        applied.push({
          ...cell,
          organizationId: undefined,
          propertyId: undefined,
          ratePlanId: undefined,
        })
      }
    }
    events.push({
      action: 'rates.dates_changed',
      entityType: 'rate_plan',
      entityId: barId,
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
      before: { cells: [] },
      after: {
        planName: 'Best available',
        from: seed.from,
        to: seed.to,
        seasonName: seed.seasonName ?? null,
        cells: applied,
        liveProperty: false,
      },
    })
  }
  await tx.insert(rateDates).values([...cells.values()])
  return events
}
