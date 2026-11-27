// Brick 6's approval kinds, evaluated from the action they are asked for, with the change service's
// own functions (the client sends no figures): an over-limit discount on a changed stay
// (modify_discount), and a penalty waiver (penalty_waiver) on a cancel, no-show or change about to be
// saved, or on a penalty already recorded.
import { ORPCError } from '@orpc/server'
import {
  type ApprovalSubject,
  type approvalActionSchema,
  dec,
  formatPercent,
  nightsBetween,
  PENALTY_KIND_LABELS,
  policyWords,
  roleLabel,
  toAmount,
  type WaiverSubject,
} from '@vento/shared'
import type { z } from 'zod'
import type { Database } from '../../db/client.ts'
import { endPenalties } from '../../reservations/change/end.ts'
import { penaltyNotOpen } from '../../reservations/change/errors.ts'
import {
  type Loaded,
  loadForChange,
  requireVersion,
  reservationHotel,
  termsOf,
  versionOf,
} from '../../reservations/change/load.ts'
import { givenPercent, priceChange } from '../../reservations/change/price-change.ts'
import { requireAllowed, requireChange } from '../../reservations/change/rules.ts'
import { findPenalty } from '../../reservations/change/waive.ts'
import { type BookingHotel, loadBookingHotel } from '../../reservations/context.ts'
import { noPermission } from '../../reservations/errors.ts'
import { discountLimitOf } from '../../reservations/pricing.ts'
import { type Access, can } from '../../tenancy/access.ts'
import { noPenaltyToWaive } from '../errors.ts'
import { MODIFY_DISCOUNT, modifyBinding, PENALTY_WAIVER, waiverBinding } from './change-rules.ts'

type Reader = Pick<Database, 'select' | 'execute'>
type Action = z.output<typeof approvalActionSchema>
type ModifyAction = Extract<Action, { kind: 'modify_discount' }>
type WaiverAction = Extract<Action, { kind: 'penalty_waiver' }>
type Context = { now: Date; deviceName: string | null }

export type EvaluatedChange = {
  hotel: BookingHotel
  value: string
  bindingHash: string
  subject: ApprovalSubject | WaiverSubject
  actionKey: string
}

async function loadChange(db: Reader, access: Access, change: ModifyAction['change']) {
  requireChange(access, change)
  const propertyId = await reservationHotel(db, access, change.reservationId)
  const hotel = await loadBookingHotel(db, access, propertyId)
  const loaded = await loadForChange(db, access, change.reservationId)
  requireAllowed(loaded, hotel, 'modify')
  const stay = loaded.stays.find((s) => s.id === change.stayId)
  if (stay) await requireVersion(db, loaded, change.version, stay.version, hotel.timeZone)
  return { hotel, loaded }
}

const guestNameOf = (loaded: Loaded) => `${loaded.guest.firstName} ${loaded.guest.lastName}`

export async function evaluateModifyDiscount(
  db: Reader,
  access: Access,
  action: ModifyAction,
  context: Context,
): Promise<EvaluatedChange> {
  requireChange(access)
  if (!can(access, MODIFY_DISCOUNT.permission)) {
    throw noPermission("You can't give discounts. Ask a manager to change this booking.")
  }
  const { hotel, loaded } = await loadChange(db, access, action.change)
  const priced = await priceChange(db, access, hotel, loaded, action.change, context.now)
  if (!priced.given) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'There is no discount on this change to approve.',
    })
  }
  const value = givenPercent(priced)
  const discounted = priced.nights.filter(
    (n) =>
      dec(n.soldPrice).lessThan(n.planPrice) && (priced.given?.scope === 'all_nights' || !n.kept),
  )
  const first = discounted[0] ?? priced.nights[0]
  const off = discounted.reduce((sum, n) => sum.plus(dec(n.planPrice).minus(n.soldPrice)), dec('0'))
  const given = priced.given.input
  const terms = termsOf(priced.stay)
  const subject: ApprovalSubject = {
    hotelName: hotel.name,
    guestName: guestNameOf(loaded),
    roomTypeName: priced.roomTypeName,
    planName: terms.planName,
    arrival: action.change.arrival,
    departure: action.change.departure,
    nights: nightsBetween(action.change.arrival, action.change.departure),
    planPrice: first?.planPrice ?? '0.00',
    newPrice: first?.soldPrice ?? '0.00',
    varies: discounted.some((n) => n.soldPrice !== first?.soldPrice),
    percent: formatPercent(value),
    discountTotal: toAmount(off),
    totalBefore: priced.beforeTotal,
    totalAfter: priced.totals.total,
    depositAfter: priced.deposit.after?.amount ?? null,
    reason: given.reason,
    reasonText: given.reasonText ?? null,
    note: given.note ?? null,
    requesterName: access.userName,
    requesterLimit: formatPercent(discountLimitOf(access) ?? '0'),
    requesterRole: roleLabel(access.role).toLowerCase(),
    deviceName: context.deviceName,
    fromRoomTypeName:
      action.change.keepBookedPrice && action.change.roomTypeId !== priced.stay.roomTypeId
        ? priced.stay.roomTypeName
        : null,
  }
  return {
    hotel,
    value,
    bindingHash: modifyBinding({
      propertyId: hotel.id,
      reservationId: action.change.reservationId,
      stayId: action.change.stayId,
      version: action.change.version,
      changeHash: priced.hash,
    }),
    subject,
    actionKey: action.change.idempotencyKey,
  }
}

function waiverSubject(
  access: Access,
  hotel: BookingHotel,
  loaded: Loaded,
  parts: {
    action: WaiverSubject['action']
    penaltyId: string | null
    kind: WaiverSubject['penalty']['kind']
    amount: string
    basisLabel: string
    reason: string
    deviceName: string | null
  },
): WaiverSubject {
  const stay = loaded.stays[0]
  const terms = stay ? termsOf(stay) : null
  const r = loaded.reservation
  return {
    reservationId: r.id,
    penaltyId: parts.penaltyId,
    hotelName: hotel.name,
    guestName: guestNameOf(loaded),
    reservationNumber: r.number,
    roomTypeName: stay?.roomTypeName ?? '',
    planName: terms?.planName ?? '',
    arrival: r.arrival,
    departure: r.departure,
    nights: nightsBetween(r.arrival, r.departure),
    penalty: {
      kind: parts.kind,
      amount: parts.amount,
      basisLabel: parts.basisLabel,
      policy: terms
        ? policyWords(
            terms.planName,
            terms.cancellation,
            parts.kind === 'no_show' ? 'no_show' : 'cancel',
          )
        : PENALTY_KIND_LABELS[parts.kind],
    },
    action: parts.action,
    waiverReason: parts.reason.trim(),
    requesterName: access.userName,
    requesterRole: roleLabel(access.role).toLowerCase(),
    deviceName: parts.deviceName,
  }
}

export async function evaluateWaiver(
  db: Reader,
  access: Access,
  action: WaiverAction,
  context: Context,
): Promise<EvaluatedChange> {
  requireChange(access)
  const waiver = action.waiver
  if (waiver.target === 'penalty') {
    const penalty = await findPenalty(db, access, waiver.penaltyId)
    const hotel = await loadBookingHotel(db, access, penalty.propertyId)
    if (penalty.status !== 'to_charge') {
      throw penaltyNotOpen({ byName: penalty.waivedByName, at: penalty.waivedAt }, hotel.timeZone)
    }
    const loaded = await loadForChange(db, access, penalty.reservationId)
    return {
      hotel,
      value: penalty.amount,
      bindingHash: waiverBinding({
        propertyId: hotel.id,
        reservationId: penalty.reservationId,
        target: 'penalty',
        version: null,
        penaltyKind: penalty.kind,
        amount: penalty.amount,
        changeHash: null,
        penaltyId: penalty.id,
        reason: waiver.reason,
      }),
      subject: waiverSubject(access, hotel, loaded, {
        action: 'penalty',
        penaltyId: penalty.id,
        kind: penalty.kind,
        amount: penalty.amount,
        basisLabel: PENALTY_KIND_LABELS[penalty.kind],
        reason: waiver.reason,
        deviceName: context.deviceName,
      }),
      actionKey: penalty.id,
    }
  }
  if (waiver.target === 'modify') {
    const { hotel, loaded } = await loadChange(db, access, waiver.change)
    const priced = await priceChange(db, access, hotel, loaded, waiver.change, context.now)
    if (!priced.latePenalty) throw noPenaltyToWaive()
    return {
      hotel,
      value: priced.latePenalty.amount,
      bindingHash: waiverBinding({
        propertyId: hotel.id,
        reservationId: waiver.change.reservationId,
        target: 'modify',
        version: waiver.change.version,
        penaltyKind: 'late_change',
        amount: priced.latePenalty.amount,
        changeHash: priced.hash,
        penaltyId: null,
        reason: waiver.reason,
      }),
      subject: waiverSubject(access, hotel, loaded, {
        action: 'modify',
        penaltyId: null,
        kind: 'late_change',
        amount: priced.latePenalty.amount,
        basisLabel: 'Lower stay total',
        reason: waiver.reason,
        deviceName: context.deviceName,
      }),
      actionKey: waiver.change.idempotencyKey,
    }
  }
  const propertyId = await reservationHotel(db, access, waiver.reservationId)
  const hotel = await loadBookingHotel(db, access, propertyId)
  const loaded = await loadForChange(db, access, waiver.reservationId)
  requireAllowed(loaded, hotel, waiver.target)
  const version = versionOf(loaded)
  await requireVersion(db, loaded, waiver.version, version, hotel.timeZone)
  const { penalties } = endPenalties(loaded, waiver.target, context.now)
  const first = penalties[0]
  if (!first) throw noPenaltyToWaive()
  const amount = toAmount(penalties.reduce((sum, p) => sum.plus(p.amount), dec('0')))
  return {
    hotel,
    value: amount,
    bindingHash: waiverBinding({
      propertyId: hotel.id,
      reservationId: waiver.reservationId,
      target: waiver.target,
      version,
      penaltyKind: first.kind,
      amount,
      changeHash: null,
      penaltyId: null,
      reason: waiver.reason,
    }),
    subject: waiverSubject(access, hotel, loaded, {
      action: waiver.target,
      penaltyId: null,
      kind: first.kind,
      amount,
      basisLabel: first.basisLabel,
      reason: waiver.reason,
      deviceName: context.deviceName,
    }),
    actionKey: waiver.actionKey,
  }
}

export { MODIFY_DISCOUNT, PENALTY_WAIVER }
