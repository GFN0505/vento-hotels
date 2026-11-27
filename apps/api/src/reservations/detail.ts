// One reservation: its stays as sold (stored prices and terms), tax lines recomputed with the rules
// in force on each night, the guest, the hotel's guest transfer account for the copied confirmation,
// and the activity from the audit log.

import { ORPCError } from '@orpc/server'
import {
  type DiscountReason,
  formatMoney,
  formatPercent,
  nightLines,
  nightTaxes,
  type ReservationDetail,
  type StayTerms,
  stayTotals,
  type TaxRuleInForce,
} from '@vento/shared'
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { approvals } from '../db/schema/approvals.ts'
import { bankAccounts } from '../db/schema/finance.ts'
import { auditEvents } from '../db/schema/governance.ts'
import { guests, reservations, stayNights, stays } from '../db/schema/reservations.ts'
import { roomTypes } from '../db/schema/rooms.ts'
import { methodSettings } from '../finance/payment-methods.ts'
import { rulesByNight } from '../finance/taxes.ts'
import { type Access, can } from '../tenancy/access.ts'
import { hotelNotFound } from '../tenancy/errors.ts'
import {
  type BookingHotel,
  type Reader,
  readBookingHotel,
  requireReservationRead,
} from './context.ts'
import { reservationNotFound } from './errors.ts'

type StoredTerms = StayTerms & { penaltyAmount: string }

const naira = (amount: unknown) => formatMoney({ amount: String(amount), currency: 'NGN' })

// One line per event for the Activity card.
function activityLine(event: { action: string; reason: string | null; after: unknown }): {
  title: string
  detail: string | null
} {
  const after = (event.after ?? {}) as Record<string, unknown>
  switch (event.action) {
    case 'reservation.created':
      return { title: 'Reservation created', detail: null }
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
      return {
        title: `Discount ${formatPercent(String(after.percent ?? '0'))}%`,
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
      after: auditEvents.after,
      at: auditEvents.createdAt,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, access.organizationId),
        or(
          and(eq(auditEvents.entityType, 'reservation'), eq(auditEvents.entityId, id)),
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
    .select({ stay: stays, roomTypeName: roomTypes.name })
    .from(stays)
    .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
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
  const staysView = stayRows.map(({ stay, roomTypeName }) => {
    const terms = stay.terms as StoredTerms
    const nights = nightRows.filter((night) => night.stayId === stay.id)
    const taxes = nights.map((night) =>
      nightTaxes(night, rules?.get(night.date) ?? empty, terms.pricesIncludeTaxes),
    )
    const { penaltyAmount, ...snapshot } = terms
    return {
      id: stay.id,
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
  return {
    id: reservation.id,
    number: reservation.number,
    status: reservation.status,
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
