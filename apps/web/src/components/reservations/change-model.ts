// Words and button states for Modify, Cancel and Mark no-show (spec: stage-1-modify-cancel.md, "UI
// copy"), the Penalty card and the copied cancellation. Pure, so they are unit-tested; the figures
// always come from the server (quoteChange, endQuote, the detail).
import {
  addDays,
  type ChangeQuote,
  clockAt,
  dec,
  END_REASON_LABELS,
  type EndQuote,
  firstNameOf,
  nightsDelta,
  type PenaltyView,
  type ReservationDetail,
  toAmount,
} from '@vento/shared'
import { dateLabel, dayLabel, instantDate, instantLabel, naira } from './format'

export const NEEDS_CONNECTION = 'Changing a booking needs a connection.'

// "+₦205,800.00", "−₦205,800.00".
const signed = (difference: ChangeQuote['difference']) =>
  difference.sign === 0 ? '' : `${difference.sign > 0 ? '+' : '−'}${naira(difference.amount)}`

export type SaveState = {
  label: string
  // What Save does: save, ask for a discount approval, or ask for a waiver.
  action: 'save' | 'ask_discount' | 'ask_waiver'
  disabled: boolean
  // Why it is disabled, said next to it.
  hint: string | null
}

// The Modify dialog's primary button.
export function saveState(
  quote: ChangeQuote | undefined,
  options: { waive: boolean; canWaive: boolean; online: boolean },
): SaveState {
  if (!options.online) {
    return { label: 'Save', action: 'save', disabled: true, hint: NEEDS_CONNECTION }
  }
  if (!quote) return { label: 'Save', action: 'save', disabled: true, hint: null }
  if (!quote.changed) {
    return { label: 'Save', action: 'save', disabled: true, hint: 'Nothing to save yet' }
  }
  const soldOut = quote.newNights.find((night) => !night.bookable)
  if (soldOut) {
    return {
      label: 'Save',
      action: 'save',
      disabled: true,
      hint: `Sold out ${dateLabel(soldOut.date, false)}`,
    }
  }
  if (quote.discount && !quote.discount.within) {
    return {
      label: `Ask for approval · ${quote.discount.percent}%`,
      action: 'ask_discount',
      disabled: false,
      hint: null,
    }
  }
  const late = quote.latePenalty
  if (late && options.waive) {
    return options.canWaive
      ? {
          label: `Save and waive ${naira(late.amount)}`,
          action: 'save',
          disabled: false,
          hint: null,
        }
      : {
          label: `Ask to waive ${naira(late.amount)}`,
          action: 'ask_waiver',
          disabled: false,
          hint: null,
        }
  }
  if (late) {
    return {
      label: `Save · ${naira(late.amount)} penalty`,
      action: 'save',
      disabled: false,
      hint: null,
    }
  }
  const diff = signed(quote.difference)
  return { label: diff ? `Save · ${diff}` : 'Save', action: 'save', disabled: false, hint: null }
}

// "+1 night", next to Leave.
export const leaveDelta = (quote: ChangeQuote | undefined) =>
  quote ? nightsDelta(quote.nightsBefore, quote.nights.length) : ''

// "Sat 12 Dec · Bed & breakfast · new night at today's rate"
export const newNightLine = (date: string, planName: string) =>
  `${dayLabel(date)} · ${planName} · new night at today's rate`

// "Deluxe King is free on 12 Dec. Same plan, no approval needed."
export function availabilityLine(
  quote: ChangeQuote,
): { tone: 'emerald' | 'rose'; text: string } | null {
  const fresh = quote.newNights
  if (fresh.length === 0) return null
  const soldOut = fresh.find((night) => !night.bookable)
  if (soldOut) {
    return {
      tone: 'rose',
      text: `${quote.roomTypeName} is sold out on ${dateLabel(soldOut.date, false)}.`,
    }
  }
  const first = fresh[0]?.date ?? ''
  const last = fresh.at(-1)?.date ?? first
  const when =
    first === last
      ? dateLabel(first, false)
      : `${dateLabel(first, false)}–${dateLabel(last, false)}`
  const approval = quote.discount && !quote.discount.within ? '' : ' Same plan, no approval needed.'
  return { tone: 'emerald', text: `${quote.roomTypeName} is free on ${when}.${approval}` }
}

// "Deposit due ₦205,800.00 by 27 Nov, 10:32 (unchanged)"
export function depositLine(quote: ChangeQuote, timeZone: string): string | null {
  const after = quote.after.deposit
  if (!after) return null
  const by = instantLabel(after.dueAt, timeZone).replace(/ \d{4},/, ',')
  return `Deposit due ${naira(after.amount)} by ${by}${quote.after.depositChanged ? '' : ' (unchanged)'}`
}

// "Free cancellation until 7 Dec 2026, 14:00", or that it has ended.
export function deadlineLine(
  quote: ChangeQuote,
  timeZone: string,
  now = new Date(),
): string | null {
  const deadline = quote.after.deadline
  if (!deadline) return 'Non-refundable'
  const at = instantLabel(deadline, timeZone)
  return Date.parse(deadline) <= now.getTime()
    ? `Free cancellation ended ${at}`
    : `Free cancellation until ${at}`
}

// "Free changes ended 7 Dec 2026, 14:00. This change lowers the stay by ₦165,375.00, so a penalty
// of ₦165,375.00 applies."
export function lateChangeLine(quote: ChangeQuote, timeZone: string): string | null {
  const late = quote.latePenalty
  if (!late) return null
  const lead =
    late.nonRefundable || !late.deadline
      ? 'This booking is non-refundable.'
      : `Free changes ended ${instantLabel(late.deadline, timeZone)}.`
  return `${lead} This change lowers the stay by ${naira(late.drop)}, so a penalty of ${naira(late.amount)} applies.`
}

// "15% is over your 12% discount limit. A manager with a higher limit can approve it, or price
// the new night without the discount."
export function overLimitLine(quote: ChangeQuote): string | null {
  const d = quote.discount
  if (!d || d.within) return null
  const newNights = quote.nights.filter((n) => !n.kept).length
  return `${d.percent}% is over your ${d.limit === null ? '' : `${Number(d.limit)}%`} discount limit. A manager with a higher limit can approve it, or price the new ${newNights === 1 ? 'night' : 'nights'} without the discount.`
}

// --- Cancel and no-show -----------------------------------------------------------------------------

// "Arrives tomorrow · free cancellation ended 24 Nov 2026, 14:00"; "Arrival 25 Nov 2026 · not checked in".
export function endSubtitle(
  quote: EndQuote,
  businessDate: string,
  timeZone: string,
  now = new Date(),
): string {
  if (quote.mode === 'no_show') return `Arrival ${dateLabel(quote.arrival)} · not checked in`
  const arrives =
    quote.arrival === businessDate
      ? 'Arrives today'
      : quote.arrival === addDays(businessDate, 1)
        ? 'Arrives tomorrow'
        : `Arrives ${dateLabel(quote.arrival)}`
  if (quote.nonRefundable) return `${arrives} · non-refundable`
  if (!quote.deadline) return arrives
  const at = instantLabel(quote.deadline, timeZone)
  return Date.parse(quote.deadline) <= now.getTime()
    ? `${arrives} · free cancellation ended ${at}`
    : `${arrives} · free cancellation until ${at}`
}

// "2 nights released (26 and 27 Nov)", "1 night released (25 Nov)".
export function releasedLine(dates: readonly string[]): string {
  const n = dates.length
  const words = dates.map((date) => dateLabel(date, false))
  const list =
    n <= 1
      ? (words[0] ?? '')
      : n === 2
        ? `${words[0]?.split(' ')[0]} and ${words[1]}`
        : `${words[0]} – ${words.at(-1)}`
  return `${n === 1 ? '1 night' : `${n} nights`} released (${list})`
}

// Why there is no penalty, as the box says it.
export function noPenaltyLine(quote: EndQuote, timeZone: string): string | null {
  if (quote.penalty) return null
  if (quote.noPenalty === 'unguaranteed')
    return 'No penalty: this booking had no deposit or guarantee.'
  if (quote.noPenalty === 'zero') return "No penalty under this booking's terms."
  if (quote.deadline)
    return `Free cancellation until ${instantLabel(quote.deadline, timeZone)} · No penalty`
  return 'No penalty'
}

// The primary button of the cancel and no-show dialogs.
export function endButton(
  quote: EndQuote | undefined,
  options: { waive: boolean; canWaive: boolean },
): { label: string; asks: boolean } {
  const cancel = quote?.mode !== 'no_show'
  const penalty = quote?.penalty
  if (penalty && options.waive) {
    if (!options.canWaive) return { label: `Ask to waive ${naira(penalty.amount)}`, asks: true }
    return {
      label: `${cancel ? 'Cancel' : 'Mark no-show'} and waive ${naira(penalty.amount)}`,
      asks: false,
    }
  }
  if (penalty) {
    return {
      label: `${cancel ? 'Cancel booking' : 'Mark no-show'} · ${naira(penalty.amount)} penalty`,
      asks: false,
    }
  }
  return { label: cancel ? 'Cancel booking' : 'Mark no-show', asks: false }
}

// "Waiving needs a manager. Tunde, Sade or Adaeze can approve it."
export function waiverNeedsLine(names: readonly string[]): string {
  const first = names.map(firstNameOf)
  if (first.length === 0) return 'Waiving needs a manager.'
  const who = first.length === 1 ? first[0] : `${first.slice(0, -1).join(', ')} or ${first.at(-1)}`
  return `Waiving needs a manager. ${who} can approve it.`
}

// --- The detail -------------------------------------------------------------------------------------

// "Cancelled 25 Nov 2026, 11:20 by Chiamaka Eze · Guest request · “Meeting moved to January”";
// "Marked no-show 26 Nov 2026, 00:35 (business date 25 Nov) by Ibrahim Musa".
export function endBanner(detail: Pick<ReservationDetail, 'end' | 'property'>): string | null {
  const end = detail.end
  if (!end) return null
  const tz = detail.property.timeZone
  const at = instantLabel(end.at, tz)
  const calendar = instantDate(end.at, tz)
  const business =
    calendar === end.businessDate ? '' : ` (business date ${dateLabel(end.businessDate, false)})`
  const why = end.reason ? (end.reasonText ?? END_REASON_LABELS[end.reason]) : null
  const parts = [
    `${end.kind === 'cancelled' ? 'Cancelled' : 'Marked no-show'} ${at}${business} by ${end.byName}`,
    end.kind === 'cancelled' && end.reason && end.reason !== 'other'
      ? END_REASON_LABELS[end.reason]
      : null,
    end.reason === 'other' && why ? why : null,
    end.note ? `“${end.note}”` : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

export type PenaltyState = {
  tone: 'amber' | 'slate' | 'emerald'
  badge: string
  line: string | null
  // What the reader can do: waive (manager), ask (others), ask again, or nothing.
  action: 'waive' | 'ask' | 'ask_again' | null
}

// The Penalty card's status, from the penalty and the latest waiver request.
export function penaltyState(
  penalty: PenaltyView,
  options: { canWaive: boolean; canManage: boolean; timeZone: string },
): PenaltyState {
  if (penalty.status === 'waived' && penalty.waived) {
    const w = penalty.waived
    const reason = `“${w.reason}”`
    return {
      tone: 'slate',
      badge: 'Waived',
      line: w.approverName
        ? `Waived · Approved by ${w.approverName} · ${reason}`
        : `Waived by ${w.byName} · ${reason}`,
      action: null,
    }
  }
  if (penalty.status === 'charged')
    return { tone: 'emerald', badge: 'Charged', line: null, action: null }
  const request = penalty.request
  const own = options.canWaive ? 'waive' : 'ask'
  if (!options.canManage) return { tone: 'amber', badge: 'To charge', line: null, action: null }
  if (request?.status === 'pending') {
    return {
      tone: 'amber',
      badge: 'Waiver asked',
      line: `Waiver asked of ${request.approverName} · expires ${clockAt(request.expiresAt, options.timeZone)}`,
      action: options.canWaive ? 'waive' : null,
    }
  }
  if (request?.status === 'declined') {
    return {
      tone: 'amber',
      badge: 'To charge',
      line: `${request.approverName} declined${request.comment ? `: “${request.comment}”` : ''}`,
      action: options.canWaive ? 'waive' : 'ask_again',
    }
  }
  if (request?.status === 'expired') {
    return {
      tone: 'amber',
      badge: 'To charge',
      line: `${request.approverName} didn't answer in time.`,
      action: options.canWaive ? 'waive' : 'ask_again',
    }
  }
  return { tone: 'amber', badge: 'To charge', line: null, action: own }
}

// The cancellation message Copy cancellation puts on the clipboard. Company-guaranteed stays never
// mention what the company owes.
export function cancellationText(detail: ReservationDetail, company = false): string {
  const stay = detail.stays[0]
  const owed = detail.penalties.filter((p) => p.status !== 'waived')
  const amount = toAmount(owed.reduce((sum, p) => sum.plus(p.amount), dec('0')))
  const what = stay ? ` for ${stay.roomTypeName}, ${rangeWords(stay.arrival, stay.departure)}` : ''
  const head = `${detail.property.name}: Hello ${detail.guest.firstName}, your booking ${detail.number}${what} is ${detail.status === 'no_show' ? 'closed as a no-show' : 'cancelled'}.`
  const charge = company
    ? ''
    : owed.length
      ? ` Under the booking's terms a cancellation charge of ${naira(amount)} applies.`
      : ' There is no charge.'
  return `${head}${charge} Questions? Reply to this message.`
}

const rangeWords = (arrival: string, departure: string) => {
  const a = dateLabel(arrival)
  const d = dateLabel(departure)
  const [ad, am, ay] = a.split(' ')
  const [dd, dm, dy] = d.split(' ')
  if (ay !== dy) return `${a} – ${d}`
  if (am !== dm) return `${ad} ${am} – ${d}`
  return `${ad}–${dd} ${dm} ${dy}`
}
