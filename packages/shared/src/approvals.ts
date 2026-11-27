// Approvals (spec: docs/specs/stage-1-approvals.md, decision 0027): one member's yes to one exact
// over-limit action by another member, at one hotel, confirmed with the approver's PIN. Kinds are
// registered in code; Stage 1 brick 5 registers the over-limit discount on a new reservation.
import { z } from 'zod'
import { formatPercent } from './reservations.ts'

export const APPROVAL_KINDS = ['stay_discount'] as const
export type ApprovalKind = (typeof APPROVAL_KINDS)[number]
export const approvalKindSchema = z.enum(APPROVAL_KINDS)

export const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'declined',
  'cancelled',
  'expired',
] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES)

// pin_here: the approver typed their PIN on the requester's screen (a registered hotel device);
// inbox: the approver answered from their own session.
export const APPROVAL_METHODS = ['pin_here', 'inbox'] as const
export type ApprovalMethod = (typeof APPROVAL_METHODS)[number]
export const approvalMethodSchema = z.enum(APPROVAL_METHODS)

// 30 minutes to answer, then 30 minutes to use, and never past the business date (owner, 27 Nov).
export const APPROVAL_MINUTES = 30

// Waiting: asked of you. Asked by you. Done: answered by you, expired or cancelled.
export const APPROVAL_VIEWS = ['waiting', 'asked', 'done'] as const
export type ApprovalListView = (typeof APPROVAL_VIEWS)[number]

export const CANCEL_REASONS = ['booking_changed', 'discarded', 'by_requester'] as const
export type CancelReason = (typeof CANCEL_REASONS)[number]
export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  booking_changed: 'Booking changed',
  discarded: 'Discarded',
  by_requester: 'Cancelled by requester',
}

export const APPROVAL_KIND_LABELS: Record<ApprovalKind, string> = {
  stay_discount: 'Over limit',
}

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Waiting',
  approved: 'Approved',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

// "Tunde Bello" → "Tunde"
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

// "14:05" in the hotel's time zone.
export function clockAt(at: string | Date, timeZone = 'Africa/Lagos'): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone }).format(
    typeof at === 'string' ? new Date(at) : at,
  )
}

// The status a reader sees: open rows past their time or business date read as expired at once,
// whatever the expiry job has stored (spec: "Expiry").
export function effectiveStatus(
  row: { status: ApprovalStatus; expiresAt: Date | string; usedAt: Date | string | null },
  businessDate: { asked: string; now: string },
  now: Date = new Date(),
): ApprovalStatus {
  if (row.status !== 'pending' && row.status !== 'approved') return row.status
  if (row.usedAt) return row.status
  const expires = typeof row.expiresAt === 'string' ? new Date(row.expiresAt) : row.expiresAt
  if (expires.getTime() <= now.getTime() || businessDate.asked !== businessDate.now) {
    return 'expired'
  }
  return row.status
}

// "15% discount waiting for you"
export function approvalWhat(kind: ApprovalKind, value: string): string {
  if (kind === 'stay_discount') return `${formatPercent(value)}% discount`
  return 'Approval'
}

// Wrong-PIN copy shared by the prompt and the inbox (spec: "UI copy").
export function wrongPinMessage(triesLeft: number): string {
  return `That PIN didn't match. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.`
}
