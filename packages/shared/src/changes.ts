// Modify, cancel and no-show (spec: docs/specs/stage-1-modify-cancel.md): the vocabulary and the
// pure maths the dialog and the server share, so the figures on the screen are the ones saved. The
// server re-computes everything inside its locks and is the authority.
import { z } from 'zod'
import { addDays, type CalendarDate, nightsBetween } from './dates.ts'
import { dec, toAmount } from './money.ts'
import type { CancellationPolicy } from './rates.ts'
import type { ReservationStatus } from './reservations.ts'

export const END_REASONS = [
  'guest_request',
  'company_request',
  'deposit_not_paid',
  'duplicate',
  'other',
] as const
export type EndReason = (typeof END_REASONS)[number]
export const endReasonSchema = z.enum(END_REASONS)
export const END_REASON_LABELS: Record<EndReason, string> = {
  guest_request: 'Guest request',
  company_request: 'Company request',
  deposit_not_paid: 'Deposit not paid',
  duplicate: 'Duplicate booking',
  other: 'Other',
}

export const PENALTY_KINDS = ['late_cancellation', 'late_change', 'no_show'] as const
export type PenaltyKind = (typeof PENALTY_KINDS)[number]
export const penaltyKindSchema = z.enum(PENALTY_KINDS)
export const PENALTY_KIND_LABELS: Record<PenaltyKind, string> = {
  late_cancellation: 'Late cancellation',
  late_change: 'Late change',
  no_show: 'No-show',
}

// `charged` from brick 10, when the penalty is posted to the folio.
export const PENALTY_STATUSES = ['to_charge', 'waived', 'charged'] as const
export type PenaltyStatus = (typeof PENALTY_STATUSES)[number]
export const penaltyStatusSchema = z.enum(PENALTY_STATUSES)

export const END_NOTE_MAX = 500
export const END_REASON_TEXT_MAX = 200
export const WAIVER_REASON_MAX = 500

// --- Which actions a reservation allows ------------------------------------------------------------

export type BlockedBecause = 'ended' | 'arrival_passed' | 'not_arrived' | 'in_house' | null

export type AllowedActions = {
  modify: boolean
  cancel: boolean
  noShow: boolean
  // Why Modify and Cancel are hidden, for the note where they would be.
  blocked: BlockedBecause
}

// The spec's table: confirmed stays can be changed or cancelled while their arrival is on or after
// the business date, and marked no-show from their arrival business date. Ended stays allow
// nothing; in-house changes are brick 8's.
export function allowedActions(
  status: ReservationStatus,
  arrival: CalendarDate,
  businessDate: CalendarDate,
): AllowedActions {
  if (status === 'cancelled' || status === 'no_show') {
    return { modify: false, cancel: false, noShow: false, blocked: 'ended' }
  }
  if (status !== 'confirmed') {
    return { modify: false, cancel: false, noShow: false, blocked: 'in_house' }
  }
  const upcoming = arrival >= businessDate
  return {
    modify: upcoming,
    cancel: upcoming,
    noShow: arrival <= businessDate,
    blocked: upcoming ? null : 'arrival_passed',
  }
}

// --- The penalty ------------------------------------------------------------------------------------

// A cancellation (or no-show) costs the stored penalty when the stay is guaranteed and the plan is
// non-refundable or the deadline has passed. The deadline is a clock time: 13:59 is free, 14:00 not.
export function penaltyApplies(input: {
  guaranteed: boolean
  policy: CancellationPolicy
  deadline: Date | null
  now: Date
  amount: string
  noShow?: boolean
}): boolean {
  if (!input.guaranteed || dec(input.amount).lessThanOrEqualTo(0)) return false
  if (input.noShow || input.policy.kind === 'non_refundable') return true
  return input.deadline !== null && input.now.getTime() >= input.deadline.getTime()
}

// After the deadline (or on a non-refundable plan) a change that lowers the stay total costs the
// policy applied to the drop: first night → the lower of the drop and the original first night;
// N% → N% of the drop; full stay or non-refundable → the drop. Null when it costs nothing.
export function lateChangePenalty(
  policy: CancellationPolicy,
  before: { total: string; firstNightGross: string },
  after: { total: string },
): string | null {
  const drop = dec(before.total).minus(after.total)
  if (drop.lessThanOrEqualTo(0)) return null
  let amount = drop
  if (policy.kind === 'free_until') {
    if (policy.penalty.kind === 'first_night') {
      amount = dec(before.firstNightGross).lessThan(drop) ? dec(before.firstNightGross) : drop
    } else if (policy.penalty.kind === 'percent_of_stay') {
      amount = drop.times(policy.penalty.percent).dividedBy(100)
    }
  }
  const rounded = toAmount(amount)
  return dec(rounded).greaterThan(0) ? rounded : null
}

// A passed deadline stays passed: moving the dates can't reopen free cancellation.
export function keptDeadline(stored: Date | null, recomputed: Date | null, now: Date): Date | null {
  if (stored && stored.getTime() <= now.getTime()) return stored
  return recomputed
}

// "First night", "Full stay", "30% of the stay".
export function penaltyBasisLabel(
  basis: 'first_night' | 'full_stay' | 'percent_of_stay' | 'non_refundable' | 'drop',
  percent?: string | null,
): string {
  switch (basis) {
    case 'first_night':
      return 'First night'
    case 'percent_of_stay':
      return `${dec(percent ?? '0').toString()}% of the stay`
    case 'drop':
      return 'Lower stay total'
    default:
      return 'Full stay'
  }
}

// "Best available: free until 48 h before arrival", "Best available: a no-show is charged the
// first night", "Non-refundable: the full stay is charged".
export function policyWords(
  planName: string,
  policy: CancellationPolicy,
  mode: 'cancel' | 'no_show',
): string {
  if (policy.kind === 'non_refundable')
    return `${planName}: non-refundable, the full stay is charged`
  const what =
    policy.penalty.kind === 'first_night'
      ? 'the first night'
      : policy.penalty.kind === 'full_stay'
        ? 'the full stay'
        : `${dec(policy.penalty.percent).toString()}% of the stay`
  if (mode === 'no_show') return `${planName}: a no-show is charged ${what}`
  return policy.hours === 0
    ? `${planName}: free until check-in time on arrival`
    : `${planName}: free until ${policy.hours} h before arrival`
}

// --- Kept and new nights ----------------------------------------------------------------------------

// A night is kept when its date and room type are unchanged (it keeps its agreed price); every other
// night of the changed stay is new (priced from the same plan now).
export function classifyNights(
  before: { roomTypeId: string; dates: readonly CalendarDate[] },
  after: { roomTypeId: string; arrival: CalendarDate; departure: CalendarDate },
): { date: CalendarDate; kept: boolean }[] {
  const old = new Set(before.dates)
  const sameType = before.roomTypeId === after.roomTypeId
  return Array.from({ length: nightsBetween(after.arrival, after.departure) }, (_, i) => {
    const date = addDays(after.arrival, i)
    return { date, kept: sameType && old.has(date) }
  })
}

// "+1 night", "−2 nights", "" when the count is the same.
export function nightsDelta(before: number, after: number): string {
  const diff = after - before
  if (diff === 0) return ''
  const n = Math.abs(diff)
  return `${diff > 0 ? '+' : '−'}${n} ${n === 1 ? 'night' : 'nights'}`
}

// "+₦205,800.00", "−₦205,800.00" for the Save button; "" when it doesn't change.
export function signedDifference(
  before: string,
  after: string,
): { sign: 1 | -1 | 0; amount: string } {
  const diff = dec(after).minus(before)
  if (diff.isZero()) return { sign: 0, amount: '0.00' }
  return { sign: diff.greaterThan(0) ? 1 : -1, amount: toAmount(diff.abs()) }
}
