// The demo seed loads a working group: people can sign in and see exactly what their role allows.
import type {
  AuditEventView,
  CheckInPrepare,
  Entity,
  FrontDeskList,
  FxSummary,
  HomeSummary,
  MemberView,
  MyShift,
  Page,
  Property,
  RateCalendar,
  RatePlanView,
  ReservationRow,
  RoomOptions,
  RoomTypeView,
  RoomView,
  ShiftDetail,
  ShiftRow,
  TapeChart,
  TaxSetup,
} from '@vento/shared'
import { addDays, calendarDateIn, newId } from '@vento/shared'
import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { organizations } from '../db/schema/auth.ts'
import { switchFeature } from '../features/switches.ts'
import { createTestApp } from '../test/harness.ts'
import { LIVE_DAYS_AGO, seedDemo } from './demo.ts'

const url = process.env.TEST_DATABASE_URL
const PASSWORD = 'Demo-pass-42!'

// What a returning guest's earlier registration may show another hotel's desk (prepare.ts).
const REUSED_KEYS = [
  'addressCity',
  'addressCountry',
  'addressLine',
  'addressRegion',
  'dateOfBirth',
  'hotelName',
  'id',
  'idCountry',
  'idExpiry',
  'idNumberMasked',
  'idType',
  'occupation',
  'purpose',
  'reusableDocument',
  'title',
  'vehiclePlate',
]

describe.skipIf(!url)('demo seed', { timeout: 60_000 }, () => {
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
    expect(first.people).toHaveLength(12)
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
    expect(team.data.total).toBe(12)
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
    // at Ikeja GRA, and Ifeoma at Ikeja GRA only. Ngozi's invite is for Abuja.
    expect(await byName(await signInAs(`adaeze@${options.emailDomain}`))).toEqual({
      'Kora Victoria Island': { people: 11, devices: 3, rooms: 120, ratesSet: true, invites: 0 },
      'Kora Ikeja GRA': { people: 4, devices: 1, rooms: 86, ratesSet: true, invites: 0 },
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
    expect(home.data.byHotel.map((row) => row.people).sort((a, b) => a - b)).toEqual([4, 11])
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

  it('books the demo reservations through the booking service, counters equal to the stays', async () => {
    const cookie = await signInAs(`adaeze@kora-${run}.example`)
    const today = calendarDateIn('Africa/Lagos')
    const hotels = await t.rpc<{ items: Property[] }>(cookie, 'properties/list', {})
    const hotel = (name: string) => hotels.data.items.find((h) => h.name === name)?.id ?? ''
    const vi = hotel('Kora Victoria Island')
    const list = (input: Record<string, unknown>) =>
      t.rpc<{ items: ReservationRow[]; total: number }>(cookie, 'reservations/list', {
        view: 'all',
        pageSize: 100,
        ...input,
      })
    const mensah = await list({ propertyId: vi, q: 'mensah' })
    const daniel = mensah.data.items.find((row) => row.guestName === 'Daniel Mensah')
    expect(daniel?.number).toMatch(/^VI-\d{4}-0482$/)
    expect(daniel).toMatchObject({
      roomTypeName: 'Executive King',
      arrival: today,
      source: 'email',
    })
    // 26 from bricks 4 and 6, and Mrs Okafor and Mrs Adebayo from brick 7 (Mr Kalu has been in
    // house since D−2, brick 8).
    expect((await list({ propertyId: vi, arrivalFrom: today, arrivalTo: today })).data.total).toBe(
      28,
    )
    expect((await list({ propertyId: vi })).data.total).toBeGreaterThanOrEqual(140)
    const ikeja = (await list({ propertyId: hotel('Kora Ikeja GRA') })).data.total
    expect(ikeja).toBeGreaterThanOrEqual(15)
    expect((await list({ propertyId: hotel('Kora Abuja') })).data.total).toBe(0)

    const at = async (code: string, date: string) => {
      const result = await t.db.execute<{ booked: number }>(sql`
        select i.booked from room_type_inventory i join room_types rt on rt.id = i.room_type_id
        where i.property_id = ${vi} and rt.code = ${code} and i.date = ${date}`)
      return result.rows[0]?.booked ?? 0
    }
    expect(await at('JRS', addDays(today, 15))).toBe(7)
    expect(await at('JRS', addDays(today, 16))).toBe(8)
    expect(await at('DLK', addDays(today, 16))).toBe(45)

    const [org] = await t.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, options.slug))
    const drift = await t.db.execute(sql`
      select i.room_type_id, i.date, i.booked, count(n.id)::int as nights
      from room_type_inventory i
      left join stays s on s.room_type_id = i.room_type_id and s.status in ('confirmed', 'checked_in')
      left join stay_nights n on n.stay_id = s.id and n.date = i.date
      where i.organization_id = ${org?.id}
      group by i.id having i.booked <> count(n.id)`)
    expect(drift.rows).toEqual([])

    const discounts = await t.db.execute<{ actor_name: string }>(sql`
      select actor_name from audit_events
      where organization_id = ${org?.id} and action = 'stay.discount_applied'`)
    expect(discounts.rows.map((row) => row.actor_name)).toContain('Chiamaka Eze')
  })

  it('has four closed approvals with their events, and the approver on the two discounts used', async () => {
    const [org] = await t.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, options.slug))
    const rows = await t.db.execute<{
      requester_name: string
      approver_name: string
      status: string
      method: string | null
      value: string
      used: boolean
      draft: unknown
    }>(sql`
      select requester_name, approver_name, status, method, value::float::text as value,
             used_at is not null as used, draft
      from approvals where organization_id = ${org?.id} and kind = 'stay_discount'
      order by requested_at`)
    expect(
      rows.rows.map((r) => [
        r.requester_name,
        r.value,
        r.status,
        r.method,
        r.approver_name,
        r.used,
      ]),
    ).toEqual([
      ['Chiamaka Eze', '15', 'approved', 'pin_here', 'Tunde Bello', true],
      ['Sade Bakare', '30', 'approved', 'inbox', 'Adaeze Okafor', true],
      ['Ibrahim Musa', '18', 'declined', 'inbox', 'Tunde Bello', false],
      ['Chiamaka Eze', '14', 'expired', null, 'Tunde Bello', false],
    ])
    expect(rows.rows.every((r) => r.draft === null)).toBe(true)
    const events = await t.db.execute<{ action: string; n: number }>(sql`
      select action, count(*)::int as n from audit_events
      where organization_id = ${org?.id} and action like 'approval.%'
        and entity_id in (select id from approvals where kind = 'stay_discount')
      group by action order by action`)
    expect(events.rows).toEqual([
      { action: 'approval.declined', n: 1 },
      { action: 'approval.expired', n: 1 },
      { action: 'approval.granted', n: 2 },
      { action: 'approval.requested', n: 3 },
    ])
    const approved = await t.db.execute<{ approver: string | null }>(sql`
      select approver_member_id as approver from audit_events
      where organization_id = ${org?.id} and action = 'stay.discount_applied'
        and approver_member_id is not null`)
    expect(approved.rows).toHaveLength(2)
  })

  it('changes, cancels and marks no-shows through the change service, with waivers both ways', async () => {
    const [org] = await t.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, options.slug))
    const ended = await t.db.execute<{ status: string; n: number }>(sql`
      select status, count(*)::int as n from reservations
      where organization_id = ${org?.id} and status in ('cancelled', 'no_show')
      group by status order by status`)
    expect(ended.rows).toEqual([
      { status: 'cancelled', n: 5 },
      { status: 'no_show', n: 1 },
    ])
    const penalties = await t.db.execute<{
      kind: string
      status: string
      hotel: string
      waived_by: string | null
      approver: string | null
    }>(sql`
      select p.kind, p.status, pr.name as hotel, p.waived_by_name as waived_by,
             p.approver_name as approver
      from penalties p join properties pr on pr.id = p.property_id
      where p.organization_id = ${org?.id}`)
    expect(penalties.rows).toHaveLength(5)
    expect(penalties.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'late_cancellation', status: 'to_charge' }),
        expect.objectContaining({ status: 'waived', waived_by: 'Tunde Bello', approver: null }),
        expect.objectContaining({
          status: 'waived',
          waived_by: 'Ibrahim Musa',
          approver: 'Tunde Bello',
        }),
        expect.objectContaining({ kind: 'no_show', status: 'to_charge' }),
        expect.objectContaining({
          hotel: 'Kora Ikeja GRA',
          status: 'waived',
          waived_by: 'Sade Bakare',
        }),
      ]),
    )
    const waiver = await t.db.execute<{ status: string; used: boolean; method: string }>(sql`
      select status, used_at is not null as used, method from approvals
      where organization_id = ${org?.id} and kind = 'penalty_waiver'`)
    expect(waiver.rows).toEqual([{ status: 'approved', used: true, method: 'inbox' }])
    const exceptions = await t.db.execute<{ actor_name: string }>(sql`
      select actor_name from audit_events
      where organization_id = ${org?.id} and action = 'reservation.penalty_waived'
        and after->>'exception' = 'penalty_waived'`)
    expect(exceptions.rows.map((row) => row.actor_name).sort()).toEqual([
      'Sade Bakare',
      'Tunde Bello',
      'Tunde Bello',
    ])
    const modified = await t.db.execute<{ actor_name: string }>(sql`
      select actor_name from audit_events
      where organization_id = ${org?.id} and action = 'reservation.modified'`)
    expect(modified.rows.map((row) => row.actor_name).sort()).toEqual([
      'Chiamaka Eze',
      'Sade Bakare',
    ])
  })

  it('puts the coming week in rooms, 503 out of order and the statuses on the chart', async () => {
    const [org] = await t.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, options.slug))
    const orgId = org?.id ?? ''
    const today = calendarDateIn('Africa/Lagos')
    const cookie = await signInAs(`chiamaka@kora-${run}.example`)
    const hotels = await t.rpc<{ items: Property[] }>(cookie, 'properties/list', {})
    const vi = hotels.data.items.find((h) => h.name === 'Kora Victoria Island')?.id ?? ''
    const chart = await t.rpc<TapeChart>(cookie, 'tapeChart/get', { propertyId: vi, days: 14 })
    expect(chart.status).toBe(200)
    const roomOf = (number: string) => chart.data.rooms.find((room) => room.number === number)
    const stayOf = (name: string) => chart.data.stays.find((stay) => stay.guestName === name)
    expect(stayOf('Daniel Mensah')?.roomId).toBe(roomOf('502')?.id)
    expect(stayOf('Ngozi Okafor')?.roomId).toBe(roomOf('404')?.id)
    expect(stayOf('Funmilayo Adebayo')?.roomId).toBeNull()
    expect(stayOf('Emeka Kalu')?.roomId).toBe(roomOf('501')?.id)
    expect(stayOf('Rasheed Shittu')?.roomId).toBe(roomOf('402')?.id)
    // Seven arriving this week without a room: 2 Deluxe King and 1 Standard Queen today.
    const week = chart.data.stays.filter(
      (stay) => stay.arrival >= today && stay.arrival <= addDays(today, 6),
    )
    const waiting = week.filter((stay) => stay.roomId === null)
    expect(waiting).toHaveLength(7)
    const typeName = (id: string) => chart.data.roomTypes.find((type) => type.id === id)?.name
    expect(
      waiting
        .filter((stay) => stay.arrival === today)
        .map((stay) => typeName(stay.roomTypeId))
        .sort(),
    ).toEqual(['Deluxe King', 'Deluxe King', 'Standard Queen'])
    // 503 is the only room out of order tonight; 406 ended yesterday, 305 is upcoming.
    const tonight = chart.data.outOfOrder.filter(
      (period) => period.from <= today && period.backInService > today,
    )
    expect(tonight.map((period) => period.roomNumber)).toEqual(['503'])
    expect(
      chart.data.outOfOrder.map((p) => [p.roomNumber, p.from, p.backInService]).sort(),
    ).toEqual([
      ['305', addDays(today, 6), addDays(today, 8)],
      ['406', addDays(today, -3), addDays(today, -1)],
      ['503', today, addDays(today, 2)],
    ])
    const exk = chart.data.roomTypes.find((type) => type.name === 'Executive King')
    const night = exk?.nights.find((n) => n.date === today)
    expect(night?.rooms).toBe(28)
    expect(night?.left).toBe(28 - 1 - (night?.booked ?? 0))
    expect(
      Object.fromEntries(
        ['502', '301', '403', '504', '1102', '303', '408', '503', '305'].map((n) => [
          n,
          roomOf(n)?.status,
        ]),
      ),
    ).toEqual({
      '502': 'dirty',
      '301': 'dirty',
      '403': 'dirty',
      '504': 'dirty',
      '1102': 'dirty',
      '303': 'clean',
      '408': 'clean',
      '503': 'dirty',
      '305': 'inspected',
    })
    expect(roomOf('301')?.statusBy).toBe('Grace Akpan')
    // Mr Chidi Eze: Deluxe King is full in rooms on D+4, so Room move offers Executive King.
    const chidi = stayOf('Chidi Eze')
    expect(chidi?.roomId).toBeTruthy()
    const dlk = chart.data.roomTypes.find((type) => type.name === 'Deluxe King')
    expect(dlk?.nights.find((n) => n.date === addDays(today, 4))?.left).toBe(0)
    const choices = await t.rpc<RoomOptions>(cookie, 'stays/roomOptions', {
      stayId: chidi?.id,
      version: chidi?.version,
    })
    expect(choices.data.sameType).toEqual([])
    expect(choices.data.otherTypes.map((type) => type.name)).toContain('Executive King')
    // Mrs Okafor has Deluxe King rooms free: only those are offered.
    const ngozi = stayOf('Ngozi Okafor')
    const hers = await t.rpc<RoomOptions>(cookie, 'stays/roomOptions', {
      stayId: ngozi?.id,
      version: ngozi?.version,
    })
    expect(hers.data.sameType.length).toBeGreaterThan(0)
    expect(hers.data.otherTypes).toEqual([])

    // No room holds two stays on a night, and no stay sits in a room out of order.
    const doubled = await t.db.execute(sql`
      select a.id from stays a join stays b on a.room_id = b.room_id and a.id < b.id
        and coalesce(a.room_from, a.arrival) < b.departure
        and coalesce(b.room_from, b.arrival) < a.departure
      where a.organization_id = ${orgId} and a.status in ('confirmed', 'checked_in')
        and b.status in ('confirmed', 'checked_in')`)
    expect(doubled.rows).toEqual([])
    const inOoo = await t.db.execute(sql`
      select s.id from stays s join room_out_of_order o on o.room_id = s.room_id
        and o.status = 'active' and coalesce(s.room_from, s.arrival) < o.back_in_service
        and o.from_date < s.departure
      where s.organization_id = ${orgId} and s.status in ('confirmed', 'checked_in')`)
    expect(inOoo.rows).toEqual([])
    const drift = await t.db.execute(sql`
      select i.id from room_type_inventory i
      left join stays s on s.room_type_id = i.room_type_id and s.status in ('confirmed', 'checked_in')
      left join stay_nights n on n.stay_id = s.id and n.date = i.date
      where i.organization_id = ${orgId}
      group by i.id having i.booked <> count(n.id)`)
    expect(drift.rows).toEqual([])

    const events = await t.db.execute<{ action: string; n: number; exceptions: number }>(sql`
      select action, count(*)::int as n,
        count(*) filter (where after->>'exception' = 'out_of_order' and after->>'liveProperty' = 'true')::int as exceptions
      from audit_events
      where organization_id = ${orgId} and action like 'room.out_of_order%'
      group by action`)
    expect(events.rows).toEqual([{ action: 'room.out_of_order', n: 4, exceptions: 4 }])
    const moved = await t.db.execute<{ reason: string }>(sql`
      select reason from audit_events
      where organization_id = ${orgId} and action = 'stay.room_moved'`)
    expect(moved.rows).toEqual([{ reason: 'Maintenance' }])
    const statuses = await t.db.execute<{ actor_name: string }>(sql`
      select distinct actor_name from audit_events
      where organization_id = ${orgId} and action = 'room.status_changed' and after->>'source' = 'chart'`)
    expect(statuses.rows.map((row) => row.actor_name).sort()).toEqual([
      'Adaeze Okafor',
      'Chiamaka Eze',
      'Grace Akpan',
    ])
  })

  it('puts guests in house, checked in through the service, with registrations encrypted and masked', async () => {
    const [org] = await t.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, options.slug))
    const orgId = org?.id ?? ''
    const today = calendarDateIn('Africa/Lagos')
    const cookie = await signInAs(`chiamaka@kora-${run}.example`)
    const hotels = await t.rpc<{ items: Property[] }>(cookie, 'properties/list', {})
    const vi = hotels.data.items.find((h) => h.name === 'Kora Victoria Island')?.id ?? ''
    const house = await t.rpc<FrontDeskList>(cookie, 'frontDesk/list', {
      propertyId: vi,
      tab: 'in_house',
    })
    expect(house.status).toBe(200)
    const names = house.data.items.map((row) => row.guestName)
    expect(names).toEqual(
      expect.arrayContaining(['Emeka Kalu', 'Claire Dubois', 'Kwame Asante', 'Tobi Ogunleye']),
    )
    expect(house.data.counts.inHouse).toBeGreaterThanOrEqual(20)
    const departures = await t.rpc<FrontDeskList>(cookie, 'frontDesk/list', {
      propertyId: vi,
      tab: 'departures',
    })
    expect(departures.data.items.map((row) => row.guestName)).toContain('Kwame Asante')
    // An arrival waits for Mr Asante's room ("Due out"), and one is in a dirty room.
    const arrivals = await t.rpc<FrontDeskList>(cookie, 'frontDesk/list', {
      propertyId: vi,
      tab: 'arrivals',
    })
    expect(arrivals.data.items.some((row) => row.readiness === 'due_out')).toBe(true)
    expect(arrivals.data.items.some((row) => row.readiness === 'dirty')).toBe(true)
    expect(arrivals.data.counts.checkedInToday).toBeGreaterThanOrEqual(3)
    expect(house.data.items.some((row) => row.waitingForRoom)).toBe(true)
    expect(house.data.items.filter((row) => row.idPhotoMissing)).toHaveLength(1)
    // Tonight adds up: occupied + arriving + not in a room yet = the stays booked over tonight.
    const tonight = house.data.tonight
    const booked = await t.db.execute<{ n: number }>(sql`
      select count(*)::int as n from stays
      where property_id = ${vi} and status in ('confirmed', 'checked_in')
        and arrival <= ${today} and departure > ${today}`)
    expect(tonight.occupied + tonight.arriving + tonight.unassigned).toBe(booked.rows[0]?.n)

    // Mr Kalu: 503 on the nights before the move, 501 from today.
    const kalu = house.data.items.find((row) => row.guestName === 'Emeka Kalu')
    expect(kalu?.room?.number).toBe('501')
    const segments = await t.db.execute<{ number: string; from_date: string; to_date: string }>(sql`
      select r.number, g.from_date::text, g.to_date::text from stay_room_segments g
      join rooms r on r.id = g.room_id where g.stay_id = ${kalu?.stayId ?? ''}`)
    expect(segments.rows).toEqual([
      { number: '503', from_date: addDays(today, -2), to_date: today },
    ])

    // No checked-in stay without a room; ID numbers are ciphertext; no full number in any event.
    const roomless = await t.db.execute(sql`
      select id from stays where organization_id = ${orgId} and status = 'checked_in' and room_id is null`)
    expect(roomless.rows).toEqual([])
    const registrations = await t.db.execute<{
      cipher: string | null
      masked: string | null
      nationality: string
      occupation: string | null
      next_destination: string | null
      visa_type: string | null
    }>(sql`
      select id_number_cipher as cipher, id_number_masked as masked, nationality, occupation,
        next_destination, visa_type from guest_registrations where organization_id = ${orgId}`)
    expect(registrations.rows.length).toBeGreaterThan(20)
    for (const row of registrations.rows) {
      expect(row.cipher).toMatch(/^v1\./)
      expect(row.masked).toMatch(/•/)
      if (row.nationality !== 'NG') {
        expect(row.occupation).toBeTruthy()
        expect(row.next_destination).toBeTruthy()
        expect(row.visa_type).toBeTruthy()
      }
    }
    const leaks = await t.db.execute(sql`
      select id from audit_events where organization_id = ${orgId}
        and (after::text like '%19FR48213%' or after::text like '%22233344455%')`)
    expect(leaks.rows).toEqual([])
    // Mrs Dubois' passport was revealed by Tunde; Femi Ogunleye's check-in was reversed.
    const reveals = await t.db.execute<{ actor_name: string; reason: string }>(sql`
      select actor_name, reason from audit_events
      where organization_id = ${orgId} and action = 'guest.id_revealed'`)
    expect(reveals.rows).toEqual([
      { actor_name: 'Tunde Bello', reason: 'Immigration officer at the desk' },
    ])
    const reversed = await t.db.execute<{ actor_name: string; exception: string }>(sql`
      select actor_name, after->>'exception' as exception from audit_events
      where organization_id = ${orgId} and action = 'stay.check_in_reversed'`)
    expect(reversed.rows).toEqual([{ actor_name: 'Tunde Bello', exception: 'check_in_reversed' }])
    // Mrs Okafor is a returning guest: her October registration is offered at check-in.
    const ngozi = arrivals.data.items.find((row) => row.guestName === 'Ngozi Okafor')
    const prepared = await t.rpc<CheckInPrepare>(cookie, 'checkIn/prepare', {
      stayId: ngozi?.stayId,
    })
    expect(prepared.data.previous?.idNumberMasked).toBe('••••••6612')
    expect(prepared.data.previous?.hotelName).toBe('Kora Ikeja GRA')
    expect(prepared.data.previous?.reusableDocument).not.toBeNull()
    // Chiamaka works only at Victoria Island: the Ikeja stay's own details never reach her.
    expect(Object.keys(prepared.data.previous ?? {}).sort()).toEqual(REUSED_KEYS)
    // The Okoro family fits a Standard Queen with its sofa bed, and 302 is free tonight.
    const stq = await t.db.execute<{ max_adults: number; max_children: number }>(sql`
      select max_adults, max_children from room_types where property_id = ${vi} and code = 'STQ'`)
    expect(stq.rows[0]).toEqual({ max_adults: 2, max_children: 2 })
    const r302 = await t.db.execute(sql`
      select s.id from stays s join rooms r on r.id = s.room_id
      where r.property_id = ${vi} and r.number = '302' and s.status in ('confirmed', 'checked_in')
        and s.arrival < ${addDays(today, 2)} and s.departure > ${today}`)
    expect(r302.rows).toEqual([])
    // Kora Ikeja GRA: Ifeoma's house and Mr Becker.
    const ifeoma = await signInAs(`ifeoma@kora-${run}.example`)
    const theirs = await t.rpc<{ items: Property[] }>(ifeoma, 'properties/list', {})
    const ikeja = theirs.data.items.find((h) => h.name === 'Kora Ikeja GRA')?.id ?? ''
    const ikejaHouse = await t.rpc<FrontDeskList>(ifeoma, 'frontDesk/list', {
      propertyId: ikeja,
      tab: 'in_house',
    })
    expect(ikejaHouse.data.items.map((row) => row.guestName)).toContain('Thomas Becker')
  })

  it("leaves Chiamaka's shift open on Desk 1 with no figures, Desk 2 free, and the three differences", async () => {
    const [org] = await t.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, options.slug))
    const orgId = org?.id ?? ''
    const cookie = await signInAs(`chiamaka@kora-${run}.example`)
    const hotels = await t.rpc<{ items: Property[] }>(cookie, 'properties/list', {})
    const vi = hotels.data.items.find((h) => h.name === 'Kora Victoria Island')?.id ?? ''
    const mine = await t.rpc<MyShift>(cookie, 'cash/myShift', { propertyId: vi })
    expect(mine.data.shift).toMatchObject({
      status: 'open',
      number: 1,
      openingFloat: '50000.00',
      drawer: { name: 'Desk 1' },
      handover: {
        floatLeft: '50000.00',
        difference: '0.00',
        fromShift: { number: 2, memberName: 'Tunde Bello' },
      },
    })
    const blind = /"(expected|counted|lines|totalDifference|cashCounted)"\s*:\s*(?!null)/
    expect(JSON.stringify(mine.data)).not.toMatch(blind)
    expect(
      mine.data.drawers.map((d) => [
        d.name,
        d.busy?.memberName ?? null,
        d.lastClose?.floatKept ?? null,
      ]),
    ).toEqual([
      ['Desk 1', 'Chiamaka Eze', '50000.00'],
      ['Desk 2', null, '20000.00'],
    ])
    const tunde = await signInAs(`tunde@kora-${run}.example`)
    const open = await t.rpc<ShiftDetail>(tunde, 'cash/shifts/get', { id: mine.data.shift?.id })
    expect(JSON.stringify(open.data)).not.toMatch(blind)
    const list = await t.rpc<Page<ShiftRow>>(tunde, 'cash/shifts/list', { propertyId: vi })
    expect(
      list.data.items.map((row) => [
        row.number,
        row.drawerName,
        row.memberName,
        row.status,
        row.totalDifference,
        row.handoverDifference,
        row.approvedBy,
      ]),
    ).toEqual([
      [1, 'Desk 1', 'Chiamaka Eze', 'open', null, '0.00', null],
      [3, 'Desk 2', 'Ibrahim Musa', 'closed', '12500.00', '0.00', 'Tunde Bello'],
      [2, 'Desk 1', 'Tunde Bello', 'closed', '0.00', '2500.00', null],
      [1, 'Desk 1', 'Chiamaka Eze', 'closed', '2500.00', '0.00', null],
    ])
    const exceptions = await t.db.execute<{
      action: string
      stage: string
      actor: string
      reason: string
    }>(sql`
      select action, after->>'stage' as stage, actor_name as actor, reason from audit_events
      where organization_id = ${orgId} and after->>'exception' = 'cash_variance'
        and after->>'liveProperty' = 'true'
      order by created_at, id`)
    expect(exceptions.rows.map((row) => [row.action, row.stage, row.actor])).toEqual([
      ['cashier_shift.closed', 'close', 'Chiamaka Eze'],
      ['cashier_shift.opened', 'handover', 'Tunde Bello'],
      ['cashier_shift.closed', 'close', 'Ibrahim Musa'],
    ])
    const night = list.data.items[1]
    const detail = await t.rpc<ShiftDetail>(tunde, 'cash/shifts/get', { id: night?.id })
    expect(detail.data.shift).toMatchObject({
      status: 'closed',
      floatKept: '20000.00',
      dropNgn: '12500.00',
      dropBagNumber: 'S-2210',
      closeApproval: { name: 'Tunde Bello', method: 'inbox' },
    })
    await expect(
      t.db.execute(
        sql`update cashier_shift_count_lines set counted = 0 where organization_id = ${orgId}`,
      ),
    ).rejects.toMatchObject({ cause: { code: '23001' } })
  })
})
