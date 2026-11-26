// The demo seed loads a working group: people can sign in and see exactly what their role allows.
import type {
  AuditEventView,
  Entity,
  FxSummary,
  HomeSummary,
  MemberView,
  Property,
  RateCalendar,
  RatePlanView,
  RoomTypeView,
  RoomView,
  TaxSetup,
} from '@vento/shared'
import { addDays, calendarDateIn, newId } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { organizations } from '../db/schema/auth.ts'
import { switchFeature } from '../features/switches.ts'
import { createTestApp } from '../test/harness.ts'
import { LIVE_DAYS_AGO, seedDemo } from './demo.ts'

const url = process.env.TEST_DATABASE_URL
const PASSWORD = 'Demo-pass-42!'

describe.skipIf(!url)('demo seed', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  const run = newId().slice(-8)
  const options = {
    password: PASSWORD,
    slug: `kora-demo-${run}`,
    emailDomain: `kora-${run}.example`,
    storage: t.storage,
  }

  const signInAs = async (email: string) => {
    const response = await t.call('/api/auth/sign-in/email', {
      body: { email, password: PASSWORD },
    })
    expect(response.status).toBe(200)
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    const organizations = await t.call('/api/auth/organization/list', { cookie })
    const [group] = (await organizations.json()) as { id: string }[]
    await t.call('/api/auth/organization/set-active', {
      cookie,
      body: { organizationId: group?.id },
    })
    return cookie
  }

  it('loads Kora Hotels Group once, with its people and hotels', async () => {
    const first = await seedDemo(t.db, options)
    expect(first.status).toBe('seeded')
    if (first.status !== 'seeded') return
    expect(first.people).toHaveLength(11)
    expect(first.people[0]).toMatchObject({ name: 'Adaeze Okafor', role: 'owner' })

    const again = await seedDemo(t.db, options)
    expect(again).toEqual({ status: 'exists', organizationId: first.organizationId })
  })

  it('lets the owner sign in and see the whole group', async () => {
    const cookie = await signInAs(`adaeze@${options.emailDomain}`)
    const hotels = await t.rpc<{ items: Property[] }>(cookie, 'properties/list', {})
    expect(hotels.data.items.map((h) => h.name).sort()).toEqual([
      'Kora Abuja',
      'Kora Ikeja GRA',
      'Kora Port Harcourt',
      'Kora Victoria Island',
    ])
    const team = await t.rpc<{ items: MemberView[]; total: number }>(cookie, 'members/list', {
      pageSize: 100,
    })
    expect(team.data.total).toBe(11)
    expect(team.data.items.every((m) => m.hasPin)).toBe(true)
  })

  it('gives the group the three companies from the designs, each owning its hotels', async () => {
    const cookie = await signInAs(`adaeze@${options.emailDomain}`)
    const companies = await t.rpc<{ items: Entity[] }>(cookie, 'entities/list', {})
    expect(
      companies.data.items.map((c) => [c.name, c.rcNumber, c.tin, c.hotels.map((h) => h.name)]),
    ).toEqual([
      [
        'Kora Hospitality Ltd',
        'RC 1184402',
        '21847390-0001',
        ['Kora Ikeja GRA', 'Kora Victoria Island'],
      ],
      ['Kora Hotels Abuja Ltd', 'RC 1290517', '22910455-0001', ['Kora Abuja']],
      ['Kora PH Ltd', 'RC 1377281', '23308817-0001', ['Kora Port Harcourt']],
    ])
  })

  it('gives Victoria Island taxes that add up to ₦183,750.00 on a ₦150,000 room, and today’s FX rates', async () => {
    const cookie = await signInAs(`kunle@${options.emailDomain}`)
    const [group] = await t.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, options.slug))
    await switchFeature(t.db, group?.id ?? '', {
      feature: 'front_desk',
      to: 'on',
      reason: 'Seed test',
    })
    const hotels = await t.rpc<{ items: Property[] }>(cookie, 'properties/list', {})
    const vi = hotels.data.items.find((h) => h.name === 'Kora Victoria Island')
    const quote = await t.rpc<{ gross: string }>(cookie, 'taxes/quote', {
      propertyId: vi?.id,
      category: 'accommodation',
      amount: '150000',
      pricing: 'exclusive',
    })
    expect(quote.data.gross).toBe('183750.00')
    const setup = await t.rpc<TaxSetup>(cookie, 'taxes/get', { propertyId: vi?.id })
    const sc = setup.data.taxes.find((tax) => tax.kind === 'service_charge')
    expect(sc?.rates.map((r) => [r.ratePercent, r.status])).toEqual([
      ['12.5', 'scheduled'],
      ['10', 'current'],
    ])
    expect(setup.data.taxes.find((tax) => tax.kind === 'vat')?.rates[0]?.verifiedByName).toBe(
      'Kunle Ade',
    )
    const fx = await t.rpc<FxSummary>(cookie, 'fxRates/summary')
    expect(fx.data.currencies.map((c) => c.latest?.rate)).toEqual(['1620', '1950', '1870'])
    expect(fx.data.currencies[0]?.recent).toHaveLength(30)
  })

  it('leaves Ikeja GRA without a street, and gives only Victoria Island a logo', async () => {
    const cookie = await signInAs(`adaeze@${options.emailDomain}`)
    const hotels = await t.rpc<{ items: Property[] }>(cookie, 'properties/list', {})
    const byName = Object.fromEntries(hotels.data.items.map((h) => [h.name, h]))
    expect(byName['Kora Victoria Island']).toMatchObject({
      addressLine1: 'Plot 1412 Ahmadu Bello Way',
      lga: 'Eti-Osa',
      checkInTime: '14:00',
      checkOutTime: '12:00',
      logo: { url: expect.any(String) },
    })
    expect(byName['Kora Ikeja GRA']).toMatchObject({ addressLine1: null, logo: null })
    expect(byName['Kora Port Harcourt']).toMatchObject({ lga: 'Obio-Akpor', state: 'Rivers' })
  })

  it('keeps the GM of Victoria Island to Victoria Island', async () => {
    const cookie = await signInAs(`tunde@${options.emailDomain}`)
    const hotels = await t.rpc<{ items: Property[] }>(cookie, 'properties/list', {})
    expect(hotels.data.items.map((h) => h.name)).toEqual(['Kora Victoria Island'])
  })

  it("counts each hotel's people, devices and invites for Home, within what the member sees", async () => {
    const byName = async (cookie: string) => {
      const [hotels, home] = await Promise.all([
        t.rpc<{ items: Property[] }>(cookie, 'properties/list', {}),
        t.rpc<HomeSummary>(cookie, 'organization/home', {}),
      ])
      return Object.fromEntries(
        home.data.byHotel.map(({ propertyId, ...counts }) => [
          hotels.data.items.find((h) => h.id === propertyId)?.name,
          counts,
        ]),
      )
    }
    // Two people see every hotel (owner and finance); nine more work at Victoria Island, Sade also
    // at Ikeja GRA. Ngozi's invite is for Abuja.
    expect(await byName(await signInAs(`adaeze@${options.emailDomain}`))).toEqual({
      'Kora Victoria Island': { people: 11, devices: 3, rooms: 120, ratesSet: true, invites: 0 },
      'Kora Ikeja GRA': { people: 3, devices: 1, rooms: 86, ratesSet: true, invites: 0 },
      'Kora Abuja': { people: 2, devices: 0, rooms: 104, ratesSet: true, invites: 1 },
      'Kora Port Harcourt': { people: 2, devices: 0, rooms: 72, ratesSet: true, invites: 0 },
    })
    const frontDesk = await signInAs(`chiamaka@${options.emailDomain}`)
    expect(await byName(frontDesk)).toEqual({
      'Kora Victoria Island': { people: 11, devices: 3, rooms: 120, ratesSet: true, invites: null },
    })
    const home = await t.rpc<HomeSummary>(frontDesk, 'organization/home', {})
    expect(home.data.members).toBeNull()
  })

  it("matches Home's counts with Members, Devices and Invited for every hotel", async () => {
    const owner = await signInAs(`adaeze@${options.emailDomain}`)
    const home = await t.rpc<HomeSummary>(owner, 'organization/home', {})
    expect(home.data.byHotel).toHaveLength(4)
    for (const hotel of home.data.byHotel) {
      const scoped = { propertyId: hotel.propertyId, pageSize: 100 }
      const [people, devices, invites] = await Promise.all([
        t.rpc<{ total: number }>(owner, 'members/list', scoped),
        t.rpc<{ total: number }>(owner, 'devices/list', scoped),
        t.rpc<{ total: number }>(owner, 'invitations/list', scoped),
      ])
      expect([people.data.total, devices.data.total, invites.data.total]).toEqual([
        hotel.people,
        hotel.devices,
        hotel.invites,
      ])
    }
    const all = await t.rpc<{ total: number }>(owner, 'devices/list', {})
    expect(all.data.total).toBe(home.data.devices)
  })

  it('gives Sade Bakare two of the four hotels, and no way into the others', async () => {
    const cookie = await signInAs(`sade@${options.emailDomain}`)
    const hotels = await t.rpc<{ items: Property[] }>(cookie, 'properties/list', {})
    expect(hotels.data.items.map((h) => h.name)).toEqual(['Kora Ikeja GRA', 'Kora Victoria Island'])
    const home = await t.rpc<HomeSummary>(cookie, 'organization/home', {})
    expect(home.data.byHotel.map((row) => row.people).sort((a, b) => a - b)).toEqual([3, 11])
  })

  it('sets up Kora Victoria Island’s rooms exactly as the designs show', async () => {
    const owner = await signInAs(`adaeze@${options.emailDomain}`)
    const home = await t.rpc<HomeSummary>(owner, 'organization/home', {})
    expect(home.data.rooms).toBe(382)

    const seeded = await seedDemo(t.db, options)
    await switchFeature(t.db, seeded.organizationId, {
      feature: 'front_desk',
      to: 'on',
      reason: 'Seed test',
    })
    const gm = await signInAs(`tunde@${options.emailDomain}`)
    const [vi] = (await t.rpc<{ items: Property[] }>(gm, 'properties/list', {})).data.items
    // Go-live 10 days before the seed date, in Lagos (going-live.md: 16 Nov for a 26 Nov seed).
    expect(vi?.liveSince).toBe(addDays(calendarDateIn('Africa/Lagos'), -LIVE_DAYS_AGO))
    const types = await t.rpc<{ items: RoomTypeView[] }>(gm, 'roomTypes/list', {
      propertyId: vi?.id,
    })
    expect(types.data.items.map((type) => [type.code, type.roomCount])).toEqual([
      ['STQ', 36],
      ['DLK', 48],
      ['EXK', 28],
      ['JRS', 8],
    ])
    const find = async (q: string) =>
      (
        await t.rpc<{ items: RoomView[] }>(gm, 'rooms/list', { propertyId: vi?.id, q })
      ).data.items.find((room) => room.number === q)
    expect(await find('401')).toMatchObject({
      features: ['City view'],
      connectingRooms: [{ number: '402' }],
      housekeepingStatus: 'inspected',
    })
    expect(await find('407')).toMatchObject({ accessible: true, features: ['Roll-in shower'] })
    expect((await find('808'))?.roomTypeCode).toBe('STQ')
    expect((await find('809'))?.roomTypeCode).toBe('DLK')
    // Set up before go-live, so the setup raises no "room count changed" exception.
    const history = await t.rpc<{ items: AuditEventView[] }>(owner, 'audit/list', {
      entityType: 'room',
      entityId: (await find('401'))?.id,
    })
    expect(history.data.items[0]).toMatchObject({
      action: 'room.created',
      after: { liveProperty: false },
    })
  })
  it('prices Kora Victoria Island as the rate plans spec shows, and the other hotels too', async () => {
    const seeded = await seedDemo(t.db, options)
    await switchFeature(t.db, seeded.organizationId, {
      feature: 'front_desk',
      to: 'on',
      reason: 'Seed test',
    })
    const owner = await signInAs(`adaeze@${options.emailDomain}`)
    const hotels = (await t.rpc<{ items: Property[] }>(owner, 'properties/list', {})).data.items
    const vi = hotels.find((hotel) => hotel.name === 'Kora Victoria Island')
    const plans = await t.rpc<{ items: RatePlanView[] }>(owner, 'ratePlans/list', {
      propertyId: vi?.id,
    })
    expect(plans.data.items.map((plan) => [plan.code, plan.pricing, plan.bookableBy])).toEqual([
      ['BAR', 'own', 'anyone'],
      ['BB', 'derived', 'anyone'],
      ['NRF', 'derived', 'anyone'],
      ['ACME', 'own', 'corporate_only'],
      ['ACME-BB', 'own', 'corporate_only'],
    ])
    expect(plans.data.items[1]).toMatchObject({
      adjustment: { kind: 'amount', value: '18000.00' },
      mealAllocation: '18000.00',
    })
    expect(plans.data.items[4]).toMatchObject({
      roomTypes: [{ weekday: '130000.00' }],
      mealPlan: 'bed_breakfast',
      cancellation: { kind: 'free_until', hours: 24 },
      deposit: { kind: 'none' },
    })
    // Chiamaka reads Deluxe King B&B on Saturday 5 Dec: ₦183,000, min stay 2.
    const desk = await signInAs(`chiamaka@${options.emailDomain}`)
    const cal = await t.rpc<RateCalendar>(desk, 'rates/calendar', {
      propertyId: vi?.id,
      from: '2026-12-02',
      nights: 4,
    })
    const row = (type: string, plan: string) =>
      cal.data.roomTypes.find((t) => t.code === type)?.rows.find((r) => r.code === plan)
    expect(row('DLK', 'BB')?.cells[3]).toMatchObject({ price: '183000.00', minStay: 2 })
    expect(row('EXK', 'NRF')?.cells[0]?.closedToArrival).toBe(true)
    const festive = await t.rpc<RateCalendar>(desk, 'rates/calendar', {
      propertyId: vi?.id,
      from: '2026-12-18',
      nights: 16,
    })
    expect(festive.data.seasons).toEqual([
      { name: 'Festive season', from: '2026-12-18', to: '2027-01-02' },
    ])
    for (const name of ['Kora Ikeja GRA', 'Kora Abuja', 'Kora Port Harcourt']) {
      const hotel = hotels.find((h) => h.name === name)
      const list = await t.rpc<{ items: RatePlanView[] }>(owner, 'ratePlans/list', {
        propertyId: hotel?.id,
      })
      expect(list.data.items.map((plan) => plan.code)).toEqual(['BAR', 'BB', 'NRF'])
    }
    const home = await t.rpc<HomeSummary>(owner, 'organization/home', {})
    expect(home.data.byHotel.every((hotel) => hotel.ratesSet)).toBe(true)
  })
})
