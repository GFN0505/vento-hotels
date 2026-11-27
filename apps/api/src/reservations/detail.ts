// One reservation: its stays as sold (stored prices and terms), tax lines recomputed with the rules
// in force on each night, the guest, the hotel's guest transfer account for the copied confirmation,
// and the activity from the audit log.

import { ORPCError } from '@orpc/server'
import {
  allowedActions,
  type DiscountReason,
  type EndReason,
  formatMoney,
  formatPercent,
  formatRateDate,
  nightLines,
  nightTaxes,
  type ReservationDetail,
  type StayTerms,
  stayTotals,
  type TaxRuleInForce,
} from '@vento/shared'
import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { approvals } from '../db/schema/approvals.ts'
import { bankAccounts } from '../db/schema/finance.ts'
import { auditEvents } from '../db/schema/governance.ts'
import { guests, reservations, stayNights, stays } from '../db/schema/reservations.ts'
import { rooms, roomTypes } from '../db/schema/rooms.ts'
import { methodSettings } from '../finance/payment-methods.ts'
import { rulesByNight } from '../finance/taxes.ts'
import { type Access, can } from '../tenancy/access.ts'
import { hotelNotFound } from '../tenancy/errors.ts'
import { penaltiesOf } from './change/views.ts'
import {
  type BookingHotel,
  type Reader,
  readBookingHotel,
  requireReservationRead,
} from './context.ts'
import { reservationNotFound } from './errors.ts'

type StoredTerms = StayTerms & { penaltyAmount: string }

const naira = (amount: unknown) => formatMoney({ amount: String(amount), currency: 'NGN' })

// "9–12 Dec 2026", "28 Nov – 2 Dec 2026", "30 Dec 2026 – 2 Jan 2027".
export function rangeLabel(arrival: string, departure: string): string {
  const [ay, am] = arrival.split('-')
  const [dy, dm] = departure.split('-')
  if (ay !== dy) return `${formatRateDate(arrival)} – ${formatRateDate(departure)}`
  if (am !== dm) return `${formatRateDate(arrival, false)} – ${formatRateDate(departure)}`
  return `${Number(arrival.slice(8))}–${formatRateDate(departure)}`
}

const guestsLabel = (adults: number, children: number) =>
  [
    `${adults} ${adults === 1 ? 'adult' : 'adults'}`,
    children ? `${children} ${children === 1 ? 'child' : 'children'}` : '',
  ]
    .filter(Boolean)
    .join(', ')

type StayShape = {
  arrival: string
  departure: string
  roomTypeName: string
  adults: number
  children: number
  total: string
}

// "9–12 Dec → 9–13 Dec 2026 · ₦617,400.00 → ₦823,200.00 · Room type Deluxe King → Executive King".
function changedLine(before: StayShape, after: StayShape): string {
  const parts: string[] = []
  if (before.arrival !== after.arrival || before.departure !== after.departure) {
    parts.push(
      `${rangeLabel(before.arrival, before.departure)} → ${rangeLabel(after.arrival, after.departure)}`,
    )
  }
  if (before.total !== after.total) parts.push(`${naira(before.total)} → ${naira(after.total)}`)
  if (before.roomTypeName !== after.roomTypeName) {
    parts.push(`Room type ${before.roomTypeName} → ${after.roomTypeName}`)
  }
  if (before.adults !== after.adults || before.children !== after.children) {
    parts.push(
      `Guests ${guestsLabel(before.adults, before.children)} → ${guestsLabel(after.adults, after.children)}`,
    )
  }
  return parts.join(' · ')
}

const approvedBy = (after: Record<string, unknown>) =>
  typeof after.approverName === 'string'
    ? `Approved by ${after.approverName} (${
        after.approvalMethod === 'pin_here'
          ? `PIN${typeof after.approvalDevice === 'string' ? ` on ${after.approvalDevice}` : ''}`
          : 'inbox'
      })`
    : null

// One line per event for the Activity card.
function activityLine(event: {
  action: string
  reason: string | null
  before?: unknown
  after: unknown
}): {
  title: string
  detail: string | null
} {
  const after = (event.after ?? {}) as Record<string, unknown>
  switch (event.action) {
    case 'reservation.created':
      return { title: 'Reservation created', detail: null }
    case 'reservation.modified': {
      const before = (event.before ?? {}) as StayShape
      return { title: 'Changed', detail: changedLine(before, after as StayShape) || null }
    }
    case 'reservation.cancelled':
    case 'reservation.no_show': {
      const penalty = (after.penalty ?? {}) as { amount?: string; waived?: boolean }
      const cost = penalty.amount ? `Penalty ${naira(penalty.amount)}` : 'No penalty'
      return {
        title: event.action === 'reservation.cancelled' ? 'Cancelled' : 'Marked no-show',
        detail: [
          typeof after.reasonLabel === 'string' ? after.reasonLabel : null,
          cost,
          typeof after.note === 'string' && after.note ? `“${after.note}”` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    }
    case 'reservation.penalty_waived':
      return {
        title: `Penalty waived · ${naira(after.amount ?? '0')}`,
        detail:
          [event.reason ? `“${event.reason}”` : null, approvedBy(after)]
            .filter(Boolean)
            .join(' · ') || null,
      }
    case 'approval.requested':
      return {
        title: `Waiver asked of ${String(after.approverName ?? 'a manager')}`,
        detail: null,
      }
    case 'approval.declined':
      return {
        title: `${String(after.approverName ?? 'The manager')} declined the waiver`,
        detail: event.reason ? `“${event.reason}”` : null,
      }
    case 'approval.expired':
      return { title: 'Waiver request expired', detail: null }
    case 'stay.discount_applied': {
      const nights = (after.nights as { planPrice: string; soldPrice: string }[] | undefined) ?? []
      const first = nights[0]
      const approver =
        typeof after.approverName === 'string'
          ? `Approved by ${after.approverName} (${
              after.approvalMethod === 'pin_here'
                ? `PIN${typeof after.approvalDevice === 'string' ? ` on ${after.approvalDevice}` : ''}`
                : 'inbox'
            })`
          : null
      const parts = [
        first ? `${naira(first.planPrice)} → ${naira(first.soldPrice)}` : null,
        event.reason ? `“${event.reason}”` : null,
        approver,
      ]
      const onNew = after.changeId
        ? after.scope === 'new_nights'
          ? nights.length === 1
            ? ' on the new night'
            : ' on the new nights'
          : ' on every night'
        : ''
      return {
        title: `Discount ${formatPercent(String(after.percent ?? '0'))}%${onNew}`,
        detail: parts.filter(Boolean).join(' · ') || null,
      }
    }
    case 'stay.restriction_overridden':
      return {
        title:
          after.kind === 'min_stay'
            ? 'Booked through min stay'
            : after.kind === 'closed_to_arrival'
              ? 'Booked through closed to arrival'
              : 'Booked through a closed night',
        detail: event.reason ? `“${event.reason}”` : null,
      }
    case 'stay.room_assigned':
    case 'stay.room_moved':
    case 'stay.room_unassigned': {
      const before = ((event.before ?? {}) as { room?: { number?: string } | null }).room
      const room = (after.room ?? null) as { number?: string } | null
      const title =
        event.action === 'stay.room_assigned'
          ? `Room ${room?.number ?? ''} assigned`
          : event.action === 'stay.room_moved'
            ? `Room ${before?.number ?? ''} → ${room?.number ?? ''}`
            : 'Room removed'
      const approver =
        typeof after.approverName === 'string' && after.approverName
          ? `Approved by ${after.approverName}`
          : null
      return {
        title,
        detail: [event.reason, approver].filter(Boolean).join(' · ') || null,
      }
    }
    case 'guest.created':
      return { title: 'Guest added', detail: null }
    case 'guest.changed':
      return {
        title: 'Guest details corrected',
        detail: Object.keys(after)
          .filter((key) => key !== 'reservationId')
          .join(', '),
      }
    default:
      return { title: event.action, detail: null }
  }
}

async function activity(db: Reader, access: Access, id: string) {
  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorName: auditEvents.actorName,
      reason: auditEvents.reason,
      before: auditEvents.before,
      after: auditEvents.after,
      at: auditEvents.createdAt,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, access.organizationId),
        // The penalty's own record is in the audit trail; the activity names it on the cancel.
        ne(auditEvents.action, 'penalty.recorded'),
        or(
          and(eq(auditEvents.entityType, 'reservation'), eq(auditEvents.entityId, id)),
          // Waiver requests for this reservation's penalties (asked, declined, expired).
          and(
            eq(auditEvents.entityType, 'approval'),
            inArray(auditEvents.action, [
              'approval.requested',
              'approval.declined',
              'approval.expired',
            ]),
            sql`${auditEvents.entityId} in (select a.id from ${approvals} a where a.organization_id = ${access.organizationId} and a.kind = 'penalty_waiver' and a.subject->>'reservationId' = ${id})`,
          ),
          and(
            eq(auditEvents.entityType, 'guest'),
            sql`${auditEvents.after}->>'reservationId' = ${id}`,
          ),
        ),
      ),
    )
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(50)
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    ...activityLine(row),
    actorName: row.actorName,
    at: row.at.toISOString(),
  }))
}

async function transferAccount(db: Reader, hotel: BookingHotel) {
  const settings = await methodSettings(db, hotel.id)
  const accountId = settings.bank_transfer.enabled
    ? settings.bank_transfer.guestTransferAccountId
    : null
  if (!accountId) return null
  const [account] = await db
    .select({
      bankName: bankAccounts.bankName,
      accountNumber: bankAccounts.accountNumber,
      accountName: bankAccounts.accountName,
    })
    .from(bankAccounts)
    .where(eq(bankAccounts.id, accountId))
  return account ?? null
}

// The rules for every night, or null when the hotel's taxes aren't set up (any more).
async function rulesFor(db: Reader, access: Access, hotel: BookingHotel, dates: string[]) {
  try {
    return await rulesByNight(db, access, hotel, dates)
  } catch (error) {
    if (
      error instanceof ORPCError &&
      (error.data as { code?: string })?.code === 'TAXES_NOT_SET_UP'
    ) {
      return null
    }
    throw error
  }
}

export async function getReservation(
  db: Database,
  access: Access,
  id: string,
): Promise<ReservationDetail> {
  requireReservationRead(access)
  const [reservation] = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.organizationId, access.organizationId)))
  if (!reservation) throw reservationNotFound()
  // Another hotel of the group the member can't see answers as the hotel switch does.
  if (!access.allProperties && !access.propertyIds.includes(reservation.propertyId)) {
    throw hotelNotFound()
  }
  const hotel = await readBookingHotel(db, access, reservation.propertyId)
  const [guest] = await db.select().from(guests).where(eq(guests.id, reservation.guestId))
  if (!guest) throw reservationNotFound()
  const stayRows = await db
    .select({ stay: stays, roomTypeName: roomTypes.name, roomNumber: rooms.number })
    .from(stays)
    .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
    .leftJoin(rooms, eq(rooms.id, stays.roomId))
    .where(eq(stays.reservationId, reservation.id))
    .orderBy(asc(stays.arrival), asc(stays.id))
  // Who approved a discount over the limit: the approval used for each stay (brick 5).
  const approvers = new Map(
    (
      await db
        .select({ stayId: approvals.usedEntityId, name: approvals.approverName })
        .from(approvals)
        .where(
          and(
            eq(approvals.organizationId, access.organizationId),
            eq(approvals.usedEntityType, 'stay'),
            inArray(
              approvals.usedEntityId,
              stayRows.map((row) => row.stay.id),
            ),
          ),
        )
    ).map((row) => [row.stayId, row.name]),
  )
  const nightRows = await db
    .select()
    .from(stayNights)
    .where(
      inArray(
        stayNights.stayId,
        stayRows.map((row) => row.stay.id),
      ),
    )
    .orderBy(asc(stayNights.date))
  const rules = await rulesFor(
    db,
    access,
    hotel,
    nightRows.map((night) => night.date),
  )
  const empty: TaxRuleInForce[] = []
  const staysView = stayRows.map(({ stay, roomTypeName, roomNumber }) => {
    const terms = stay.terms as StoredTerms
    const nights = nightRows.filter((night) => night.stayId === stay.id)
    const taxes = nights.map((night) =>
      nightTaxes(night, rules?.get(night.date) ?? empty, terms.pricesIncludeTaxes),
    )
    const { penaltyAmount, ...snapshot } = terms
    return {
      id: stay.id,
      version: stay.version,
      roomTypeId: stay.roomTypeId,
      roomTypeName,
      arrival: stay.arrival,
      departure: stay.departure,
      adults: stay.adults,
      children: stay.children,
      terms: snapshot,
      cancellation:
        terms.cancellation.kind === 'free_until' && stay.cancellationDeadline
          ? {
              kind: 'free_until' as const,
              deadline: stay.cancellationDeadline.toISOString(),
              penalty: penaltyAmount,
              penaltyKind: terms.cancellation.penalty.kind,
              percent:
                terms.cancellation.penalty.kind === 'percent_of_stay'
                  ? terms.cancellation.penalty.percent
                  : null,
            }
          : { kind: 'non_refundable' as const, penalty: penaltyAmount },
      discount:
        stay.discountPercent && stay.discountReason
          ? {
              percent: formatPercent(stay.discountPercent),
              reason: stay.discountReason as DiscountReason,
              reasonText: stay.discountReasonText,
              note: stay.discountNote,
              byName: stay.discountByName ?? '',
              approverName: approvers.get(stay.id) ?? null,
            }
          : null,
      restrictionOverride: stay.restrictionOverride as {
        kind: string
        date: string
        reason: string
      } | null,
      room: stay.roomId && roomNumber ? { id: stay.roomId, number: roomNumber } : null,
      nights: nights.map((night, index) => {
        const tax = taxes[index]
        return {
          date: night.date,
          planPrice: night.planPrice,
          soldPrice: night.soldPrice,
          extraAdult: night.extraAdult,
          mealAllocation: night.mealAllocation,
          net: tax?.net ?? night.soldPrice,
          lines: tax ? nightLines(tax) : [],
          rounding: tax?.rounding ?? '0.00',
          gross: tax?.gross ?? night.soldPrice,
        }
      }),
      totals: stayTotals(taxes),
    }
  })
  const allowed = allowedActions(reservation.status, reservation.arrival, hotel.businessDate)
  const manage = can(access, 'reservation.manage') && !hotel.archived
  return {
    id: reservation.id,
    number: reservation.number,
    status: reservation.status,
    version: stayRows.reduce((sum, row) => sum + row.stay.version, 0),
    end:
      (reservation.status === 'cancelled' || reservation.status === 'no_show') &&
      reservation.endedAt
        ? {
            kind:
              reservation.status === 'cancelled' ? ('cancelled' as const) : ('no_show' as const),
            at: reservation.endedAt.toISOString(),
            businessDate: reservation.endedOnBusinessDate ?? reservation.bookedOnBusinessDate,
            byName: reservation.endedByName ?? '',
            reason: (reservation.endReason as EndReason | null) ?? null,
            reasonText: reservation.endReasonText,
            note: reservation.endNote,
          }
        : null,
    penalties: await penaltiesOf(db, access, reservation.id),
    actions: {
      modify: manage && allowed.modify,
      cancel: manage && allowed.cancel,
      noShow: manage && allowed.noShow,
      blocked: allowed.blocked,
      canManage: manage,
      canWaive: manage && can(access, 'penalty.waive'),
      roomMove:
        can(access, 'room.move') &&
        !hotel.archived &&
        reservation.status === 'confirmed' &&
        reservation.arrival >= hotel.businessDate,
    },
    source: reservation.source,
    guarantee: reservation.guarantee,
    notes: reservation.notes,
    quotedTotal: reservation.quotedTotal,
    depositDue:
      reservation.depositDue && reservation.depositDueAt
        ? { amount: reservation.depositDue, dueAt: reservation.depositDueAt.toISOString() }
        : null,
    bookedAt: reservation.bookedAt.toISOString(),
    bookedOnBusinessDate: reservation.bookedOnBusinessDate,
    bookedByName: reservation.bookedByName,
    property: {
      id: hotel.id,
      name: hotel.name,
      address: hotel.address,
      checkInTime: hotel.checkInTime,
      timeZone: hotel.timeZone,
      businessDate: hotel.businessDate,
      archived: hotel.archived,
    },
    guest: {
      id: guest.id,
      title: guest.title,
      firstName: guest.firstName,
      lastName: guest.lastName,
      phone: guest.phone,
      email: guest.email,
      nationality: guest.nationality,
    },
    stays: staysView,
    taxesSetUp: rules !== null,
    transferAccount: await transferAccount(db, hotel),
    activity: await activity(db, access, reservation.id),
    canAudit: can(access, 'audit.view'),
  }
}
