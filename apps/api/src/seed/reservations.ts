// The demo group's reservations (spec: stage-1-availability-and-reservations.md, "Demo seed"),
// booked through the booking service with its locks, by Chiamaka Eze, Sade Bakare and Tunde Bello
// on earlier business dates. Dates are relative to the seed's business date D:
// - Mr Daniel Mensah, VI-…-0482, Executive King on Acme Energy, D → D+3 (golden thread hop 1);
// - 26 arrivals at Kora Victoria Island on D;
// - Junior Suite 7 of 8 booked on D+15 and 8 of 8 on D+16 (the Adeyemi–Nwosu wedding);
// - Deluxe King 45 of 48 on D+16;
// - one 10% Repeat guest discount by Chiamaka, one min-stay book-through by Sade;
// - the next ten nights 60–80% full, lighter after (about 430 at Kora Victoria Island);
// - about 20 reservations at Kora Ikeja GRA.
// Everything is made up and deterministic (a fixed pseudo-random sequence).
import { ORPCError } from '@orpc/server'
import {
  addDays,
  type DeskSource,
  featuresOn,
  instantAt,
  type MemberRole,
  newId,
  periodOf,
} from '@vento/shared'
import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { ratePlans } from '../db/schema/rates.ts'
import { reservationCounters, reservations } from '../db/schema/reservations.ts'
import { rooms, roomTypes } from '../db/schema/rooms.ts'
import { type Booked, type BookOptions, bookInTx, type CreateInput } from '../reservations/book.ts'
import { type Access, effectiveRules } from '../tenancy/access.ts'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type Person = { userId: string; memberId: string; name: string; role: MemberRole }
type Code = 'STQ' | 'DLK' | 'EXK' | 'JRS'

// A fixed pseudo-random sequence (mulberry32), so every seed is the same.
function sequence(seed: number) {
  let state = seed
  const next = () => {
    state = (state + 0x6d2b79f5) | 0
    let x = Math.imul(state ^ (state >>> 15), 1 | state)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296
  }
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T,
  }
}

const NAMES: [string, string, string, string][] = [
  // title, first, last, nationality
  ['Mrs', 'Funmilayo', 'Adebayo', 'NG'],
  ['Mr', 'Chukwuemeka', 'Obi', 'NG'],
  ['Dr', 'Aisha', 'Bello', 'NG'],
  ['Mr', 'Tobi', 'Ogunleye', 'NG'],
  ['Ms', 'Ngozi', 'Eze', 'NG'],
  ['Chief', 'Babatunde', 'Alade', 'NG'],
  ['Mr', 'Ibrahim', 'Sani', 'NG'],
  ['Mrs', 'Kemi', 'Adeyemi', 'NG'],
  ['Engr', 'Uche', 'Nwosu', 'NG'],
  ['Mr', 'Segun', 'Fashola', 'NG'],
  ['Ms', 'Halima', 'Abubakar', 'NG'],
  ['Barr', 'Ifeoma', 'Okeke', 'NG'],
  ['Mr', 'Kwame', 'Asante', 'GH'],
  ['Ms', 'Amara', 'Diallo', 'SN'],
  ['Mr', 'James', 'Whitfield', 'GB'],
  ['Mrs', 'Claire', 'Dubois', 'FR'],
  ['Mr', 'Thomas', 'Becker', 'DE'],
  ['Ms', 'Priya', 'Raman', 'IN'],
  ['Mr', 'Michael', 'Carter', 'US'],
  ['Mr', 'Wei', 'Zhang', 'CN'],
  ['Alhaji', 'Musa', 'Danjuma', 'NG'],
  ['Mrs', 'Bisi', 'Akande', 'NG'],
  ['Mr', 'Emeka', 'Okafor', 'NG'],
  ['Ms', 'Zainab', 'Lawal', 'NG'],
  ['Prof', 'Olumide', 'Bankole', 'NG'],
  ['Mr', 'Femi', 'Oyelaran', 'NG'],
  ['Mrs', 'Chioma', 'Udeh', 'NG'],
  ['Mr', 'Yusuf', 'Garba', 'NG'],
  ['Ms', 'Tolu', 'Ajayi', 'NG'],
  ['Mr', 'Daniel', 'Kariuki', 'KE'],
  ['Ms', 'Sophie', 'Martin', 'GB'],
  ['Mr', 'Luca', 'Rossi', 'IT'],
  ['Mrs', 'Adaobi', 'Nnamdi', 'NG'],
  ['Mr', 'Kunle', 'Afolabi', 'NG'],
  ['Ms', 'Esther', 'Okon', 'NG'],
  ['Mr', 'Peter', 'Mensah', 'GH'],
  ['Mrs', 'Yetunde', 'Balogun', 'NG'],
  ['Mr', 'Obinna', 'Chukwu', 'NG'],
  ['Ms', 'Hauwa', 'Ibrahim', 'NG'],
  ['Mr', 'Gbenga', 'Adeleke', 'NG'],
]

const SOURCES: DeskSource[] = ['phone', 'phone', 'phone', 'whatsapp', 'whatsapp', 'email', 'direct']

type Planned = {
  propertyId: string
  person: Person
  stay: Omit<CreateInput['stays'][number], 'quoteHash'>
  bookedOn: string
  source?: DeskSource
  notes?: string
  guest?: CreateInput['guest']
}

export type ReservationSeedContext = {
  organizationId: string
  businessDate: string
  hotels: { vi: string; ikeja: string }
  people: { chiamaka: Person; sade: Person; tunde: Person }
}

async function accessFor(tx: Tx, context: ReservationSeedContext, person: Person): Promise<Access> {
  return {
    organizationId: context.organizationId,
    userId: person.userId,
    userName: person.name,
    memberId: person.memberId,
    role: person.role,
    allProperties: false,
    propertyIds: [context.hotels.vi, context.hotels.ikeja],
    rules: await effectiveRules(tx, context.organizationId, person.role),
    features: featuresOn(new Map(), true),
    deviceId: null,
  }
}

async function typesAt(tx: Tx, organizationId: string, propertyId: string) {
  const rows = await tx
    .select({ id: roomTypes.id, code: roomTypes.code })
    .from(roomTypes)
    .where(and(eq(roomTypes.organizationId, organizationId), eq(roomTypes.propertyId, propertyId)))
  const counts = await tx
    .select({ id: rooms.roomTypeId, value: count() })
    .from(rooms)
    .where(
      and(
        inArray(
          rooms.roomTypeId,
          rows.map((row) => row.id),
        ),
        isNull(rooms.archivedAt),
      ),
    )
    .groupBy(rooms.roomTypeId)
  return rows.map((row) => ({
    id: row.id,
    code: row.code as Code,
    rooms: counts.find((c) => c.id === row.id)?.value ?? 0,
  }))
}

async function plansAt(tx: Tx, propertyId: string) {
  const rows = await tx
    .select({ id: ratePlans.id, code: ratePlans.code })
    .from(ratePlans)
    .where(eq(ratePlans.propertyId, propertyId))
  return Object.fromEntries(rows.map((row) => [row.code, row.id])) as Record<string, string>
}

const SKIPPABLE = new Set(['SOLD_OUT', 'RESTRICTION_REASON_REQUIRED', 'TOO_MANY_GUESTS'])

export async function seedReservations(tx: Tx, context: ReservationSeedContext) {
  const random = sequence(20261125)
  const D = context.businessDate
  const { vi, ikeja } = context.hotels
  const { chiamaka, sade, tunde } = context.people
  const access = {
    chiamaka: await accessFor(tx, context, chiamaka),
    sade: await accessFor(tx, context, sade),
    tunde: await accessFor(tx, context, tunde),
  }
  const accessOf = (person: Person) =>
    person === chiamaka ? access.chiamaka : person === sade ? access.sade : access.tunde
  const viTypes = await typesAt(tx, context.organizationId, vi)
  const ikejaTypes = await typesAt(tx, context.organizationId, ikeja)
  const viPlans = await plansAt(tx, vi)
  const ikejaPlans = await plansAt(tx, ikeja)
  const typeOf = (code: Code) => viTypes.find((type) => type.code === code)?.id ?? ''

  // Guests are created on their first booking and picked again after (repeat guests).
  const guestIds = new Map<number, string>()
  let nextGuest = 0
  const guestFor = (index?: number): { choice: CreateInput['guest']; index: number } => {
    const i =
      index ?? (random.next() < 0.25 && nextGuest > 5 ? random.int(0, nextGuest - 1) : nextGuest++)
    const known = guestIds.get(i % NAMES.length)
    if (known) return { choice: { kind: 'existing', id: known }, index: i }
    const [title, firstName, lastName, nationality] = NAMES[
      i % NAMES.length
    ] as (typeof NAMES)[number]
    const n = String(4_560_000 + i * 7919).slice(-7)
    const phone =
      nationality === 'NG' ? `+234803${n}` : nationality === 'GB' ? `+447700${n.slice(-6)}` : null
    return {
      choice: {
        kind: 'new',
        fields: {
          title,
          firstName,
          lastName,
          ...(phone ? { phone } : {}),
          email: `${firstName}.${lastName}@example.com`.toLowerCase(),
          nationality,
        },
      },
      index: i,
    }
  }

  // Rooms sold per room type and night, so the filler stops at each night's target.
  const sold = new Map<string, number>()
  const capOverride = new Map<string, number>()
  const key = (roomTypeId: string, date: string) => `${roomTypeId}:${date}`
  const target = new Map<string, number>()
  const capOf = (type: { id: string; rooms: number }, date: string) => {
    const fixed = capOverride.get(key(type.id, date))
    if (fixed !== undefined) return fixed
    let share = target.get(date)
    if (share === undefined) {
      share = date > addDays(D, 10) ? 0.25 + random.next() * 0.2 : 0.6 + random.next() * 0.2
      target.set(date, share)
    }
    return Math.floor(type.rooms * share)
  }

  let booked = 0
  async function place(planned: Planned, options: BookOptions = {}): Promise<Booked | null> {
    const guest = planned.guest ? { choice: planned.guest, index: -1 } : guestFor()
    const input: CreateInput = {
      idempotencyKey: newId(),
      propertyId: planned.propertyId,
      guest: guest.choice,
      source: planned.source ?? random.pick(SOURCES),
      notes: planned.notes,
      stays: [{ ...planned.stay, quoteHash: 'seed' }],
    }
    const time = `${String(random.int(8, 21)).padStart(2, '0')}:${String(random.int(0, 59)).padStart(2, '0')}`
    try {
      // A savepoint each, so a booking the hotel can't take leaves nothing behind.
      const result = await tx.transaction((savepoint) =>
        bookInTx(savepoint, accessOf(planned.person), input, {
          bookedAt: instantAt(planned.bookedOn, time, 'Africa/Lagos'),
          bookedOnBusinessDate: planned.bookedOn,
          trustQuote: true,
          ...options,
        }),
      )
      if (guest.choice.kind === 'new' && guest.index >= 0) {
        const [row] = await tx
          .select({ guestId: reservations.guestId })
          .from(reservations)
          .where(eq(reservations.id, result.id))
        if (row) guestIds.set(guest.index % NAMES.length, row.guestId)
      }
      for (
        let date = planned.stay.arrival;
        date < planned.stay.departure;
        date = addDays(date, 1)
      ) {
        const k = key(planned.stay.roomTypeId, date)
        sold.set(k, (sold.get(k) ?? 0) + 1)
      }
      booked++
      return result
    } catch (error) {
      const code = error instanceof ORPCError ? (error.data as { code?: string })?.code : undefined
      if (code && SKIPPABLE.has(code)) return null
      throw error
    }
  }

  const bookedBefore = (arrival: string) => {
    const lead = random.int(0, 14)
    const on = addDays(D, -lead)
    return on > arrival ? D : on
  }
  const stayOn = (code: Code, plan: string, arrival: string, nights: number, adults = 1) => ({
    roomTypeId: typeOf(code),
    ratePlanId: viPlans[plan] ?? '',
    arrival,
    departure: addDays(arrival, nights),
    adults,
    children: 0,
  })

  // Mr Daniel Mensah first, on Acme's corporate rate, numbered 0482 in his booking month.
  await tx.insert(reservationCounters).values({
    organizationId: context.organizationId,
    propertyId: vi,
    period: periodOf(addDays(D, -7)),
    last: 481,
  })
  await place(
    {
      propertyId: vi,
      person: tunde,
      stay: stayOn('EXK', 'ACME', D, 3),
      bookedOn: addDays(D, -7),
      source: 'email',
      notes: 'Quiet room',
      guest: {
        kind: 'new',
        fields: {
          title: 'Mr',
          firstName: 'Daniel',
          lastName: 'Mensah',
          phone: '+233244123456',
          email: 'daniel.mensah@acme-energy.example',
          nationality: 'GH',
        },
      },
    },
    { allowCorporate: true },
  )

  // The Adeyemi–Nwosu wedding: Junior Suite 7 of 8 on D+15, 8 of 8 on D+16.
  const wedding = 'Adeyemi–Nwosu wedding'
  for (let i = 0; i < 8; i++) {
    const arrival = i < 7 ? addDays(D, 15) : addDays(D, 16)
    await place({
      propertyId: vi,
      person: sade,
      stay: {
        ...stayOn('JRS', 'BB', arrival, i < 7 ? 2 : 1, 2),
        restrictionReason: 'Wedding party',
      },
      bookedOn: addDays(D, -random.int(3, 20)),
      source: 'email',
      notes: wedding,
    })
  }
  capOverride.set(key(typeOf('JRS'), addDays(D, 15)), 7)
  capOverride.set(key(typeOf('JRS'), addDays(D, 16)), 8)

  // Deluxe King 45 of 48 on D+16.
  for (let i = 0; i < 45; i++) {
    const arrival = addDays(D, 16 - (i % 3))
    const nights = (i % 3) + 1 + (i % 2)
    await place({
      propertyId: vi,
      person: random.pick([chiamaka, sade, tunde]),
      stay: {
        ...stayOn('DLK', random.pick(['BAR', 'BB', 'BB', 'NRF']), arrival, nights),
        restrictionReason: 'Festive group rate agreed by the GM',
      },
      bookedOn: bookedBefore(arrival),
    })
  }
  capOverride.set(key(typeOf('DLK'), addDays(D, 16)), 45)

  // One 10% Repeat guest discount by Chiamaka.
  await place({
    propertyId: vi,
    person: chiamaka,
    stay: {
      ...stayOn('DLK', 'BB', addDays(D, 3), 2),
      discount: { kind: 'percent', value: '10', reason: 'repeat_guest' },
    },
    bookedOn: addDays(D, -2),
    source: 'phone',
  })

  // Sade books through a min stay with a reason, on the first restricted night ahead (Sat 5 Dec or
  // the Festive season, as seeded by the rates seed).
  const restricted = ['2026-12-05', '2026-12-18'].find((date) => date >= addDays(D, 1))
  if (restricted) {
    await place({
      propertyId: vi,
      person: sade,
      stay: {
        ...stayOn('STQ', 'BAR', restricted, 1),
        restrictionReason: 'Guest leaving Saturday for a wedding',
      },
      bookedOn: addDays(D, -1),
      source: 'whatsapp',
    })
  }

  // 26 arrivals on D in all (Mensah's included).
  const fits = (type: { id: string; rooms: number }, arrival: string, nights: number) => {
    for (let i = 0; i < nights; i++) {
      const date = addDays(arrival, i)
      if ((sold.get(key(type.id, date)) ?? 0) + 1 > capOf(type, date)) return false
    }
    return true
  }
  let arrivalsToday = 1
  for (let attempt = 0; arrivalsToday < 26 && attempt < 200; attempt++) {
    const type = random.pick(viTypes)
    const nights = random.int(1, 4)
    if (!fits(type, D, nights)) continue
    const made = await place({
      propertyId: vi,
      person: random.pick([chiamaka, chiamaka, sade, tunde]),
      stay: stayOn(
        type.code,
        random.pick(['BAR', 'BAR', 'BB', 'BB', 'NRF']),
        D,
        nights,
        random.int(1, 2),
      ),
      bookedOn: bookedBefore(D),
    })
    if (made) arrivalsToday++
  }

  // Fill the month: the next ten nights 60–80% full, lighter after. Most bookings are for the
  // coming days, as at a city hotel; nobody is in house yet (check-in is brick 8).
  for (let attempt = 0; booked < 430 && attempt < 4000; attempt++) {
    const type = random.pick(viTypes)
    const soon = random.next() < 0.75
    const arrival = addDays(D, soon ? random.int(1, 9) : random.int(10, 30))
    const nights = random.int(1, soon ? 6 : 4)
    if (!fits(type, arrival, nights)) continue
    await place({
      propertyId: vi,
      person: random.pick([chiamaka, chiamaka, chiamaka, sade, tunde]),
      stay: stayOn(
        type.code,
        random.pick(['BAR', 'BAR', 'BB', 'BB', 'NRF']),
        arrival,
        nights,
        random.int(1, 2),
      ),
      bookedOn: bookedBefore(arrival),
    })
  }

  // About 20 at Kora Ikeja GRA, by Sade.
  let ikejaBooked = 0
  for (let attempt = 0; ikejaBooked < 20 && attempt < 60; attempt++) {
    const type = random.pick(ikejaTypes)
    const arrival = addDays(D, random.int(0, 20))
    const made = await place({
      propertyId: ikeja,
      person: sade,
      stay: {
        roomTypeId: type.id,
        ratePlanId: ikejaPlans[random.pick(['BAR', 'BB'])] ?? '',
        arrival,
        departure: addDays(arrival, random.int(1, 3)),
        adults: 1,
        children: 0,
      },
      bookedOn: bookedBefore(arrival),
    })
    if (made) ikejaBooked++
  }
  return booked
}
