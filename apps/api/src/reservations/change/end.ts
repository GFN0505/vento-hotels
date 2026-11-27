// Cancel and mark no-show (spec: "Cancel", "Mark no-show"): every stay of the reservation ends and
// every night is released, in one transaction in the lock order of locks.ts. A guaranteed stay
// cancelled after its deadline (or on a non-refundable plan), or marked no-show, records its stored
// penalty to charge, or waived with a reason by someone with penalty.waive or with their approval.
import {
  type CancelInput,
  type ChangedReservation,
  calendarDateIn,
  cancelInputSchema,
  dec,
  END_REASON_LABELS,
  type EndMode,
  type EndQuote,
  type endQuoteInputSchema,
  type MarkNoShowInput,
  markNoShowInputSchema,
  newId,
  type PenaltyKind,
  penaltyApplies,
  penaltyBasisLabel,
  policyWords,
  toAmount,
} from '@vento/shared'
import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import { waiverBinding } from '../../approvals/kinds/change-rules.ts'
import { type AuditEvent, recordAuditMany } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { reservationChanges, reservations, stays } from '../../db/schema/reservations.ts'
import { type Access, can } from '../../tenancy/access.ts'
import { type BookingHotel, readBookingHotel, type Tx } from '../context.ts'
import { addBooked, lockInventory } from '../locks.ts'
import { foreignEquivalent } from '../quote.ts'
import {
  type Loaded,
  loadForChange,
  requireVersion,
  reservationHotel,
  termsOf,
  versionOf,
} from './load.ts'
import { recordPenalty, resolveWaiver } from './penalty.ts'
import {
  blockedMessage,
  nightKeysOf,
  releaseCounts,
  requireAllowed,
  requireChange,
} from './rules.ts'
import { changedView, inChangeTransaction, requestHashOf } from './transaction.ts'

export type EndPenalty = {
  stayId: string
  kind: PenaltyKind
  amount: string
  basisLabel: string
  basis: Record<string, unknown>
}

// What ending the reservation now costs, per stay, and why there is nothing when there isn't.
export function endPenalties(
  loaded: Loaded,
  mode: EndMode,
  now: Date,
): { penalties: EndPenalty[]; none: 'free' | 'unguaranteed' | 'zero' | null } {
  const guaranteed = loaded.reservation.guarantee !== 'none'
  const out: EndPenalty[] = []
  let zero = false
  for (const stay of loaded.stays.filter((s) => s.status === 'confirmed')) {
    const terms = termsOf(stay)
    const amount = toAmount(terms.penaltyAmount)
    if (dec(amount).lessThanOrEqualTo(0)) zero = true
    const applies = penaltyApplies({
      guaranteed,
      policy: terms.cancellation,
      deadline: stay.cancellationDeadline,
      now,
      amount,
      noShow: mode === 'no_show',
    })
    if (!applies) continue
    const policy = terms.cancellation
    const basisKind =
      policy.kind === 'non_refundable' ? ('non_refundable' as const) : policy.penalty.kind
    const percent =
      policy.kind === 'free_until' && policy.penalty.kind === 'percent_of_stay'
        ? policy.penalty.percent
        : null
    out.push({
      stayId: stay.id,
      kind: mode === 'no_show' ? 'no_show' : 'late_cancellation',
      amount,
      basisLabel: penaltyBasisLabel(basisKind, percent),
      basis: {
        policy,
        basis: basisKind,
        nights: loaded.nights.filter((n) => n.stayId === stay.id).length,
        deadline: stay.cancellationDeadline?.toISOString() ?? null,
        at: now.toISOString(),
      },
    })
  }
  if (out.length) return { penalties: out, none: null }
  return { penalties: out, none: !guaranteed ? 'unguaranteed' : zero ? 'zero' : 'free' }
}

const totalOf = (list: EndPenalty[]) =>
  toAmount(list.reduce((sum, p) => sum.plus(p.amount), dec('0')))

const releasedDates = (loaded: Loaded) =>
  [
    ...new Set(
      loaded.stays
        .filter((s) => s.status === 'confirmed')
        .flatMap((s) => nightKeysOf(s).map((k) => k.date)),
    ),
  ].sort()

export async function endQuote(
  db: Database,
  access: Access,
  input: z.output<typeof endQuoteInputSchema>,
): Promise<EndQuote> {
  requireChange(access)
  await reservationHotel(db, access, input.reservationId)
  const loaded = await loadForChange(db, access, input.reservationId)
  const hotel = await readBookingHotel(db, access, loaded.reservation.propertyId)
  const blocked = hotel.archived
    ? 'This hotel was archived.'
    : blockedMessage(loaded, hotel, input.mode)
  const first = loaded.stays[0]
  const terms = first ? termsOf(first) : null
  const { penalties, none } = endPenalties(loaded, input.mode, new Date())
  const total = penalties.length ? totalOf(penalties) : null
  return {
    reservationId: loaded.reservation.id,
    number: loaded.reservation.number,
    guestName: `${loaded.guest.firstName} ${loaded.guest.lastName}`,
    mode: input.mode,
    version: versionOf(loaded),
    allowed: blocked === null,
    blocked,
    arrival: loaded.reservation.arrival,
    departure: loaded.reservation.departure,
    roomTypeName: first?.roomTypeName ?? '',
    policy: terms ? policyWords(terms.planName, terms.cancellation, input.mode) : '',
    deadline: first?.cancellationDeadline?.toISOString() ?? null,
    nonRefundable: terms?.cancellation.kind === 'non_refundable',
    penalty:
      total && penalties[0]
        ? { kind: penalties[0].kind, amount: total, basisLabel: penalties[0].basisLabel }
        : null,
    noPenalty: none,
    released: releasedDates(loaded),
    canWaive: can(access, 'penalty.waive'),
    fx: total ? await foreignEquivalent(db, access, hotel, loaded.guest.nationality, total) : null,
  }
}

type EndInput =
  | ({ mode: 'cancel' } & z.output<typeof cancelInputSchema>)
  | ({ mode: 'no_show' } & z.output<typeof markNoShowInputSchema>)

async function endInTx(
  tx: Tx,
  access: Access,
  hotel: BookingHotel,
  input: EndInput,
  hash: string,
): Promise<ChangedReservation> {
  const now = new Date()
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  // Step 2b: the reservation row.
  const loaded = await loadForChange(tx, access, input.reservationId, true)
  const version = versionOf(loaded)
  await requireVersion(tx, loaded, input.version, version, hotel.timeZone)
  requireAllowed(loaded, hotel, input.mode)
  const live = loaded.stays.filter((s) => s.status === 'confirmed')

  // Step 4: release every night of every stay.
  const keys = live.flatMap((stay) => nightKeysOf(stay))
  await lockInventory(tx, scope, keys)
  const { penalties, none } = endPenalties(loaded, input.mode, now)
  const total = penalties.length ? totalOf(penalties) : null

  // Step 5: a waiver's approval, bound to exactly this action.
  const waiver =
    total && input.waive && penalties[0]
      ? await resolveWaiver(tx, access, input.waive, {
          propertyId: hotel.id,
          businessDate: hotel.businessDate,
          timeZone: hotel.timeZone,
          now,
          bindingHash: waiverBinding({
            propertyId: hotel.id,
            reservationId: loaded.reservation.id,
            target: input.mode,
            version,
            penaltyKind: penalties[0].kind,
            amount: total,
            changeHash: null,
            penaltyId: null,
            reason: input.waive.reason,
          }),
        })
      : null

  const changeId = newId()
  const status = input.mode === 'cancel' ? ('cancelled' as const) : ('no_show' as const)
  const reason = input.mode === 'cancel' ? input.reason : null
  const reasonText = input.mode === 'cancel' ? input.reasonText || null : null
  for (const stay of live) {
    await tx
      .update(stays)
      .set({ status, version: stay.version + 1, updatedAt: now })
      .where(eq(stays.id, stay.id))
  }
  await tx
    .update(reservations)
    .set({
      status,
      endedAt: now,
      endedByMemberId: access.memberId,
      endedByName: access.userName,
      endedOnBusinessDate: hotel.businessDate,
      endReason: reason,
      endReasonText: reasonText,
      endNote: input.note || null,
      updatedAt: now,
    })
    .where(eq(reservations.id, loaded.reservation.id))
  await addBooked(tx, scope, releaseCounts(keys))

  const released = releasedDates(loaded)
  const before = { status: loaded.reservation.status, version }
  const after = {
    status,
    reason,
    reasonText,
    note: input.note || null,
    released,
    penalty: total ? { amount: total, kind: penalties[0]?.kind } : { none },
    version: version + live.length,
  }
  await tx.insert(reservationChanges).values({
    id: changeId,
    ...scope,
    reservationId: loaded.reservation.id,
    stayId: live.length === 1 ? (live[0]?.id ?? null) : null,
    kind: input.mode,
    idempotencyKey: input.idempotencyKey,
    requestHash: hash,
    before,
    after,
    businessDate: hotel.businessDate,
    byMemberId: access.memberId,
    byName: access.userName,
    deviceId: access.deviceId,
  })

  const guestName = `${loaded.guest.firstName} ${loaded.guest.lastName}`
  const isLive = hotel.liveSince !== null
  const events: AuditEvent[] = []
  const penaltyEvents: AuditEvent[] = []
  const recorded: { id: string; kind: string; amount: string; basisLabel: string }[] = []
  for (const penalty of penalties) {
    const stay = live.find((s) => s.id === penalty.stayId)
    const made = await recordPenalty(
      tx,
      access,
      {
        propertyId: hotel.id,
        reservationId: loaded.reservation.id,
        reservationNumber: loaded.reservation.number,
        stayId: penalty.stayId,
        changeId,
        kind: penalty.kind,
        amount: penalty.amount,
        basis: penalty.basis,
        businessDate: hotel.businessDate,
        liveProperty: isLive,
        roomTypeName: stay?.roomTypeName ?? '',
        guestName,
      },
      // One approval covers the whole of the reservation's penalty; it is marked used by the
      // first, and the rest are waived with the same reason and approver.
      waiver && recorded.length > 0 ? { ...waiver, approval: null } : waiver,
      now,
    )
    recorded.push({
      id: made.id,
      kind: penalty.kind,
      amount: penalty.amount,
      basisLabel: penalty.basisLabel,
    })
    penaltyEvents.push(...made.events)
  }
  const penaltyAfter = recorded.length
    ? {
        penalties: recorded,
        amount: total,
        waived: Boolean(waiver),
      }
    : { none, why: none }
  events.push({
    action: input.mode === 'cancel' ? 'reservation.cancelled' : 'reservation.no_show',
    entityType: 'reservation',
    entityId: loaded.reservation.id,
    propertyId: hotel.id,
    businessDate: hotel.businessDate,
    reason: reason ? (reasonText ?? END_REASON_LABELS[reason]) : null,
    before,
    after: {
      ...after,
      changeId,
      reservationNumber: loaded.reservation.number,
      reasonLabel: reason ? END_REASON_LABELS[reason] : null,
      nightsReleased: released.length,
      penalty: penaltyAfter,
      // The calendar date it happened on, beside the business date (a no-show at 00:35).
      calendarDate: calendarDateIn(hotel.timeZone, now),
      liveProperty: isLive,
    },
  })
  await recordAuditMany(tx, access, [...events, ...penaltyEvents])
  return changedView(tx, loaded.reservation.id, changeId)
}

export async function cancelReservation(
  db: Database,
  access: Access,
  input: CancelInput,
): Promise<ChangedReservation> {
  requireChange(access)
  const parsed = cancelInputSchema.parse(input)
  const hash = requestHashOf(parsed)
  return inChangeTransaction(
    db,
    access,
    { idempotencyKey: parsed.idempotencyKey, reservationId: parsed.reservationId, hash },
    (tx, hotel) => endInTx(tx, access, hotel, { mode: 'cancel', ...parsed }, hash),
  )
}

export async function markNoShow(
  db: Database,
  access: Access,
  input: MarkNoShowInput,
): Promise<ChangedReservation> {
  requireChange(access)
  const parsed = markNoShowInputSchema.parse(input)
  const hash = requestHashOf(parsed)
  return inChangeTransaction(
    db,
    access,
    { idempotencyKey: parsed.idempotencyKey, reservationId: parsed.reservationId, hash },
    (tx, hotel) => endInTx(tx, access, hotel, { mode: 'no_show', ...parsed }, hash),
  )
}
