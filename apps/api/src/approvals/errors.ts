// Errors for approvals, with the spec's wording (stage-1-approvals.md, "UI copy") and a
// `data.code` the web app can react to (APPROVAL_ERROR_CODES in @vento/shared).
import { ORPCError } from '@orpc/server'
import { clockAt, firstNameOf, formatPercent, wrongPinMessage } from '@vento/shared'

const make = (
  status: 'BAD_REQUEST' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND',
  code: string,
  message: string,
  data: Record<string, unknown> = {},
) => new ORPCError(status, { message, data: { code, ...data } })

export const approvalNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that request" })

export const selfApproval = () =>
  make('FORBIDDEN', 'SELF_APPROVAL', "You can't approve your own discount. Ask another manager.")

export const approverNotEligible = (name: string, value: string, hotel: string) =>
  make(
    'FORBIDDEN',
    'APPROVER_NOT_ELIGIBLE',
    `${name} can't approve ${formatPercent(value)}% at ${hotel}.`,
  )

export const needsPin = (name: string) =>
  make('FORBIDDEN', 'APPROVER_NOT_ELIGIBLE', `Approvers need a PIN. ${name} hasn't set one yet.`)

export const notNeeded = (value: string) =>
  make(
    'BAD_REQUEST',
    'APPROVAL_NOT_NEEDED',
    `${formatPercent(value)}% is within your limit. Book it directly.`,
  )

export const pinHereNeedsDevice = () =>
  make(
    'FORBIDDEN',
    'PIN_HERE_NEEDS_DEVICE',
    'Approving here needs a shared hotel device. Send it to an inbox instead.',
  )

export const wrongPin = (triesLeft: number) =>
  make('BAD_REQUEST', 'WRONG_PIN', wrongPinMessage(triesLeft), { triesLeft })

// `whose`: "Tunde's" on the requester's screen, "Your" when the approver answers themselves.
export const pinLocked = (whose: string, lockedUntil: string, timeZone: string, own: boolean) =>
  make(
    'FORBIDDEN',
    'PIN_LOCKED',
    own
      ? `Too many tries. Your PIN is locked until ${clockAt(lockedUntil, timeZone)}.`
      : `Too many tries. ${whose} PIN is locked until ${clockAt(lockedUntil, timeZone)}. Pick another manager or send it to an inbox.`,
    { lockedUntil },
  )

export const pinNeedsReset = (whose: string) =>
  make('FORBIDDEN', 'PIN_NEEDS_RESET', `${whose} PIN needs a reset by a manager.`)

export const commentRequired = (requesterName: string) =>
  make(
    'BAD_REQUEST',
    'COMMENT_REQUIRED',
    `Add a comment so ${firstNameOf(requesterName)} knows why.`,
  )

export const requesterLeft = (name: string, hotel: string) =>
  make('CONFLICT', 'REQUESTER_LEFT', `${name} no longer works at ${hotel}.`)

type Closed = {
  status: string
  requesterName: string
  answeredAt: Date | null
  expiresAt: Date
  updatedAt: Date
  usedAt: Date | null
  timeZone: string
}

// "Chiamaka cancelled this request at 10:40." · "This request expired at 11:06." · "You already
// approved this request at 10:39."
export function notPending(row: Closed) {
  const at = (when: Date | null) => clockAt(when ?? row.updatedAt, row.timeZone)
  const message =
    row.status === 'cancelled'
      ? `${firstNameOf(row.requesterName)} cancelled this request at ${at(row.updatedAt)}.`
      : row.status === 'expired'
        ? `This request expired at ${at(row.expiresAt)}.`
        : row.status === 'approved'
          ? `You already approved this request at ${at(row.answeredAt)}.`
          : 'You already answered this request.'
  return make('CONFLICT', 'APPROVAL_NOT_PENDING', message, { status: row.status })
}

export const cantCancel = (status: string) =>
  make(
    'CONFLICT',
    'APPROVAL_NOT_PENDING',
    status === 'cancelled'
      ? 'This request was already cancelled.'
      : 'This request was already answered.',
    { status },
  )

// Refusals at Book (spec: "Using an approval at Book").
export const approvalUsed = (reference: string | null) =>
  make(
    'CONFLICT',
    'APPROVAL_USED',
    `This approval was already used${reference ? ` for ${reference}` : ''}. Ask again for a new booking.`,
  )

export const approvalExpired = (approverName: string, at: Date, timeZone: string) =>
  make(
    'CONFLICT',
    'APPROVAL_EXPIRED',
    `${firstNameOf(approverName)}'s approval expired at ${clockAt(at, timeZone)}. Ask again.`,
  )

export const approvalNotMatching = (approverName: string) =>
  make(
    'CONFLICT',
    'APPROVAL_NOT_MATCHING',
    `The booking changed after ${firstNameOf(approverName)} approved it. Ask again.`,
  )

export const approvalNoLongerValid = (approverName: string, value: string) =>
  make(
    'CONFLICT',
    'APPROVAL_NO_LONGER_VALID',
    `${approverName} can no longer approve ${formatPercent(value)}%. Ask another manager.`,
  )

export const approvalNotGiven = (approverName: string | null) =>
  make(
    'CONFLICT',
    'APPROVAL_NO_LONGER_VALID',
    `${approverName ?? 'The manager'} hasn't approved this. Ask again.`,
  )

export const approvalOnOneStay = () =>
  make('BAD_REQUEST', 'APPROVAL_NOT_MATCHING', 'An approval covers one stay. Ask for each stay.')

export const tooManyOpenRequests = (max: number) =>
  make(
    'CONFLICT',
    'TOO_MANY_OPEN_REQUESTS',
    `You have ${max} requests waiting. Cancel one or wait for an answer.`,
  )

export const tooManyWrongPins = () =>
  make(
    'FORBIDDEN',
    'TOO_MANY_PIN_TRIES',
    'Too many wrong PINs from this desk. Wait 15 minutes, or send the request to an inbox.',
  )
