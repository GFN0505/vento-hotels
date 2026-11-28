// The demo house on the business date D (spec: stage-1-front-desk-check-in.md, "Demo seed"), made
// through the check-in service for the named guests (each on its own business date, as the tape
// chart seed does) and written in bulk for the rest of the house, so the demo loads quickly.
// - Kora Victoria Island: in house on D (arrived D−3 to D−1, some leaving today: Departures), Mrs
//   Claire Dubois (French, passport and business visa, ID photo on file, revealed by Tunde at 09:05
//   for an immigration officer), Mr Kwame Asante (Ghanaian, ECOWAS, Not required, due out today from
//   a room an arrival is waiting for), Mr Tobi Ogunleye (checked in on his brother's booking on D−1 at
//   16:02 by Chiamaka, reversed by Tunde, his own booking checked in at 16:25); Mr Emeka Kalu comes
//   from the tape chart seed (in house since D−2, moved 503 → 501 on D). Three early arrivals
//   checked in on D, one into a dirty room (Waiting for room), one by Tunde without the ID photo
//   (ID photo to add). Mrs Ngozi Okafor stayed at Kora Ikeja GRA in October (NIN registration and ID
//   photo on file, written as checked out until check-out exists), so her check-in reuses them.
// - Kora Ikeja GRA: in house, checked in by Ifeoma Nnadi; Mr Thomas Becker (German, business visa).
// ID photos are small generated placeholders (nothing real), written to the private bucket after
// the transaction. The rest of the house was registered in bulk, without photos.
import { createHash } from 'node:crypto'
import {
  addDays,
  type CreateReservationInput,
  createReservationSchema,
  instantAt,
  maskIdNumber,
  newId,
  nightsBetween,
  type RegistrationInput,
  registrationCardNumber,
} from '@vento/shared'
import { and, eq, gt, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { type AuditEvent, recordAuditMany } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import {
  guestIdDocuments,
  guestRegistrations,
  registrationCardCounters,
  stayRoomSegments,
} from '../db/schema/front-desk.ts'
import { ratePlans } from '../db/schema/rates.ts'
import { reservations, roomTypeInventory, stays } from '../db/schema/reservations.ts'
import { roomOutOfOrder, rooms, roomTypes } from '../db/schema/rooms.ts'
import { properties } from '../db/schema/tenancy.ts'
import { currentKeyId, encryptId } from '../guests/registration/crypto.ts'
import { revealNumber } from '../guests/registration/service.ts'
import type { StorageProvider } from '../providers/storage.ts'
import { assignRoom } from '../reservations/assign/assign.ts'
import { bookInTx } from '../reservations/book.ts'
import { checkIn } from '../reservations/check-in/check-in.ts'
import { reverseCheckIn } from '../reservations/check-in/undo.ts'
import { pngFromPixels } from '../storage/png.ts'
import type { Access } from '../tenancy/access.ts'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

// A placeholder ID card: a green band, a grey photo box and lines, 320 × 200. Nothing real.
export function placeholderIdCard(): Uint8Array {
  return pngFromPixels(320, 200, (x, y) => {
    if (y < 34) return [14, 77, 61]
    if (x >= 20 && x < 100 && y >= 52 && y < 160) return [190, 196, 200]
    if (x >= 120 && x < 300 && (y - 60) % 22 < 6 && y < 160) return [214, 218, 222]
    return [246, 247, 248]
  })
}

export type PendingFile = { key: string; bytes: Uint8Array }

// An ID document row for a demo guest, pending until a check-in names it; its file is written to
// the private bucket after the seed's transaction (`files`).
export async function seedIdDocument(
  tx: Tx,
  who: Access,
  propertyId: string,
  files: PendingFile[],
): Promise<string> {
  const id = newId()
  const bytes = placeholderIdCard()
  const key = `guest-ids/${who.organizationId}/${propertyId}/${id}.png`
  await tx.insert(guestIdDocuments).values({
    id,
    organizationId: who.organizationId,
    propertyId,
    storageKey: key,
    contentType: 'image/png',
    byteSize: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    source: 'camera',
    byMemberId: who.memberId,
    byName: who.userName,
  })
  files.push({ key, bytes })
  return id
}

export const nigerian = (
  guest: { firstName: string; lastName: string; title?: string },
  nin: string,
  address: { line: string; city: string; region: string },
): RegistrationInput => ({
  lead: true,
  ...guest,
  nationality: 'NG',
  addressLine: address.line,
  addressCity: address.city,
  addressRegion: address.region,
  addressCountry: 'NG',
  idType: 'nin',
  idNumber: nin,
  purpose: 'business',
})

// One named check-in through the service, by `who`, on the hotel's business date `date` at `time`.
export async function checkInNamed(
  tx: Tx,
  context: { propertyId: string; restoreTo: string },
  ask: {
    who: Access
    stay: { id: string; version: number }
    roomId: string
    date: string
    time: string
    registration: RegistrationInput
    documentId: string | null
    skipReason?: string
  },
) {
  await tx
    .update(properties)
    .set({ businessDate: ask.date })
    .where(eq(properties.id, context.propertyId))
  try {
    const at = instantAt(ask.date, ask.time, 'Africa/Lagos')
    return await checkIn(
      { db: tx as unknown as Database },
      ask.who,
      {
        idempotencyKey: newId(),
        stayId: ask.stay.id,
        version: ask.stay.version,
        roomId: ask.roomId,
        registrations: [ask.registration],
        idDocument: ask.documentId
          ? { kind: 'uploaded', documentId: ask.documentId }
          : { kind: 'skip', reason: ask.skipReason ?? 'Camera not working' },
        printCard: true,
        occurredAt: at.toISOString(),
        businessDate: ask.date,
        durationSeconds: 70,
        source: 'arrivals',
      },
      { at },
    )
  } finally {
    await tx
      .update(properties)
      .set({ businessDate: context.restoreTo })
      .where(eq(properties.id, context.propertyId))
  }
}

export type FrontDeskSeedContext = {
  organizationId: string
  businessDate: string
  hotels: { vi: string; ikeja: string }
  access: { chiamaka: Access; ibrahim: Access; tunde: Access; ifeoma: Access }
}

type RoomRow = { id: string; number: string; typeId: string; code: string }

// In house at the hotels on D, the reversal story, the early check-ins and Mrs Okafor's October
// stay. Returns lines for the CLI's "what to try" and the ID photo files to write.
export async function seedFrontDesk(
  tx: Tx,
  context: FrontDeskSeedContext,
): Promise<{ tryToday: string[]; files: PendingFile[] }> {
  const D = context.businessDate
  const { vi, ikeja } = context.hotels
  const { chiamaka, ibrahim, tunde, ifeoma } = context.access
  const files: PendingFile[] = []

  async function on<T>(propertyId: string, date: string, step: () => Promise<T>): Promise<T> {
    await tx.update(properties).set({ businessDate: date }).where(eq(properties.id, propertyId))
    try {
      return await step()
    } finally {
      await tx.update(properties).set({ businessDate: D }).where(eq(properties.id, propertyId))
    }
  }
  async function roomsAt(propertyId: string): Promise<RoomRow[]> {
    const rows = await tx
      .select({
        id: rooms.id,
        number: rooms.number,
        typeId: rooms.roomTypeId,
        code: roomTypes.code,
      })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .where(eq(rooms.propertyId, propertyId))
    return rows.sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true }))
  }
  const plans = async (propertyId: string) =>
    new Map(
      (
        await tx
          .select({ code: ratePlans.code, id: ratePlans.id })
          .from(ratePlans)
          .where(eq(ratePlans.propertyId, propertyId))
      ).map((row) => [row.code, row.id]),
    )

  // Who holds each room when, from what is already booked: stays from their room_from, earlier
  // rooms after a move, and out-of-order periods.
  async function occupancy(propertyId: string) {
    const held = new Map<string, { from: string; to: string }[]>()
    const add = (roomId: string, from: string, to: string) =>
      held.set(roomId, [...(held.get(roomId) ?? []), { from, to }])
    const rows = await tx
      .select({
        roomId: stays.roomId,
        from: sql<string>`coalesce(${stays.roomFrom}, ${stays.arrival})::text`,
        to: stays.departure,
      })
      .from(stays)
      .where(
        and(
          eq(stays.propertyId, propertyId),
          inArray(stays.status, ['confirmed', 'checked_in']),
          isNotNull(stays.roomId),
        ),
      )
    for (const row of rows) if (row.roomId) add(row.roomId, row.from, row.to)
    for (const row of await tx
      .select()
      .from(stayRoomSegments)
      .where(eq(stayRoomSegments.propertyId, propertyId))) {
      add(row.roomId, row.fromDate, row.toDate)
    }
    for (const row of await tx
      .select()
      .from(roomOutOfOrder)
      .where(and(eq(roomOutOfOrder.propertyId, propertyId), eq(roomOutOfOrder.status, 'active')))) {
      add(row.roomId, row.fromDate, row.backInService)
    }
    return {
      free: (roomId: string, from: string, to: string) =>
        !(held.get(roomId) ?? []).some((w) => w.from < to && from < w.to),
      hold: add,
    }
  }

  async function book(ask: {
    propertyId: string
    who: Access
    typeId: string
    planId: string
    arrival: string
    nights: number
    guest: {
      title: string
      firstName: string
      lastName: string
      phone: string
      nationality: string
    }
    bookedOn: string
    adults?: number
  }) {
    const input: CreateReservationInput = {
      idempotencyKey: newId(),
      propertyId: ask.propertyId,
      guest: { kind: 'new', fields: ask.guest },
      source: 'phone',
      stays: [
        {
          roomTypeId: ask.typeId,
          ratePlanId: ask.planId,
          arrival: ask.arrival,
          departure: addDays(ask.arrival, ask.nights),
          adults: ask.adults ?? 1,
          children: 0,
          quoteHash: 'seed',
        },
      ],
    }
    const made = await on(ask.propertyId, ask.arrival, () =>
      tx.transaction((savepoint) =>
        bookInTx(savepoint, ask.who, createReservationSchema.parse(input), {
          bookedAt: instantAt(ask.bookedOn, '10:00', 'Africa/Lagos'),
          bookedOnBusinessDate: ask.bookedOn,
          trustQuote: true,
        }),
      ),
    )
    const [stay] = await tx.select().from(stays).where(eq(stays.reservationId, made.id))
    if (!stay) throw new Error('The demo booking has no stay')
    return { ...made, stay }
  }

  const viRooms = await roomsAt(vi)
  const viPlans = await plans(vi)
  const typeAt = (list: RoomRow[], code: string) => list.find((r) => r.code === code)?.typeId ?? ''
  const roomNo = (list: RoomRow[], number: string) => {
    const found = list.find((r) => r.number === number)
    if (!found) throw new Error(`The demo needs room ${number}`)
    return found
  }
  const viOcc = await occupancy(vi)
  const freeRoom = (
    list: RoomRow[],
    occ: typeof viOcc,
    code: string,
    from: string,
    to: string,
    skip: string[] = [],
  ) => {
    const room = list.find(
      (r) => r.code === code && !skip.includes(r.number) && occ.free(r.id, from, to),
    )
    if (room) occ.hold(room.id, from, to)
    return room
  }
  const bar = viPlans.get('BAR') ?? ''
  const bb = viPlans.get('BB') ?? ''
  // Rooms the walkthroughs and browser tests use: kept out of the bulk house.
  const keep = ['302', '401', '408', '506', '501', '503', '502', '404', '402', '406', '514', '1104']

  // --- Named in-house guests at Kora Victoria Island ---------------------------------------------

  // Mrs Claire Dubois, French, D−1 → D+1, Deluxe King, booked on D−10; checked in by Chiamaka on D−1.
  const dubois = await book({
    propertyId: vi,
    who: chiamaka,
    typeId: typeAt(viRooms, 'DLK'),
    planId: bb,
    arrival: addDays(D, -1),
    nights: 2,
    guest: {
      title: 'Mrs',
      firstName: 'Claire',
      lastName: 'Dubois',
      phone: '+33612345678',
      nationality: 'FR',
    },
    bookedOn: addDays(D, -10),
  })
  const duboisRoom = freeRoom(viRooms, viOcc, 'DLK', addDays(D, -1), addDays(D, 1), keep)
  if (!duboisRoom) throw new Error('The demo needs a Deluxe King for Mrs Dubois')
  const duboisDone = await checkInNamed(
    tx,
    { propertyId: vi, restoreTo: D },
    {
      who: chiamaka,
      stay: dubois.stay,
      roomId: duboisRoom.id,
      date: addDays(D, -1),
      time: '15:40',
      registration: {
        lead: true,
        title: 'Mrs',
        firstName: 'Claire',
        lastName: 'Dubois',
        nationality: 'FR',
        addressLine: '18 rue de Rivoli',
        addressCity: 'Paris',
        addressCountry: 'FR',
        purpose: 'business',
        occupation: 'Engineer',
        idType: 'passport',
        idNumber: '19FR48213',
        idCountry: 'FR',
        idExpiry: '2031-06-30',
        visaType: 'business',
        visaNumber: 'NGB4471209',
        visaValidUntil: '2027-02-01',
        entryDate: addDays(D, -1),
        portOfEntry: 'lagos_mmia',
        arrivingFrom: 'Paris',
        nextDestination: 'Abuja',
      },
      documentId: await seedIdDocument(tx, chiamaka, vi, files),
    },
  )
  // Tunde revealed her passport number on D at 09:05 for an immigration officer.
  const duboisRegistration = duboisDone.registrations[0]?.id
  if (duboisRegistration) {
    await revealNumber(tx as unknown as Database, tunde, {
      registrationId: duboisRegistration,
      which: 'id',
      reason: 'Immigration officer at the desk',
    })
  }

  // Mr Kwame Asante, Ghanaian (ECOWAS, visa Not required), D−3 → D, due out today from the room an
  // arrival today is waiting for.
  const [waiting] = await tx
    .select({ roomId: stays.roomId, number: rooms.number, code: roomTypes.code })
    .from(stays)
    .innerJoin(rooms, eq(rooms.id, stays.roomId))
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(
      and(
        eq(stays.propertyId, vi),
        eq(stays.status, 'confirmed'),
        eq(stays.arrival, D),
        eq(roomTypes.code, 'DLK'),
        sql`${rooms.number} not in ('404', '401', '408', '402')`,
      ),
    )
    .orderBy(rooms.number)
    .limit(1)
  const asanteRoom =
    waiting?.roomId && viOcc.free(waiting.roomId, addDays(D, -3), D) ? waiting : null
  const asante = await book({
    propertyId: vi,
    who: chiamaka,
    typeId: typeAt(viRooms, 'DLK'),
    planId: bar,
    arrival: addDays(D, -3),
    nights: 3,
    guest: {
      title: 'Mr',
      firstName: 'Kwame',
      lastName: 'Asante',
      phone: '+233244123456',
      nationality: 'GH',
    },
    bookedOn: addDays(D, -8),
  })
  const asanteTarget =
    (asanteRoom?.roomId ? { id: asanteRoom.roomId, number: asanteRoom.number } : null) ??
    freeRoom(viRooms, viOcc, 'DLK', addDays(D, -3), D, keep)
  if (!asanteTarget) throw new Error('The demo needs a room for Mr Asante')
  viOcc.hold(asanteTarget.id, addDays(D, -3), D)
  await checkInNamed(
    tx,
    { propertyId: vi, restoreTo: D },
    {
      who: ibrahim,
      stay: asante.stay,
      roomId: asanteTarget.id,
      date: addDays(D, -3),
      time: '21:10',
      registration: {
        lead: true,
        title: 'Mr',
        firstName: 'Kwame',
        lastName: 'Asante',
        nationality: 'GH',
        addressLine: '7 Oxford Street, Osu',
        addressCity: 'Accra',
        addressCountry: 'GH',
        purpose: 'business',
        occupation: 'Trader',
        idType: 'passport',
        idNumber: 'G2290412',
        idCountry: 'GH',
        idExpiry: '2029-09-14',
        visaType: 'not_required',
        entryDate: addDays(D, -3),
        portOfEntry: 'seme',
        arrivingFrom: 'Accra',
        nextDestination: 'Accra',
      },
      documentId: await seedIdDocument(tx, ibrahim, vi, files),
    },
  )

  // D−1, 16:02: Chiamaka checks Mr Tobi Ogunleye in on his brother's booking in 307; 16:20 Tunde
  // reverses it (Wrong booking); 16:25 Tobi's own booking goes into 307.
  const brother = await book({
    propertyId: vi,
    who: chiamaka,
    typeId: typeAt(viRooms, 'STQ'),
    planId: bar,
    arrival: addDays(D, -1),
    nights: 2,
    guest: {
      title: 'Mr',
      firstName: 'Femi',
      lastName: 'Ogunleye',
      phone: '+2348031110307',
      nationality: 'NG',
    },
    bookedOn: addDays(D, -5),
  })
  const tobi = await book({
    propertyId: vi,
    who: chiamaka,
    typeId: typeAt(viRooms, 'STQ'),
    planId: bar,
    arrival: addDays(D, -1),
    nights: 2,
    guest: {
      title: 'Mr',
      firstName: 'Tobi',
      lastName: 'Ogunleye',
      phone: '+2348031110317',
      nationality: 'NG',
    },
    bookedOn: addDays(D, -5),
  })
  const room307 = roomNo(viRooms, '307')
  const tobiDocument = await seedIdDocument(tx, chiamaka, vi, files)
  const tobiRegistration = nigerian(
    { title: 'Mr', firstName: 'Femi', lastName: 'Ogunleye' },
    '23456789012',
    { line: '4 Adeola Odeku Street', city: 'Victoria Island', region: 'Lagos' },
  )
  const wrong = await checkInNamed(
    tx,
    { propertyId: vi, restoreTo: D },
    {
      who: chiamaka,
      stay: brother.stay,
      roomId: room307.id,
      date: addDays(D, -1),
      time: '16:02',
      registration: tobiRegistration,
      documentId: tobiDocument,
    },
  )
  await on(vi, addDays(D, -1), () =>
    reverseCheckIn(tx as unknown as Database, tunde, {
      idempotencyKey: newId(),
      stayId: brother.stay.id,
      version: wrong.version,
      reason: 'wrong_booking',
    }),
  )
  // 307 goes to Tobi's own booking; his brother's waits without a room (he never came: night
  // audit will list it as a no-show).
  const [brotherNow] = await tx.select().from(stays).where(eq(stays.id, brother.stay.id))
  if (brotherNow) {
    await on(vi, addDays(D, -1), () =>
      assignRoom(tx, chiamaka, {
        idempotencyKey: newId(),
        stayId: brotherNow.id,
        version: brotherNow.version,
        roomId: null,
        source: 'dialog',
      }),
    )
  }
  await checkInNamed(
    tx,
    { propertyId: vi, restoreTo: D },
    {
      who: chiamaka,
      stay: tobi.stay,
      roomId: room307.id,
      date: addDays(D, -1),
      time: '16:25',
      registration: nigerian(
        { title: 'Mr', firstName: 'Tobi', lastName: 'Ogunleye' },
        '34567890123',
        { line: '4 Adeola Odeku Street', city: 'Victoria Island', region: 'Lagos' },
      ),
      documentId: await seedIdDocument(tx, chiamaka, vi, files),
    },
  )
  viOcc.hold(room307.id, addDays(D, -1), addDays(D, 1))

  // --- The rest of the house, in bulk -------------------------------------------------------------

  const HOUSE: [string, string, string][] = [
    ['Mr', 'Adewale', 'Johnson'],
    ['Mrs', 'Bimpe', 'Akanbi'],
    ['Dr', 'Chika', 'Okoro'],
    ['Mr', 'Danjuma', 'Bala'],
    ['Ms', 'Ebere', 'Nnamdi'],
    ['Mr', 'Folarin', 'Coker'],
    ['Mrs', 'Grace', 'Etim'],
    ['Mr', 'Hassan', 'Garba'],
    ['Ms', 'Ifunanya', 'Ude'],
    ['Mr', 'Jolaoso', 'Bankole'],
    ['Mrs', 'Kehinde', 'Afolayan'],
    ['Mr', 'Lukman', 'Abiodun'],
    ['Ms', 'Mojisola', 'Ige'],
    ['Mr', 'Nnamdi', 'Okafor'],
    ['Mrs', 'Omolara', 'Fashola'],
    ['Mr', 'Peter', 'Udoh'],
    ['Ms', 'Queen', 'Ekpo'],
    ['Mr', 'Rilwan', 'Lawal'],
    ['Mrs', 'Sola', 'Adeniyi'],
    ['Mr', 'Taiwo', 'Ojo'],
    ['Ms', 'Uju', 'Anene'],
    ['Mr', 'Victor', 'Ibe'],
    ['Mrs', 'Wuraola', 'Salami'],
    ['Mr', 'Yakubu', 'Aliyu'],
    ['Ms', 'Zainab', 'Musa'],
    ['Mr', 'Akin', 'Olaniyan'],
    ['Mrs', 'Bukola', 'Ajayi'],
    ['Mr', 'Chinedu', 'Eze'],
  ]
  const CODES = ['DLK', 'STQ', 'EXK', 'DLK', 'STQ', 'JRS', 'DLK']
  type House = {
    stay: typeof stays.$inferSelect
    reservationId: string
    number: string
    room: RoomRow
    who: Access
    first: string
    last: string
    title: string
    nin: string
  }
  async function houseAt(
    propertyId: string,
    list: RoomRow[],
    occ: typeof viOcc,
    planId: string,
    people: [string, string, string][],
    who: (i: number) => Access,
    phonePrefix: string,
    skip: string[],
  ) {
    const housed: House[] = []
    for (const [i, [title, first, last]] of people.entries()) {
      const arrival = addDays(D, -(1 + (i % 3)))
      const departure = addDays(D, i % 5 === 0 ? 0 : i % 3 === 0 ? 2 : 1)
      if (departure <= arrival) continue
      const code = CODES[i % CODES.length] ?? 'DLK'
      const room = freeRoom(list, occ, code, arrival, departure, skip)
      if (!room) continue
      const made = await book({
        propertyId,
        who: who(i),
        typeId: room.typeId,
        planId,
        arrival,
        nights: nightsBetween(arrival, departure),
        guest: {
          title,
          firstName: first,
          lastName: last,
          phone: `${phonePrefix}${String(1000 + i)}`,
          nationality: 'NG',
        },
        bookedOn: addDays(arrival, -4),
      }).catch(() => null)
      if (!made) continue
      housed.push({
        stay: made.stay,
        reservationId: made.id,
        number: made.number,
        room,
        who: who(i),
        first,
        last,
        title,
        nin: String(41000000000 + i * 7919),
      })
    }
    return housed
  }
  const viHouse = await houseAt(
    vi,
    viRooms,
    viOcc,
    bar,
    HOUSE,
    (i) => (i % 4 === 3 ? ibrahim : chiamaka),
    '+23480566',
    keep,
  )

  // --- Kora Ikeja GRA ------------------------------------------------------------------------------

  const ikejaRooms = await roomsAt(ikeja)
  const ikejaPlans = await plans(ikeja)
  const ikejaOcc = await occupancy(ikeja)
  const ikejaBar = ikejaPlans.get('BAR') ?? [...ikejaPlans.values()][0] ?? ''
  const becker = await book({
    propertyId: ikeja,
    who: ifeoma,
    typeId: typeAt(ikejaRooms, 'EXK'),
    planId: ikejaBar,
    arrival: addDays(D, -2),
    nights: 4,
    guest: {
      title: 'Mr',
      firstName: 'Thomas',
      lastName: 'Becker',
      phone: '+4915112345678',
      nationality: 'DE',
    },
    bookedOn: addDays(D, -12),
  })
  const beckerRoom = freeRoom(ikejaRooms, ikejaOcc, 'EXK', addDays(D, -2), addDays(D, 2))
  if (!beckerRoom) throw new Error('The demo needs an Executive King at Ikeja for Mr Becker')
  await checkInNamed(
    tx,
    { propertyId: ikeja, restoreTo: D },
    {
      who: ifeoma,
      stay: becker.stay,
      roomId: beckerRoom.id,
      date: addDays(D, -2),
      time: '13:15',
      registration: {
        lead: true,
        title: 'Mr',
        firstName: 'Thomas',
        lastName: 'Becker',
        nationality: 'DE',
        addressLine: 'Torstraße 112',
        addressCity: 'Berlin',
        addressCountry: 'DE',
        purpose: 'business',
        occupation: 'Consultant',
        idType: 'passport',
        idNumber: 'C4KL7P2M9',
        idCountry: 'DE',
        idExpiry: '2030-01-20',
        visaType: 'business',
        visaNumber: 'NGB5583011',
        visaValidUntil: '2027-01-15',
        entryDate: addDays(D, -2),
        portOfEntry: 'lagos_mmia',
        arrivingFrom: 'Frankfurt',
        nextDestination: 'Port Harcourt',
      },
      documentId: await seedIdDocument(tx, ifeoma, ikeja, files),
    },
  )
  const ikejaHouse = await houseAt(
    ikeja,
    ikejaRooms,
    ikejaOcc,
    ikejaBar,
    HOUSE.slice(0, 8).map(([title, first, last]) => [title, first, `${last}-Ade`]),
    () => ifeoma,
    '+23480577',
    [],
  )

  // Bulk check-in: the stays, their reservations, registrations (NIN encrypted), card numbers, events.
  async function checkInHouse(propertyId: string, prefix: string, housed: House[]) {
    if (housed.length === 0) return
    const year = D.slice(0, 4)
    const [counter] = await tx
      .insert(registrationCardCounters)
      .values({ organizationId: context.organizationId, propertyId, year, last: housed.length })
      .onConflictDoUpdate({
        target: [registrationCardCounters.propertyId, registrationCardCounters.year],
        set: {
          last: sql`${registrationCardCounters.last} + ${housed.length}`,
          updatedAt: new Date(),
        },
      })
      .returning({ last: registrationCardCounters.last })
    const first = (counter?.last ?? housed.length) - housed.length + 1
    const at = (h: House) => instantAt(h.stay.arrival, '15:00', 'Africa/Lagos')
    await tx.execute(sql`
      update ${stays} s set status = 'checked_in', room_id = k.room_id,
        checked_in_at = k.at, checked_in_by_member_id = k.member_id, checked_in_by_name = k.name,
        checked_in_business_date = s.arrival, card_printed_at = k.at,
        version = s.version + 1, updated_at = now()
      from unnest(
        ${sql.param(housed.map((h) => h.stay.id))}::uuid[],
        ${sql.param(housed.map((h) => h.room.id))}::uuid[],
        ${sql.param(housed.map((h) => at(h).toISOString()))}::timestamptz[],
        ${sql.param(housed.map((h) => h.who.memberId))}::uuid[],
        ${sql.param(housed.map((h) => h.who.userName))}::text[]
      ) as k(stay_id, room_id, at, member_id, name)
      where s.id = k.stay_id and s.property_id = ${propertyId}::uuid`)
    await tx
      .update(reservations)
      .set({ status: 'checked_in' })
      .where(
        inArray(
          reservations.id,
          housed.map((h) => h.reservationId),
        ),
      )
    const rows = await tx
      .insert(guestRegistrations)
      .values(
        housed.map((h, i) => ({
          organizationId: context.organizationId,
          propertyId,
          stayId: h.stay.id,
          reservationId: h.reservationId,
          guestId: h.stay.guestId,
          lead: true,
          cardNumber: registrationCardNumber(prefix, year, first + i),
          title: h.title,
          firstName: h.first,
          lastName: h.last,
          nationality: 'NG',
          addressLine: `${10 + i} Awolowo Road`,
          addressCity: 'Ikoyi',
          addressRegion: 'Lagos',
          addressCountry: 'NG',
          idType: 'nin' as const,
          idNumberCipher: encryptId(h.nin),
          idNumberMasked: maskIdNumber('nin', h.nin),
          keyId: currentKeyId(),
          ruleSetVersion: 'seed',
          source: 'desk' as const,
          businessDate: h.stay.arrival,
          byMemberId: h.who.memberId,
          byName: h.who.userName,
        })),
      )
      .returning({
        id: guestRegistrations.id,
        stayId: guestRegistrations.stayId,
        masked: guestRegistrations.idNumberMasked,
      })
    const events: AuditEvent[] = housed.flatMap((h) => {
      const row = rows.find((r) => r.stayId === h.stay.id)
      const base = {
        entityType: 'reservation',
        entityId: h.reservationId,
        propertyId,
        businessDate: h.stay.arrival,
      }
      return [
        {
          action: 'guest.registration_captured',
          ...base,
          after: {
            registrationId: row?.id,
            stayId: h.stay.id,
            lead: true,
            nationality: 'NG',
            foreign: false,
            idType: 'nin',
            idNumberMasked: row?.masked,
            source: 'seed',
          },
        },
        {
          action: 'stay.checked_in',
          ...base,
          before: { status: 'confirmed' },
          after: {
            stayId: h.stay.id,
            reservationNumber: h.number,
            guestName: `${h.first} ${h.last}`,
            room: { id: h.room.id, number: h.room.number },
            arrival: h.stay.arrival,
            departure: h.stay.departure,
            walkIn: false,
            source: 'seed',
            cardPrinted: true,
            occurredAt: at(h).toISOString(),
            liveProperty: true,
          },
        },
      ]
    })
    // Each person's events under their own name.
    for (const who of new Set(housed.map((h) => h.who))) {
      await recordAuditMany(
        tx,
        who,
        events.filter(
          (event) => housed.find((h) => h.reservationId === event.entityId)?.who === who,
        ),
      )
    }
  }
  await checkInHouse(vi, 'VI', viHouse)
  await checkInHouse(ikeja, 'IKJ', ikejaHouse)

  // --- Early check-ins on D ------------------------------------------------------------------------

  // Three of today's arrivals in rooms (not the named ones, nor those kept for the warnings): two in
  // ready rooms by Chiamaka, one into a dirty room (Waiting for room); one more by Tunde without the
  // ID photo, so "ID photo to add" can be tried.
  const today = await tx
    .select({
      id: stays.id,
      version: stays.version,
      roomId: stays.roomId,
      number: rooms.number,
      status: rooms.housekeepingStatus,
      guestId: stays.guestId,
    })
    .from(stays)
    .innerJoin(rooms, eq(rooms.id, stays.roomId))
    .innerJoin(reservations, eq(reservations.id, stays.reservationId))
    .where(and(eq(stays.propertyId, vi), eq(stays.status, 'confirmed'), eq(stays.arrival, D)))
    .orderBy(rooms.number)
  const reserved = new Set(['502', '404', '504', asanteTarget.number])
  const candidates = today.filter((s) => !reserved.has(s.number))
  const ready = candidates.filter((s) => s.status !== 'dirty').slice(0, 3)
  const dirty = candidates.find((s) => s.status === 'dirty')
  const early = [
    ...(ready[0] ? [{ stay: ready[0], who: chiamaka, time: '07:20', photo: true }] : []),
    ...(ready[1] ? [{ stay: ready[1], who: chiamaka, time: '07:40', photo: true }] : []),
    ...(dirty ? [{ stay: dirty, who: chiamaka, time: '08:00', photo: true }] : []),
    ...(ready[2] ? [{ stay: ready[2], who: tunde, time: '08:15', photo: false }] : []),
  ]
  const earlyNames: string[] = []
  for (const [i, item] of early.entries()) {
    const [guest] = await tx
      .execute<{ first_name: string; last_name: string; title: string | null }>(
        sql`select first_name, last_name, title from guests where id = ${item.stay.guestId}::uuid`,
      )
      .then((r) => r.rows)
    if (!guest) continue
    await checkInNamed(
      tx,
      { propertyId: vi, restoreTo: D },
      {
        who: item.who,
        stay: item.stay,
        roomId: item.stay.roomId ?? '',
        date: D,
        time: item.time,
        registration: nigerian(
          {
            firstName: guest.first_name,
            lastName: guest.last_name,
            ...(guest.title ? { title: guest.title } : {}),
          },
          String(52000000000 + i * 104729),
          { line: '22 Bourdillon Road', city: 'Ikoyi', region: 'Lagos' },
        ),
        documentId: item.photo ? await seedIdDocument(tx, item.who, vi, files) : null,
        skipReason: 'Camera not working',
      },
    )
    earlyNames.push(`${guest.first_name} ${guest.last_name} (${item.stay.number})`)
  }

  // --- Mrs Okafor's October stay at Kora Ikeja GRA ---------------------------------------------------

  const [ngozi] = await tx
    .execute<{ id: string; guest_id: string }>(sql`
    select s.id, s.guest_id from stays s join guests g on g.id = s.guest_id
    where s.property_id = ${vi}::uuid and g.first_name = 'Ngozi' and g.last_name = 'Okafor'
      and s.arrival = ${D}::date limit 1`)
    .then((r) => r.rows)
  if (ngozi) {
    const october = addDays(D, -42)
    const input: CreateReservationInput = {
      idempotencyKey: newId(),
      propertyId: ikeja,
      guest: { kind: 'existing', id: ngozi.guest_id },
      source: 'phone',
      stays: [
        {
          roomTypeId: typeAt(ikejaRooms, 'DLK'),
          ratePlanId: ikejaBar,
          arrival: october,
          departure: addDays(october, 2),
          adults: 1,
          children: 0,
          quoteHash: 'seed',
        },
      ],
    }
    const made = await on(ikeja, october, () =>
      tx.transaction((savepoint) =>
        bookInTx(savepoint, ifeoma, createReservationSchema.parse(input), {
          bookedAt: instantAt(addDays(october, -7), '12:00', 'Africa/Lagos'),
          bookedOnBusinessDate: addDays(october, -7),
          trustQuote: true,
        }),
      ),
    )
    const [stay] = await tx.select().from(stays).where(eq(stays.reservationId, made.id))
    const octRoom = freeRoom(ikejaRooms, ikejaOcc, 'DLK', october, addDays(october, 2))
    if (stay && octRoom) {
      await checkInNamed(
        tx,
        { propertyId: ikeja, restoreTo: D },
        {
          who: ifeoma,
          stay,
          roomId: octRoom.id,
          date: october,
          time: '14:30',
          registration: nigerian(
            { title: 'Mrs', firstName: 'Ngozi', lastName: 'Okafor' },
            '12345676612',
            { line: '9 Isaac John Street', city: 'Ikeja GRA', region: 'Lagos' },
          ),
          documentId: await seedIdDocument(tx, ifeoma, ikeja, files),
        },
      )
      // Checked out (written by the seed until brick 10's check-out): its nights leave the counts.
      await tx.update(stays).set({ status: 'checked_out' }).where(eq(stays.id, stay.id))
      await tx
        .update(reservations)
        .set({ status: 'checked_out' })
        .where(eq(reservations.id, made.id))
      await tx
        .update(roomTypeInventory)
        .set({ booked: sql`${roomTypeInventory.booked} - 1` })
        .where(
          and(
            eq(roomTypeInventory.roomTypeId, stay.roomTypeId),
            lte(roomTypeInventory.date, addDays(october, 1)),
            gt(roomTypeInventory.date, addDays(october, -1)),
          ),
        )
    }
  }

  const ikejaIn = ikejaHouse.length + 1
  return {
    files,
    tryToday: [
      `Front desk: ${viHouse.length + 5} in house at Kora Victoria Island (Mr Kalu in 501 since the move, Mrs Dubois in ${duboisRoom.number}, Mr Asante due out of ${asanteTarget.number}), ${ikejaIn} at Kora Ikeja GRA (Mr Becker in ${beckerRoom.number})`,
      `Check in Mrs Ngozi Okafor (404): her October NIN and ID photo are reused`,
      `Mark 502 clean, then check in Mr Daniel Mensah: the foreign national section with ECOWAS "Not required"`,
      `Check in Mrs Funmilayo Adebayo (no room): ready rooms first; pick a dirty one to see the warning`,
      `Walk-in: the Okoro family, 2 adults 2 children, Standard Queen 302, 2 nights`,
      `Checked in early today: ${earlyNames.join(', ')}`,
      `As Tunde: Reveal and View ID photo for Mrs Claire Dubois; the reversed check-in of Femi Ogunleye is in the audit log`,
    ],
  }
}

export async function writeIdPhotos(storage: StorageProvider | undefined, files: PendingFile[]) {
  if (!storage) return
  for (const file of files) await storage.put(file.key, file.bytes, 'image/png')
}
