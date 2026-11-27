// Waiving a penalty already recorded (the Penalty card's Waive penalty or Ask to waive), and the
// waiver an inbox approval applies in the approver's transaction (decision 0028). Lock order: the
// reservation row (2b), then the approval row, then the penalty row; the inbox path takes the
// approver's PIN row between the approval and the penalty. Waiving never touches inventory.
import {
  newId,
  type PenaltyView,
  type WaivePenaltyInput,
  waivePenaltyInputSchema,
} from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import { waiverBinding } from '../../approvals/kinds/change-rules.ts'
import { markApprovalUsed } from '../../approvals/use.ts'
import { recordAudit } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { isUniqueViolation } from '../../db/errors.ts'
import {
  guests,
  penalties,
  reservationChanges,
  reservations,
  stays,
} from '../../db/schema/reservations.ts'
import { roomTypes } from '../../db/schema/rooms.ts'
import { type Access, scopeToProperties } from '../../tenancy/access.ts'
import { type BookingHotel, loadBookingHotel, type Reader, type Tx } from '../context.ts'
import { changeAlreadySaved, penaltyNotFound, penaltyNotOpen } from './errors.ts'
import { resolveWaiver, type Waiver, waivedColumns, waivedEvent } from './penalty.ts'
import { requireChange } from './rules.ts'
import { penaltyView } from './views.ts'

type PenaltyRow = typeof penalties.$inferSelect

// The penalty in the member's organization and hotels, without a lock.
export async function findPenalty(db: Reader, access: Access, penaltyId: string) {
  const [row] = await db
    .select()
    .from(penalties)
    .where(
      and(
        eq(penalties.id, penaltyId),
        eq(penalties.organizationId, access.organizationId),
        scopeToProperties(access, penalties.propertyId),
      ),
    )
  if (!row) throw penaltyNotFound()
  return row
}

// Who and what the waiver event names.
async function penaltyContext(db: Reader, penalty: PenaltyRow) {
  const [row] = await db
    .select({
      number: reservations.number,
      firstName: guests.firstName,
      lastName: guests.lastName,
      roomTypeName: roomTypes.name,
    })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .innerJoin(stays, eq(stays.id, penalty.stayId))
    .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
    .where(eq(reservations.id, penalty.reservationId))
  return {
    number: row?.number ?? '',
    guestName: row ? `${row.firstName} ${row.lastName}` : '',
    roomTypeName: row?.roomTypeName ?? '',
  }
}

// Locks the reservation row, then the penalty row (after any approval the caller locked between).
export async function lockReservationRow(tx: Tx, reservationId: string) {
  await tx
    .select({ id: reservations.id })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .for('update')
}

export async function lockPenalty(tx: Tx, penaltyId: string) {
  const [row] = await tx.select().from(penalties).where(eq(penalties.id, penaltyId)).for('update')
  if (!row) throw penaltyNotFound()
  return row
}

// Applies a waiver to a recorded penalty: the row, the change record, the approval used and the
// event. `by` is who waived it; `requestedBy` the requester when an inbox approval applies it.
export async function applyWaiver(
  tx: Tx,
  actor: Access,
  hotel: Pick<BookingHotel, 'businessDate' | 'timeZone' | 'liveSince'>,
  penalty: PenaltyRow,
  waiver: Waiver,
  options: {
    idempotencyKey: string
    requestHash: string
    requestedBy: { memberId: string; name: string } | null
    by: { memberId: string; name: string }
    now: Date
  },
) {
  if (penalty.status !== 'to_charge') {
    throw penaltyNotOpen({ byName: penalty.waivedByName, at: penalty.waivedAt }, hotel.timeZone)
  }
  const { now } = options
  const context = await penaltyContext(tx, penalty)
  await tx
    .update(penalties)
    .set({
      ...waivedColumns(waiver, options.by, { now, businessDate: hotel.businessDate }),
      updatedAt: now,
    })
    .where(eq(penalties.id, penalty.id))
  await tx.insert(reservationChanges).values({
    id: newId(),
    organizationId: penalty.organizationId,
    propertyId: penalty.propertyId,
    reservationId: penalty.reservationId,
    stayId: penalty.stayId,
    kind: 'waive',
    idempotencyKey: options.idempotencyKey,
    requestHash: options.requestHash,
    before: { penaltyId: penalty.id, status: penalty.status },
    after: {
      penaltyId: penalty.id,
      status: 'waived',
      reason: waiver.reason,
      approvalId: waiver.approval?.id ?? null,
    },
    businessDate: hotel.businessDate,
    byMemberId: actor.memberId,
    byName: actor.userName,
    deviceId: actor.deviceId,
  })
  if (waiver.approval) {
    await markApprovalUsed(tx, waiver.approval.id, {
      entity: { type: 'penalty', id: penalty.id },
      reference: context.number,
      at: now,
    })
  }
  await recordAudit(
    tx,
    actor,
    waivedEvent(
      {
        id: penalty.id,
        propertyId: penalty.propertyId,
        reservationId: penalty.reservationId,
        reservationNumber: context.number,
        stayId: penalty.stayId,
        kind: penalty.kind,
        amount: penalty.amount,
        businessDate: penalty.businessDate,
        liveProperty: hotel.liveSince !== null,
        roomTypeName: context.roomTypeName,
        guestName: context.guestName,
      },
      waiver,
      { businessDate: hotel.businessDate, requestedBy: options.requestedBy },
    ),
  )
}

const hashOf = (input: { penaltyId: string; reason: string; approvalId?: string | undefined }) =>
  JSON.stringify([input.penaltyId, input.reason.trim(), input.approvalId ?? null])

// penalties.waive: a manager waives it, or a member with an approval given for exactly this
// penalty, amount and reason.
export async function waivePenalty(
  db: Database,
  access: Access,
  input: WaivePenaltyInput,
): Promise<PenaltyView> {
  requireChange(access)
  const parsed = waivePenaltyInputSchema.parse(input)
  const found = await findPenalty(db, access, parsed.penaltyId)
  const requestHash = hashOf(parsed)
  const replayed = async () => {
    const [done] = await db
      .select({ hash: reservationChanges.requestHash })
      .from(reservationChanges)
      .where(
        and(
          eq(reservationChanges.organizationId, access.organizationId),
          eq(reservationChanges.idempotencyKey, parsed.idempotencyKey),
        ),
      )
    if (!done) return null
    if (done.hash !== requestHash) throw changeAlreadySaved()
    return penaltyView(db, access, parsed.penaltyId)
  }
  const again = await replayed()
  if (again) return again
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`change:${access.organizationId}:${parsed.idempotencyKey}`}, 0))`,
      )
      const hotel = await loadBookingHotel(tx, access, found.propertyId)
      await lockReservationRow(tx, found.reservationId)
      const now = new Date()
      const waiver = await resolveWaiver(tx, access, parsed, {
        propertyId: hotel.id,
        businessDate: hotel.businessDate,
        timeZone: hotel.timeZone,
        now,
        bindingHash: waiverBinding({
          propertyId: hotel.id,
          reservationId: found.reservationId,
          target: 'penalty',
          version: null,
          penaltyKind: found.kind,
          amount: found.amount,
          changeHash: null,
          penaltyId: found.id,
          reason: parsed.reason,
        }),
      })
      const penalty = await lockPenalty(tx, found.id)
      if (!waiver) return
      await applyWaiver(tx, access, hotel, penalty, waiver, {
        idempotencyKey: parsed.idempotencyKey,
        requestHash,
        requestedBy: null,
        by: { memberId: access.memberId, name: access.userName },
        now,
      })
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      const after = await replayed()
      if (after) return after
    }
    throw error
  }
  return penaltyView(db, access, parsed.penaltyId)
}
