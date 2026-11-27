// How a changed stay is priced (spec: "Modify: how the changed stay is priced"), for the quote and
// inside the modify transaction alike. Kept nights (same date, same room type) keep their stored
// plan and sold prices; new nights are priced from the same plan now; extra adults are re-quoted on
// every night when the party changes. The terms snapshot stays; the deadline, penalty and deposit
// are recomputed from it, a passed deadline stays passed, and a late change that lowers the total
// carries the policy on the drop. The hash covers every figure the dialog shows.
import { createHash } from 'node:crypto'
import { ORPCError } from '@orpc/server'
import type { changeFieldsSchema } from '@vento/shared'
import {
  applyDiscount,
  type CalendarDate,
  cancellationTerms,
  classifyNights,
  Decimal,
  type DiscountInput,
  dec,
  depositDue,
  discountProblemMessage,
  formatPercent,
  keptDeadline,
  lateChangePenalty,
  type NightTaxes,
  nightLines,
  nightTaxes,
  overLimit,
  type RestrictionBreak,
  stayTotals,
  toAmount,
} from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import type { z } from 'zod'
import { roomTypes } from '../../db/schema/rooms.ts'
import { rulesByNight } from '../../finance/taxes.ts'
import { type QuoteReader, quoteStay, requireStayDates } from '../../rates/quote.ts'
import { type Access, can } from '../../tenancy/access.ts'
import type { BookingHotel } from '../context.ts'
import { discountProblem } from '../errors.ts'
import { discountLimitOf } from '../pricing.ts'
import { planArchivedForNewNights, planDoesntSellType } from './errors.ts'
import { type Loaded, type NightRow, type StayRow, termsOf } from './load.ts'

export type ChangeFields = z.output<typeof changeFieldsSchema>

export type ChangedNight = {
  date: CalendarDate
  kept: boolean
  planPrice: string
  soldPrice: string
  extraAdult: string
  mealAllocation: string
  from: 'date' | 'standard'
}

export type PricedChange = {
  stay: StayRow
  input: ChangeFields
  roomTypeName: string
  nights: ChangedNight[]
  taxes: NightTaxes[]
  totals: ReturnType<typeof stayTotals>
  beforeTotal: string
  beforeFirstNightGross: string
  deposit: {
    before: { amount: string; dueAt: Date } | null
    after: { amount: string; dueAt: Date } | null
    changed: boolean
  }
  deadline: { before: Date | null; after: Date | null }
  penalty: { before: string; after: string }
  latePenalty: { amount: string; drop: string } | null
  breaks: RestrictionBreak[]
  breakAlreadyAllowed: boolean
  // The discount given by this change (carried onto new nights, or set on every night).
  given: { percent: Decimal; scope: 'new_nights' | 'all_nights'; input: DiscountInput } | null
  // The stay's discount fields after the change (null: no night is discounted any more).
  discountAfter: {
    percent: string
    rate: string | null
    reason: DiscountInput['reason']
    reasonText: string | null
    note: string | null
    byMemberId: string | null
    byName: string | null
  } | null
  existingPercent: Decimal | null
  changed: boolean
  fieldsChanged: boolean
  ratePlanVersion: number | null
  hash: string
}

const mealWords = (stay: StayRow) => {
  const terms = termsOf(stay)
  return { name: terms.planName, mealPlan: terms.mealPlan, mealAllocation: terms.mealAllocation }
}

// The stay's discount as a %: a rate-per-night discount carries as the % it was on its first night.
export function existingPercent(stay: StayRow, nights: NightRow[]): Decimal | null {
  if (!stay.discountPercent) return null
  if (!stay.discountRate) return dec(stay.discountPercent)
  const first = nights[0]
  if (!first || dec(first.planPrice).isZero()) return dec(stay.discountPercent)
  return dec(first.planPrice).minus(first.soldPrice).dividedBy(first.planPrice).times(100)
}

function requireDiscount(
  stay: StayRow,
  nights: Omit<ChangedNight, 'soldPrice'>[],
  discount: Pick<DiscountInput, 'kind' | 'value'>,
) {
  const applied = applyDiscount(nights, discount)
  if (!applied.ok) {
    const code =
      applied.problem === 'ABOVE_PLAN'
        ? 'DISCOUNT_ABOVE_PLAN'
        : applied.problem === 'ZERO'
          ? 'DISCOUNT_ZERO'
          : 'DISCOUNT_BELOW_MEAL'
    throw discountProblem(code, discountProblemMessage(applied.problem, mealWords(stay)))
  }
  return applied
}

const codeOf = (error: unknown) =>
  error instanceof ORPCError ? (error.data as { code?: string } | undefined)?.code : undefined

// Prices the stay as `input` asks, from what is stored now. Reads only (quoteStay takes the shared
// rates lock); availability is checked by the caller (the quote reads it, modify locks it).
export async function priceChange(
  db: QuoteReader,
  access: Access,
  hotel: BookingHotel,
  loaded: Loaded,
  input: ChangeFields,
  now: Date,
): Promise<PricedChange> {
  const stay = loaded.stays.find((s) => s.id === input.stayId)
  if (!stay) throw new ORPCError('NOT_FOUND', { message: "We couldn't find that stay" })
  requireStayDates(input, hotel)
  const terms = termsOf(stay)
  const stored = loaded.nights.filter((night) => night.stayId === stay.id)
  const classified = classifyNights(
    { roomTypeId: stay.roomTypeId, dates: stored.map((night) => night.date) },
    input,
  )
  const guestsChanged = input.adults !== stay.adults || input.children !== stay.children
  const fieldsChanged =
    guestsChanged ||
    input.arrival !== stay.arrival ||
    input.departure !== stay.departure ||
    input.roomTypeId !== stay.roomTypeId
  const anyNew = classified.some((night) => !night.kept)

  // Today's plan prices for the changed stay (new nights and extra adults).
  let quote: Awaited<ReturnType<typeof quoteStay>> | null = null
  try {
    quote = await quoteStay(db, access, {
      propertyId: hotel.id,
      roomTypeId: input.roomTypeId,
      ratePlanId: stay.ratePlanId,
      arrival: input.arrival,
      departure: input.departure,
      adults: input.adults,
      children: input.children,
    })
  } catch (error) {
    const code = codeOf(error)
    if (code === 'ROOM_TYPE_NOT_ON_PLAN') {
      throw planDoesntSellType(
        terms.planName,
        await typeName(db, access, hotel.id, input.roomTypeId),
      )
    }
    if (code === 'PLAN_ARCHIVED') {
      if (anyNew || guestsChanged) throw planArchivedForNewNights(terms.planName)
    } else {
      throw error
    }
  }
  const quoted = new Map((quote?.nights ?? []).map((line) => [line.date, line]))
  const byDate = new Map(stored.map((night) => [night.date, night]))
  const planned = classified.map((night) => {
    const old = byDate.get(night.date)
    const line = quoted.get(night.date)
    if (night.kept && old) {
      return {
        date: night.date,
        kept: true,
        planPrice: old.planPrice,
        storedSold: old.soldPrice,
        extraAdult: guestsChanged && line ? line.extraAdult : old.extraAdult,
        mealAllocation: old.mealAllocation,
        from: (old.priceFrom === 'date_price' ? 'date' : 'standard') as 'date' | 'standard',
      }
    }
    if (!line) throw planArchivedForNewNights(terms.planName)
    return {
      date: night.date,
      kept: false,
      planPrice: line.price,
      storedSold: null,
      extraAdult: line.extraAdult,
      mealAllocation: line.mealAllocation,
      from: line.from,
    }
  })

  // The discount on the changed stay.
  const carried = existingPercent(stay, stored)
  const mode = input.discount
  let given: PricedChange['given'] = null
  let nights: ChangedNight[]
  const base = (night: (typeof planned)[number]) => ({
    date: night.date,
    kept: night.kept,
    planPrice: night.planPrice,
    extraAdult: night.extraAdult,
    mealAllocation: night.mealAllocation,
    from: night.from,
  })
  const keepPrice = input.keepBookedPrice && input.roomTypeId !== stay.roomTypeId
  if (keepPrice) {
    // An upgrade at the booked price (brick 7): each night keeps the price it was sold at (capped
    // at the new type's plan price), and the difference is a discount with reason Upgrade,
    // measured on the night it is largest.
    nights = planned.map((night) => {
      const old = byDate.get(night.date)
      const keep = old ? dec(old.soldPrice) : dec(night.planPrice)
      const floor = Decimal.max(keep, dec(night.mealAllocation))
      return { ...base(night), soldPrice: toAmount(Decimal.min(dec(night.planPrice), floor)) }
    })
    const largest = nights.reduce((top, night) => {
      const plan = dec(night.planPrice)
      if (plan.isZero()) return top
      const off = plan.minus(night.soldPrice).dividedBy(plan).times(100)
      return off.greaterThan(top) ? off : top
    }, dec('0'))
    if (largest.greaterThan(0)) {
      given = {
        percent: largest,
        scope: 'all_nights',
        input: {
          kind: 'percent',
          value: largest.toDecimalPlaces(4).toString(),
          reason: 'upgrade',
          note: input.keepBookedPrice?.note || undefined,
        },
      }
    }
  } else if (mode.mode === 'set') {
    const applied = requireDiscount(stay, planned.map(base), mode.discount)
    nights = planned.map((night, i) => ({
      ...base(night),
      soldPrice: applied.nights[i]?.soldPrice ?? night.planPrice,
    }))
    given = { percent: applied.percent, scope: 'all_nights', input: mode.discount }
  } else if (mode.mode === 'remove') {
    nights = planned.map((night) => ({ ...base(night), soldPrice: toAmount(night.planPrice) }))
  } else {
    const carry = mode.mode === 'keep' && carried !== null && carried.greaterThan(0)
    const fresh = planned.filter((night) => !night.kept)
    const applied =
      carry && carried && fresh.length
        ? requireDiscount(stay, fresh.map(base), { kind: 'percent', value: carried.toString() })
        : null
    const soldByDate = new Map(applied?.nights.map((night) => [night.date, night.soldPrice]))
    nights = planned.map((night) => ({
      ...base(night),
      soldPrice: night.kept
        ? (night.storedSold ?? night.planPrice)
        : (soldByDate.get(night.date) ?? toAmount(night.planPrice)),
    }))
    if (applied && stay.discountReason) {
      given = {
        percent: carried ?? dec('0'),
        scope: 'new_nights',
        input: {
          kind: 'percent',
          value: (carried ?? dec('0')).toString(),
          reason: stay.discountReason,
          reasonText: stay.discountReasonText ?? undefined,
          note: stay.discountNote ?? undefined,
        },
      }
    }
  }
  const discounted = nights.some((night) => dec(night.soldPrice).lessThan(night.planPrice))
  const discountAfter: PricedChange['discountAfter'] = !discounted
    ? null
    : keepPrice && given
      ? {
          percent: given.percent.toDecimalPlaces(4).toString(),
          rate: null,
          reason: 'upgrade',
          reasonText: null,
          note: input.keepBookedPrice?.note || null,
          byMemberId: access.memberId,
          byName: access.userName,
        }
      : mode.mode === 'set'
        ? {
            percent: (given?.percent ?? dec('0')).toDecimalPlaces(4).toString(),
            rate: mode.discount.kind === 'rate' ? mode.discount.value : null,
            reason: mode.discount.reason,
            reasonText: mode.discount.reasonText ?? null,
            note: mode.discount.note ?? null,
            byMemberId: access.memberId,
            byName: access.userName,
          }
        : stay.discountPercent && stay.discountReason
          ? {
              percent: stay.discountPercent,
              rate: stay.discountRate,
              reason: stay.discountReason,
              reasonText: stay.discountReasonText,
              note: stay.discountNote,
              byMemberId: stay.discountByMemberId,
              byName: stay.discountByName,
            }
          : null

  // Tax lines per night with the rules in force on that night, before and after.
  const dates = [...new Set([...stored.map((n) => n.date), ...nights.map((n) => n.date)])]
  const rules = await rulesByNight(db, access, hotel, dates)
  const include = terms.pricesIncludeTaxes
  const beforeTaxes = stored.map((night) => nightTaxes(night, rules.get(night.date) ?? [], include))
  const taxes = nights.map((night) => nightTaxes(night, rules.get(night.date) ?? [], include))
  const beforeTotals = stayTotals(beforeTaxes)
  const totals = stayTotals(taxes)
  const beforeFirstNightGross = beforeTaxes[0]?.gross ?? '0.00'
  const afterStay = {
    arrival: input.arrival,
    firstNightGross: taxes[0]?.gross ?? '0.00',
    total: totals.total,
  }

  // Deposit: recomputed from the stored rule; the due time stays unless the amount goes up.
  const reservation = loaded.reservation
  const before =
    reservation.depositDue && reservation.depositDueAt
      ? { amount: reservation.depositDue, dueAt: reservation.depositDueAt }
      : null
  const fresh = depositDue(terms.deposit, afterStay, now, hotel)
  let afterAmount = fresh?.amount ?? null
  if (fresh && loaded.stays.length > 1 && before) {
    // Several stays: only this stay's part of the reservation's deposit moves.
    const old = depositDue(
      terms.deposit,
      { arrival: stay.arrival, firstNightGross: beforeFirstNightGross, total: beforeTotals.total },
      now,
      hotel,
    )
    afterAmount = toAmount(
      dec(before.amount)
        .minus(old?.amount ?? '0')
        .plus(fresh.amount),
    )
  }
  const after =
    afterAmount === null
      ? null
      : before && dec(afterAmount).lessThanOrEqualTo(before.amount)
        ? { amount: afterAmount, dueAt: before.dueAt }
        : { amount: afterAmount, dueAt: fresh?.dueAt ?? now }
  const depositChanged = (before?.amount ?? null) !== (after?.amount ?? null)

  // Cancellation: deadline from the new arrival, unless it had passed; the penalty from the terms.
  const recomputed = cancellationTerms(terms.cancellation, afterStay, hotel)
  const deadlineAfter =
    recomputed.kind === 'free_until'
      ? keptDeadline(stay.cancellationDeadline, recomputed.deadline, now)
      : null
  const late =
    reservation.guarantee !== 'none' &&
    (terms.cancellation.kind === 'non_refundable' ||
      (stay.cancellationDeadline !== null && now.getTime() >= stay.cancellationDeadline.getTime()))
  const lateAmount = late
    ? lateChangePenalty(
        terms.cancellation,
        { total: beforeTotals.total, firstNightGross: beforeFirstNightGross },
        { total: totals.total },
      )
    : null
  const drop = toAmount(dec(beforeTotals.total).minus(totals.total))

  // Restrictions, as at booking: the same break already booked through with a reason is allowed.
  const breaks = anyNew || fieldsChanged ? (quote?.breaks ?? []) : []
  const override = stay.restrictionOverride as { kind: string; date: string } | null
  const first = breaks[0]
  const breakAlreadyAllowed = Boolean(
    first && override && override.kind === first.kind && override.date === first.date,
  )

  const changed =
    fieldsChanged ||
    nights.some((night) => {
      const old = byDate.get(night.date)
      return !old || old.soldPrice !== night.soldPrice || old.extraAdult !== night.extraAdult
    }) ||
    (mode.mode === 'set' && stay.discountReason !== mode.discount.reason)

  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        stay: stay.id,
        fields: [input.arrival, input.departure, input.roomTypeId, input.adults, input.children],
        discount: mode,
        // The room asked for (left out: kept if free) and an upgrade at the booked price.
        room: input.roomId === undefined ? 'keep' : input.roomId,
        keepBookedPrice: keepPrice ? (input.keepBookedPrice?.note ?? '') : null,
        nights: nights.map((n, i) => [
          n.date,
          n.kept,
          n.planPrice,
          n.soldPrice,
          n.extraAdult,
          taxes[i] ? nightLines(taxes[i]).map((line) => [line.key, line.amount]) : [],
        ]),
        total: totals.total,
        before: beforeTotals.total,
        deposit: after?.amount ?? null,
        deadline: deadlineAfter?.toISOString() ?? null,
        penalty: recomputed.penalty,
        late: lateAmount,
      }),
    )
    .digest('hex')

  return {
    stay,
    input,
    roomTypeName: quote?.roomTypeName ?? stay.roomTypeName,
    nights,
    taxes,
    totals,
    beforeTotal: beforeTotals.total,
    beforeFirstNightGross,
    deposit: { before, after, changed: depositChanged },
    deadline: { before: stay.cancellationDeadline, after: deadlineAfter },
    penalty: { before: terms.penaltyAmount, after: recomputed.penalty },
    latePenalty: lateAmount ? { amount: lateAmount, drop } : null,
    breaks,
    breakAlreadyAllowed,
    given,
    discountAfter,
    existingPercent: carried,
    changed,
    fieldsChanged,
    ratePlanVersion: quote?.ratePlanVersion ?? null,
    hash,
  }
}

async function typeName(db: QuoteReader, access: Access, propertyId: string, roomTypeId: string) {
  const [row] = await db
    .select({ name: roomTypes.name })
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.id, roomTypeId),
        eq(roomTypes.organizationId, access.organizationId),
        eq(roomTypes.propertyId, propertyId),
      ),
    )
  return row?.name ?? 'that room type'
}

// The discount given, checked against the saver's limit (the quote's view of it).
export function changeDiscountCheck(access: Access, priced: PricedChange) {
  if (!priced.given) return null
  const allowed = can(access, 'stay.rate_override')
  const limit = allowed ? discountLimitOf(access) : '0'
  return {
    percent: formatPercent(priced.given.percent),
    limit,
    within: allowed && !overLimit(priced.given.percent, limit),
    scope: priced.given.scope,
  }
}

// The value an approval compares with limits: rounded up, never half (as brick 5).
export const givenPercent = (priced: PricedChange) =>
  priced.given ? priced.given.percent.toDecimalPlaces(4, Decimal.ROUND_UP).toString() : '0'
