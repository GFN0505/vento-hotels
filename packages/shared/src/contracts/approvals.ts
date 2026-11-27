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
import { calendarDateSchema } from '../dates.ts'
import { idSchema } from '../ids.ts'
import { pageQuerySchema, pageSchema } from '../pagination.ts'
import { discountReasonSchema, MAX_STAYS } from '../reservations.ts'
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
})
export type ApprovalSubject = z.infer<typeof approvalSubjectSchema>

const person = z.object({ memberId: idSchema, name: z.string() })

export const approvalViewSchema = z.object({
  id: idSchema,
  kind: approvalKindSchema,
  propertyId: idSchema,
  // As a reader sees it now: open rows past their time read as expired.
  status: approvalStatusSchema,
  method: approvalMethodSchema.nullable(),
  value: z.string(),
  subject: approvalSubjectSchema,
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

// The action: the booking as Review & book would send it, and which stay the discount is on.
export const approvalActionSchema = z.object({
  kind: approvalKindSchema,
  booking: createReservationSchema,
  stayIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_STAYS - 1)
    .default(0),
})
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
  subject: approvalSubjectSchema,
  value: z.string(),
})
export type Approvers = z.infer<typeof approversSchema>

// A PIN typed to confirm: 4 digits (checked against the stored hash, never against the rules).
const enteredPin = z.string().regex(/^\d{4}$/, 'Use 4 digits')
const comment = z.string().trim().max(500, 'Use 500 characters or fewer')

export const approveHereSchema = approvalActionSchema.extend({
  approverMemberId: idSchema,
  pin: enteredPin,
})

export const requestApprovalSchema = approvalActionSchema.extend({
  // A double tap or a retry returns the same request.
  idempotencyKey: z.uuidv7(),
  approverMemberId: idSchema,
})

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
