// checkIn.undo and checkIn.reverse (spec: "Undo", "Reverse check-in (GM)"). Undo is the checker's
// own, within 8 seconds (a grace for a slow answer): the stay goes back to confirmed with its room
// and registrations (they're true); a walk-in's booking is then cancelled (reason Duplicate, no
// penalty). Reverse is a GM's, later the same business date, never their own: the stay goes back to
// confirmed, the room is set dirty, and it is an exception for the owner's report. Lock order: the
// key lock, the hotel FOR SHARE (2), the reservation FOR UPDATE (2b), the room FOR UPDATE (3).
import {
  newId,
  REVERSE_REASON_LABELS,
  type reverseCheckInInputSchema,
  type undoCheckInInputSchema,
} from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { recordAudit } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { reservationChanges, reservations, stays } from '../../db/schema/reservations.ts'
import { REVERSE_ONLY } from '../../guests/registration/messages.ts'
import { setStatusInTx } from '../../rooms/status/set-status.ts'
import { type Access, can, requireFeature } from '../../tenancy/access.ts'
import { stayHotel } from '../assign/assign.ts'
import { stayNotFound } from '../assign/errors.ts'
import { lockRoomsForStay } from '../assign/room-check.ts'
import { cancelReservation } from '../change/end.ts'
import { loadForChange, requireVersion, versionOf } from '../change/load.ts'
import { requestHashOf } from '../change/transaction.ts'
import { holdBookingHotel, type Tx } from '../context.ts'
import { noPermission } from '../errors.ts'
import { requireCheckIn } from './check-in.ts'
import {
  checkInAlreadySaved,
  notCheckedIn,
  reverseNotSameDay,
  selfReverse,
  undoExpired,
} from './errors.ts'
import { UNDO_WINDOW_MS } from './rules.ts'

type Undone = { stayId: string; reservationId: string; guestName: string; version: number }
type UndoInput = z.output<typeof undoCheckInInputSchema>
type ReverseInput = z.output<typeof reverseCheckInInputSchema>

async function replay(tx: Tx, access: Access, key: string, hash: string, kind: string) {
  const [row] = await tx
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
  if (row.hash !== hash || row.kind !== kind) throw checkInAlreadySaved()
  return row.after as Undone & { walkIn?: boolean }
}

async function backToConfirmed(
  tx: Tx,
  access: Access,
  input: UndoInput | ReverseInput,
  mode: 'undo' | 'reverse',
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`check-in:${access.organizationId}:${input.idempotencyKey}`}, 0))`,
  )
  const hash = requestHashOf(input)
  const kind = mode === 'undo' ? 'check_in_undo' : 'check_in_reverse'
  const replayed = await replay(tx, access, input.idempotencyKey, hash, kind)
  if (replayed) return { result: replayed, replayed: true }
  const where = await stayHotel(tx, access, input.stayId)
  const hotel = await holdBookingHotel(tx, access, where.propertyId)
  const loaded = await loadForChange(tx, access, where.reservationId, true)
  const stay = loaded.stays.find((s) => s.id === input.stayId)
  if (!stay) throw stayNotFound()
  await requireVersion(tx, loaded, input.version, stay.version, hotel.timeZone)
  if (stay.status !== 'checked_in' || !stay.checkedInAt) throw notCheckedIn()
  const guestName = `${loaded.guest.firstName} ${loaded.guest.lastName}`
  const now = new Date()
  if (mode === 'undo') {
    const own = stay.checkedInByMemberId === access.memberId
    if (!own || now.getTime() - stay.checkedInAt.getTime() > UNDO_WINDOW_MS) throw undoExpired()
  } else {
    if (stay.checkedInBusinessDate !== hotel.businessDate) {
      throw reverseNotSameDay(stay.checkedInBusinessDate ?? stay.arrival)
    }
    if (stay.checkedInByMemberId === access.memberId) throw selfReverse(guestName)
  }
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  // Step 3: the room (its status is written for a reversal).
  const locked = stay.roomId ? await lockRoomsForStay(tx, scope, [stay.roomId]) : new Map()
  const room = stay.roomId ? locked.get(stay.roomId) : undefined
  const version = stay.version + 1
  await tx
    .update(stays)
    .set({
      status: 'confirmed',
      checkedInAt: null,
      checkedInByMemberId: null,
      checkedInByName: null,
      checkedInDeviceId: null,
      checkedInBusinessDate: null,
      cardPrintedAt: null,
      version,
      updatedAt: now,
    })
    .where(eq(stays.id, stay.id))
  await tx
    .update(reservations)
    .set({ status: 'confirmed', updatedAt: now })
    .where(eq(reservations.id, loaded.reservation.id))
  const walkIn = loaded.reservation.source === 'walk_in'
  const result = {
    stayId: stay.id,
    reservationId: loaded.reservation.id,
    guestName,
    version,
    walkIn,
  }
  await tx.insert(reservationChanges).values({
    ...scope,
    reservationId: loaded.reservation.id,
    stayId: stay.id,
    kind,
    idempotencyKey: input.idempotencyKey,
    requestHash: hash,
    before: {
      status: 'checked_in',
      checkedInAt: stay.checkedInAt.toISOString(),
      byName: stay.checkedInByName,
    },
    after: result,
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
  const checkedIn = {
    stayId: stay.id,
    reservationNumber: loaded.reservation.number,
    guestName,
    room: room ? { id: room.id, number: room.number } : null,
    checkedInAt: stay.checkedInAt.toISOString(),
    checkedInByName: stay.checkedInByName,
    checkedInByMemberId: stay.checkedInByMemberId,
  }
  if (mode === 'undo') {
    await recordAudit(tx, access, {
      action: 'stay.check_in_undone',
      ...at,
      before: { status: 'checked_in' },
      after: { ...checkedIn, walkIn },
    })
  } else {
    const reverse = input as ReverseInput
    const words =
      reverse.reason === 'other'
        ? (reverse.reasonText ?? 'Other')
        : REVERSE_REASON_LABELS[reverse.reason]
    await recordAudit(tx, access, {
      action: 'stay.check_in_reversed',
      ...at,
      reason: words,
      before: { status: 'checked_in' },
      after: {
        ...checkedIn,
        reverseReason: reverse.reason,
        reasonText: reverse.reasonText ?? null,
        exception: 'check_in_reversed',
        liveProperty: hotel.liveSince !== null,
      },
    })
    if (room) {
      await setStatusInTx(tx, access, {
        propertyId: hotel.id,
        businessDate: hotel.businessDate,
        roomId: room.id,
        status: 'dirty',
        source: 'check_in_reversed',
        causedBy: { stayId: stay.id, reservationNumber: loaded.reservation.number },
      })
    }
  }
  return { result, replayed: false, reservationVersion: versionOf(loaded) + 1 }
}

export async function undoCheckIn(db: Database, access: Access, input: UndoInput): Promise<Undone> {
  requireCheckIn(access)
  const done = await db.transaction((tx) => backToConfirmed(tx, access, input, 'undo'))
  const result = done.result as Undone & { walkIn?: boolean }
  // A walk-in made by mistake: its booking goes too (brick 6's cancel, no penalty: no guarantee).
  if (result.walkIn && !done.replayed && can(access, 'reservation.manage')) {
    await cancelReservation(db, access, {
      idempotencyKey: newId(),
      reservationId: result.reservationId,
      version: done.reservationVersion ?? 1,
      reason: 'duplicate',
      note: 'Walk-in undone at the desk',
    }).catch(() => undefined)
  }
  return {
    stayId: result.stayId,
    reservationId: result.reservationId,
    guestName: result.guestName,
    version: result.version,
  }
}

export async function reverseCheckIn(
  db: Database,
  access: Access,
  input: ReverseInput,
): Promise<Undone> {
  requireFeature(access, 'front_desk')
  if (!can(access, 'stay.check_in_reverse')) throw noPermission(REVERSE_ONLY)
  const done = await db.transaction((tx) => backToConfirmed(tx, access, input, 'reverse'))
  const result = done.result
  return {
    stayId: result.stayId,
    reservationId: result.reservationId,
    guestName: result.guestName,
    version: result.version,
  }
}
