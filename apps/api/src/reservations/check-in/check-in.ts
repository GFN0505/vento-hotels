// checkIn.checkIn (spec: "Check in"): a confirmed stay arriving on the business date becomes
// checked_in in one transaction, in the lock order of locks.ts: the key lock (a resend or an
// offline sync queues and finds the first result), the hotel FOR SHARE (2), the reservation FOR
// UPDATE (2b), the assigned and the chosen room FOR UPDATE in id order (3, re-checked free every
// night), the guest row when corrected or swapped (6), the card counter (7b). The registrations
// and the audit events are written in the same transaction. A walk-in runs the booking first and
// then the same check-in (walk-in.ts).
import {
  type CheckedIn,
  type CheckInInput,
  checkInInputSchema,
  type RegistrationValues,
} from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { type AuditEvent, recordAuditMany } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { isExclusionViolation, isUniqueViolation, violatedConstraint } from '../../db/errors.ts'
import { reservationChanges, reservations, stays } from '../../db/schema/reservations.ts'
import { devices } from '../../db/schema/tenancy.ts'
import { cardLink } from '../../documents/card-link.ts'
import { captureRegistrations } from '../../guests/registration/capture.ts'
import { idFingerprint } from '../../guests/registration/crypto.ts'
import { CHECK_IN_ONLY } from '../../guests/registration/messages.ts'
import { ruleSetFor } from '../../guests/registration/rules.ts'
import { type Access, can, requireFeature } from '../../tenancy/access.ts'
import { stayHotel } from '../assign/assign.ts'
import { roomTaken, stayNotFound } from '../assign/errors.ts'
import {
  conflictError,
  lockRoomsForStay,
  type RoomRow,
  requireFits,
  roomConflict,
} from '../assign/room-check.ts'
import { type Loaded, loadForChange, requireVersion, type StayRow } from '../change/load.ts'
import { requestHashOf } from '../change/transaction.ts'
import { type BookingHotel, holdBookingHotel, type Reader, type Tx } from '../context.ts'
import { noPermission } from '../errors.ts'
import { type GuestChoice, resolveGuest } from '../guests.ts'
import {
  alreadyCheckedIn,
  businessDateMoved,
  checkInAlreadySaved,
  notCheckable,
  roomTypeDiffers,
} from './errors.ts'
import { checkInProblem } from './rules.ts'

export type CheckInFields = z.output<typeof checkInInputSchema>
export type CheckInDeps = { db: Database; cardSecret?: string | undefined }

export function requireCheckIn(access: Access): void {
  requireFeature(access, 'front_desk')
  if (!can(access, 'stay.check_in')) throw noPermission(CHECK_IN_ONLY)
}

async function deviceName(db: Reader, access: Access) {
  if (!access.deviceId) return null
  const [row] = await db
    .select({ name: devices.name })
    .from(devices)
    .where(eq(devices.id, access.deviceId))
  return row?.name ?? null
}

// A short-lived link to the card (5 minutes), or null when the server can't sign one.
export async function cardUrlFor(
  deps: Pick<CheckInDeps, 'cardSecret'>,
  db: Reader,
  access: Access,
  stay: { propertyId: string; id: string },
  copy: number,
) {
  if (!deps.cardSecret) return null
  return cardLink(deps.cardSecret, {
    organizationId: access.organizationId,
    propertyId: stay.propertyId,
    stayId: stay.id,
    copy,
    byName: access.userName,
    deviceName: await deviceName(db, access),
  })
}

type StoredResult = Omit<CheckedIn, 'cardUrl'> & { printCard: boolean; propertyId: string }

async function replayOf(
  db: Reader,
  deps: Pick<CheckInDeps, 'cardSecret'>,
  access: Access,
  key: string,
  hash: string,
): Promise<CheckedIn | null> {
  const [row] = await db
    .select({
      hash: reservationChanges.requestHash,
      kind: reservationChanges.kind,
      after: reservationChanges.after,
    })
    .from(reservationChanges)
    .where(
      and(
        eq(reservationChanges.organizationId, access.organizationId),
        eq(reservationChanges.idempotencyKey, key),
      ),
    )
  if (!row) return null
  if (row.hash !== hash || row.kind !== 'check_in') throw checkInAlreadySaved()
  const { printCard, propertyId, ...stored } = row.after as StoredResult
  const cardUrl = printCard
    ? await cardUrlFor(deps, db, access, { propertyId, id: stored.stayId }, 1)
    : null
  return { ...stored, cardUrl }
}

// The lead guest's profile corrections from the registration (the passport's spelling and
// nationality win over the booking's, audited as brick 4's guest corrections).
function correctionsOf(
  guest: { firstName: string; lastName: string; nationality: string },
  lead: RegistrationValues,
) {
  const corrections: { firstName?: string; lastName?: string; nationality?: string } = {}
  if (lead.firstName !== guest.firstName) corrections.firstName = lead.firstName
  if (lead.lastName !== guest.lastName) corrections.lastName = lead.lastName
  if (lead.nationality !== guest.nationality) corrections.nationality = lead.nationality
  return Object.keys(corrections).length ? corrections : null
}

export type CoreInput = Pick<
  CheckInFields,
  | 'roomId'
  | 'registrations'
  | 'idDocument'
  | 'printCard'
  | 'occurredAt'
  | 'durationSeconds'
  | 'source'
  | 'guest'
  | 'idempotencyKey'
> & { walkIn: boolean }

// The check-in itself, inside a transaction that holds the hotel (2) and the reservation (2b).
export async function checkInStay(
  tx: Tx,
  deps: Pick<CheckInDeps, 'cardSecret'>,
  access: Access,
  context: { hotel: BookingHotel; loaded: Loaded; stay: StayRow; hash: string; at?: Date },
  input: CoreInput,
): Promise<CheckedIn> {
  const { hotel, loaded, stay } = context
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  // The demo seed checks guests in "at 14:20 two days ago"; everything else is now.
  const now = context.at ?? new Date()

  // Step 3: the assigned room and the chosen one, in id order, checked free under the lock.
  const locked = await lockRoomsForStay(
    tx,
    scope,
    [stay.roomId, input.roomId].filter((id): id is string => Boolean(id)),
  )
  const target = locked.get(input.roomId) as RoomRow
  const previous = stay.roomId ? (locked.get(stay.roomId) ?? null) : null
  if (target.roomTypeId !== stay.roomTypeId) throw roomTypeDiffers(target.number)
  requireFits(target, stay)
  const conflict = await roomConflict(tx, target.id, stay.arrival, stay.departure, {
    stay: stay.id,
  })
  if (conflict) throw conflictError(target, conflict)
  const [room] = await tx
    .execute<{
      status: string
      due_out: string | null
    }>(sql`
    select r.housekeeping_status as status,
      (select g.first_name || ' ' || g.last_name from stays s join guests g on g.id = s.guest_id
        where s.room_id = r.id and s.status = 'checked_in' and s.departure = ${hotel.businessDate}::date
          and s.id <> ${stay.id}::uuid limit 1) as due_out
    from rooms r where r.id = ${target.id}::uuid`)
    .then((result) => result.rows)
  const roomNotReady = room?.status === 'dirty' || Boolean(room?.due_out)

  // Step 6: someone else is staying, or the registration corrects the guest.
  const events: AuditEvent[] = []
  let guestId = stay.guestId
  let guest = loaded.guest
  const lead = input.registrations[0] as RegistrationValues
  if (input.guest) {
    const swapped = await resolveGuest(tx, access, input.guest as GuestChoice, {
      reservationId: loaded.reservation.id,
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
    })
    events.push(...swapped.events)
    events.push({
      action: 'stay.guest_changed',
      entityType: 'reservation',
      entityId: loaded.reservation.id,
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
      before: { guestId: stay.guestId },
      after: { stayId: stay.id, guestId: swapped.id, guestName: swapped.name },
    })
    guestId = swapped.id
  }
  const [profile] = await tx
    .execute<{
      first_name: string
      last_name: string
      nationality: string
      phone: string | null
      email: string | null
    }>(
      sql`select first_name, last_name, nationality, phone, email from guests where id = ${guestId}::uuid`,
    )
    .then((result) => result.rows)
  if (!profile) throw stayNotFound()
  guest = {
    firstName: profile.first_name,
    lastName: profile.last_name,
    nationality: profile.nationality,
  }
  const corrections = correctionsOf(guest, lead)
  if (corrections) {
    const corrected = await resolveGuest(
      tx,
      access,
      { kind: 'existing', id: guestId, corrections },
      {
        reservationId: loaded.reservation.id,
        propertyId: hotel.id,
        businessDate: hotel.businessDate,
      },
    )
    events.push(...corrected.events)
    guest = {
      firstName: corrections.firstName ?? guest.firstName,
      lastName: corrections.lastName ?? guest.lastName,
      nationality: corrections.nationality ?? guest.nationality,
    }
  }
  const guestName = `${guest.firstName} ${guest.lastName}`

  // The registrations (step 7b: the card number), checked against the rule set in force.
  const ruleSet = await ruleSetFor(tx, { ...scope, stateCode: hotel.stateCode }, hotel.businessDate)
  const captured = await captureRegistrations(
    tx,
    access,
    {
      hotel: { id: hotel.id, bookingPrefix: hotel.bookingPrefix, businessDate: hotel.businessDate },
      stay: {
        id: stay.id,
        reservationId: loaded.reservation.id,
        reservationNumber: loaded.reservation.number,
      },
      guest: { id: guestId, phone: profile.phone, email: profile.email },
      ruleSet,
      source: input.walkIn ? 'walk_in' : input.source === 'offline' ? 'offline' : 'desk',
      idDocument: input.idDocument,
    },
    input.registrations as RegistrationValues[],
  )
  events.push(...captured.events)

  // The stay, the reservation, the change row.
  const version = stay.version + 1
  await tx
    .update(stays)
    .set({
      status: 'checked_in',
      roomId: target.id,
      guestId,
      checkedInAt: now,
      checkedInByMemberId: access.memberId,
      checkedInByName: access.userName,
      checkedInDeviceId: access.deviceId,
      checkedInBusinessDate: hotel.businessDate,
      cardPrintedAt: input.printCard ? now : null,
      version,
      updatedAt: now,
    })
    .where(eq(stays.id, stay.id))
  const othersIn = loaded.stays
    .filter((s) => s.id !== stay.id)
    .every((s) => s.status === 'checked_in' || s.status === 'cancelled')
  if (othersIn) {
    await tx
      .update(reservations)
      .set({ status: 'checked_in', updatedAt: now })
      .where(eq(reservations.id, loaded.reservation.id))
  }
  const result: Omit<CheckedIn, 'cardUrl'> = {
    stayId: stay.id,
    reservationId: loaded.reservation.id,
    number: loaded.reservation.number,
    guestName,
    version,
    room: { id: target.id, number: target.number },
    roomNotReady,
    checkedInAt: now.toISOString(),
    byName: access.userName,
    registrations: captured.views,
  }
  await tx.insert(reservationChanges).values({
    ...scope,
    reservationId: loaded.reservation.id,
    stayId: stay.id,
    kind: 'check_in',
    idempotencyKey: input.idempotencyKey,
    requestHash: context.hash,
    before: {
      status: stay.status,
      room: previous ? { id: previous.id, number: previous.number } : null,
      version: stay.version,
    },
    after: { ...result, printCard: input.printCard, propertyId: hotel.id } satisfies StoredResult,
    businessDate: hotel.businessDate,
    byMemberId: access.memberId,
    byName: access.userName,
    deviceId: access.deviceId,
  })

  const at = {
    entityType: 'reservation',
    entityId: loaded.reservation.id,
    propertyId: hotel.id,
    businessDate: hotel.businessDate,
  }
  const roomOf = (r: RoomRow) => ({ id: r.id, number: r.number, roomTypeName: r.roomTypeName })
  if (previous?.id !== target.id) {
    events.push({
      action: previous ? 'stay.room_moved' : 'stay.room_assigned',
      ...at,
      before: { room: previous ? roomOf(previous) : null },
      after: {
        stayId: stay.id,
        reservationNumber: loaded.reservation.number,
        guestName,
        arrival: stay.arrival,
        departure: stay.departure,
        room: roomOf(target),
        source: 'check_in',
        keptBookedPrice: false,
      },
    })
  }
  const occurredAt = new Date(input.occurredAt)
  const late = now.getTime() - occurredAt.getTime() > 60_000
  events.push({
    action: 'stay.checked_in',
    ...at,
    before: { status: stay.status },
    after: {
      stayId: stay.id,
      reservationNumber: loaded.reservation.number,
      guestName,
      room: { ...roomOf(target), housekeepingStatus: room?.status ?? null },
      roomNotReady,
      arrival: stay.arrival,
      departure: stay.departure,
      nights: loaded.nights.filter((n) => n.stayId === stay.id).length,
      walkIn: input.walkIn,
      source: input.walkIn ? 'walk_in' : input.source,
      registrationIds: captured.rows.map((row) => row.id),
      cardPrinted: input.printCard,
      idPhotoMissing: captured.idPhotoMissing,
      durationSeconds: input.durationSeconds,
      occurredAt: occurredAt.toISOString(),
      syncedAt: late ? now.toISOString() : null,
      liveProperty: hotel.liveSince !== null,
    },
  })
  if (input.printCard) {
    events.push({
      action: 'registration_card.printed',
      ...at,
      after: {
        stayId: stay.id,
        cardNumber: captured.rows.find((row) => row.lead)?.cardNumber ?? null,
        copy: 'original',
        number: 1,
      },
    })
  }
  await recordAuditMany(tx, access, events)
  const cardUrl = input.printCard
    ? await cardUrlFor(deps, tx, access, { propertyId: hotel.id, id: stay.id }, 1)
    : null
  return { ...result, cardUrl }
}

async function checkInInTx(
  tx: Tx,
  deps: CheckInDeps,
  access: Access,
  input: CheckInFields,
  hash: string,
  at?: Date,
): Promise<CheckedIn> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`check-in:${access.organizationId}:${input.idempotencyKey}`}, 0))`,
  )
  const replayed = await replayOf(tx, deps, access, input.idempotencyKey, hash)
  if (replayed) return replayed
  const where = await stayHotel(tx, access, input.stayId)
  // Step 2: the hotel; 2b: the reservation row.
  const hotel = await holdBookingHotel(tx, access, where.propertyId)
  const loaded = await loadForChange(tx, access, where.reservationId, true)
  const stay = loaded.stays.find((s) => s.id === input.stayId)
  if (!stay) throw stayNotFound()
  // An offline check-in made on a business date that has since closed: a person decides.
  if (input.businessDate !== hotel.businessDate) throw businessDateMoved(hotel.businessDate)
  if (stay.status === 'checked_in' && stay.checkedInAt) {
    throw alreadyCheckedIn(
      stay.checkedInByName ?? 'Someone',
      `${loaded.guest.firstName} ${loaded.guest.lastName}`,
      stay.checkedInAt,
      hotel.timeZone,
    )
  }
  await requireVersion(tx, loaded, input.version, stay.version, hotel.timeZone)
  const problem = checkInProblem(stay, loaded.reservation.status, hotel)
  if (problem) throw notCheckable(problem)
  return checkInStay(
    tx,
    deps,
    access,
    { hotel, loaded, stay, hash, ...(at ? { at } : {}) },
    { ...input, walkIn: false },
  )
}

// What makes two sends the same check-in. Typed ID numbers go in as keyed fingerprints: the whole
// number counts (two numbers with the same mask differ), and the stored hash can never be matched
// against guessed numbers without the key (decision 0031).
export function checkInHash(
  input: Pick<CheckInFields, 'idempotencyKey' | 'registrations'> & Record<string, unknown>,
) {
  const payload = {
    ...input,
    occurredAt: undefined,
    durationSeconds: undefined,
    registrations: input.registrations.map((registration) => ({
      ...registration,
      idNumber: registration.idNumber ? idFingerprint(registration.idNumber) : undefined,
      visaNumber: registration.visaNumber ? idFingerprint(registration.visaNumber) : undefined,
    })),
  }
  return requestHashOf(payload)
}

// `options.at` is the demo seed's: when the check-in happened (never sent by a client).
export async function checkIn(
  deps: CheckInDeps,
  access: Access,
  input: CheckInInput,
  options: { at?: Date } = {},
): Promise<CheckedIn> {
  requireCheckIn(access)
  const parsed = checkInInputSchema.parse(input)
  const hash = checkInHash(parsed)
  try {
    return await deps.db.transaction((tx) =>
      checkInInTx(tx, deps, access, parsed, hash, options.at),
    )
  } catch (error) {
    if (
      isUniqueViolation(error) &&
      violatedConstraint(error) === 'reservation_changes_organization_id_idempotency_key_unique'
    ) {
      const replayed = await replayOf(deps.db, deps, access, parsed.idempotencyKey, hash)
      if (replayed) return replayed
      throw checkInAlreadySaved()
    }
    if (isExclusionViolation(error)) throw roomTaken({ id: parsed.roomId, number: '' }, '')
    throw error
  }
}
