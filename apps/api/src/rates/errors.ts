// Errors with the spec's wording ("Empty, error and edge cases" and "UI copy") and a `data.code`
// from RATE_ERROR_CODES the web app can react to.
import { ORPCError } from '@orpc/server'
import { formatNaira, formatRateDate, type LoweredTonight } from '@vento/shared'

export const planNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that rate plan" })

export const roomTypeNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that room type" })

// "Bed & breakfast and Non-refundable", "A, B and C".
export function names(list: readonly string[]): string {
  if (list.length <= 1) return list.join('')
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
}

export const planNameTaken = (name: string) =>
  new ORPCError('CONFLICT', {
    message: `${name} already exists at this hotel.`,
    data: { code: 'PLAN_NAME_TAKEN' },
  })

export const planCodeTaken = (code: string, usedBy: { name: string; archived: boolean }) =>
  new ORPCError('CONFLICT', {
    message: usedBy.archived
      ? `Code ${code} belongs to an archived plan. Restore it, or pick another code.`
      : `Code ${code} is used by ${usedBy.name}.`,
    data: { code: 'PLAN_CODE_TAKEN', archived: usedBy.archived },
  })

export const planArchived = (name: string) =>
  new ORPCError('CONFLICT', {
    message: `${name} is archived. Restore it first.`,
    data: { code: 'PLAN_ARCHIVED' },
  })

export const planIsDerived = (name: string, parent: string) =>
  new ORPCError('BAD_REQUEST', {
    message: `${name} follows ${parent}. Change ${parent}'s dates instead.`,
    data: { code: 'PLAN_DERIVED' },
  })

export const parentNotOwn = (name: string) =>
  new ORPCError('BAD_REQUEST', {
    message: `${name} follows another plan, so it can't be a parent. Choose a plan with its own prices.`,
    data: { code: 'PARENT_NOT_OWN' },
  })

export const parentArchived = (name: string) =>
  new ORPCError('CONFLICT', {
    message: `${name} is archived. Restore it first, or choose another parent plan.`,
    data: { code: 'PARENT_ARCHIVED' },
  })

// "Bed & breakfast and Non-refundable follow Best available. Archive them first, or point them to
// another plan."
export const hasFollowers = (plan: string, followers: readonly string[], action: string) =>
  new ORPCError('CONFLICT', {
    message: `${names(followers)} ${followers.length === 1 ? 'follows' : 'follow'} ${plan}. ${action}`,
    data: { code: 'HAS_DERIVED_PLANS', plans: [...followers] },
  })

export const notOnParent = (parent: string, roomTypes: readonly string[]) =>
  new ORPCError('BAD_REQUEST', {
    message: `${parent} doesn't sell ${names(roomTypes)}. Add ${roomTypes.length === 1 ? 'it' : 'them'} to ${parent} first.`,
    data: { code: 'ROOM_TYPE_NOT_ON_PARENT', roomTypes: [...roomTypes] },
  })

export const notOnPlan = (plan: string) =>
  new ORPCError('BAD_REQUEST', {
    message: `${plan} doesn't sell that room type.`,
    data: { code: 'ROOM_TYPE_NOT_ON_PLAN' },
  })

export const roomTypeArchived = (name: string) =>
  new ORPCError('CONFLICT', {
    message: `${name} is archived. Restore it first.`,
    data: { code: 'ROOM_TYPE_ARCHIVED' },
  })

export const noRoomTypes = () =>
  new ORPCError('CONFLICT', {
    message: 'Set up rooms first. Rates are set per room type.',
    data: { code: 'NO_ROOM_TYPES' },
  })

// "Non-refundable would be ₦0 or less for Standard Queen on 12 Jan 2027. Use a smaller offset."
export const derivedNotPositive = (plan: string, roomType: string, date: string) =>
  new ORPCError('BAD_REQUEST', {
    message: `${plan} would be ₦0 or less for ${roomType} on ${formatRateDate(date)}. Use a smaller offset.`,
    data: { code: 'DERIVED_NOT_POSITIVE', plan, roomType, date },
  })

// "Bed & breakfast costs ₦15,000 for Standard Queen on 12 Jan 2027, less than its ₦18,000 meal
// allocation. Lower the allocation or raise the price."
export const allocationAbovePrice = (
  plan: string,
  allocation: string,
  roomType: string,
  date: string,
) =>
  new ORPCError('BAD_REQUEST', {
    message: `${plan}'s meal allocation (${formatNaira(allocation)}) would be more than its price for ${roomType} on ${formatRateDate(date)}. Lower the allocation or raise the price.`,
    data: { code: 'MEAL_ALLOCATION_ABOVE_PRICE', plan, roomType, date },
  })

export const undoExpired = () =>
  new ORPCError('CONFLICT', {
    message:
      "This change can't be undone any more: night audit has run since. Change the dates again instead.",
    data: { code: 'UNDO_EXPIRED' },
  })

export type CellsRemoved = {
  count: number
  prices: number
  closures: number
  minStays: number
  seasons: string[]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// "Its 16 date prices and 3 closures from 25 Nov 2026 are removed." The web shows it in a confirm
// and saves again with confirmDateCellsRemoved: data.count.
export const dateCellsRemoved = (removed: CellsRemoved) => {
  const parts = [
    removed.prices ? plural(removed.prices, 'date price', 'date prices') : '',
    removed.closures ? plural(removed.closures, 'closure', 'closures') : '',
    removed.minStays ? plural(removed.minStays, 'min stay', 'min stays') : '',
  ].filter(Boolean)
  const what = parts.length
    ? names(parts)
    : plural(removed.count, 'dated setting', 'dated settings')
  return new ORPCError('CONFLICT', {
    message: `Its ${what} ${removed.count === 1 && parts.length <= 1 ? 'is' : 'are'} removed. Confirm to save.`,
    data: { code: 'DATE_CELLS_REMOVED', ...removed },
  })
}

export const pastDate = (date: string) =>
  new ORPCError('BAD_REQUEST', {
    message: `${formatRateDate(date)} is before the business date. Past rates can't change.`,
    data: { code: 'PAST_DATE' },
  })

export const tooFarAhead = (lastDate: string) =>
  new ORPCError('BAD_REQUEST', {
    message: `Rates can be set up to ${formatRateDate(lastDate)}.`,
    data: { code: 'TOO_FAR_AHEAD', lastDate },
  })

export const noDates = (message: string) =>
  new ORPCError('BAD_REQUEST', { message, data: { code: 'NO_DATES' } })

export const lowerTonightReason = (lowered: readonly LoweredTonight[]) =>
  new ORPCError('BAD_REQUEST', {
    message:
      "Give a reason for lowering tonight's price. It's recorded with your name and shows in the owner's daily report.",
    data: { code: 'REASON_REQUIRED', lowered: [...lowered] },
  })

export const notArchived = (name: string) =>
  new ORPCError('CONFLICT', {
    message: `${name} isn't archived. Archive it first.`,
    data: { code: 'NOT_ARCHIVED' },
  })

export const hasHistory = (name: string) =>
  new ORPCError('CONFLICT', {
    message: `${name} has been used on bookings, so it stays archived.`,
    data: { code: 'HAS_HISTORY' },
  })

export const listChanged = () =>
  new ORPCError('BAD_REQUEST', {
    message: 'The rate plans changed while you were sorting. Reload and try again.',
    data: { code: 'LIST_CHANGED' },
  })

export const plansExist = () =>
  new ORPCError('CONFLICT', {
    message: 'This hotel already has rate plans. Add another with New rate plan.',
    data: { code: 'PLANS_EXIST' },
  })

export const plansArchived = () =>
  new ORPCError('CONFLICT', {
    message:
      "This hotel's rate plans are all archived. Restore one from Archived, or add a new plan.",
    data: { code: 'PLANS_ARCHIVED' },
  })

export const batchReused = () =>
  new ORPCError('BAD_REQUEST', {
    message: 'That change was already applied to another rate plan. Reload and try again.',
    data: { code: 'BATCH_REUSED' },
  })

export const stayTooLong = () =>
  new ORPCError('BAD_REQUEST', {
    message: 'A stay can be up to 365 nights.',
    data: { code: 'STAY_TOO_LONG' },
  })

export const undoNotFound = () =>
  new ORPCError('NOT_FOUND', {
    message: "We couldn't find that change to undo",
    data: { code: 'UNDO_NOT_FOUND' },
  })

export const alreadyUndone = () =>
  new ORPCError('CONFLICT', {
    message: 'That change was already undone.',
    data: { code: 'ALREADY_UNDONE' },
  })

export const tooManyGuests = (roomType: string) =>
  new ORPCError('BAD_REQUEST', {
    message: `Too many guests for ${roomType}.`,
    data: { code: 'TOO_MANY_GUESTS' },
  })
