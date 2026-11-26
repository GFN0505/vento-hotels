// A rate plan's row ↔ the shared shapes (adjustment, cancellation policy, deposit rule). Kept in one
// place so reads, writes and audit events describe a plan the same way.
import {
  type BookableBy,
  type CancellationPolicy,
  type DepositRule,
  dec,
  type MealPlan,
  type RateAdjustment,
  type RatePricing,
  toAmount,
} from '@vento/shared'
import type { ratePlans } from '../db/schema/rates.ts'

export type PlanRow = typeof ratePlans.$inferSelect

const pct = (value: string) => dec(value).toFixed(2)

export function adjustmentOf(
  row: Pick<PlanRow, 'adjustmentPercent' | 'adjustmentAmount'>,
): RateAdjustment | null {
  if (row.adjustmentPercent !== null) return { kind: 'percent', value: pct(row.adjustmentPercent) }
  if (row.adjustmentAmount !== null)
    return { kind: 'amount', value: toAmount(row.adjustmentAmount) }
  return null
}

export function cancellationOf(
  row: Pick<
    PlanRow,
    'cancellationKind' | 'cancellationHours' | 'cancellationPenalty' | 'cancellationPercent'
  >,
): CancellationPolicy {
  if (row.cancellationKind === 'non_refundable') return { kind: 'non_refundable' }
  const penalty: Extract<CancellationPolicy, { kind: 'free_until' }>['penalty'] =
    row.cancellationPenalty === 'percent_of_stay'
      ? { kind: 'percent_of_stay', percent: pct(row.cancellationPercent ?? '0') }
      : { kind: row.cancellationPenalty === 'full_stay' ? 'full_stay' : 'first_night' }
  return { kind: 'free_until', hours: row.cancellationHours ?? 0, penalty }
}

export function depositOf(
  row: Pick<PlanRow, 'depositKind' | 'depositPercent' | 'depositDue' | 'depositDueHours'>,
): DepositRule {
  if (row.depositKind === 'none') return { kind: 'none' }
  const due: Extract<DepositRule, { kind: 'first_night' }>['due'] =
    row.depositDue === 'within_hours'
      ? { kind: 'within_hours', hours: row.depositDueHours ?? 1 }
      : { kind: 'at_booking' }
  if (row.depositKind === 'percent_of_stay') {
    return { kind: 'percent_of_stay', percent: pct(row.depositPercent ?? '0'), due }
  }
  return { kind: row.depositKind, due }
}

// The plan's terms and settings as the editor sends them.
export type PlanTerms = {
  name: string
  code: string
  pricing: RatePricing
  parentId: string | null
  adjustment: RateAdjustment | null
  mealPlan: MealPlan
  mealAllocation: string | null
  cancellation: CancellationPolicy
  deposit: DepositRule
  minStay: number
  extraAdult: string | null
  bookableBy: BookableBy
  pricesIncludeTaxes: boolean
}

export function termsOf(row: PlanRow): PlanTerms {
  return {
    name: row.name,
    code: row.code,
    pricing: row.pricing,
    parentId: row.parentId,
    adjustment: adjustmentOf(row),
    mealPlan: row.mealPlan,
    mealAllocation: row.mealAllocation === null ? null : toAmount(row.mealAllocation),
    cancellation: cancellationOf(row),
    deposit: depositOf(row),
    minStay: row.minStay,
    extraAdult: row.extraAdult === null ? null : toAmount(row.extraAdult),
    bookableBy: row.bookableBy,
    pricesIncludeTaxes: row.pricesIncludeTaxes,
  }
}

// The columns that store the terms.
export function termColumns(terms: PlanTerms) {
  const { cancellation: c, deposit: d, adjustment: a } = terms
  const free = c.kind === 'free_until' ? c : null
  const due = d.kind === 'none' ? null : d.due
  return {
    name: terms.name,
    code: terms.code,
    pricing: terms.pricing,
    parentId: terms.pricing === 'derived' ? terms.parentId : null,
    adjustmentPercent: terms.pricing === 'derived' && a?.kind === 'percent' ? a.value : null,
    adjustmentAmount: terms.pricing === 'derived' && a?.kind === 'amount' ? a.value : null,
    mealPlan: terms.mealPlan,
    mealAllocation: terms.mealPlan === 'room_only' ? null : terms.mealAllocation,
    cancellationKind: c.kind,
    cancellationHours: free ? free.hours : null,
    cancellationPenalty: free ? free.penalty.kind : null,
    cancellationPercent: free?.penalty.kind === 'percent_of_stay' ? free.penalty.percent : null,
    depositKind: d.kind,
    depositPercent: d.kind === 'percent_of_stay' ? d.percent : null,
    depositDue: due ? due.kind : null,
    depositDueHours: due?.kind === 'within_hours' ? due.hours : null,
    minStay: terms.minStay,
    extraAdult: terms.pricing === 'own' ? terms.extraAdult : null,
    bookableBy: terms.bookableBy,
    pricesIncludeTaxes: terms.pricesIncludeTaxes,
  }
}
