// The demo group's rooms in use (spec: stage-1-tape-chart.md, "Demo seed"), made through the
// services as the desk would, each step on its own business date (the hotel's date is set back for
// the step and restored after). D is the seed's business date (25 Nov 2026 in the walkthroughs).
// - Kora Victoria Island: five named bookings (Mrs Ngozi Okafor in 404, Mrs Funmilayo Adebayo
//   unassigned, Mr Emeka Kalu, Mr Rasheed Shittu in 402 from D+1, Mr Uchenna Okeke in 401 from D+2);
//   every confirmed stay arriving D to D+6 assigned by Chiamaka on D−1 and D, packed by type and
//   floor, except 7 (2 Deluxe King and 1 Standard Queen arriving D among them); Mr Mensah in 502
//   with 502 free D+3 to D+5 so his stay can be dragged to D+5; 401, 408 and 506 kept free for the
//   moves to try; Mr Kalu assigned 503 on D−1 and moved to 501 on D at 10:15 (Maintenance) before
//   Tunde puts 503 out of order D → D+2 (AC) at 10:25; 406 out of order D−3 → D−1 (ended) and 305
//   D+6 → D+8 (Plumbing, Grace); 502, 301, 403, 504 and 1102 dirty and 303 and 408 clean on D.
// - Kora Ikeja GRA: stays arriving D to D+3 assigned by Sade; a room out of order D → D+4
//   (Renovation, Adaeze); two rooms dirty.
import {
  addDays,
  type CreateReservationInput,
  compareRoomNumbers,
  createReservationSchema,
  formatRateDate,
  instantAt,
  newId,
  rangesOverlap,
} from '@vento/shared'
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { recordAuditMany } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { ratePlans } from '../db/schema/rates.ts'
import { guests, stays } from '../db/schema/reservations.ts'
import { rooms, roomTypes } from '../db/schema/rooms.ts'
import { properties } from '../db/schema/tenancy.ts'
import { assignRoom } from '../reservations/assign/assign.ts'
import { bookInTx } from '../reservations/book.ts'
import { createOutOfOrder } from '../rooms/out-of-order/service.ts'
import { setRoomStatus } from '../rooms/status/set-status.ts'
import type { Access } from '../tenancy/access.ts'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export type TapeChartSeedContext = {
  organizationId: string
  businessDate: string
  hotels: { vi: string; ikeja: string }
  access: { chiamaka: Access; tunde: Access; grace: Access; sade: Access; adaeze: Access }
}

type Room = { id: string; number: string; floor: number; typeId: string; code: string }
type Window = { from: string; to: string }

// Stays assigned through the assign service, by the person given, on the business date given.
export async function seedTapeChart(tx: Tx, context: TapeChartSeedContext): Promise<string[]> {
  const D = context.businessDate
  const { vi, ikeja } = context.hotels
  const { chiamaka, tunde, grace, sade, adaeze } = context.access

  async function on<T>(propertyId: string, date: string, step: () => Promise<T>): Promise<T> {
    await tx.update(properties).set({ businessDate: date }).where(eq(properties.id, propertyId))
    try {
      return await step()
    } finally {
      await tx.update(properties).set({ businessDate: D }).where(eq(properties.id, propertyId))
    }
  }
  const at = (time: string) => instantAt(D, time, 'Africa/Lagos').toISOString()

  async function roomsAt(propertyId: string): Promise<Room[]> {
    const rows = await tx
      .select({
        id: rooms.id,
        number: rooms.number,
        floor: rooms.floor,
        typeId: rooms.roomTypeId,
        code: roomTypes.code,
      })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .where(and(eq(rooms.propertyId, propertyId), isNull(rooms.archivedAt)))
    return rows.sort((a, b) => a.floor - b.floor || compareRoomNumbers(a.number, b.number))
  }
  const viRooms = await roomsAt(vi)
  const ikejaRooms = await roomsAt(ikeja)
  const roomNo = (list: Room[], number: string) => {
    const found = list.find((room) => room.number === number)
    if (!found) throw new Error(`The demo needs room ${number}`)
    return found
  }
  const typeOf = (code: string) => viRooms.find((room) => room.code === code)?.typeId ?? ''
  const planAt = async (code: string) => {
    const [row] = await tx
      .select({ id: ratePlans.id })
      .from(ratePlans)
      .where(and(eq(ratePlans.propertyId, vi), eq(ratePlans.code, code)))
    if (!row) throw new Error(`The demo needs ${code}`)
    return row.id
  }

  // --- The named bookings ---------------------------------------------------------------------------

  async function book(ask: {
    code: string
    plan: string
    arrival: string
    nights: number
    guest: { title: string; firstName: string; lastName: string; phone: string }
    notes?: string
    on: string
    at: string
  }) {
    const input: CreateReservationInput = {
      idempotencyKey: newId(),
      propertyId: vi,
      guest: { kind: 'new', fields: { ...ask.guest, nationality: 'NG' } },
      source: 'phone',
      ...(ask.notes ? { notes: ask.notes } : {}),
      stays: [
        {
          roomTypeId: typeOf(ask.code),
          ratePlanId: await planAt(ask.plan),
          arrival: ask.arrival,
          departure: addDays(ask.arrival, ask.nights),
          adults: 1,
          children: 0,
          quoteHash: 'seed',
        },
      ],
    }
    const made = await on(vi, ask.on, () =>
      tx.transaction((savepoint) =>
        bookInTx(savepoint, chiamaka, createReservationSchema.parse(input), {
          bookedAt: instantAt(ask.on, ask.at, 'Africa/Lagos'),
          trustQuote: true,
        }),
      ),
    )
    const [stay] = await tx.select().from(stays).where(eq(stays.reservationId, made.id))
    if (!stay) throw new Error('The demo booking has no stay')
    return { ...made, stay }
  }
  const ngozi = await book({
    code: 'DLK',
    plan: 'BB',
    arrival: D,
    nights: 2,
    guest: { title: 'Mrs', firstName: 'Ngozi', lastName: 'Okafor', phone: '+2348031110404' },
    notes: 'Repeat guest. Last stay: AC trouble in her room.',
    on: addDays(D, -6),
    at: '11:20',
  })
  const funmilayo = await book({
    code: 'DLK',
    plan: 'BAR',
    arrival: D,
    nights: 2,
    guest: { title: 'Mrs', firstName: 'Funmilayo', lastName: 'Adebayo', phone: '+2348031110408' },
    on: addDays(D, -3),
    at: '15:05',
  })
  const kalu = await book({
    code: 'EXK',
    plan: 'BAR',
    arrival: D,
    nights: 2,
    guest: { title: 'Mr', firstName: 'Emeka', lastName: 'Kalu', phone: '+2348031110503' },
    on: addDays(D, -4),
    at: '09:40',
  })
  const shittu = await book({
    code: 'DLK',
    plan: 'BAR',
    arrival: addDays(D, 1),
    nights: 2,
    guest: { title: 'Mr', firstName: 'Rasheed', lastName: 'Shittu', phone: '+2348031110402' },
    on: addDays(D, -2),
    at: '12:30',
  })
  const okeke = await book({
    code: 'DLK',
    plan: 'BB',
    arrival: addDays(D, 2),
    nights: 2,
    guest: { title: 'Mr', firstName: 'Uchenna', lastName: 'Okeke', phone: '+2348031110401' },
    on: addDays(D, -5),
    at: '10:10',
  })

  // --- Packing Kora Victoria Island's next seven days -------------------------------------------------

  type Arriving = {
    id: string
    reservationId: string
    version: number
    roomTypeId: string
    arrival: string
    departure: string
    lastName: string
    firstName: string
  }
  async function arrivingAt(propertyId: string, to: string): Promise<Arriving[]> {
    return tx
      .select({
        id: stays.id,
        reservationId: stays.reservationId,
        version: stays.version,
        roomTypeId: stays.roomTypeId,
        arrival: stays.arrival,
        departure: stays.departure,
        firstName: guests.firstName,
        lastName: guests.lastName,
      })
      .from(stays)
      .innerJoin(guests, eq(guests.id, stays.guestId))
      .where(
        and(
          eq(stays.propertyId, propertyId),
          eq(stays.status, 'confirmed'),
          isNull(stays.roomId),
          gte(stays.arrival, D),
          lte(stays.arrival, to),
        ),
      )
      .orderBy(asc(stays.arrival), asc(stays.departure), asc(stays.id))
  }
  const [mensah] = (await arrivingAt(vi, D)).filter((stay) => stay.lastName === 'Mensah')
  if (!mensah) throw new Error('The demo needs Mr Mensah arriving today')

  // Rooms held for a stay, or kept free for the moves to try, and out-of-order nights.
  const taken = new Map<string, Window[]>()
  const hold = (room: Room, from: string, to: string) =>
    taken.set(room.id, [...(taken.get(room.id) ?? []), { from, to }])
  const isFree = (room: Room, from: string, to: string) =>
    !(taken.get(room.id) ?? []).some((w) => rangesOverlap(w.from, w.to, from, to))
  const fixed = new Map<string, Room>([
    [mensah.id, roomNo(viRooms, '502')],
    [ngozi.stay.id, roomNo(viRooms, '404')],
    [kalu.stay.id, roomNo(viRooms, '503')],
    [shittu.stay.id, roomNo(viRooms, '402')],
    [okeke.stay.id, roomNo(viRooms, '401')],
  ])
  hold(roomNo(viRooms, '502'), D, addDays(D, 5))
  hold(roomNo(viRooms, '401'), D, addDays(D, 4))
  hold(roomNo(viRooms, '408'), D, addDays(D, 2))
  hold(roomNo(viRooms, '506'), D, addDays(D, 2))
  hold(roomNo(viRooms, '501'), D, addDays(D, 2))
  hold(roomNo(viRooms, '503'), D, addDays(D, 2))
  hold(roomNo(viRooms, '305'), addDays(D, 6), addDays(D, 8))
  hold(roomNo(viRooms, '404'), ngozi.stay.arrival, ngozi.stay.departure)
  hold(roomNo(viRooms, '402'), shittu.stay.arrival, shittu.stay.departure)

  const arriving = await arrivingAt(vi, addDays(D, 6))
  const dlkToday = arriving.filter(
    (s) => s.arrival === D && s.roomTypeId === typeOf('DLK') && !fixed.has(s.id),
  )
  const stqToday = arriving.find((s) => s.arrival === D && s.roomTypeId === typeOf('STQ'))
  const otherDlk = dlkToday.find((s) => s.id !== funmilayo.stay.id)
  const unassigned = new Set(
    [funmilayo.stay.id, otherDlk?.id, stqToday?.id].filter((id): id is string => Boolean(id)),
  )
  const plan = new Map<string, Room>()
  for (const stay of arriving) {
    if (unassigned.has(stay.id)) continue
    const pinned = fixed.get(stay.id)
    const room =
      pinned ??
      viRooms.find((r) => r.typeId === stay.roomTypeId && isFree(r, stay.arrival, stay.departure))
    if (!room) {
      unassigned.add(stay.id)
      continue
    }
    if (!pinned) hold(room, stay.arrival, stay.departure)
    plan.set(stay.id, room)
  }
  // Seven unassigned in all: the latest arrivals after D make up the rest.
  for (const stay of [...arriving].reverse()) {
    if (unassigned.size >= 7) break
    if (stay.arrival === D || fixed.has(stay.id) || unassigned.has(stay.id)) continue
    unassigned.add(stay.id)
    plan.delete(stay.id)
  }
  if (unassigned.size !== 7) throw new Error(`The demo left ${unassigned.size} unassigned, not 7`)

  const assign = (who: Access, stay: Arriving | { id: string; version: number }, room: Room) =>
    assignRoom(tx, who, {
      idempotencyKey: newId(),
      stayId: stay.id,
      version: stay.version,
      roomId: room.id,
      source: 'dialog',
    })

  // Rooms for many stays at once, as the packing above checked them free (each stay's room was
  // held for its nights): one update and one insert of events.
  async function assignInBulk(
    who: Access,
    propertyId: string,
    list: { stay: Arriving; room: Room; businessDate: string }[],
  ) {
    if (list.length === 0) return
    await tx.execute(sql`
      update ${stays} s set room_id = k.room_id, version = s.version + 1, updated_at = now()
      from unnest(
        ${sql.param(list.map((item) => item.stay.id))}::uuid[],
        ${sql.param(list.map((item) => item.room.id))}::uuid[]
      ) as k(stay_id, room_id)
      where s.id = k.stay_id and s.property_id = ${propertyId}::uuid and s.room_id is null`)
    await recordAuditMany(
      tx,
      who,
      list.map(({ stay, room, businessDate }) => ({
        action: 'stay.room_assigned',
        entityType: 'reservation',
        entityId: stay.reservationId,
        propertyId,
        businessDate,
        before: { room: null },
        after: {
          stayId: stay.id,
          guestName: `${stay.firstName} ${stay.lastName}`,
          arrival: stay.arrival,
          departure: stay.departure,
          room: { id: room.id, number: room.number },
          source: 'seed',
        },
      })),
    )
  }

  // 406 was out of order D−3 → D−1 (AC compressor), Tunde on D−3.
  await on(vi, addDays(D, -3), () =>
    createOutOfOrder(tx, tunde, {
      idempotencyKey: newId(),
      propertyId: vi,
      roomId: roomNo(viRooms, '406').id,
      from: addDays(D, -3),
      backInService: addDays(D, -1),
      reason: 'ac',
      note: 'AC compressor',
    }),
  )
  // Chiamaka assigns today's and tomorrow's arrivals the evening before, the rest on D. The named
  // guests go through the assign service; the rest of the week is written in one statement with
  // its events (source `seed`), which keeps the demo quick to load for every browser test.
  const named = new Set(fixed.keys())
  let kaluVersion = kalu.stay.version
  for (const stay of arriving) {
    const room = plan.get(stay.id)
    if (!room || !named.has(stay.id)) continue
    const day = stay.arrival <= addDays(D, 1) ? addDays(D, -1) : D
    const done = await on(vi, day, () => assign(chiamaka, stay, room))
    if (stay.id === kalu.stay.id) kaluVersion = done.version
  }
  await assignInBulk(
    chiamaka,
    vi,
    arriving.flatMap((stay) => {
      const room = plan.get(stay.id)
      if (!room || named.has(stay.id)) return []
      return [{ stay, room, businessDate: stay.arrival <= addDays(D, 1) ? addDays(D, -1) : D }]
    }),
  )

  // D, 10:15: Mr Kalu moved 503 → 501 for the AC repair; 10:25: Tunde puts 503 out of order.
  await on(vi, D, () =>
    assignRoom(tx, chiamaka, {
      idempotencyKey: newId(),
      stayId: kalu.stay.id,
      version: kaluVersion,
      roomId: roomNo(viRooms, '501').id,
      reason: 'maintenance',
      source: 'dialog',
    }),
  )
  await createOutOfOrder(tx, tunde, {
    idempotencyKey: newId(),
    propertyId: vi,
    roomId: roomNo(viRooms, '503').id,
    from: D,
    backInService: addDays(D, 2),
    reason: 'ac',
    note: 'Compressor fault, part needed',
  })
  // 305 booked out of order for plumbing, D+6 → D+8, by Grace.
  await createOutOfOrder(tx, grace, {
    idempotencyKey: newId(),
    propertyId: vi,
    roomId: roomNo(viRooms, '305').id,
    from: addDays(D, 6),
    backInService: addDays(D, 8),
    reason: 'plumbing',
    note: 'Leaking shower valve',
  })

  // Room statuses on D, with names and times.
  const status = (
    who: Access,
    propertyId: string,
    room: Room,
    value: 'clean' | 'dirty',
    time: string,
  ) =>
    setRoomStatus(tx, who, {
      idempotencyKey: newId(),
      propertyId,
      roomId: room.id,
      status: value,
      occurredAt: at(time),
      source: 'chart',
    })
  await status(chiamaka, vi, roomNo(viRooms, '502'), 'dirty', '06:40')
  for (const [number, time] of [
    ['301', '06:50'],
    ['403', '06:52'],
    ['504', '06:55'],
    ['1102', '06:58'],
  ] as const) {
    await status(grace, vi, roomNo(viRooms, number), 'dirty', time)
  }
  await status(grace, vi, roomNo(viRooms, '303'), 'clean', '07:05')
  await status(grace, vi, roomNo(viRooms, '408'), 'clean', '07:10')

  // --- Kora Ikeja GRA -----------------------------------------------------------------------------------

  const ikejaArriving = await arrivingAt(ikeja, addDays(D, 3))
  const ikejaPlan: { stay: Arriving; room: Room; businessDate: string }[] = []
  const ikejaTaken = new Map<string, Window[]>()
  const ikejaFree = (room: Room, from: string, to: string) =>
    !(ikejaTaken.get(room.id) ?? []).some((w) => rangesOverlap(w.from, w.to, from, to))
  for (const stay of ikejaArriving) {
    const room = ikejaRooms.find(
      (r) => r.typeId === stay.roomTypeId && ikejaFree(r, stay.arrival, stay.departure),
    )
    if (!room) continue
    ikejaTaken.set(room.id, [
      ...(ikejaTaken.get(room.id) ?? []),
      { from: stay.arrival, to: stay.departure },
    ])
    ikejaPlan.push({ stay, room, businessDate: D })
  }
  await assignInBulk(sade, ikeja, ikejaPlan)
  const later = await tx
    .select({ roomId: stays.roomId })
    .from(stays)
    .where(and(eq(stays.propertyId, ikeja), inArray(stays.status, ['confirmed'])))
  const used = new Set([...ikejaTaken.keys(), ...later.map((row) => row.roomId)])
  const refit = [...ikejaRooms].reverse().find((room) => room.code === 'EXK' && !used.has(room.id))
  if (!refit) throw new Error('The demo needs a free Executive King at Kora Ikeja GRA')
  await createOutOfOrder(tx, adaeze, {
    idempotencyKey: newId(),
    propertyId: ikeja,
    roomId: refit.id,
    from: D,
    backInService: addDays(D, 4),
    reason: 'renovation',
    note: 'Bathroom refit',
  })
  const [first, second] = ikejaRooms
  if (first) await status(adaeze, ikeja, first, 'dirty', '07:20')
  if (second) await status(adaeze, ikeja, second, 'dirty', '07:22')

  return [
    `Tape chart: 503 out of order (AC) until ${formatRateDate(addDays(D, 2), false)}, Unassigned 7, Mr Mensah in 502`,
    `Drag Funmilayo Adebayo (Deluxe King, unassigned) onto 408; move Ngozi Okafor (404) to 401, then to 506 at her price`,
    `Drag the end of Mr Mensah's bar to ${formatRateDate(addDays(D, 5), false)}; mark 502 clean`,
    `As Tunde: put 1104 out of order on ${formatRateDate(addDays(D, 16), false)} (refused: Junior Suite full)`,
  ]
}
