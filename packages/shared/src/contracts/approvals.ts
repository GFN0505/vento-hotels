// Approvals (spec: docs/specs/stage-1-approvals.md, decision 0027): the approver list, approve here
// by PIN, ask in the inbox, answer, cancel, and the inbox and bell reads. The server prices the
// action itself from the booking it is given: the client never sends a value, hash or subject.
// No input carries an organizationId.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import {
  APPROVAL_VIEWS,
  approvalKindSchema,
  approvalMethodSchema,
  approvalStatusSchema,
  CANCEL_REASONS,
} from '../approvals.ts'
import { cashReasonSchema, noteCountSchema } from '../cash.ts'
import { penaltyKindSchema } from '../changes.ts'
import { calendarDateSchema } from '../dates.ts'
import { idSchema } from '../ids.ts'
import { pageQuerySchema, pageSchema } from '../pagination.ts'
import { discountReasonSchema, MAX_STAYS } from '../reservations.ts'
import { changeFieldsSchema } from './changes.ts'
import { createReservationSchema } from './reservations.ts'

// `data.code` on errors from these procedures, so the web app can react.
export const APPROVAL_ERROR_CODES = [
  'SELF_APPROVAL',
  'APPROVER_NOT_ELIGIBLE',
  'NO_APPROVERS',
  'APPROVAL_NOT_NEEDED',
  'PIN_HERE_NEEDS_DEVICE',
  'WRONG_PIN', // data: { triesLeft }
  'PIN_LOCKED', // data: { lockedUntil }
  'PIN_NEEDS_RESET',
  'COMMENT_REQUIRED',
  'APPROVAL_NOT_PENDING', // data: { status }
  'APPROVAL_EXPIRED',
  'APPROVAL_USED',
  'APPROVAL_NOT_MATCHING',
  'APPROVAL_NO_LONGER_VALID',
  'REQUESTER_LEFT',
  'TOO_MANY_OPEN_REQUESTS',
  'TOO_MANY_PIN_TRIES',
  'PROPERTY_NOT_FOUND',
  'PROPERTY_ARCHIVED',
  'FEATURE_OFF',
] as const
export type ApprovalErrorCode = (typeof APPROVAL_ERROR_CODES)[number]

// What the approver sees, stored on the approval when it is asked (names are snapshots).
export const approvalSubjectSchema = z.object({
  hotelName: z.string(),
  guestName: z.string(),
  roomTypeName: z.string(),
  planName: z.string(),
  arrival: calendarDateSchema,
  departure: calendarDateSchema,
  nights: z.number().int(),
  // First night's plan and sold price; `varies` when the nights differ.
  planPrice: z.string(),
  newPrice: z.string(),
  varies: z.boolean(),
  percent: z.string(),
  // Off the plan price over the whole stay, excl. taxes.
  discountTotal: z.string(),
  totalBefore: z.string(),
  totalAfter: z.string(),
  depositAfter: z.string().nullable(),
  reason: discountReasonSchema,
  reasonText: z.string().nullable(),
  note: z.string().nullable(),
  requesterName: z.string(),
  requesterLimit: z.string(),
  requesterRole: z.string(),
  deviceName: z.string().nullable(),
  // An upgrade at the booked price (brick 7): the room type the price was kept from.
  fromRoomTypeName: z.string().nullable().optional(),
})
export type ApprovalSubject = z.infer<typeof approvalSubjectSchema>

// What the approver sees for a penalty waiver (brick 6).
export const waiverSubjectSchema = z.object({
  reservationId: idSchema,
  // Set when the waiver is for a penalty already recorded.
  penaltyId: idSchema.nullable(),
  hotelName: z.string(),
  guestName: z.string(),
  reservationNumber: z.string(),
  roomTypeName: z.string(),
  planName: z.string(),
  arrival: calendarDateSchema,
  departure: calendarDateSchema,
  nights: z.number().int(),
  // What is being waived and on what action.
  penalty: z.object({
    kind: penaltyKindSchema,
    amount: z.string(),
    basisLabel: z.string(),
    policy: z.string(),
  }),
  action: z.enum(['cancel', 'no_show', 'modify', 'penalty']),
  waiverReason: z.string(),
  requesterName: z.string(),
  requesterRole: z.string(),
  deviceName: z.string().nullable(),
})
export type WaiverSubject = z.infer<typeof waiverSubjectSchema>

// What the approver sees for a cash difference on a cashier shift (brick 9): at the hand-over when
// a shift opens, or on the count when it closes. Staff names only, never guest data.
export const cashVarianceSubjectSchema = z.object({
  stage: z.enum(['handover', 'close']),
  hotelName: z.string(),
  drawerName: z.string(),
  // Null at the hand-over: the shift has no number until it opens.
  shiftNumber: z.number().int().nullable(),
  shiftBusinessDate: z.string(),
  // The total difference in naira, and each line that differs ("Cash ₦12,500.00 over").
  difference: z.string(),
  lines: z.array(
    z.object({ label: z.string(), difference: z.string(), words: z.enum(['short', 'over']) }),
  ),
  handover: z
    .object({ fromName: z.string().nullable(), floatLeft: z.string(), counted: z.string() })
    .nullable(),
  reason: z.string(),
  requesterName: z.string(),
  requesterRole: z.string(),
  // Null = no limit; '0.00' without the permission.
  requesterLimit: z.string().nullable(),
  deviceName: z.string().nullable(),
})
export type CashVarianceSubject = z.infer<typeof cashVarianceSubjectSchema>

export const anySubjectSchema = z.union([
  approvalSubjectSchema,
  waiverSubjectSchema,
  cashVarianceSubjectSchema,
])
export type AnyApprovalSubject = z.infer<typeof anySubjectSchema>

export const isWaiverSubject = (subject: AnyApprovalSubject): subject is WaiverSubject =>
  'penalty' in subject

export const isCashSubject = (subject: AnyApprovalSubject): subject is CashVarianceSubject =>
  'stage' in subject

// A discount, on a new booking or a changed stay.
export const isDiscountSubject = (subject: AnyApprovalSubject): subject is ApprovalSubject =>
  !isWaiverSubject(subject) && !isCashSubject(subject)

const person = z.object({ memberId: idSchema, name: z.string() })

export const approvalViewSchema = z.object({
  id: idSchema,
  kind: approvalKindSchema,
  propertyId: idSchema,
  // As a reader sees it now: open rows past their time read as expired.
  status: approvalStatusSchema,
  method: approvalMethodSchema.nullable(),
  value: z.string(),
  subject: anySubjectSchema,
  requester: person,
  approver: person.nullable(),
  // The approver's answer, or why the requester cancelled.
  comment: z.string().nullable(),
  requestedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  answeredAt: z.iso.datetime().nullable(),
  usedAt: z.iso.datetime().nullable(),
  // "VI-2611-0484" once used.
  usedFor: z.string().nullable(),
  // The reader's part: asked of them, or asked by them.
  role: z.enum(['approver', 'requester']),
  hotelArchived: z.boolean(),
  timeZone: z.string(),
})
export type ApprovalView = z.infer<typeof approvalViewSchema>

// The requester also gets back the booking to resume it ("Continue booking"); nobody else does.
export const approvalDetailSchema = approvalViewSchema.extend({
  draft: createReservationSchema.nullable(),
})
export type ApprovalDetail = z.infer<typeof approvalDetailSchema>

// The action. A discount on a new booking: the booking as Review & book would send it, and which
// stay the discount is on. A discount on a changed stay: the change as Save would send it. A
// penalty waiver: on the cancel, no-show or change about to be saved (approved here, used by it),
// or on a penalty already recorded (approved here or in the inbox, applied when approved).
const waiverReason = z
  .string()
  .trim()
  .min(1, "Say why you're waiving the penalty.")
  .max(500, 'Use 500 characters or fewer')

export const waiverTargetSchema = z.discriminatedUnion('target', [
  z.object({
    target: z.enum(['cancel', 'no_show']),
    reservationId: idSchema,
    version: z.number().int().min(1),
    // The cancel's or no-show's own idempotency key.
    actionKey: z.uuidv7(),
    reason: waiverReason,
  }),
  z.object({
    target: z.literal('modify'),
    change: changeFieldsSchema.extend({ idempotencyKey: z.uuidv7() }),
    reason: waiverReason,
  }),
  z.object({ target: z.literal('penalty'), penaltyId: idSchema, reason: waiverReason }),
])
export type WaiverTarget = z.input<typeof waiverTargetSchema>

// A cash difference: at the hand-over of the shift about to open (the open's own client id), or on
// a counted shift about to close. The server works out the figures from the drawer or the stored
// count; the client sends only what was typed.
export const cashVarianceTargetSchema = z.discriminatedUnion('stage', [
  z.object({
    stage: z.literal('handover'),
    propertyId: idSchema,
    drawerId: idSchema,
    // The id the shift will have once open.
    shiftId: z.uuidv7(),
    handoverFromShiftId: idSchema.nullable(),
    count: noteCountSchema,
    reason: cashReasonSchema,
  }),
  z.object({ stage: z.literal('close'), shiftId: idSchema, reason: cashReasonSchema }),
])
export type CashVarianceTarget = z.input<typeof cashVarianceTargetSchema>

export const approvalActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stay_discount'),
    booking: createReservationSchema,
    stayIndex: z
      .number()
      .int()
      .min(0)
      .max(MAX_STAYS - 1)
      .default(0),
  }),
  z.object({
    kind: z.literal('modify_discount'),
    change: changeFieldsSchema.extend({ idempotencyKey: z.uuidv7() }),
  }),
  z.object({ kind: z.literal('penalty_waiver'), waiver: waiverTargetSchema }),
  z.object({ kind: z.literal('cash_variance'), variance: cashVarianceTargetSchema }),
])
export type ApprovalActionInput = z.input<typeof approvalActionSchema>

export const approverSchema = z.object({
  memberId: idSchema,
  name: z.string(),
  role: z.string(),
  // Their limit for the kind's permission; null = any.
  limit: z.string().nullable(),
})
export type Approver = z.infer<typeof approverSchema>

export const approversSchema = z.object({
  approvers: z.array(approverSchema),
  // Members whose limit would cover it but who have no PIN yet ("Tunde Bello hasn't set one yet").
  withoutPin: z.array(z.string()),
  // This browser is a registered device of the hotel, so an approver can type their PIN here.
  canApproveHere: z.boolean(),
  subject: anySubjectSchema,
  value: z.string(),
})
export type Approvers = z.infer<typeof approversSchema>

// A PIN typed to confirm: 4 digits (checked against the stored hash, never against the rules).
const enteredPin = z.string().regex(/^\d{4}$/, 'Use 4 digits')
const comment = z.string().trim().max(500, 'Use 500 characters or fewer')

export const approveHereSchema = z.intersection(
  approvalActionSchema,
  z.object({
    // A double submit or a retry returns the same approval.
    idempotencyKey: z.uuidv7(),
    approverMemberId: idSchema,
    pin: enteredPin,
  }),
)

export const requestApprovalSchema = z.intersection(
  approvalActionSchema,
  z.object({
    // A double tap or a retry returns the same request.
    idempotencyKey: z.uuidv7(),
    approverMemberId: idSchema,
  }),
)

export const listApprovalsSchema = pageQuerySchema.extend({
  propertyId: idSchema.optional(),
  view: z.enum(APPROVAL_VIEWS).default('waiting'),
  // Only those asked on the hotel's current business date (the bell's "Your requests").
  today: z.boolean().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})
export type ListApprovalsInput = z.input<typeof listApprovalsSchema>

export const approvalsContract = {
  approvals: {
    approvers: oc.input(approvalActionSchema).output(approversSchema),
    approveHere: oc.input(approveHereSchema).output(approvalViewSchema),
    request: oc.input(requestApprovalSchema).output(approvalViewSchema),
    get: oc.input(z.object({ id: idSchema })).output(approvalDetailSchema),
    list: oc.input(listApprovalsSchema).output(pageSchema(approvalViewSchema)),
    count: oc
      .input(z.object({ propertyId: idSchema.optional() }))
      .output(z.object({ waiting: z.number().int() })),
    approve: oc
      .input(z.object({ id: idSchema, pin: enteredPin, comment: comment.optional() }))
      .output(approvalViewSchema),
    decline: oc.input(z.object({ id: idSchema, comment })).output(approvalViewSchema),
    cancel: oc
      .input(z.object({ id: idSchema, reason: z.enum(CANCEL_REASONS) }))
      .output(approvalViewSchema),
  },
}
