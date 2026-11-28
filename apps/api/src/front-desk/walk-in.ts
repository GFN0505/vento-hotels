// The 60-second walk-in (spec: "Walk-in (#6)"): walkIn.options lists, per room type, the rooms free
// for every night from the business date, ready first; prices, plans, taxes and the discount come
// from brick 4's availability and quote. walkIn.checkIn books (source walk_in, the room picked) and
// checks in in one transaction: brick 4's booking takes locks 1 → 2 → 3 (the room) → 4 → 5 → 6 → 7,
// then the check-in writes its registrations (7b) and the stay. Online only: it needs live
// availability. Idempotent: the booking's key is the check-in's key.
import { ORPCError } from '@orpc/server'
import {
  type CheckedIn,
  compareRoomOptions,
  createReservationSchema,
  nightsOf,
  type RoomOption,
  type WalkInInput,
  type WalkInOptions,
  walkInInputSchema,
  walkInOptionsInputSchema,
} from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database } from '../db/client.ts'
import { isExclusionViolation, isUniqueViolation, violatedConstraint } from '../db/errors.ts'
import { reservationChanges } from '../db/schema/reservations.ts'
import { basePlanOf } from '../rates/plan-reads.ts'
import { roomTaken, stayNotFound } from '../reservations/assign/errors.ts'
import { busyRooms } from '../reservations/assign/room-check.ts'
import { bookInTx } from '../reservations/book.ts'
import { loadForChange } from '../reservations/change/load.ts'
import {
  type CheckInDeps,
  checkInHash,
  checkInStay,
  requireCheckIn,
} from '../reservations/check-in/check-in.ts'
import { checkInAlreadySaved } from '../reservations/check-in/errors.ts'
import {
  holdBookingHotel,
  loadBookingHotel,
  requireReservationManage,
} from '../reservations/context.ts'
import { hotelRooms } from '../tape-chart/hotel-rooms.ts'
import type { Access } from '../tenancy/access.ts'

const notAWalkIn = (message: string) =>
  new ORPCError('BAD_REQUEST', { message, data: { code: 'NOT_A_WALK_IN' } })

export async function walkInOptions(
  db: Pick<Database, 'select'>,
  access: Access,
  input: z.input<typeof walkInOptionsInputSchema>,
): Promise<WalkInOptions> {
  requireCheckIn(access)
  requireReservationManage(access)
  const ask = walkInOptionsInputSchema.parse(input)
  const hotel = await loadBookingHotel(db, access, ask.propertyId)
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  const arrival = hotel.businessDate
  if (ask.departure <= arrival) throw notAWalkIn('Departure must be after tonight.')
  if (nightsOf(arrival, ask.departure).length > 30)
    throw notAWalkIn('A walk-in is up to 30 nights.')
  const [all, busy, base] = await Promise.all([
    hotelRooms(db, scope),
    busyRooms(db, hotel.id, arrival, ask.departure, '00000000-0000-7000-8000-000000000000'),
    basePlanOf(db, access.organizationId, hotel.id),
  ])
  const free = all.filter((room) => !busy.has(room.id))
  const byType = new Map<string, RoomOption[]>()
  for (const room of free.sort((a, b) => compareRoomOptions(a, b, true))) {
    byType.set(room.roomTypeId, [
      ...(byType.get(room.roomTypeId) ?? []),
      {
        id: room.id,
        number: room.number,
        floor: room.floor,
        features: room.features,
        connectsTo: room.connectsTo,
        accessible: room.accessible,
        status: room.status,
      },
    ])
  }
  return {
    arrival,
    departure: ask.departure,
    types: [...new Set(all.map((room) => room.roomTypeId))].map((roomTypeId) => {
      const rooms = byType.get(roomTypeId) ?? []
      return { roomTypeId, rooms, ready: rooms.filter((room) => room.status !== 'dirty').length }
    }),
    basePlanId: base?.id ?? null,
  }
}

export async function walkInCheckIn(
  deps: CheckInDeps,
  access: Access,
  input: WalkInInput,
): Promise<CheckedIn> {
  requireCheckIn(access)
  requireReservationManage(access)
  const parsed = walkInInputSchema.parse(input)
  const booking = createReservationSchema.parse(parsed.booking)
  const stay = booking.stays[0]
  if (booking.stays.length !== 1 || !stay?.roomId) {
    throw notAWalkIn('A walk-in is one room, picked at the desk.')
  }
  const key = booking.idempotencyKey
  const hash = checkInHash({ ...parsed, idempotencyKey: key })
  const run = async () =>
    deps.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`check-in:${access.organizationId}:${key}`}, 0))`,
      )
      const [done] = await tx
        .select({ hash: reservationChanges.requestHash, after: reservationChanges.after })
        .from(reservationChanges)
        .where(
          and(
            eq(reservationChanges.organizationId, access.organizationId),
            eq(reservationChanges.idempotencyKey, key),
          ),
        )
      if (done) {
        if (done.hash !== hash) throw checkInAlreadySaved()
        const {
          printCard: _print,
          propertyId: _hotel,
          ...stored
        } = done.after as CheckedIn & {
          printCard: boolean
          propertyId: string
        }
        return { ...stored, cardUrl: null }
      }
      // Brick 4's booking, recorded as a walk-in, with the room picked (steps 1–7); the hotel is
      // held from step 2, so its business date can't move before the check-in below.
      const made = await bookInTx(tx, access, { ...booking, source: 'walk_in' })
      const hotel = await holdBookingHotel(tx, access, booking.propertyId)
      if (stay.arrival !== hotel.businessDate) {
        throw notAWalkIn('A walk-in arrives tonight. Use New reservation for a later arrival.')
      }
      const loaded = await loadForChange(tx, access, made.id, true)
      const stayRow = loaded.stays[0]
      if (!stayRow) throw stayNotFound()
      return checkInStay(
        tx,
        deps,
        access,
        { hotel, loaded, stay: stayRow, hash },
        {
          idempotencyKey: key,
          roomId: stay.roomId as string,
          registrations: parsed.registrations,
          idDocument: parsed.idDocument,
          printCard: parsed.printCard,
          occurredAt: new Date().toISOString(),
          durationSeconds: parsed.durationSeconds,
          source: 'arrivals',
          guest: undefined,
          walkIn: true,
        },
      )
    })
  try {
    return await run()
  } catch (error) {
    if (
      isUniqueViolation(error) &&
      violatedConstraint(error) === 'reservation_changes_organization_id_idempotency_key_unique'
    ) {
      return run()
    }
    if (isExclusionViolation(error)) throw roomTaken({ id: stay.roomId, number: '' }, stay.arrival)
    throw error
  }
}
