// Availability, quotes, bookings, the list, the detail and guest search against the test database,
// as the web app drives them (spec: stage-1-availability-and-reservations.md).
import type { AuditEventView, Page, ReservationDetail, ReservationRow } from '@vento/shared'
import { newId } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { roomTypeInventory } from '../db/schema/reservations.ts'
import { switchFeature } from '../features/switches.ts'
import { events, setHotel } from '../finance/testing.ts'
import { limitTo } from '../tenancy/testing.ts'
import { createTestApp } from '../test/harness.ts'
import {
  availabilityOf,
  book,
  COLLINS,
  DAY,
  type KoraBooking,
  koraBooking,
  type Problem,
  quote,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('availability and new reservations', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraBooking
  // Deluxe King, Bed & breakfast, 9–12 Dec, 1 adult: the walkthrough booking.
  let walk: { roomTypeId: string; ratePlanId: string; arrival: string; departure: string }

  beforeAll(async () => {
    k = await koraBooking(t)
    walk = {
      roomTypeId: k.types.dlk.id,
      ratePlanId: k.bb.id,
      arrival: '2026-12-09',
      departure: '2026-12-12',
    }
  })

  const detail = (cookie: string, id: string) =>
    t.rpc<ReservationDetail & Problem>(cookie, 'reservations/get', { id })
  const booked = async (roomTypeId: string, date: string) => {
    const [row] = await t.db
      .select({ booked: roomTypeInventory.booked })
      .from(roomTypeInventory)
      .where(and(eq(roomTypeInventory.roomTypeId, roomTypeId), eq(roomTypeInventory.date, date)))
    return row?.booked ?? 0
  }

  describe('Room & rate', () => {
    it('lists each room type with rooms left per night and its plans priced incl. taxes', async () => {
      const result = await availabilityOf(
        t,
        k.frontDesk.cookie,
        k.vi.id,
        '2026-12-09',
        '2026-12-12',
      )
      expect(result.status).toBe(200)
      expect(result.data.setup).toBe('ready')
      expect(result.data.roomTypes.map((type) => type.name)).toEqual([
        'Standard Queen',
        'Deluxe King',
        'Executive King',
        'Junior Suite',
      ])
      const dlk = result.data.roomTypes.find((type) => type.code === 'DLK')
      expect(dlk?.nights.map((night) => night.left)).toEqual([6, 6, 6])
      const bb = dlk?.plans.find((plan) => plan.code === 'BB')
      expect(bb).toMatchObject({
        derivedLabel: 'BAR + ₦18,000',
        perNightExcl: '168000.00',
        totalIncl: '617400.00',
        varies: false,
      })
      expect(result.data.discountLimit).toBe('12.00')
    })

    it('marks room types that can’t take the party', async () => {
      const result = await availabilityOf(
        t,
        k.frontDesk.cookie,
        k.vi.id,
        '2026-12-09',
        '2026-12-10',
        3,
      )
      const dlk = result.data.roomTypes.find((type) => type.code === 'DLK')
      expect(dlk).toMatchObject({ sellable: false, reason: 'too_many_guests' })
      expect(result.data.roomTypes.find((type) => type.code === 'JRS')?.sellable).toBe(true)
    })

    it('says when a hotel isn’t ready to sell', async () => {
      const result = await availabilityOf(t, k.sade.cookie, k.ikeja.id, '2026-12-09', '2026-12-10')
      expect(result.data.setup).toBe('no_rooms')
    })
  })

  describe('the quote', () => {
    it('prices the walkthrough stay with taxes, deposit, cancellation and the pound equivalent', async () => {
      const result = await quote(t, k.frontDesk.cookie, k.vi.id, walk, { nationality: 'GB' })
      expect(result.status).toBe(200)
      expect(result.data.totals.total).toBe('617400.00')
      expect(result.data.totals.lines.map((line) => [line.name, line.amount])).toEqual([
        ['Service charge', '50400.00'],
        ['VAT', '37800.00'],
        ['Lagos consumption tax', '25200.00'],
      ])
      expect(result.data.deposit?.amount).toBe('205800.00')
      expect(result.data.cancellation).toMatchObject({
        kind: 'free_until',
        deadline: '2026-12-07T13:00:00.000Z',
        penalty: '205800.00',
      })
      expect(result.data.fx?.text).toBe('≈ £316.62 at ₦1,950/£, CBN, 25 Nov 2026')
    })

    it('checks a discount against the member’s limit', async () => {
      const ten = await quote(t, k.frontDesk.cookie, k.vi.id, {
        ...walk,
        discount: { kind: 'percent', value: '10', reason: 'repeat_guest' },
      })
      expect(ten.data.totals.total).toBe('555660.00')
      expect(ten.data.deposit?.amount).toBe('185220.00')
      expect(ten.data.discount).toEqual({ percent: '10', limit: '12.00', within: true })
      const fifteen = await quote(t, k.frontDesk.cookie, k.vi.id, {
        ...walk,
        discount: { kind: 'percent', value: '15', reason: 'repeat_guest' },
      })
      expect(fifteen.data.discount?.within).toBe(false)
    })

    it('refuses a hotel whose taxes aren’t set up', async () => {
      await setHotel(t, k.ph.id, { businessDate: DAY })
      const result = await quote(t, k.owner.cookie, k.ikeja.id, walk)
      expect(result.status).toBe(404)
    })
  })

  describe('booking', () => {
    let id: string
    let number: string

    it('books the walkthrough stay and takes one room off each night', async () => {
      const result = await book(t, k.frontDesk.cookie, k.vi.id, [walk], {
        notes: 'Quiet room, late arrival around 22:00.',
      })
      expect(result.status).toBe(200)
      expect(result.data.number).toBe('VI-2611-0001')
      id = result.data.id
      number = result.data.number
      for (const date of ['2026-12-09', '2026-12-10', '2026-12-11']) {
        expect(await booked(k.types.dlk.id, date)).toBe(1)
      }
      expect(await booked(k.types.dlk.id, '2026-12-12')).toBe(0)
      const after = await availabilityOf(t, k.frontDesk.cookie, k.vi.id, '2026-12-09', '2026-12-12')
      expect(after.data.roomTypes.find((type) => type.code === 'DLK')?.nights[2]?.left).toBe(5)
    })

    it('stores plan and sold prices and terms that later rate changes don’t touch', async () => {
      await t.rpc(k.gm.cookie, 'rates/setDates', {
        ratePlanId: k.bar.id,
        batchId: newId(),
        roomTypeIds: [k.types.dlk.id],
        from: '2026-12-09',
        to: '2026-12-11',
        prices: [{ roomTypeId: k.types.dlk.id, price: '157000' }],
      })
      const result = await detail(k.frontDesk.cookie, id)
      expect(result.status).toBe(200)
      const [stay] = result.data.stays
      expect(stay?.nights.map((night) => [night.planPrice, night.soldPrice])).toEqual([
        ['168000.00', '168000.00'],
        ['168000.00', '168000.00'],
        ['168000.00', '168000.00'],
      ])
      expect(stay?.totals.total).toBe('617400.00')
      expect(stay?.terms).toMatchObject({ planName: 'Bed & breakfast', mealAllocation: '18000.00' })
      expect(result.data).toMatchObject({
        number,
        status: 'confirmed',
        source: 'phone',
        guarantee: 'deposit',
        depositDue: { amount: '205800.00' },
        bookedByName: 'Chiamaka Eze',
        notes: 'Quiet room, late arrival around 22:00.',
        guest: { firstName: 'Sarah', phone: '+447700900123', nationality: 'GB' },
      })
      expect(result.data.activity.map((entry) => entry.title)).toContain('Reservation created')
    })

    it('refuses a booking whose price changed since the quote, saving nothing', async () => {
      const quoted = await quote(t, k.frontDesk.cookie, k.vi.id, { ...walk, ratePlanId: k.bar.id })
      await t.rpc(k.gm.cookie, 'rates/setDates', {
        ratePlanId: k.bar.id,
        batchId: newId(),
        roomTypeIds: [k.types.dlk.id],
        from: '2026-12-09',
        to: '2026-12-11',
        prices: [{ roomTypeId: k.types.dlk.id, price: '175000' }],
      })
      const before = await booked(k.types.dlk.id, '2026-12-09')
      const result = await t.rpc<Problem>(k.frontDesk.cookie, 'reservations/create', {
        idempotencyKey: newId(),
        propertyId: k.vi.id,
        guest: COLLINS,
        source: 'phone',
        stays: [
          {
            ...walk,
            ratePlanId: k.bar.id,
            adults: 1,
            children: 0,
            quoteHash: quoted.data.quoteHash,
          },
        ],
      })
      expect(result.status).toBe(409)
      expect(result.data.data?.code).toBe('PRICE_CHANGED')
      expect(result.data.message).toBe(
        'The price changed since you quoted it: Best available is now ₦175,000.00 a night. Check the new total with the guest and book again.',
      )
      expect(await booked(k.types.dlk.id, '2026-12-09')).toBe(before)
    })

    it('returns the same reservation for a repeated key, and refuses the key on another booking', async () => {
      const key = newId()
      const q = await quote(t, k.frontDesk.cookie, k.vi.id, walk)
      const body = {
        idempotencyKey: key,
        propertyId: k.vi.id,
        guest: COLLINS,
        source: 'whatsapp',
        stays: [{ ...walk, adults: 1, children: 0, quoteHash: q.data.quoteHash }],
      }
      const [a, b] = await Promise.all([
        t.rpc<{ id: string }>(k.frontDesk.cookie, 'reservations/create', body),
        t.rpc<{ id: string }>(k.frontDesk.cookie, 'reservations/create', body),
      ])
      expect(a.status).toBe(200)
      expect(b.data.id).toBe(a.data.id)
      const other = await t.rpc<Problem>(k.frontDesk.cookie, 'reservations/create', {
        ...body,
        source: 'email',
      })
      expect(other.data.data?.code).toBe('IDEMPOTENCY_CONFLICT')
    })

    it('fixes the booking prefix once the hotel has a reservation', async () => {
      const hotel = await t.rpc<{ version: number; bookingPrefixLocked: boolean }>(
        k.owner.cookie,
        'properties/get',
        { id: k.vi.id },
      )
      expect(hotel.data.bookingPrefixLocked).toBe(true)
      const result = await t.rpc<Problem>(k.owner.cookie, 'properties/update', {
        id: k.vi.id,
        version: hotel.data.version,
        bookingPrefix: 'KVI',
      })
      expect(result.data.data?.code).toBe('BOOKING_PREFIX_LOCKED')
    })
  })

  describe('discounts', () => {
    const stay = () => ({ ...walk, arrival: '2026-12-20', departure: '2026-12-21' })

    it('books 12% within the front desk limit and records it for the owner', async () => {
      const result = await book(t, k.frontDesk.cookie, k.vi.id, [
        { ...stay(), discount: { kind: 'percent', value: '12', reason: 'repeat_guest' } },
      ])
      expect(result.status).toBe(200)
      const found = (await events(t, k.owner, {
        entityType: 'reservation',
        entityId: result.data.id,
      })) as AuditEventView[]
      const discount = found.find((event) => event.action === 'stay.discount_applied')
      expect(discount?.reason).toBe('Repeat guest')
      expect(discount?.after).toMatchObject({
        percent: '12',
        limit: '12.00',
        exception: 'discount',
        approverMemberId: null,
        liveProperty: false,
      })
      const view = await detail(k.owner.cookie, result.data.id)
      expect(view.data.stays[0]?.discount).toMatchObject({ percent: '12', byName: 'Chiamaka Eze' })
    })

    it('refuses 12.01% for the front desk but not for the owner', async () => {
      const over = await book(t, k.frontDesk.cookie, k.vi.id, [
        { ...stay(), discount: { kind: 'percent', value: '12.01', reason: 'repeat_guest' } },
      ])
      expect(over.status).toBe(403)
      expect(over.data.data).toMatchObject({ code: 'DISCOUNT_OVER_LIMIT', requested: '12.01' })
      const owner = await book(t, k.owner.cookie, k.vi.id, [
        { ...stay(), discount: { kind: 'percent', value: '40', reason: 'service_recovery' } },
      ])
      expect(owner.status).toBe(200)
    })

    it('refuses a rate above the plan, a free night and one below breakfast', async () => {
      for (const [value, code] of [
        ['200000', 'DISCOUNT_ABOVE_PLAN'],
        ['0', 'DISCOUNT_ZERO'],
        ['15000', 'DISCOUNT_BELOW_MEAL'],
      ] as const) {
        const result = await quote(t, k.owner.cookie, k.vi.id, {
          ...stay(),
          discount: { kind: 'rate', value, reason: 'long_stay' },
        })
        expect(result.data.data?.code).toBe(code)
      }
    })
  })

  describe('restrictions and dates', () => {
    it('asks for a reason to book through a min stay, then records it', async () => {
      await t.rpc(k.gm.cookie, 'rates/setDates', {
        ratePlanId: k.bar.id,
        batchId: newId(),
        roomTypeIds: [k.types.stq.id],
        from: '2026-12-05',
        to: '2026-12-05',
        minStay: 2,
      })
      const stay = {
        roomTypeId: k.types.stq.id,
        ratePlanId: k.bar.id,
        arrival: '2026-12-05',
        departure: '2026-12-06',
      }
      const missing = await book(t, k.sade.cookie, k.vi.id, [stay])
      expect(missing.data.data?.code).toBe('RESTRICTION_REASON_REQUIRED')
      expect(missing.data.message).toBe('Give a reason for booking through the min stay.')
      const ok = await book(t, k.sade.cookie, k.vi.id, [stay], {
        restrictionReason: 'Guest leaving Saturday for a wedding',
      })
      expect(ok.status).toBe(200)
      const view = await detail(k.sade.cookie, ok.data.id)
      expect(view.data.activity.map((entry) => entry.title)).toContain('Booked through min stay')
    })

    it('refuses an arrival before the business date', async () => {
      const result = await quote(t, k.frontDesk.cookie, k.vi.id, {
        ...walk,
        arrival: '2026-11-24',
        departure: '2026-11-26',
      })
      expect(result.data.data?.code).toBe('PAST_DATE')
    })
  })

  describe('the list', () => {
    it('finds a reservation by name, number ending and phone', async () => {
      for (const q of ['collins', '0001', '+44 7700']) {
        const page = await t.rpc<Page<ReservationRow>>(k.frontDesk.cookie, 'reservations/list', {
          propertyId: k.vi.id,
          q,
          view: 'all',
        })
        expect(page.status).toBe(200)
        expect(page.data.items.some((row) => row.number === 'VI-2611-0001')).toBe(true)
      }
    })

    it('shows bookings taken today and lets finance read but not book', async () => {
      const today = await t.rpc<Page<ReservationRow>>(k.finance.cookie, 'reservations/list', {
        view: 'booked_today',
      })
      expect(today.status).toBe(200)
      expect(today.data.total).toBeGreaterThan(0)
      expect(today.data.items[0]).toMatchObject({
        propertyName: 'Kora Victoria Island',
        foreign: true,
      })
      const create = await book(t, k.finance.cookie, k.vi.id, [walk])
      expect(create.status).toBe(403)
    })

    it('keeps reservations from cashiers', async () => {
      const result = await t.rpc<Problem>(k.cashier.cookie, 'reservations/list', {})
      expect(result.status).toBe(403)
      expect(result.data.message).toBe("You don't have access to reservations. Ask your GM.")
    })
  })

  describe('isolation and scope', () => {
    it('never shows another group’s reservations or guests', async () => {
      const page = await t.rpc<Page<ReservationRow>>(k.frontDesk.cookie, 'reservations/list', {})
      const id = page.data.items[0]?.id ?? ''
      const other = await detail(k.other.cookie, id)
      expect(other.status).toBe(404)
      const guests = await t.rpc<unknown[]>(k.other.cookie, 'guests/search', { q: 'collins' })
      expect(guests.data).toEqual([])
      const ours = await t.rpc<{ maskedPhone: string }[]>(k.frontDesk.cookie, 'guests/search', {
        q: 'collins',
      })
      expect(ours.data[0]?.maskedPhone).toBe('+44 770 ••• 0123')
    })

    it('keeps a member to their hotels', async () => {
      const page = await t.rpc<Page<ReservationRow>>(k.owner.cookie, 'reservations/list', {})
      const id = page.data.items[0]?.id ?? ''
      await limitTo(t, k.owner, k.sade, [k.ikeja.id])
      try {
        const one = await detail(k.sade.cookie, id)
        expect(one.data.data?.code).toBe('PROPERTY_NOT_FOUND')
        const list = await t.rpc<Problem>(k.sade.cookie, 'reservations/list', {
          propertyId: k.vi.id,
        })
        expect(list.data.data?.code).toBe('PROPERTY_NOT_FOUND')
        const all = await t.rpc<Page<ReservationRow>>(k.sade.cookie, 'reservations/list', {})
        expect(all.data.total).toBe(0)
        const booking = await book(t, k.sade.cookie, k.vi.id, [walk])
        expect(booking.data.data?.code).toBe('PROPERTY_NOT_FOUND')
      } finally {
        await limitTo(t, k.owner, k.sade, [k.vi.id, k.ikeja.id])
      }
    })

    it('answers FEATURE_OFF when front desk is switched off', async () => {
      await switchFeature(t.db, k.orgId, { feature: 'front_desk', to: 'off', reason: 'Test' })
      try {
        const result = await t.rpc<Problem>(k.frontDesk.cookie, 'reservations/list', {})
        expect(result.data.data?.code).toBe('FEATURE_OFF')
      } finally {
        await switchFeature(t.db, k.orgId, { feature: 'front_desk', to: 'on', reason: 'Test' })
      }
    })
  })

  describe('guest data (NDPA)', () => {
    it('searches with masked contact details only', async () => {
      const found = await t.rpc<Record<string, unknown>[]>(k.frontDesk.cookie, 'guests/search', {
        q: 'collins',
      })
      expect(found.data[0]).not.toHaveProperty('phone')
      expect(found.data[0]).not.toHaveProperty('email')
      expect(found.data[0]).toMatchObject({ maskedPhone: '+44 770 ••• 0123' })
    })

    it('keeps contact details masked in audit events, and takes only typed corrections', async () => {
      const [match] = (
        await t.rpc<{ id: string }[]>(k.frontDesk.cookie, 'guests/search', { q: 'collins' })
      ).data
      const result = await book(
        t,
        k.frontDesk.cookie,
        k.vi.id,
        [{ ...walk, arrival: '2026-12-22', departure: '2026-12-24' }],
        {
          guest: {
            kind: 'existing',
            id: match?.id ?? '',
            corrections: { email: 'sarah.collins@example.com', phone: '' },
          },
        },
      )
      expect(result.status).toBe(200)
      const guestEvents = (await events(t, k.owner, {
        entityType: 'guest',
        entityId: match?.id,
      })) as AuditEventView[]
      const changed = guestEvents.find((event) => event.action === 'guest.changed')
      expect(changed?.after).toMatchObject({ fields: ['email'], email: 's•••@example.com' })
      const created = guestEvents.find((event) => event.action === 'guest.created')
      expect(created?.after).toMatchObject({ phone: '+44 770 ••• 0123' })
      expect(JSON.stringify(guestEvents)).not.toContain('900123')
      const view = await detail(k.frontDesk.cookie, result.data.id)
      expect(view.data.guest).toMatchObject({
        phone: '+447700900123',
        email: 'sarah.collins@example.com',
      })
    })
  })

  describe('idempotency and scope', () => {
    it('never replays a booking at a hotel outside the member’s access', async () => {
      const key = newId()
      const q = await quote(t, k.frontDesk.cookie, k.vi.id, walk)
      const body = {
        idempotencyKey: key,
        propertyId: k.vi.id,
        guest: COLLINS,
        source: 'phone',
        stays: [{ ...walk, adults: 1, children: 0, quoteHash: q.data.quoteHash }],
      }
      const first = await t.rpc<{ id: string }>(k.frontDesk.cookie, 'reservations/create', body)
      expect(first.status).toBe(200)
      await limitTo(t, k.owner, k.sade, [k.ikeja.id])
      try {
        const replay = await t.rpc<Problem & { id?: string }>(
          k.sade.cookie,
          'reservations/create',
          body,
        )
        expect(replay.data.id).toBeUndefined()
        expect(replay.data.data?.code).toBe('PROPERTY_NOT_FOUND')
      } finally {
        await limitTo(t, k.owner, k.sade, [k.vi.id, k.ikeja.id])
      }
    })
  })

  describe('what bookings hold back', () => {
    it('refuses to delete a plan a stay used', async () => {
      await t.rpc(k.gm.cookie, 'ratePlans/archive', { id: k.bb.id })
      const result = await t.rpc<Problem>(k.gm.cookie, 'ratePlans/delete', { id: k.bb.id })
      expect(result.data.data?.code).toBe('HAS_HISTORY')
      await t.rpc(k.gm.cookie, 'ratePlans/restore', { id: k.bb.id })
    })

    it('blocks archiving a hotel with upcoming reservations', async () => {
      const preview = await t.rpc<{ blockers: { code: string; label: string }[] }>(
        k.owner.cookie,
        'properties/archivePreview',
        { id: k.vi.id },
      )
      expect(preview.data.blockers[0]?.code).toBe('UPCOMING_RESERVATIONS')
    })
  })
})
