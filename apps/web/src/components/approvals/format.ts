// Words for approvals, as the spec writes them ("UI copy"): the prompt's figures, inbox rows, the
// waiting line on Review, and PIN errors. Pure, so they are tested without a browser.
import {
  APPROVAL_KIND_LABELS,
  type ApprovalStatus,
  type ApprovalSubject,
  type ApprovalView,
  clockAt,
  DISCOUNT_REASON_LABELS,
  dec,
  firstNameOf,
  formatMoney,
  formatPercent,
  toAmount,
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
export const promptTitle = (subject: ApprovalSubject) =>
  `Discount ${subject.percent}% on ${subject.roomTypeName} · ${subject.planName}`

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

// Inbox rows: "Over limit · Kora Victoria Island", "Discount 15% · Sarah Collins", "− ₦75,600.00".
export const rowLabel = (view: Pick<ApprovalView, 'kind' | 'subject'>) =>
  `${APPROVAL_KIND_LABELS[view.kind]} · ${view.subject.hotelName}`
export const rowTitle = (view: Pick<ApprovalView, 'subject'>) =>
  `Discount ${view.subject.percent}% · ${view.subject.guestName}`
export const rowAmount = (view: Pick<ApprovalView, 'subject'>) =>
  `− ${naira(view.subject.discountTotal)}`

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
      return `${name} declined ${view.subject.percent}%${view.comment ? `: “${view.comment}”` : ''}`
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
  const what = `${view.subject.percent}% for ${view.subject.guestName}`
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
