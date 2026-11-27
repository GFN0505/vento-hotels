// A reservation's audit events in plain words for its audit trail (design: AuditOnReservation).
import { type AuditEventView, formatMoney, formatPercent } from '@vento/shared'
import type { AuditLine } from '@/components/audit/audit-sheet'

type Fields = Record<string, unknown>
const asFields = (value: unknown): Fields =>
  value && typeof value === 'object' ? (value as Fields) : {}
const naira = (amount: unknown) => formatMoney({ amount: String(amount), currency: 'NGN' })

const TITLES: Record<string, string> = {
  'reservation.created': 'Reservation created',
  'stay.discount_applied': 'Discount',
  'stay.restriction_overridden': 'Booked through a restriction',
}

const when = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Lagos',
})

export function describeReservationEvent(event: AuditEventView): AuditLine {
  const after = asFields(event.after)
  const changes: string[] = []
  if (event.action === 'reservation.created') {
    const total = after.quotedTotal ? `Total ${naira(after.quotedTotal)}` : null
    const deposit = asFields(after.depositDue)
    changes.push(
      [
        String(after.number ?? ''),
        total,
        deposit.amount ? `deposit ${naira(deposit.amount)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    )
  } else if (event.action === 'stay.discount_applied') {
    const nights = Array.isArray(after.nights) ? (after.nights as Fields[]) : []
    const first = nights[0]
    changes.push(
      `${formatPercent(String(after.percent ?? '0'))}%${first ? ` · ${naira(first.planPrice)} → ${naira(first.soldPrice)} a night` : ''}`,
    )
    if (after.limit) changes.push(`Limit at the time: ${formatPercent(String(after.limit))}%`)
  } else if (event.action === 'stay.restriction_overridden' && typeof after.message === 'string') {
    changes.push(after.message)
  }
  return {
    id: event.id,
    title: TITLES[event.action] ?? event.action.replace(/[._]/g, ' '),
    changes,
    who: event.actorName ?? 'Vento',
    when: when.format(new Date(event.createdAt)),
    reason: event.reason,
  }
}
