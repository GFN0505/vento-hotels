// Cashier shifts and cash drawers (spec: docs/specs/stage-1-cashier-shifts.md). Behind the
// front_desk feature. Running a shift needs `cashier_shift.operate`; a difference above the
// person's `cashier_shift.variance` limit needs an approval (kind `cash_variance`); reading every
// shift of a hotel needs `leakage.view`; drawers are set up with `finance.setup`.
//
// The count is blind: an open shift's schema has no expected, counted or difference fields at all,
// and the server's output validation strips anything that isn't in it. Expected figures first leave
// the server in the response to `submitCount`. No input carries an organizationId.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import {
  bagNumberSchema,
  cashReasonSchema,
  countLineKindSchema,
  foreignCashSchema,
  noteCountSchema,
  takingsSchema,
} from '../cash.ts'
import { calendarDateSchema } from '../dates.ts'
import { fxCurrencySchema, fxSourceSchema } from '../fx.ts'
import { idSchema } from '../ids.ts'
import { amountSchema } from '../money.ts'
import { MAX_PAGE_SIZE, pageQuerySchema, pageSchema } from '../pagination.ts'

// `data.code` on errors from these procedures, so the web app can react.
export const CASH_ERROR_CODES = [
  'SHIFT_ALREADY_OPEN',
  'DRAWER_BUSY',
  'DRAWER_ARCHIVED',
  'DRAWER_WRONG_HOTEL',
  'DRAWER_LAST_ACTIVE',
  'DRAWER_HAS_SHIFT',
  'DRAWER_NAME_TAKEN',
  'HANDOVER_CHANGED',
  'NOT_YOUR_SHIFT',
  'SHIFT_NOT_OPEN',
  'SHIFT_CLOSED',
  'COUNT_ALREADY_SUBMITTED',
  'COUNT_LINES_CHANGED',
  'COUNT_TOO_LARGE',
  'FX_RATE_MISSING',
  'DIFFERENCE_REASON_REQUIRED',
  'DIFFERENCE_OVER_LIMIT', // data: { canAsk, limit, value }
  'FLOAT_MORE_THAN_CASH',
  'BAG_NUMBER_REQUIRED',
  'IDEMPOTENCY_CONFLICT',
  'PROPERTY_NOT_FOUND',
  'PROPERTY_ARCHIVED',
  'FEATURE_OFF',
] as const
export type CashErrorCode = (typeof CASH_ERROR_CODES)[number]

const hotel = { propertyId: idSchema }
const amount = z.string()
const currency = z.enum(['NGN', 'USD', 'GBP', 'EUR'])

export const terminalRefSchema = z.object({
  id: idSchema,
  // "Moniepoint · Desk 1"
  label: z.string(),
  archived: z.boolean(),
})
export type TerminalRef = z.infer<typeof terminalRefSchema>

const approvedBySchema = z.object({
  approvalId: idSchema,
  name: z.string(),
  method: z.enum(['pin_here', 'inbox']),
  // Where the PIN was typed, for "PIN on FD-VI-01".
  deviceName: z.string().nullable(),
  at: z.iso.datetime(),
})
export type ApprovedBy = z.infer<typeof approvedBySchema>

// What the drawer's last shift left, and how the opening count compared with it (not blind: the
// incoming cashier's own close is measured against the float she accepts).
export const handoverSchema = z.object({
  fromShift: z
    .object({
      id: idSchema,
      number: z.number().int(),
      businessDate: calendarDateSchema,
      memberName: z.string(),
      closedAt: z.iso.datetime(),
    })
    .nullable(),
  floatLeft: amount,
  // Counted at opening − float left; 0.00 when there was nothing to compare.
  difference: amount,
  reason: z.string().nullable(),
  approvedBy: approvedBySchema.nullable(),
})
export type Handover = z.infer<typeof handoverSchema>

const shiftBase = {
  id: idSchema,
  propertyId: idSchema,
  number: z.number().int(),
  businessDate: calendarDateSchema,
  drawer: z.object({ id: idSchema, name: z.string() }),
  member: z.object({ memberId: idSchema, name: z.string() }),
  deviceName: z.string().nullable(),
  openedAt: z.iso.datetime(),
  openingFloat: amount,
  openingCount: noteCountSchema,
  handover: handoverSchema,
  // Fixed at opening from the drawer's terminals.
  terminals: z.array(terminalRefSchema),
  version: z.number().int(),
  timeZone: z.string(),
}

// An open shift: the float and the hand-over, nothing about takings (the count is blind).
export const openShiftSchema = z.object({ ...shiftBase, status: z.literal('open') })
export type OpenShift = z.infer<typeof openShiftSchema>

export const countLineViewSchema = z.object({
  kind: countLineKindSchema,
  currency,
  posTerminalId: idSchema.nullable(),
  // "Cash ₦", "Cash US$", "POS · Moniepoint · Desk 1", "Bank transfers"
  label: z.string(),
  // Naira cash only: the count by note.
  notes: noteCountSchema.nullable(),
  counted: amount,
  expected: amount,
  difference: amount,
  // Foreign lines: the rate used, its source and date.
  fx: z.object({ rate: z.string(), source: fxSourceSchema, date: calendarDateSchema }).nullable(),
  countedNgn: amount,
  expectedNgn: amount,
  differenceNgn: amount,
  // Cash lines at close: what went to the safe, in the line's currency.
  toSafe: amount.nullable(),
})
export type CountLineView = z.infer<typeof countLineViewSchema>

const countedFields = {
  countedAt: z.iso.datetime(),
  countedBusinessDate: calendarDateSchema,
  lines: z.array(countLineViewSchema),
  // Naira cash counted, the most the float kept can be.
  cashCounted: amount,
  // Sum of the absolute line differences, in naira.
  totalDifference: amount,
}

export const countedShiftSchema = z.object({
  ...shiftBase,
  ...countedFields,
  status: z.literal('counted'),
  // Within the person's limit now, so a reason is enough to close.
  limit: amount.nullable(),
})

export const closedShiftSchema = z.object({
  ...shiftBase,
  ...countedFields,
  status: z.literal('closed'),
  closedAt: z.iso.datetime(),
  closedBusinessDate: calendarDateSchema,
  closeReason: z.string().nullable(),
  floatKept: amount,
  dropNgn: amount,
  dropBagNumber: z.string().nullable(),
  closeApproval: approvedBySchema.nullable(),
})

export const shiftViewSchema = z.discriminatedUnion('status', [
  openShiftSchema,
  countedShiftSchema,
  closedShiftSchema,
])
export type ShiftView = z.infer<typeof shiftViewSchema>
export type CountedShift = z.infer<typeof countedShiftSchema>
export type ClosedShift = z.infer<typeof closedShiftSchema>

export const drawerChoiceSchema = z.object({
  id: idSchema,
  name: z.string(),
  terminals: z.array(terminalRefSchema),
  // Somebody's shift is open on it: who, so the pill can say "Desk 1 · Chiamaka Eze's shift".
  busy: z
    .object({ memberName: z.string(), number: z.number().int(), mine: z.boolean() })
    .nullable(),
  lastClose: z
    .object({
      shiftId: idSchema,
      number: z.number().int(),
      businessDate: calendarDateSchema,
      memberName: z.string(),
      closedAt: z.iso.datetime(),
      floatKept: amount,
    })
    .nullable(),
})
export type DrawerChoice = z.infer<typeof drawerChoiceSchema>

export const myShiftSchema = z.object({
  hotel: z.object({
    id: idSchema,
    name: z.string(),
    businessDate: calendarDateSchema,
    timeZone: z.string(),
    archived: z.boolean(),
  }),
  // My shift here that isn't closed.
  shift: shiftViewSchema.nullable(),
  // My shift that isn't closed, at another hotel.
  elsewhere: z
    .object({
      propertyId: idSchema,
      hotelName: z.string(),
      number: z.number().int(),
      drawerName: z.string(),
    })
    .nullable(),
  drawers: z.array(drawerChoiceSchema),
  // My cashier_shift.variance limit in naira; null = any. Without the permission, '0.00'.
  limit: amount.nullable(),
})
export type MyShift = z.infer<typeof myShiftSchema>

export const openShiftInputSchema = z.object({
  ...hotel,
  // A double click or a retry returns the same shift (and lets brick 10 queue it offline).
  idempotencyKey: z.uuidv7(),
  id: z.uuidv7(),
  drawerId: idSchema,
  count: noteCountSchema,
  // The previous shift the opener saw the hand-over of; null for a first shift.
  handoverFromShiftId: idSchema.nullable(),
  reason: cashReasonSchema.optional(),
  approvalId: idSchema.optional(),
})
export type OpenShiftInput = z.input<typeof openShiftInputSchema>

export const countLineSchema = z.object({
  kind: countLineKindSchema,
  currency,
  posTerminalId: idSchema.nullable(),
  label: z.string(),
  hint: z.string(),
  // POS and transfers must be entered (0 allowed); cash can be left empty for 0.
  required: z.boolean(),
})
export type CountLine = z.infer<typeof countLineSchema>

export const submitCountSchema = z.object({
  idempotencyKey: z.uuidv7(),
  shiftId: idSchema,
  version: z.number().int().min(1),
  cash: noteCountSchema,
  foreign: z.array(z.object({ currency: fxCurrencySchema, amount: foreignCashSchema })).max(3),
  pos: z.array(z.object({ posTerminalId: idSchema, amount: takingsSchema })).max(50),
  transfers: takingsSchema.nullable(),
})
export type SubmitCountInput = z.input<typeof submitCountSchema>

export const closeShiftSchema = z.object({
  idempotencyKey: z.uuidv7(),
  shiftId: idSchema,
  version: z.number().int().min(1),
  reason: cashReasonSchema.optional(),
  floatKept: amountSchema.refine((value) => !value.startsWith('-'), 'The float can’t be negative.'),
  bagNumber: bagNumberSchema.optional(),
  approvalId: idSchema.optional(),
})
export type CloseShiftInput = z.input<typeof closeShiftSchema>

export const SHIFT_SEGMENTS = ['all', 'open', 'difference'] as const
export type ShiftSegment = (typeof SHIFT_SEGMENTS)[number]

export const listShiftsSchema = pageQuerySchema.extend({
  ...hotel,
  segment: z.enum(SHIFT_SEGMENTS).default('all'),
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
})
export type ListShiftsInput = z.input<typeof listShiftsSchema>

// A row of the Shifts list. An open shift has no difference: "Counted at close".
export const shiftRowSchema = z.object({
  id: idSchema,
  number: z.number().int(),
  businessDate: calendarDateSchema,
  drawerName: z.string(),
  memberName: z.string(),
  status: z.enum(['open', 'counted', 'closed']),
  openedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  openingFloat: amount,
  handoverDifference: amount,
  // Null while the count isn't submitted.
  totalDifference: amount.nullable(),
  // Signed naira cash difference, for "short" / "over" when only cash differs.
  cashDifference: amount.nullable(),
  approvedBy: z.string().nullable(),
  timeZone: z.string(),
})
export type ShiftRow = z.infer<typeof shiftRowSchema>

export const shiftEventSchema = z.object({
  id: idSchema,
  action: z.string(),
  actorName: z.string().nullable(),
  deviceName: z.string().nullable(),
  at: z.iso.datetime(),
  reason: z.string().nullable(),
})

export const shiftDetailSchema = z.object({
  shift: shiftViewSchema,
  events: z.array(shiftEventSchema),
})
export type ShiftDetail = z.infer<typeof shiftDetailSchema>

// --- Drawers --------------------------------------------------------------------------------------

export const drawerNameSchema = z
  .string()
  .trim()
  .min(1, 'Name the drawer, e.g. Desk 2')
  .max(30, 'Use 30 characters or fewer')

export const drawerViewSchema = z.object({
  id: idSchema,
  propertyId: idSchema,
  name: z.string(),
  terminals: z.array(terminalRefSchema),
  status: z.enum(['active', 'archived']),
  version: z.number().int(),
  // "Shift 1 open · Chiamaka Eze", or "Free · ₦50,000.00 float"
  now: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('busy'), number: z.number().int(), memberName: z.string() }),
    z.object({ kind: z.literal('free'), floatLeft: amount }),
  ]),
})
export type DrawerView = z.infer<typeof drawerViewSchema>

const drawerReason = z.string().trim().min(3, 'Give a reason of at least 3 characters').max(500)
const drawerFields = {
  ...hotel,
  name: drawerNameSchema,
  posTerminalIds: z.array(idSchema).max(20),
  reason: drawerReason.optional(),
}
export const createDrawerSchema = z.object(drawerFields)
export const updateDrawerSchema = z.object({
  ...drawerFields,
  id: idSchema,
  version: z.number().int().min(1),
})
export const drawerChangeSchema = z.object({
  ...hotel,
  id: idSchema,
  reason: drawerReason.optional(),
})

export const listDrawersSchema = pageQuerySchema.extend({
  ...hotel,
  status: z.enum(['active', 'archived']).default('active'),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(MAX_PAGE_SIZE),
})

export const cashContract = {
  cash: {
    myShift: oc.input(z.object(hotel)).output(myShiftSchema),
    open: oc.input(openShiftInputSchema).output(shiftViewSchema),
    countLines: oc
      .input(z.object({ shiftId: idSchema }))
      .output(z.object({ lines: z.array(countLineSchema) })),
    submitCount: oc.input(submitCountSchema).output(shiftViewSchema),
    close: oc.input(closeShiftSchema).output(shiftViewSchema),
    shifts: {
      list: oc.input(listShiftsSchema).output(pageSchema(shiftRowSchema)),
      get: oc.input(z.object({ id: idSchema })).output(shiftDetailSchema),
    },
    drawers: {
      list: oc.input(listDrawersSchema).output(pageSchema(drawerViewSchema)),
      create: oc.input(createDrawerSchema).output(drawerViewSchema),
      update: oc.input(updateDrawerSchema).output(drawerViewSchema),
      archive: oc.input(drawerChangeSchema).output(drawerViewSchema),
      restore: oc.input(drawerChangeSchema).output(drawerViewSchema),
    },
  },
}
