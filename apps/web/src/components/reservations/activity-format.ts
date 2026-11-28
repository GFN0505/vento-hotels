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
  'reservation.modified': 'Changed',
  'reservation.cancelled': 'Cancelled',
  'reservation.no_show': 'Marked no-show',
  'penalty.recorded': 'Penalty recorded',
  'reservation.penalty_waived': 'Penalty waived',
  'stay.room_assigned': 'Room assigned',
  'stay.room_moved': 'Room moved',
  'stay.room_unassigned': 'Room removed',
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
  if (event.action.startsWith('stay.room_')) {
    const before = asFields(asFields(event.before).room)
    const room = asFields(after.room)
    changes.push(
      [
        before.number ? `Room ${String(before.number)}` : 'No room',
        room.number ? `Room ${String(room.number)}` : 'no room',
      ].join(' → '),
    )
  } else if (event.action === 'reservation.created') {
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
    if (typeof after.approverName === 'string') {
      const how =
        after.approvalMethod === 'pin_here'
          ? `PIN${typeof after.approvalDevice === 'string' ? ` on ${after.approvalDevice}` : ''}`
          : 'inbox'
      changes.push(`Approved by ${after.approverName} (${how})`)
    }
  } else if (event.action === 'stay.restriction_overridden' && typeof after.message === 'string') {
    changes.push(after.message)
  } else if (event.action === 'reservation.modified') {
    const before = asFields(event.before)
    if (before.arrival !== after.arrival || before.departure !== after.departure) {
      changes.push(
        `${before.arrival} – ${before.departure} → ${after.arrival} – ${after.departure}`,
      )
    }
    if (before.roomTypeName !== after.roomTypeName) {
      changes.push(`Room type ${before.roomTypeName} → ${after.roomTypeName}`)
    }
    if (before.adults !== after.adults || before.children !== after.children) {
      changes.push(
        `Guests ${before.adults} + ${before.children} → ${after.adults} + ${after.children}`,
      )
    }
    if (before.total !== after.total) changes.push(`${naira(before.total)} → ${naira(after.total)}`)
  } else if (event.action === 'reservation.cancelled' || event.action === 'reservation.no_show') {
    const penalty = asFields(after.penalty)
    changes.push(
      penalty.amount
        ? `Penalty ${naira(penalty.amount)}${penalty.waived ? ' (waived)' : ''}`
        : 'No penalty',
    )
    if (typeof after.nightsReleased === 'number') {
      changes.push(
        `${after.nightsReleased} ${after.nightsReleased === 1 ? 'night' : 'nights'} released`,
      )
    }
  } else if (event.action === 'penalty.recorded') {
    changes.push(`${naira(after.amount)} · to charge`)
  } else if (event.action === 'reservation.penalty_waived') {
    changes.push(naira(after.amount))
    const asked = asFields(after.requestedBy)
    if (typeof asked.name === 'string') changes.push(`Asked by ${asked.name}`)
    if (typeof after.approverName === 'string') {
      changes.push(
        `Approved by ${after.approverName} (${after.approvalMethod === 'pin_here' ? 'PIN' : 'inbox'})`,
      )
    }
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
