// Turns a room's audit events into plain words for its audit trail: what happened, what changed
// (before → after), and whether it was part of one go ("Added by floor with other rooms").
import type { AuditEventView } from '@vento/shared'

type Fields = Record<string, unknown>

const TITLES: Record<string, string> = {
  'room.created': 'Room added',
  'room.changed': 'Room changed',
  'room.archived': 'Removed',
  'room.restored': 'Restored',
  'room.deleted': 'Deleted for good',
  'room.status_changed': 'Status',
  'room.out_of_order': 'Out of order',
  'room.out_of_order_changed': 'Out-of-order dates changed',
  'room.back_in_service': 'Back in service',
}

// "25 Nov" from a stored date.
const day = (value: unknown) => {
  if (typeof value !== 'string') return ''
  const [, m, d] = value.split('-').map(Number)
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(m ?? 1) - 1]}`
}

const STATUS: Record<string, string> = {
  clean: 'Clean',
  inspected: 'Inspected',
  dirty: 'Dirty',
  out_of_order: 'Out of order',
  out_of_service: 'Out of service',
}

const asFields = (value: unknown): Fields =>
  value && typeof value === 'object' ? (value as Fields) : {}

function show(key: string, value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (key === 'floor' && value === 0) return 'Ground'
  if (key === 'housekeepingStatus' && typeof value === 'string') return STATUS[value] ?? value
  return value === null || value === undefined || value === '' ? 'none' : String(value)
}

const LABELS: [key: string, label: string][] = [
  ['number', 'Number'],
  ['floor', 'Floor'],
  ['roomTypeName', 'Type'],
  ['features', 'Features'],
  ['accessible', 'Accessible'],
  ['connectingRooms', 'Connecting'],
]

export type HistoryLine = {
  id: string
  title: string
  changes: string[]
  batch: string | undefined
  who: string
  when: string
  reason: string | null
}

const when = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Lagos',
})

export function describe(event: AuditEventView): HistoryLine {
  const before = asFields(event.before)
  const after = asFields(event.after)
  let changes: string[] = []
  if (event.action === 'room.created') {
    changes = [`${show('roomTypeName', after.roomTypeName)} · Floor ${show('floor', after.floor)}`]
  } else if (event.action === 'room.status_changed') {
    changes = [
      after.applied === false
        ? `${show('housekeepingStatus', after.requested)} from a device, kept as ${show('housekeepingStatus', after.housekeepingStatus).toLowerCase()} (a later change won)`
        : `${show('housekeepingStatus', before.housekeepingStatus)} → ${show('housekeepingStatus', after.housekeepingStatus)}`,
    ]
  } else if (event.action === 'room.out_of_order') {
    changes = [
      `${day(after.from)} → back in service ${day(after.backInService)}${typeof after.note === 'string' && after.note ? ` · ${after.note}` : ''}`,
    ]
  } else if (
    event.action === 'room.out_of_order_changed' ||
    event.action === 'room.back_in_service'
  ) {
    changes = [
      `${day(before.from)}–${day(before.backInService)} → ${after.ended === 'removed' ? 'removed' : `${day(after.from)}–${day(after.backInService)}`}`,
    ]
  } else if (event.action === 'room.archived' || event.action === 'room.restored') {
    changes = after.roomTypeName ? [`${show('roomTypeName', after.roomTypeName)}`] : []
  } else {
    changes = LABELS.filter(([key]) => key in after && key !== 'number').map(
      ([key, label]) => `${label}: ${show(key, before[key])} → ${show(key, after[key])}`,
    )
    if ('number' in before && before.number !== after.number) {
      changes.unshift(`Number: ${show('number', before.number)} → ${show('number', after.number)}`)
    }
  }
  const batch =
    typeof after.batchId === 'string'
      ? event.action === 'room.status_changed'
        ? 'With every room, in one go'
        : 'Added by floor with other rooms, in one go'
      : undefined
  return {
    id: event.id,
    title: TITLES[event.action] ?? event.action.replace(/^room\./, '').replace(/_/g, ' '),
    changes,
    batch,
    who: event.actorName ?? 'Vento',
    when: when.format(new Date(event.createdAt)),
    reason: event.reason,
  }
}
