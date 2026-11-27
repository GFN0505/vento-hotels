// The booking service: every way a reservation is made (the desk now; walk-in, groups, import, the
// booking engine and OTAs later) goes through bookInTx, in one transaction, in the lock order of
// locks.ts. Nothing is visible until it commits.
import { createHash } from 'node:crypto'
import {
  addDays,
  type CreateReservationInput,
  createReservationSchema,
  DISCOUNT_REASON_LABELS,
  dec,
  newId,
  nightsBetween,
  periodOf,
  reservationNumber,
  toAmount,
} from '@vento/shared'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { approvalOnOneStay } from '../approvals/errors.ts'
import {
  lockApprovals,
  markApprovalUsed,
  noteApprovalsUsedFor,
  type UsedApproval,
} from '../approvals/use.ts'
import { type AuditEvent, recordAuditMany } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isUniqueViolation, violatedConstraint } from '../db/errors.ts'
import { reservationCounters, reservations, stayNights, stays } from '../db/schema/reservations.ts'
import { roomTypes } from '../db/schema/rooms.ts'
import { rulesByNight } from '../finance/taxes.ts'
import { lockHotelRatesShared } from '../rates/context.ts'
import { quoteStay, requireStayDates } from '../rates/quote.ts'
import { type Access, scopeToProperties } from '../tenancy/access.ts'
import {
  type BookingHotel,
  holdBookingHotel,
  type Reader,
  requireReservationManage,
  type Tx,
} from './context.ts'
import {
  type Alternative,
  idempotencyConflict,
  keyUsedElsewhere,
  planCorporateOnly,
  priceChanged,
  restrictionReasonRequired,
  roomTypeRemoved,
  soldOut,
} from './errors.ts'
import { type GuestChoice, resolveGuest } from './guests.ts'
import {
  addBooked,
  bookedFor,
  capacityOf,
  keyOf,
  leftOn,
  lockInventory,
  type NightKey,
  type Scope,
} from './locks.ts'
import {
  type PricedStay,
  priceChangedMessage,
  priceStay,
  requireDiscountAllowed,
} from './pricing.ts'

export type CreateInput = z.output<typeof createReservationSchema>

// Internal options (not in the contract): the demo seed books "on earlier dates", and corporate
// plans are booked by the seed until corporate accounts arrive (brick 12).
export type BookOptions = {
  bookedAt?: Date
  bookedOnBusinessDate?: string
  allowCorporate?: boolean
  // The seed prices from the same quote it books with, so it skips the "still the price?" check.
  trustQuote?: boolean
}

export type Booked = { id: string; number: string }

function requestHash(input: CreateInput): string {
  const { idempotencyKey: _key, ...rest } = input
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex')
}

async function existingBooking(db: Reader, access: Access, key: string) {
  const [row] = await db
    .select({ id: reservations.id, number: reservations.number, hash: reservations.requestHash })
    .from(reservations)
    .where(
      and(
        eq(reservations.organizationId, access.organizationId),
        eq(reservations.idempotencyKey, key),
        // Only bookings at the member's hotels are replayed: a key never reveals another's.
        scopeToProperties(access, reservations.propertyId),
      ),
    )
  return row
}

function replay(row: { id: string; number: string; hash: string }, hash: string): Booked {
  if (row.hash !== hash) throw idempotencyConflict({ id: row.id, number: row.number })
  return { id: row.id, number: row.number }
}

const nightKeys = (stay: { roomTypeId: string; arrival: string; departure: string }) =>
  Array.from({ length: nightsBetween(stay.arrival, stay.departure) }, (_, i) => ({
    roomTypeId: stay.roomTypeId,
    date: addDays(stay.arrival, i),
  }))

// Other room types free on every night of the stay, best first, for the sold-out message.
async function alternatives(
  db: Reader,
  scope: Scope,
  stay: { roomTypeId: string; arrival: string; departure: string },
): Promise<Alternative[]> {
  const types = await capacityOf(db, scope, await activeTypeIds(db, scope))
  const ids = [...types.keys()].filter((id) => id !== stay.roomTypeId)
  const booked = await bookedFor(db, scope, ids, stay.arrival, addDays(stay.departure, -1))
  const result: Alternative[] = []
  for (const id of ids) {
    const capacity = types.get(id)
    const nights = nightKeys({ ...stay, roomTypeId: id })
    const left = Math.min(
      ...nights.map((key) => leftOn(capacity, booked.get(keyOf(key)) ?? 0).left),
    )
    if (left > 0 && capacity) result.push({ roomTypeId: id, name: capacity.name, left })
  }
  return result.sort((a, b) => b.left - a.left)
}

async function activeTypeIds(db: Reader, scope: Scope): Promise<string[]> {
  const rows = await db
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.organizationId, scope.organizationId),
        eq(roomTypes.propertyId, scope.propertyId),
        isNull(roomTypes.archivedAt),
      ),
    )
  return rows.map((row) => row.id)
}

// Steps 3–4: lock every night the request needs and check each can take the rooms it asks for.
async function holdRooms(tx: Tx, scope: Scope, input: CreateInput) {
  const wanted = new Map<string, number>()
  const keys: NightKey[] = []
  for (const stay of input.stays) {
    for (const key of nightKeys(stay)) {
      keys.push(key)
      wanted.set(keyOf(key), (wanted.get(keyOf(key)) ?? 0) + 1)
    }
  }
  const booked = await lockInventory(tx, scope, keys)
  const capacity = await capacityOf(tx, scope, [...new Set(keys.map((k) => k.roomTypeId))])
  const ordered = [...wanted.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [key, count] of ordered) {
    const [roomTypeId = '', date = ''] = key.split(':')
    const type = capacity.get(roomTypeId)
    if (!type) throw await roomTypeRemoved(tx, scope, roomTypeId)
    const night = leftOn(type, booked.get(key) ?? 0)
    if (night.bookable < count) {
      const stay = input.stays.find((s) => s.roomTypeId === roomTypeId) ?? input.stays[0]
      const others = stay ? await alternatives(tx, scope, stay) : []
      throw soldOut({ id: roomTypeId, name: type.name }, date, night.left, others)
    }
  }
  return wanted
}

async function nextNumber(tx: Tx, scope: Scope, hotel: BookingHotel, businessDate: string) {
  const period = periodOf(businessDate)
  const [row] = await tx
    .insert(reservationCounters)
    .values({ ...scope, period, last: 1 })
    .onConflictDoUpdate({
      target: [reservationCounters.propertyId, reservationCounters.period],
      set: { last: sql`${reservationCounters.last} + 1`, updatedAt: new Date() },
    })
    .returning({ last: reservationCounters.last })
  return reservationNumber(hotel.bookingPrefix, period, row?.last ?? 1)
}

export async function bookInTx(
  tx: Tx,
  access: Access,
  input: CreateInput,
  options: BookOptions = {},
): Promise<Booked> {
  const hash = requestHash(input)
  // Step 0: twins of one request (a double press, a retry) queue here, so the second finds the
  // first's booking instead of racing it for the last room.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`booking:${access.organizationId}:${input.idempotencyKey}`}, 0))`,
  )

  // Steps 1–2: the rates lock (shared), then the hotel, in the member's scope.
  await lockHotelRatesShared(tx, input.propertyId)
  const hotel = await holdBookingHotel(tx, access, input.propertyId)
  // A replay is answered only after the hotel check, and only for the member's hotels.
  const existing = await existingBooking(tx, access, input.idempotencyKey)
  if (existing) return replay(existing, hash)
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  for (const stay of input.stays) requireStayDates(stay, hotel)
  const bookedAt = options.bookedAt ?? new Date()
  const businessDate = options.bookedOnBusinessDate ?? hotel.businessDate

  // Steps 3–4: inventory.
  const wanted = await holdRooms(tx, scope, input)

  // Step 5: price each stay as quoted, inside the locks.
  const allDates = input.stays.flatMap((stay) => nightKeys(stay).map((key) => key.date))
  const rules = await rulesByNight(tx, access, hotel, allDates)
  const priced: PricedStay[] = []
  const approved: (UsedApproval | null)[] = []
  // Stay ids are made now, so an approval is marked used the moment it is checked: a second stay
  // carrying the same approval then finds it used (APPROVAL_USED).
  const stayIds = input.stays.map(() => newId())
  // Step 5a: every approval of the request, locked in id order (deadlock safety, locks.ts).
  const approvalIds = input.stays.flatMap((stay) => (stay.approvalId ? [stay.approvalId] : []))
  if (new Set(approvalIds).size !== approvalIds.length) throw approvalOnOneStay()
  await lockApprovals(tx, access, approvalIds)
  for (const [index, stay] of input.stays.entries()) {
    const quote = await quoteStay(tx, access, { propertyId: hotel.id, ...stay })
    if (quote.terms.bookableBy === 'corporate_only' && !options.allowCorporate) {
      throw planCorporateOnly(quote.planName)
    }
    const broken = quote.breaks[0]
    if (broken && !stay.restrictionReason) throw restrictionReasonRequired(broken.kind, broken.date)
    const result = priceStay(quote, stay.discount, rules, hotel, bookedAt)
    // Step 5b: an approval for a discount over the limit is locked and checked here.
    const used = await requireDiscountAllowed(tx, access, result, stay, {
      propertyId: hotel.id,
      businessDate,
      timeZone: hotel.timeZone,
      now: bookedAt,
    })
    if (used) {
      await markApprovalUsed(tx, used.id, { stayId: stayIds[index] ?? '', at: bookedAt })
    }
    approved.push(used)
    if (!options.trustQuote && result.hash !== stay.quoteHash) {
      throw priceChanged(index, priceChangedMessage(result))
    }
    priced.push(result)
  }

  // Step 6: the guest; step 7: the number.
  const reservationId = newId()
  const guest = await resolveGuest(tx, access, input.guest as GuestChoice, {
    reservationId,
    propertyId: hotel.id,
    businessDate,
  })
  const number = await nextNumber(tx, scope, hotel, businessDate)
  await noteApprovalsUsedFor(tx, approvalIds, number)

  // Step 8: the reservation, its stays and nights; the rooms booked.
  const deposits = priced.flatMap((stay) => (stay.deposit ? [stay.deposit] : []))
  const depositDue = deposits.length
    ? toAmount(deposits.reduce((sum, d) => sum.plus(d.amount), dec('0')))
    : null
  const depositDueAt = deposits.length
    ? new Date(Math.min(...deposits.map((d) => d.dueAt.getTime())))
    : null
  const quotedTotal = toAmount(priced.reduce((sum, stay) => sum.plus(stay.totals.total), dec('0')))
  const arrival = input.stays.map((stay) => stay.arrival).sort()[0] ?? ''
  const departure =
    input.stays
      .map((stay) => stay.departure)
      .sort()
      .at(-1) ?? ''
  await tx.insert(reservations).values({
    id: reservationId,
    ...scope,
    number,
    status: 'confirmed',
    source: input.source,
    guestId: guest.id,
    guarantee: depositDue ? 'deposit' : 'none',
    depositDue,
    depositDueAt,
    quotedTotal,
    notes: input.notes || null,
    bookedByMemberId: access.memberId,
    bookedByName: access.userName,
    deviceId: access.deviceId,
    bookedAt,
    bookedOnBusinessDate: businessDate,
    arrival,
    departure,
    idempotencyKey: input.idempotencyKey,
    requestHash: hash,
  })
  const events: AuditEvent[] = [...guest.events]
  const stayEvents: AuditEvent[] = []
  const storedStays = []
  for (const [index, stay] of input.stays.entries()) {
    const result = priced[index] as PricedStay
    const approval = approved[index] ?? null
    const stayId = stayIds[index] ?? newId()
    const discount = result.discount
    const broken = result.quote.breaks[0]
    await tx.insert(stays).values({
      id: stayId,
      ...scope,
      reservationId,
      guestId: guest.id,
      roomTypeId: stay.roomTypeId,
      ratePlanId: stay.ratePlanId,
      ratePlanVersion: result.quote.ratePlanVersion,
      arrival: stay.arrival,
      departure: stay.departure,
      adults: stay.adults,
      children: stay.children,
      status: 'confirmed',
      quoteHash: result.hash,
      terms: { ...result.terms, penaltyAmount: result.cancellation.penalty },
      cancellationDeadline:
        result.cancellation.kind === 'free_until' ? result.cancellation.deadline : null,
      quotedTotal: result.totals.total,
      discountPercent: discount ? discount.percent.toDecimalPlaces(4).toString() : null,
      discountRate: discount?.input.kind === 'rate' ? discount.input.value : null,
      discountReason: discount?.input.reason ?? null,
      discountReasonText: discount?.input.reasonText ?? null,
      discountNote: discount?.input.note ?? null,
      discountByMemberId: discount ? access.memberId : null,
      discountByName: discount ? access.userName : null,
      restrictionOverride:
        broken && stay.restrictionReason
          ? { kind: broken.kind, date: broken.date, reason: stay.restrictionReason }
          : null,
    })
    await tx.insert(stayNights).values(
      result.nights.map((night) => ({
        ...scope,
        stayId,
        date: night.date,
        planPrice: night.planPrice,
        soldPrice: night.soldPrice,
        extraAdult: night.extraAdult,
        mealAllocation: night.mealAllocation,
        priceFrom: night.from === 'date' ? ('date_price' as const) : ('standard_price' as const),
      })),
    )
    const nights = result.nights.map((n) => ({
      date: n.date,
      planPrice: n.planPrice,
      soldPrice: n.soldPrice,
    }))
    storedStays.push({
      stayId,
      roomTypeId: stay.roomTypeId,
      roomTypeName: result.quote.roomTypeName,
      ratePlanId: stay.ratePlanId,
      planName: result.quote.planName,
      ratePlanVersion: result.quote.ratePlanVersion,
      arrival: stay.arrival,
      departure: stay.departure,
      adults: stay.adults,
      children: stay.children,
      nights,
      quoteHash: result.hash,
    })
    const at = {
      entityType: 'reservation',
      entityId: reservationId,
      propertyId: hotel.id,
      businessDate,
    }
    if (discount) {
      stayEvents.push({
        action: 'stay.discount_applied',
        ...at,
        approverMemberId: approval?.approverMemberId ?? null,
        reason: discount.input.reasonText || DISCOUNT_REASON_LABELS[discount.input.reason],
        after: {
          stayId,
          reservationNumber: number,
          guestName: guest.name,
          roomTypeName: result.quote.roomTypeName,
          planName: result.quote.planName,
          nights,
          percent: discount.percent.toDecimalPlaces(4).toString(),
          limit: access.rules['stay.rate_override'].limit,
          discountReason: discount.input.reason,
          note: discount.input.note ?? null,
          approverMemberId: approval?.approverMemberId ?? null,
          ...(approval
            ? {
                approvalId: approval.id,
                approverName: approval.approverName,
                approverLimit: approval.approverLimit,
                approvalMethod: approval.method,
                approvalDevice: approval.deviceName,
              }
            : {}),
          exception: 'discount',
          liveProperty: hotel.liveSince !== null,
        },
      })
    }
    if (broken && stay.restrictionReason) {
      stayEvents.push({
        action: 'stay.restriction_overridden',
        ...at,
        reason: stay.restrictionReason,
        after: {
          stayId,
          reservationNumber: number,
          kind: broken.kind,
          date: broken.date,
          planName: result.quote.planName,
          message: broken.message,
        },
      })
    }
  }
  await addBooked(tx, scope, wanted)

  // Step 9: the audit events, in the same transaction.
  events.push({
    action: 'reservation.created',
    entityType: 'reservation',
    entityId: reservationId,
    propertyId: hotel.id,
    businessDate,
    after: {
      number,
      status: 'confirmed',
      source: input.source,
      guarantee: depositDue ? 'deposit' : 'none',
      guestId: guest.id,
      guestName: guest.name,
      depositDue: depositDue ? { amount: depositDue, dueAt: depositDueAt?.toISOString() } : null,
      quotedTotal,
      idempotencyKey: input.idempotencyKey,
      stays: storedStays,
      liveProperty: hotel.liveSince !== null,
    },
  })
  await recordAuditMany(tx, access, [...events, ...stayEvents])
  return { id: reservationId, number }
}

export async function createReservation(
  db: Database,
  access: Access,
  input: CreateReservationInput | CreateInput,
  options: BookOptions = {},
): Promise<Booked> {
  requireReservationManage(access)
  const parsed = createReservationSchema.parse(input)
  try {
    return await db.transaction((tx) => bookInTx(tx, access, parsed, options))
  } catch (error) {
    // A twin that slipped past the key lock (another API process): return what the first made.
    if (
      isUniqueViolation(error) &&
      violatedConstraint(error) === 'reservations_organization_id_idempotency_key_unique'
    ) {
      const existing = await existingBooking(db, access, parsed.idempotencyKey)
      if (existing) return replay(existing, requestHash(parsed))
      throw keyUsedElsewhere()
    }
    throw error
  }
}
