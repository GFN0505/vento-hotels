// reservations.modify: dates, room type, guests and the discount of one stay, in one transaction in
// the lock order of locks.ts (rates → hotel → the reservation row → inventory for the union of old
// and new nights → approval rows → the penalty row). The old nights are released and the new ones
// taken as net counts per row; nothing is visible until it commits.
import {
  type ChangedReservation,
  DISCOUNT_REASON_LABELS,
  dec,
  formatMoney,
  formatRateDate,
  type ModifyInput,
  modifyInputSchema,
  newId,
  toAmount,
} from '@vento/shared'
import { and, eq, notInArray } from 'drizzle-orm'
import { approvalNotMatching } from '../../approvals/errors.ts'
import {
  MODIFY_DISCOUNT,
  modifyBinding,
  waiverBinding,
} from '../../approvals/kinds/change-rules.ts'
import {
  lockApprovals,
  markApprovalUsed,
  type UsedApproval,
  useApproval,
} from '../../approvals/use.ts'
import { type AuditEvent, recordAuditMany } from '../../audit/record.ts'
import {
  reservationChanges,
  reservations,
  stayNights,
  stays,
} from '../../db/schema/reservations.ts'
import {
  type Access,
  ApprovalRequiredError,
  can,
  requireWithinLimit,
} from '../../tenancy/access.ts'
import type { BookingHotel, Tx } from '../context.ts'
import { noPermission, restrictionReasonRequired, roomTypeRemoved, soldOut } from '../errors.ts'
import { addBooked, capacityOf, leftOn, lockInventory, type Scope } from '../locks.ts'
import { discountLimitOf } from '../pricing.ts'
import { changePriceChanged, modifyDiscountOverLimit, nothingChanged } from './errors.ts'
import { loadForChange, requireVersion, termsOf } from './load.ts'
import { recordPenalty, resolveWaiver } from './penalty.ts'
import { givenPercent, type PricedChange, priceChange } from './price-change.ts'
import { netCounts, nightKeysOf, requireAllowed, requireChange } from './rules.ts'
import { type ChangeDb, changedView, inChangeTransaction, requestHashOf } from './transaction.ts'

type Input = ReturnType<typeof modifyInputSchema.parse>

const naira = (amount: string) => formatMoney({ amount, currency: 'NGN' })

// "The price changed since you opened this: Bed & breakfast is now ₦175,000.00 a night for 12 Dec.
// Check the new total with the guest and save again."
function priceChangedMessage(priced: PricedChange) {
  const plan = (priced.stay.terms as { planName: string }).planName
  const fresh = priced.nights.find((night) => !night.kept)
  if (!fresh) {
    return `The price changed since you opened this: the stay is now ${naira(priced.totals.total)}. Check the new total with the guest and save again.`
  }
  return `The price changed since you opened this: ${plan} is now ${naira(fresh.soldPrice)} a night for ${formatRateDate(fresh.date, false)}. Check the new total with the guest and save again.`
}

// Locks the old and new nights in one statement and checks each new night can take its room.
async function moveRooms(tx: Tx, scope: Scope, priced: PricedChange) {
  const before = nightKeysOf(priced.stay)
  const after = nightKeysOf(priced.input)
  const net = netCounts(before, after)
  const booked = await lockInventory(tx, scope, [...before, ...after])
  const wanted = [...net.entries()].filter(([, n]) => n > 0)
  const capacity = await capacityOf(tx, scope, [...new Set(after.map((key) => key.roomTypeId))])
  for (const [key, count] of wanted.sort(([a], [b]) => a.localeCompare(b))) {
    const [roomTypeId = '', date = ''] = key.split(':')
    const type = capacity.get(roomTypeId)
    if (!type) throw await roomTypeRemoved(tx, scope, roomTypeId)
    const night = leftOn(type, booked.get(key) ?? 0)
    if (night.bookable < count) {
      throw soldOut({ id: roomTypeId, name: type.name }, date, night.left, [])
    }
  }
  return net
}

// A discount carried onto new nights or set on every night counts as given by the saver: within
// their stay.rate_override limit, or with an approval (kind modify_discount) bound to this change.
async function requireChangeDiscount(
  tx: Tx,
  access: Access,
  priced: PricedChange,
  input: Input,
  at: { hotel: BookingHotel; now: Date },
): Promise<UsedApproval | null> {
  if (!priced.given) {
    if (input.approvalId) throw approvalNotMatching('the manager')
    return null
  }
  if (input.approvalId) {
    return useApproval(tx, access, {
      approvalId: input.approvalId,
      kind: MODIFY_DISCOUNT.kind,
      permission: MODIFY_DISCOUNT.permission,
      propertyId: at.hotel.id,
      bindingHash: modifyBinding({
        propertyId: at.hotel.id,
        reservationId: input.reservationId,
        stayId: input.stayId,
        version: input.version,
        changeHash: priced.hash,
      }),
      businessDate: at.hotel.businessDate,
      timeZone: at.hotel.timeZone,
      now: at.now,
    })
  }
  const percent = givenPercent(priced)
  if (!can(access, 'stay.rate_override')) {
    if (priced.given.scope === 'all_nights') {
      throw noPermission("You can't give discounts. Ask a manager to change this booking.")
    }
    throw modifyDiscountOverLimit(dec(percent).toDecimalPlaces(2).toString(), '0')
  }
  try {
    requireWithinLimit(access, 'stay.rate_override', priced.given.percent.toString())
  } catch (error) {
    if (error instanceof ApprovalRequiredError) {
      throw modifyDiscountOverLimit(
        dec(percent).toDecimalPlaces(2).toString(),
        dec(discountLimitOf(access) ?? '0').toString(),
      )
    }
    throw error
  }
  return null
}

const nightsOf = (rows: { date: string; planPrice: string; soldPrice: string }[]) =>
  rows.map((n) => ({ date: n.date, planPrice: n.planPrice, soldPrice: n.soldPrice }))

async function writeNights(tx: Tx, scope: Scope, priced: PricedChange) {
  const stayId = priced.stay.id
  const kept = priced.nights.filter((night) => night.kept)
  await tx.delete(stayNights).where(
    and(
      eq(stayNights.stayId, stayId),
      kept.length
        ? notInArray(
            stayNights.date,
            kept.map((night) => night.date),
          )
        : undefined,
    ),
  )
  const fresh = priced.nights.filter((night) => !night.kept)
  if (fresh.length) {
    await tx.insert(stayNights).values(
      fresh.map((night) => ({
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
  }
  // Kept nights change only when the party or the discount does.
  for (const night of kept) {
    await tx
      .update(stayNights)
      .set({ soldPrice: night.soldPrice, extraAdult: night.extraAdult, updatedAt: new Date() })
      .where(and(eq(stayNights.stayId, stayId), eq(stayNights.date, night.date)))
  }
}

async function modifyInTx(
  tx: Tx,
  access: Access,
  hotel: BookingHotel,
  input: Input,
  hash: string,
): Promise<ChangedReservation> {
  const now = new Date()
  const scope = { organizationId: access.organizationId, propertyId: hotel.id }
  // Step 2b: the reservation row.
  const loaded = await loadForChange(tx, access, input.reservationId, true)
  const stay = loaded.stays.find((s) => s.id === input.stayId)
  if (stay) await requireVersion(tx, loaded, input.version, stay.version, hotel.timeZone)
  requireAllowed(loaded, hotel, 'modify')
  const priced = await priceChange(tx, access, hotel, loaded, input, now)
  if (!priced.changed) throw nothingChanged()
  const broken = priced.breaks[0]
  if (broken && !priced.breakAlreadyAllowed && !input.restrictionReason) {
    throw restrictionReasonRequired(broken.kind, broken.date)
  }

  // Steps 4–5: inventory for the old and new nights, then the approvals in id order.
  const net = await moveRooms(tx, scope, priced)
  await lockApprovals(
    tx,
    access,
    [input.approvalId, input.waive?.approvalId].filter((id): id is string => Boolean(id)),
  )
  const discountApproval = await requireChangeDiscount(tx, access, priced, input, { hotel, now })
  if (priced.hash !== input.changeHash) throw changePriceChanged(priceChangedMessage(priced))
  const late = priced.latePenalty
  const waiver =
    late && input.waive
      ? await resolveWaiver(tx, access, input.waive, {
          propertyId: hotel.id,
          businessDate: hotel.businessDate,
          timeZone: hotel.timeZone,
          now,
          bindingHash: waiverBinding({
            propertyId: hotel.id,
            reservationId: input.reservationId,
            target: 'modify',
            version: input.version,
            penaltyKind: 'late_change',
            amount: late.amount,
            changeHash: priced.hash,
            penaltyId: null,
            reason: input.waive.reason,
          }),
        })
      : null

  // Writes.
  const old = priced.stay
  const terms = termsOf(old)
  const stored = loaded.nights.filter((night) => night.stayId === old.id)
  const after = priced.discountAfter
  const restrictionOverride =
    broken && input.restrictionReason
      ? { kind: broken.kind, date: broken.date, reason: input.restrictionReason }
      : broken && priced.breakAlreadyAllowed
        ? old.restrictionOverride
        : null
  await writeNights(tx, scope, priced)
  await tx
    .update(stays)
    .set({
      arrival: input.arrival,
      departure: input.departure,
      roomTypeId: input.roomTypeId,
      adults: input.adults,
      children: input.children,
      quoteHash: priced.hash,
      terms: { ...terms, penaltyAmount: priced.penalty.after },
      cancellationDeadline: priced.deadline.after,
      quotedTotal: priced.totals.total,
      discountPercent: after?.percent ?? null,
      discountRate: after?.rate ?? null,
      discountReason: after?.reason ?? null,
      discountReasonText: after?.reasonText ?? null,
      discountNote: after?.note ?? null,
      discountByMemberId: after?.byMemberId ?? null,
      discountByName: after?.byName ?? null,
      restrictionOverride,
      version: old.version + 1,
      updatedAt: now,
    })
    .where(eq(stays.id, old.id))
  const others = loaded.stays.filter((s) => s.id !== old.id)
  const arrivals = [input.arrival, ...others.map((s) => s.arrival)].sort()
  const departures = [input.departure, ...others.map((s) => s.departure)].sort()
  const reservationTotal = toAmount(
    others.reduce((sum, s) => sum.plus(s.quotedTotal), dec(priced.totals.total)),
  )
  const deposit = priced.deposit.after
  await tx
    .update(reservations)
    .set({
      arrival: arrivals[0] ?? input.arrival,
      departure: departures.at(-1) ?? input.departure,
      quotedTotal: reservationTotal,
      depositDue: deposit?.amount ?? null,
      depositDueAt: deposit?.dueAt ?? null,
      updatedAt: now,
    })
    .where(eq(reservations.id, loaded.reservation.id))
  await addBooked(tx, scope, net)

  const changeId = newId()
  const roomTypeName = priced.roomTypeName
  const before = {
    arrival: old.arrival,
    departure: old.departure,
    roomTypeId: old.roomTypeId,
    roomTypeName: old.roomTypeName,
    adults: old.adults,
    children: old.children,
    nights: nightsOf(stored),
    total: priced.beforeTotal,
    depositDue: priced.deposit.before
      ? { amount: priced.deposit.before.amount, dueAt: priced.deposit.before.dueAt.toISOString() }
      : null,
    cancellationDeadline: priced.deadline.before?.toISOString() ?? null,
    penaltyAmount: priced.penalty.before,
    version: old.version,
  }
  const afterView = {
    arrival: input.arrival,
    departure: input.departure,
    roomTypeId: input.roomTypeId,
    roomTypeName,
    adults: input.adults,
    children: input.children,
    nights: priced.nights.map((n) => ({
      date: n.date,
      kept: n.kept,
      planPrice: n.planPrice,
      soldPrice: n.soldPrice,
    })),
    total: priced.totals.total,
    depositDue: deposit ? { amount: deposit.amount, dueAt: deposit.dueAt.toISOString() } : null,
    cancellationDeadline: priced.deadline.after?.toISOString() ?? null,
    penaltyAmount: priced.penalty.after,
    version: old.version + 1,
  }
  await tx.insert(reservationChanges).values({
    id: changeId,
    ...scope,
    reservationId: loaded.reservation.id,
    stayId: old.id,
    kind: 'modify',
    idempotencyKey: input.idempotencyKey,
    requestHash: hash,
    before,
    after: afterView,
    businessDate: hotel.businessDate,
    byMemberId: access.memberId,
    byName: access.userName,
    deviceId: access.deviceId,
  })
  if (discountApproval) {
    await markApprovalUsed(tx, discountApproval.id, {
      entity: { type: 'reservation_change', id: changeId },
      reference: loaded.reservation.number,
      at: now,
    })
  }

  const at = {
    entityType: 'reservation',
    entityId: loaded.reservation.id,
    propertyId: hotel.id,
    businessDate: hotel.businessDate,
  }
  const live = hotel.liveSince !== null
  const guestName = `${loaded.guest.firstName} ${loaded.guest.lastName}`
  const events: AuditEvent[] = [
    {
      action: 'reservation.modified',
      ...at,
      reason: input.restrictionReason ?? null,
      approverMemberId: discountApproval?.approverMemberId ?? null,
      before,
      after: {
        ...afterView,
        changeId,
        stayId: old.id,
        restrictionReason: input.restrictionReason ?? null,
        liveProperty: live,
      },
    },
  ]
  if (priced.given) {
    const discounted = priced.nights.filter(
      (n) =>
        dec(n.soldPrice).lessThan(n.planPrice) && (priced.given?.scope === 'all_nights' || !n.kept),
    )
    const given = priced.given.input
    events.push({
      action: 'stay.discount_applied',
      ...at,
      approverMemberId: discountApproval?.approverMemberId ?? null,
      reason: given.reasonText || DISCOUNT_REASON_LABELS[given.reason],
      after: {
        changeId,
        stayId: old.id,
        reservationNumber: loaded.reservation.number,
        guestName,
        roomTypeName,
        planName: terms.planName,
        nights: discounted.map((n) => ({
          date: n.date,
          planPrice: n.planPrice,
          soldPrice: n.soldPrice,
        })),
        percent: priced.given.percent.toDecimalPlaces(4).toString(),
        scope: priced.given.scope,
        limit: access.rules['stay.rate_override'].limit,
        discountReason: given.reason,
        note: given.note ?? null,
        approverMemberId: discountApproval?.approverMemberId ?? null,
        ...(discountApproval
          ? {
              approvalId: discountApproval.id,
              approverName: discountApproval.approverName,
              approverLimit: discountApproval.approverLimit,
              approvalMethod: discountApproval.method,
              approvalDevice: discountApproval.deviceName,
            }
          : {}),
        exception: 'discount',
        liveProperty: live,
      },
    })
  }
  if (broken && input.restrictionReason) {
    events.push({
      action: 'stay.restriction_overridden',
      ...at,
      reason: input.restrictionReason,
      after: {
        stayId: old.id,
        changeId,
        reservationNumber: loaded.reservation.number,
        kind: broken.kind,
        date: broken.date,
        planName: terms.planName,
        message: broken.message,
      },
    })
  }
  if (late) {
    const recorded = await recordPenalty(
      tx,
      access,
      {
        propertyId: hotel.id,
        reservationId: loaded.reservation.id,
        reservationNumber: loaded.reservation.number,
        stayId: old.id,
        changeId,
        kind: 'late_change',
        amount: late.amount,
        basis: {
          policy: terms.cancellation,
          drop: late.drop,
          totalBefore: priced.beforeTotal,
          totalAfter: priced.totals.total,
          deadline: priced.deadline.before?.toISOString() ?? null,
        },
        businessDate: hotel.businessDate,
        liveProperty: live,
        roomTypeName,
        guestName,
      },
      waiver,
      now,
    )
    events.push(...recorded.events)
  }
  await recordAuditMany(tx, access, events)
  return changedView(tx, loaded.reservation.id, changeId)
}

export async function modifyReservation(
  db: ChangeDb,
  access: Access,
  input: ModifyInput,
): Promise<ChangedReservation> {
  requireChange(access)
  const parsed = modifyInputSchema.parse(input)
  const hash = requestHashOf(parsed)
  return inChangeTransaction(
    db,
    access,
    { idempotencyKey: parsed.idempotencyKey, reservationId: parsed.reservationId, hash },
    (tx, hotel) => modifyInTx(tx, access, hotel, parsed, hash),
  )
}
