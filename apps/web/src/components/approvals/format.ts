// Words for approvals, as the spec writes them ("UI copy"): the prompt's figures, inbox rows, the
// waiting line on Review, and PIN errors. Pure, so they are tested without a browser.
import {
  type AnyApprovalSubject,
  APPROVAL_KIND_LABELS,
  type ApprovalStatus,
  type ApprovalSubject,
  type ApprovalView,
  type CashVarianceSubject,
  clockAt,
  DISCOUNT_REASON_LABELS,
  dec,
  firstNameOf,
  formatMoney,
  formatPercent,
  isCashSubject,
  isWaiverSubject,
  PENALTY_KIND_LABELS,
  toAmount,
  type WaiverSubject,
} from '@vento/shared'

export const naira = (amount: string) => formatMoney({ amount, currency: 'NGN' })

export const NEEDS_CONNECTION = 'Approval needs a connection.'

// "Repeat guest · Stayed 4 times this year"
export function reasonLine(subject: Pick<ApprovalSubject, 'reason' | 'reasonText' | 'note'>) {
  return [subject.reasonText || DISCOUNT_REASON_LABELS[subject.reason], subject.note]
    .filter(Boolean)
    .join(' · ')
}

// The prompt's figures: plan price, the discount a night, the new rate and the stay total.
export function subjectFigures(subject: ApprovalSubject) {
  const off = toAmount(dec(subject.planPrice).minus(subject.newPrice))
  const aNight = subject.varies ? 'first night' : 'a night'
  return [
    { label: 'Plan price', value: `${naira(subject.planPrice)} ${aNight}` },
    { label: `Discount ${subject.percent}%`, value: `− ${naira(off)} ${aNight}` },
    { label: 'New rate', value: `${naira(subject.newPrice)} ${aNight}`, strong: true },
    {
      label: 'Stay total incl. taxes',
      value: `${naira(subject.totalBefore)} → ${naira(subject.totalAfter)}`,
    },
  ]
}

// "Discount 15% on Deluxe King · Bed & breakfast"
// An upgrade at the booked price (brick 7): "Upgrade at the booked price · Deluxe King → Executive
// King, 26.32% below the Executive King price".
export const promptTitle = (subject: ApprovalSubject) =>
  subject.reason === 'upgrade' && subject.fromRoomTypeName
    ? `Upgrade at the booked price for ${subject.guestName} · ${subject.fromRoomTypeName} → ${subject.roomTypeName}, ${subject.percent}% below the ${subject.roomTypeName} price`
    : `Discount ${subject.percent}% on ${subject.roomTypeName} · ${subject.planName}`

// "Chiamaka's limit is 12%. Asked at 10:36 on FD-VI-01."
export function promptMeta(subject: ApprovalSubject, askedAt: Date, timeZone: string) {
  const device = subject.deviceName ? ` on ${subject.deviceName}` : ''
  return `${firstNameOf(subject.requesterName)}'s limit is ${subject.requesterLimit}%. Asked at ${clockAt(askedAt, timeZone)}${device}.`
}

// "Nobody at Kora Victoria Island can approve 15% right now. Use up to 12%."
export const nobodyLine = (subject: ApprovalSubject) =>
  `Nobody at ${subject.hotelName} can approve ${subject.percent}% right now. Use up to ${subject.requesterLimit}%.`

// "Approvers need a PIN. Tunde Bello hasn't set one yet."
export function withoutPinLine(names: string[]): string | undefined {
  if (names.length === 0) return undefined
  const who =
    names.length === 1
      ? `${names[0]} hasn't`
      : `${names.slice(0, -1).join(', ')} and ${names.at(-1)} haven't`
  return `Approvers need a PIN. ${who} set one yet.`
}

// What is asked, as the toasts and lines say it: "15%", "the waiver", or "₦12,500.00".
export const whatOf = (subject: AnyApprovalSubject) =>
  isCashSubject(subject)
    ? naira(subject.difference)
    : isWaiverSubject(subject)
      ? 'the waiver'
      : `${subject.percent}%`

// Who or what it's for: the guest, or the cashier's shift ("Ibrahim Musa · Shift 3").
export function forWhom(subject: AnyApprovalSubject): string {
  if (!isCashSubject(subject)) return subject.guestName
  return subject.shiftNumber === null
    ? `${subject.requesterName} · ${subject.drawerName}`
    : `${subject.requesterName} · Shift ${subject.shiftNumber}`
}

// "a ₦12,500.00", "an ₦8,000.00" (eight, eleven and eighteen start with a vowel sound).
export function withArticle(amount: string): string {
  const shown = naira(amount)
  const lead = toAmount(amount).split('.')[0] ?? ''
  const group = lead.length % 3 === 0 ? lead.slice(0, 3) : lead.slice(0, lead.length % 3)
  const vowel = lead.startsWith('8') || group === '11' || group === '18'
  return `${vowel ? 'an' : 'a'} ${shown}`
}

// "Approve a ₦12,500.00 difference on shift 3?" / "Approve an ₦8,000.00 hand-over difference on
// Desk 2?"
export const cashTitle = (subject: CashVarianceSubject) =>
  subject.stage === 'handover' || subject.shiftNumber === null
    ? `Approve ${withArticle(subject.difference)} hand-over difference on ${subject.drawerName}?`
    : `Approve ${withArticle(subject.difference)} difference on shift ${subject.shiftNumber}?`

// "Cash ₦12,500.00 over · POS ₦2,500.00 short"
export const cashLinesText = (subject: CashVarianceSubject) =>
  subject.lines
    .map((line) => `${line.label} ${naira(dec(line.difference).abs().toFixed(2))} ${line.words}`)
    .join(' · ')

// "Desk 2 · Ibrahim Musa · Cash ₦12,500.00 over"
export const cashMeta = (subject: CashVarianceSubject) =>
  [subject.drawerName, subject.requesterName, cashLinesText(subject)].filter(Boolean).join(' · ')

// "Ibrahim's limit is ₦5,000.00."
export function cashLimitLine(subject: CashVarianceSubject): string {
  const first = firstNameOf(subject.requesterName)
  if (subject.requesterLimit === null) return `${first} has no limit.`
  if (dec(subject.requesterLimit).isZero()) return `${first} can't close with a difference.`
  return `${first}'s limit is ${naira(subject.requesterLimit)}.`
}

// The prompt's figures for a cash difference.
export function cashFigures(subject: CashVarianceSubject) {
  const rows: { label: string; value: string; strong?: boolean }[] = []
  if (subject.handover) {
    rows.push(
      {
        label: subject.handover.fromName ? `Left by ${subject.handover.fromName}` : 'Float left',
        value: naira(subject.handover.floatLeft),
      },
      { label: 'Counted at opening', value: naira(subject.handover.counted) },
    )
  } else {
    for (const line of subject.lines) {
      rows.push({
        label: line.label,
        value: `${naira(dec(line.difference).abs().toFixed(2))} ${line.words}`,
      })
    }
  }
  rows.push({ label: 'Difference to approve', value: naira(subject.difference), strong: true })
  return rows
}

// "Nobody at Kora Victoria Island can approve ₦250,000.00 right now."
export const nobodyCashLine = (subject: CashVarianceSubject) =>
  `Nobody at ${subject.hotelName} can approve ${naira(subject.difference)} right now.`

// Inbox rows: "Over limit · Kora Victoria Island", "Discount 15% · Sarah Collins", "− ₦75,600.00";
// a waiver: "Waiver · Kora Victoria Island", "Waive ₦183,750.00 · VI-2611-0405", "₦183,750.00".
export const rowLabel = (view: Pick<ApprovalView, 'kind' | 'subject'>) =>
  `${APPROVAL_KIND_LABELS[view.kind]} · ${view.subject.hotelName}`
export const rowTitle = (view: Pick<ApprovalView, 'subject'>) =>
  isCashSubject(view.subject)
    ? `${naira(view.subject.difference)} cash difference · ${forWhom(view.subject)}`
    : isWaiverSubject(view.subject)
      ? `Waive ${naira(view.subject.penalty.amount)} · ${view.subject.reservationNumber}`
      : `Discount ${view.subject.percent}% · ${view.subject.guestName}`
export const rowAmount = (view: Pick<ApprovalView, 'subject'>) =>
  isCashSubject(view.subject)
    ? naira(view.subject.difference)
    : isWaiverSubject(view.subject)
      ? naira(view.subject.penalty.amount)
      : `− ${naira(view.subject.discountTotal)}`

// "Waive penalty ₦257,250.00 on VI-2611-0447 · Kelechi Obi"
export const waiverTitle = (subject: WaiverSubject) =>
  `Waive penalty ${naira(subject.penalty.amount)} on ${subject.reservationNumber} · ${subject.guestName}`

// "Chiamaka can't waive penalties. Asked at 11:21 on FD-VI-01."
export function waiverMeta(subject: WaiverSubject, askedAt: Date, timeZone: string) {
  const device = subject.deviceName ? ` on ${subject.deviceName}` : ''
  return `${firstNameOf(subject.requesterName)} can't waive penalties. Asked at ${clockAt(askedAt, timeZone)}${device}.`
}

// The prompt's figures for a waiver: the penalty, its basis and the policy.
export function waiverFigures(subject: WaiverSubject) {
  return [
    { label: 'Booking', value: `${subject.reservationNumber} · ${subject.roomTypeName}` },
    { label: 'Policy', value: subject.penalty.policy },
    {
      label: PENALTY_KIND_LABELS[subject.penalty.kind],
      value: subject.penalty.basisLabel,
    },
    { label: 'Penalty to waive', value: naira(subject.penalty.amount), strong: true },
  ]
}

// "Nobody at Kora Victoria Island can waive penalties right now."
export const nobodyWaiverLine = (subject: WaiverSubject) =>
  `Nobody at ${subject.hotelName} can waive penalties right now.`

// "2 min", "1 h", "yesterday": how long ago, as the rows say it.
export function age(iso: string, now = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days`
}

export function statusBadge(view: Pick<ApprovalView, 'status' | 'usedFor'>): {
  tone: 'amber' | 'emerald' | 'slate'
  label: string
} {
  const labels: Record<ApprovalStatus, string> = {
    pending: 'Waiting',
    approved: view.usedFor ? `Approved · used for ${view.usedFor}` : 'Approved',
    declined: 'Declined',
    cancelled: 'Cancelled',
    expired: 'Expired',
  }
  const tone =
    view.status === 'pending' ? 'amber' : view.status === 'approved' ? 'emerald' : 'slate'
  return { tone, label: labels[view.status] }
}

// Review & book while a request is out, and once it's answered.
export function answerLine(
  view: Pick<
    ApprovalView,
    'status' | 'approver' | 'requestedAt' | 'expiresAt' | 'answeredAt' | 'comment' | 'subject'
  >,
  timeZone: string,
): string {
  const name = view.approver?.name ?? 'the manager'
  const first = firstNameOf(name)
  switch (view.status) {
    case 'pending':
      return `Waiting for ${name} · asked ${clockAt(view.requestedAt, timeZone)} · expires ${clockAt(view.expiresAt, timeZone)}`
    case 'approved':
      return `Approved by ${name} at ${clockAt(view.answeredAt ?? view.requestedAt, timeZone)}`
    case 'declined':
      return `${name} declined ${whatOf(view.subject)}${view.comment ? `: “${view.comment}”` : ''}`
    case 'expired':
      return view.answeredAt
        ? `${first}'s approval expired at ${clockAt(view.expiresAt, timeZone)}. Ask again.`
        : `${first} didn't answer by ${clockAt(view.expiresAt, timeZone)}. Ask again or change the discount.`
    default:
      return `Request to ${first} cancelled`
  }
}

// The bell's "Your requests" line: "Tunde approved 15% for Sarah Collins".
export function yourRequestLine(view: Pick<ApprovalView, 'status' | 'approver' | 'subject'>) {
  const first = firstNameOf(view.approver?.name ?? 'The manager')
  const what = `${whatOf(view.subject)} for ${forWhom(view.subject)}`
  switch (view.status) {
    case 'pending':
      return `Waiting for ${view.approver?.name ?? 'a manager'} · ${what}`
    case 'approved':
      return `${first} approved ${what}`
    case 'declined':
      return `${first} declined ${what}`
    case 'expired':
      return `${first}'s answer expired · ${what}`
    default:
      return `Cancelled · ${what}`
  }
}

export const percentText = (value: string) => `${formatPercent(value)}%`
