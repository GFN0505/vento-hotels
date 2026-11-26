// Errors for taxes, payments and FX rates, with the spec's wording and a `data.code` the web app can
// react to (FINANCE_ERROR_CODES in @vento/shared).
import { ORPCError } from '@orpc/server'

export const noPermission = (message: string) => new ORPCError('FORBIDDEN', { message })

const conflict = (code: string, message: string, data: Record<string, unknown> = {}) =>
  new ORPCError('CONFLICT', { message, data: { code, ...data } })
const bad = (code: string, message: string, data: Record<string, unknown> = {}) =>
  new ORPCError('BAD_REQUEST', { message, data: { code, ...data } })

export const taxesNotSetUp = (hotel: string) =>
  conflict('TAXES_NOT_SET_UP', `${hotel}'s taxes aren't set up yet. Ask finance to set them up.`)

export const taxesAlreadySetUp = (hotel: string) =>
  conflict('TAXES_ALREADY_SET_UP', `${hotel}'s taxes are already set up.`)

export const noState = (hotel: string) =>
  bad('NO_STATE', `Add ${hotel}'s state on Settings › Hotels first. Its taxes depend on it.`)

export const startTooEarly = (earliest: string) =>
  bad('START_TOO_EARLY', `Changes start after the business date. The earliest is ${earliest}.`, {
    field: 'startsOn',
  })

export const alreadyScheduled = (tax: string, from: string) =>
  conflict(
    'RATE_ALREADY_SCHEDULED',
    `${tax} already has a change scheduled for ${from}. Cancel it first.`,
  )

export const notScheduled = () =>
  conflict(
    'NOT_SCHEDULED',
    'Only a scheduled change can be cancelled. Schedule a new change instead.',
  )

export const groupAccessNeeded = (message: string) =>
  new ORPCError('FORBIDDEN', { message, data: { code: 'GROUP_ACCESS_NEEDED' } })

export const taxNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that tax" })
export const rateNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that rate" })

export const reasonRequired = () =>
  bad(
    'REASON_REQUIRED',
    "Give a reason. Recorded with your name. This shows in the owner's daily report.",
    { field: 'reason' },
  )

export const bankAccountNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that bank account" })
export const terminalNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that POS terminal" })
