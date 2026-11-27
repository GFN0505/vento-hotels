// The New reservation sheet's draft (spec: "Draft"): kept in memory for the session only, so
// closing the sheet by mistake and reopening restores it. Never written to the device's storage
// (guest details on a shared PC). Cleared on Book, Discard draft, sign-out and hotel change. A
// draft holds no rooms. The idempotency key is made when the draft starts, so a double press or a
// retry after a timeout returns the same reservation.
import {
  DESK_SOURCES,
  type DeskSource,
  type DiscountReason,
  type GuestMatch,
  newId,
} from '@vento/shared'
import { useSyncExternalStore } from 'react'
import { SIGNED_OUT } from '../../../offline/saved-data'

export type GuestDraft = {
  // A picked guest; corrections to their details are sent with the booking.
  picked: GuestMatch | undefined
  title: string
  firstName: string
  lastName: string
  phone: string
  email: string
  nationality: string
}

export type DiscountDraft = {
  kind: 'percent' | 'rate'
  value: string
  reason: DiscountReason | undefined
  reasonText: string
  note: string
}

// An approval asked or given for this booking (spec stage-1-approvals.md). Kept with the quote hash
// it was for: a new price means it no longer matches.
export type ApprovalDraft = {
  id: string
  quoteHash: string
  status: 'pending' | 'approved' | 'declined' | 'expired' | 'cancelled'
  approverName: string
  requestedAt: string
  expiresAt: string
  answeredAt: string | null
  comment: string | null
}

export type Draft = {
  key: string
  // Where the draft was started (a hotel id, or 'all'), so another hotel never reuses it.
  scopeKey: string
  hotelId: string | undefined
  step: 1 | 2 | 3 | 4
  arrival: string
  departure: string
  adults: number
  children: number
  roomTypeId: string | undefined
  ratePlanId: string | undefined
  discount: DiscountDraft | undefined
  guest: GuestDraft
  source: DeskSource
  notes: string
  restrictionReason: string
  approval?: ApprovalDraft | undefined
  // Booked from a tape chart cell (brick 7): the room, assigned in the booking's transaction while
  // the draft stays on its room type.
  room?: { id: string; number: string; roomTypeId: string } | undefined
  savedAt: number | undefined
}

const SOURCE_KEY = 'vento.lastSource'

// The last source used on this device (not guest data, so it may be kept).
export function lastSource(): DeskSource {
  try {
    const saved = localStorage.getItem(SOURCE_KEY)
    return DESK_SOURCES.includes(saved as DeskSource) ? (saved as DeskSource) : 'phone'
  } catch {
    return 'phone'
  }
}

export function rememberSource(source: DeskSource) {
  try {
    localStorage.setItem(SOURCE_KEY, source)
  } catch {
    // Storage blocked: the default stays Phone.
  }
}

export const EMPTY_GUEST: GuestDraft = {
  picked: undefined,
  title: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  nationality: 'NG',
}

export function newDraft(
  scopeKey: string,
  hotelId: string | undefined,
  arrival: string,
  departure: string,
): Draft {
  return {
    key: newId(),
    scopeKey,
    hotelId,
    step: 1,
    arrival,
    departure,
    adults: 2,
    children: 0,
    roomTypeId: undefined,
    ratePlanId: undefined,
    discount: undefined,
    guest: EMPTY_GUEST,
    source: lastSource(),
    notes: '',
    restrictionReason: '',
    savedAt: undefined,
  }
}

let current: Draft | undefined
const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) listener()
}

export const getDraft = () => current

export function startDraft(draft: Draft) {
  current = draft
  notify()
}

export function updateDraft(patch: Partial<Draft>) {
  if (!current) return
  current = { ...current, ...patch, savedAt: Date.now() }
  notify()
}

export function clearDraft() {
  current = undefined
  notify()
}

// Signing out drops the draft (components/shell/account-menu.tsx); locking a shared device reloads
// the page, which drops it too.
if (typeof window !== 'undefined') window.addEventListener(SIGNED_OUT, clearDraft)

export function useDraft(): Draft | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}
