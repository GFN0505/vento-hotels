// The demo group's changes, cancellations, no-shows and waivers (spec: stage-1-modify-cancel.md,
// "Demo seed"), made through the change service as the desk would. Each happens on its own business
// date: the hotel's date is set back for the step and restored after, so the records carry the date
// they were made on. Dates relative to D, the business date:
// - Kora Victoria Island: one of Chiamaka's bookings extended by a night (D−2); Kola Bankole's 15%
//   booking (approved by Tunde in brick 5) moved a day later by Sade (D−1); a free cancellation
//   (Chiamaka, D−3); a late non-refundable cancellation to charge (Chiamaka, D−1); a late cancellation
//   waived by Tunde himself (D−2); a late cancellation Ibrahim asked Tunde to waive in the inbox,
//   approved (D−1); a no-show from D−1 marked by Ibrahim with its penalty to charge; and, for the
//   owner to try today, Mr Kelechi Obi (Executive King, D+1 → D+3, deadline passed), a Standard Queen
//   arriving today, and a Deluxe King arriving today whose guest's flight was cancelled;
// - Kora Ikeja GRA: a late cancellation waived by Sade, so All hotels shows two hotels' waivers.
import { ORPCError } from '@orpc/server'
import {
  addDays,
  type CreateReservationInput,
  createReservationSchema,
  instantAt,
  newId,
} from '@vento/shared'
import { and, asc, eq } from 'drizzle-orm'
import { approveRequest, requestApproval } from '../approvals/service.ts'
import type { Database } from '../db/client.ts'
import { ratePlans } from '../db/schema/rates.ts'
import { guests, reservations, stays } from '../db/schema/reservations.ts'
import { roomTypes } from '../db/schema/rooms.ts'
import { properties } from '../db/schema/tenancy.ts'
import { type Booked, bookInTx } from '../reservations/book.ts'
import { cancelReservation, markNoShow } from '../reservations/change/end.ts'
import { modifyReservation } from '../reservations/change/modify.ts'
import { quoteChange } from '../reservations/change/quote-change.ts'
import type { Access } from '../tenancy/access.ts'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export type ChangeSeedContext = {
  organizationId: string
  businessDate: string
  hotels: { vi: string; ikeja: string }
  access: {
    chiamaka: Access
    ibrahim: Access
    sade: Access
    tunde: Access
  }
  pins: { tunde: string }
}

type Guest = {
  title: string
  firstName: string
  lastName: string
  phone: string
  nationality: string
}

export async function seedChanges(tx: Tx, context: ChangeSeedContext): Promise<string[]> {
  const D = context.businessDate
  const { vi, ikeja } = context.hotels
  const { chiamaka, ibrahim, sade, tunde } = context.access
  const notes: string[] = []

  // Each step on its own business date; the hotel goes back to D after.
  async function on<T>(propertyId: string, date: string, step: () => Promise<T>): Promise<T> {
    await tx.update(properties).set({ businessDate: date }).where(eq(properties.id, propertyId))
    try {
      return await step()
    } finally {
      await tx.update(properties).set({ businessDate: D }).where(eq(properties.id, propertyId))
    }
  }

  const typesAt = async (propertyId: string) =>
    tx
      .select({ id: roomTypes.id, code: roomTypes.code })
      .from(roomTypes)
      .where(eq(roomTypes.propertyId, propertyId))
      .orderBy(asc(roomTypes.sortOrder))
  const planAt = async (propertyId: string, code: string) => {
    const [row] = await tx
      .select({ id: ratePlans.id })
      .from(ratePlans)
      .where(and(eq(ratePlans.propertyId, propertyId), eq(ratePlans.code, code)))
    if (!row) throw new Error(`The demo needs ${code}`)
    return row.id
  }
  const viTypes = await typesAt(vi)
  const ikejaTypes = await typesAt(ikeja)

  // Books on the hotel's business date at the time given, on the first of the room types that
  // still has a room (the reservations seed has filled the coming nights).
  async function book(
    who: Access,
    propertyId: string,
    ask: {
      codes: string[]
      plan: string
      arrival: string
      nights: number
      guest: Guest
      notes?: string
      at: string
      on: string
    },
  ): Promise<Booked> {
    const types = propertyId === vi ? viTypes : ikejaTypes
    const ordered = [
      ...ask.codes.flatMap((code) => types.filter((t) => t.code === code)),
      ...types.filter((t) => !ask.codes.includes(t.code)),
    ]
    const ratePlanId = await planAt(propertyId, ask.plan)
    for (const type of ordered) {
      const input: CreateReservationInput = {
        idempotencyKey: newId(),
        propertyId,
        guest: { kind: 'new', fields: ask.guest },
        source: 'phone',
        ...(ask.notes ? { notes: ask.notes } : {}),
        stays: [
          {
            roomTypeId: type.id,
            ratePlanId,
            arrival: ask.arrival,
            departure: addDays(ask.arrival, ask.nights),
            adults: 1,
            children: 0,
            quoteHash: 'seed',
          },
        ],
      }
      try {
        return await on(propertyId, ask.on, () =>
          tx.transaction((savepoint) =>
            bookInTx(savepoint, who, createReservationSchema.parse(input), {
              bookedAt: instantAt(ask.on, ask.at, 'Africa/Lagos'),
              trustQuote: true,
            }),
          ),
        )
      } catch (error) {
        const code = error instanceof ORPCError ? (error.data as { code?: string })?.code : null
        if (code !== 'SOLD_OUT') throw error
      }
    }
    throw new Error(`The demo couldn't book ${ask.guest.lastName}: every room type is full`)
  }

  async function stayOf(reservationId: string) {
    const [stay] = await tx.select().from(stays).where(eq(stays.reservationId, reservationId))
    if (!stay) throw new Error('The demo booking has no stay')
    return stay
  }

  async function change(
    who: Access,
    propertyId: string,
    date: string,
    reservationId: string,
    patch: Partial<{ arrival: string; departure: string }>,
  ) {
    const stay = await stayOf(reservationId)
    const fields = {
      reservationId,
      stayId: stay.id,
      version: stay.version,
      arrival: patch.arrival ?? stay.arrival,
      departure: patch.departure ?? stay.departure,
      roomTypeId: stay.roomTypeId,
      adults: stay.adults,
      children: stay.children,
      discount: { mode: 'keep' as const },
    }
    return on(propertyId, date, async () => {
      const quoted = await quoteChange(tx, who, fields)
      return modifyReservation(tx, who, {
        idempotencyKey: newId(),
        ...fields,
        changeHash: quoted.changeHash,
      })
    })
  }

  const versionOf = async (reservationId: string) => (await stayOf(reservationId)).version

  // --- Kora Victoria Island ------------------------------------------------------------------------

  // Extended by a night on D−2.
  const extended = await book(chiamaka, vi, {
    codes: ['DLK'],
    plan: 'BB',
    arrival: addDays(D, 5),
    nights: 2,
    guest: {
      title: 'Mrs',
      firstName: 'Nkechi',
      lastName: 'Ude',
      phone: '+2348031112233',
      nationality: 'NG',
    },
    at: '10:20',
    on: addDays(D, -4),
  })
  await change(chiamaka, vi, addDays(D, -2), extended.id, { departure: addDays(D, 8) })

  // Kola Bankole's 15% booking from brick 5, moved a day later by Sade on D−1.
  const [kola] = await tx
    .select({ id: reservations.id })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .where(
      and(
        eq(reservations.organizationId, context.organizationId),
        eq(guests.firstName, 'Kola'),
        eq(guests.lastName, 'Bankole'),
      ),
    )
  if (kola) {
    const stay = await stayOf(kola.id)
    await change(sade, vi, addDays(D, -1), kola.id, {
      arrival: addDays(stay.arrival, 1),
      departure: addDays(stay.departure, 1),
    })
  }

  // A free cancellation on D−3.
  const free = await book(chiamaka, vi, {
    codes: ['DLK'],
    plan: 'BAR',
    arrival: addDays(D, 12),
    nights: 2,
    guest: {
      title: 'Mr',
      firstName: 'Tunji',
      lastName: 'Adewale',
      phone: '+2348034445566',
      nationality: 'NG',
    },
    at: '09:15',
    on: addDays(D, -6),
  })
  await on(vi, addDays(D, -3), () =>
    cancelReservation(tx, chiamaka, {
      idempotencyKey: newId(),
      reservationId: free.id,
      version: 1,
      reason: 'guest_request',
      note: 'Trip moved to January',
    }),
  )

  // A late non-refundable cancellation on D−1: the full stay to charge.
  const nonRefundable = await book(chiamaka, vi, {
    codes: ['DLK'],
    plan: 'NRF',
    arrival: addDays(D, 2),
    nights: 2,
    guest: {
      title: 'Ms',
      firstName: 'Folake',
      lastName: 'Ogun',
      phone: '+2348037778899',
      nationality: 'NG',
    },
    at: '16:40',
    on: addDays(D, -8),
  })
  await on(vi, addDays(D, -1), () =>
    cancelReservation(tx, chiamaka, {
      idempotencyKey: newId(),
      reservationId: nonRefundable.id,
      version: 1,
      reason: 'guest_request',
      note: 'Plans changed',
    }),
  )

  // A late cancellation Tunde waived himself on D−2.
  const wrongDates = await book(chiamaka, vi, {
    codes: ['STQ', 'DLK'],
    plan: 'BAR',
    arrival: addDays(D, 1),
    nights: 2,
    guest: {
      title: 'Mr',
      firstName: 'Bayo',
      lastName: 'Ajibola',
      phone: '+2348032223344',
      nationality: 'NG',
    },
    at: '12:05',
    on: addDays(D, -5),
  })
  await on(vi, addDays(D, -2), () =>
    cancelReservation(tx, tunde, {
      idempotencyKey: newId(),
      reservationId: wrongDates.id,
      version: 1,
      reason: 'duplicate',
      waive: { reason: "Hotel's error: wrong dates taken by phone" },
    }),
  )

  // A late cancellation Ibrahim asked Tunde to waive in the inbox on D−1, approved with his PIN.
  const askedInbox = await book(chiamaka, vi, {
    codes: ['DLK', 'STQ'],
    plan: 'BAR',
    arrival: addDays(D, 1),
    nights: 1,
    guest: {
      title: 'Dr',
      firstName: 'Musa',
      lastName: 'Yaro',
      phone: '+2348035556677',
      nationality: 'NG',
    },
    at: '14:50',
    on: addDays(D, -4),
  })
  await on(vi, addDays(D, -1), async () => {
    const cancelled = await cancelReservation(tx, ibrahim, {
      idempotencyKey: newId(),
      reservationId: askedInbox.id,
      version: 1,
      reason: 'guest_request',
      note: 'Family emergency',
    })
    const penaltyId = cancelled.penalties[0]?.id
    if (!penaltyId) return
    const asked = await requestApproval(
      tx,
      ibrahim,
      {
        kind: 'penalty_waiver',
        waiver: { target: 'penalty', penaltyId, reason: 'Family emergency, regular guest' },
        idempotencyKey: newId(),
        approverMemberId: tunde.memberId,
      },
      null,
    )
    await approveRequest(tx, tunde, { id: asked.id, pin: context.pins.tunde })
  })

  // A no-show from D−1, marked by Ibrahim at night with the penalty to charge.
  const noShow = await book(chiamaka, vi, {
    codes: ['STQ', 'DLK'],
    plan: 'BAR',
    arrival: addDays(D, -1),
    nights: 2,
    guest: {
      title: 'Mr',
      firstName: 'Chinedu',
      lastName: 'Ikenna',
      phone: '+2348038889900',
      nationality: 'NG',
    },
    at: '11:30',
    on: addDays(D, -3),
  })
  await on(vi, addDays(D, -1), () =>
    markNoShow(tx, ibrahim, {
      idempotencyKey: newId(),
      reservationId: noShow.id,
      version: 1,
      note: "Didn't call, phone off",
    }),
  )

  // For the owner to try today.
  const obi = await book(chiamaka, vi, {
    codes: ['EXK', 'DLK'],
    plan: 'BAR',
    arrival: addDays(D, 1),
    nights: 2,
    guest: {
      title: 'Mr',
      firstName: 'Kelechi',
      lastName: 'Obi',
      phone: '+2348036661234',
      nationality: 'NG',
    },
    at: '10:02',
    on: addDays(D, -9),
  })
  const arrivingToday = await book(chiamaka, vi, {
    codes: ['STQ', 'DLK'],
    plan: 'BAR',
    arrival: D,
    nights: 2,
    guest: {
      title: 'Mrs',
      firstName: 'Grace',
      lastName: 'Eboh',
      phone: '+2348033334455',
      nationality: 'NG',
    },
    at: '15:25',
    on: addDays(D, -6),
  })
  const flightCancelled = await book(chiamaka, vi, {
    codes: ['DLK', 'STQ'],
    plan: 'BAR',
    arrival: D,
    nights: 1,
    guest: {
      title: 'Mr',
      firstName: 'Abubakar',
      lastName: 'Sule',
      phone: '+2348039990011',
      nationality: 'NG',
    },
    notes: 'Abuja flight cancelled, guest called 21:30',
    at: '17:45',
    on: addDays(D, -2),
  })
  notes.push(
    `Cancel ${obi.number} (Kelechi Obi, free cancellation ended): the first-night penalty`,
    `Mark no-show ${arrivingToday.number} (arriving today)`,
    `Mark no-show and waive ${flightCancelled.number} (Abuja flight cancelled)`,
  )

  // --- Kora Ikeja GRA ------------------------------------------------------------------------------

  const ikejaLate = await book(sade, ikeja, {
    codes: [],
    plan: 'BAR',
    arrival: addDays(D, 1),
    nights: 2,
    guest: {
      title: 'Ms',
      firstName: 'Ronke',
      lastName: 'Bello',
      phone: '+2348030102030',
      nationality: 'NG',
    },
    at: '13:10',
    on: addDays(D, -4),
  })
  await on(ikeja, addDays(D, -1), async () =>
    cancelReservation(tx, sade, {
      idempotencyKey: newId(),
      reservationId: ikejaLate.id,
      version: await versionOf(ikejaLate.id),
      reason: 'company_request',
      reasonText: undefined,
      waive: { reason: 'Corporate client, rebooked for next week' },
    }),
  )
  return notes
}
