// The tape chart, room moves and room status (spec: docs/specs/stage-1-tape-chart.md): the words,
// limits and pure maths the API and the web app share. Bars and periods are half-open date ranges
// like a stay: arrival (or From) is the first night, departure (or Back in service) the first day
// the room is free again.
import { z } from 'zod'
import { addDays, type CalendarDate, nightsBetween } from './dates.ts'
import { formatRateDate } from './rates.ts'

// Why a room was assigned or moved (optional before arrival; Upgrade is required when the booked
// price is kept on a better room type, because it's a discount).
export const ROOM_MOVE_REASONS = [
  'guest_request',
  'maintenance',
  'upgrade',
  'noise',
  'other',
] as const
export type RoomMoveReason = (typeof ROOM_MOVE_REASONS)[number]
export const roomMoveReasonSchema = z.enum(ROOM_MOVE_REASONS)
export const ROOM_MOVE_REASON_LABELS: Record<RoomMoveReason, string> = {
  guest_request: 'Guest request',
  maintenance: 'Maintenance',
  upgrade: 'Upgrade',
  noise: 'Noise',
  other: 'Other',
}

// Where an assignment came from, for the audit trail.
export const ROOM_CHANGE_SOURCES = ['chart_drag', 'dialog', 'day_list', 'undo'] as const
export type RoomChangeSource = (typeof ROOM_CHANGE_SOURCES)[number]

export const OOO_REASONS = ['ac', 'plumbing', 'electrical', 'renovation', 'other'] as const
export type OutOfOrderReason = (typeof OOO_REASONS)[number]
export const outOfOrderReasonSchema = z.enum(OOO_REASONS)
export const OOO_REASON_LABELS: Record<OutOfOrderReason, string> = {
  ac: 'AC',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  renovation: 'Renovation',
  other: 'Other',
}
export const OOO_MAX_NIGHTS = 365
export const OOO_NOTE_MAX = 200
export const OOO_REASON_TEXT_MAX = 100

// Housekeeping status as stored (out of order is a dated period, shown on the nights it covers).
export const ROOM_STATUSES = ['clean', 'inspected', 'dirty'] as const
export type RoomStatus = (typeof ROOM_STATUSES)[number]
export const roomStatusSchema = z.enum(ROOM_STATUSES)
export const ROOM_STATUS_LABELS: Record<RoomStatus | 'out_of_order', string> = {
  clean: 'Clean',
  inspected: 'Inspected',
  dirty: 'Dirty',
  out_of_order: 'Out of order',
}
// What the desk and housekeeping set; inspected comes from inspections (Stage 2) and set-up.
export const SETTABLE_STATUSES = ['clean', 'dirty'] as const
export type SettableStatus = (typeof SETTABLE_STATUSES)[number]

// The chart's window: past nights for context, then the range chosen.
export const CHART_LEAD_DAYS = 2
export const CHART_RANGES = [7, 14, 30] as const
export type ChartRange = (typeof CHART_RANGES)[number]
// The day list asks for one night.
export const CHART_DAY_OPTIONS = [1, 7, 14, 30] as const
export const UNDO_SECONDS = 8
// Rooms per type in the Room move dialog before "Show all".
export const ROOM_OPTIONS_SHOWN = 8

export const chartStartFor = (businessDate: CalendarDate) => addDays(businessDate, -CHART_LEAD_DAYS)

// Two half-open ranges share a night.
export const rangesOverlap = (aFrom: string, aTo: string, bFrom: string, bTo: string) =>
  aFrom < bTo && bFrom < aTo

// Every night of a half-open range.
export function nightsOf(from: CalendarDate, to: CalendarDate): CalendarDate[] {
  const count = Math.max(0, nightsBetween(from, to))
  return Array.from({ length: count }, (_, i) => addDays(from, i))
}

// Where a bar sits in a window of `days` columns from `windowFrom`: the first column, how many it
// spans, and whether it runs past either edge. Null when it is outside the window.
export function barSpan(
  arrival: CalendarDate,
  departure: CalendarDate,
  windowFrom: CalendarDate,
  days: number,
): { start: number; span: number; clippedStart: boolean; clippedEnd: boolean } | null {
  const windowTo = addDays(windowFrom, days)
  if (!rangesOverlap(arrival, departure, windowFrom, windowTo)) return null
  const first = arrival < windowFrom ? windowFrom : arrival
  const last = departure > windowTo ? windowTo : departure
  return {
    start: nightsBetween(windowFrom, first),
    span: nightsBetween(first, last),
    clippedStart: arrival < windowFrom,
    clippedEnd: departure > windowTo,
  }
}

// "Mensah D."
export const shortGuestName = (firstName: string, lastName: string) =>
  `${lastName} ${firstName.slice(0, 1).toUpperCase()}.`.trim()

// "25–27 Nov", "28 Nov–2 Dec", with the year: "25–27 Nov 2026".
export function rangeLabel(from: CalendarDate, to: CalendarDate, withYear = false): string {
  const [fy, fm, fd] = from.split('-')
  const [ty, tm] = to.split('-')
  if (fy !== ty) return `${formatRateDate(from)}–${formatRateDate(to)}`
  if (fm !== tm) return `${formatRateDate(from, false)}–${formatRateDate(to, withYear)}`
  return `${Number(fd)}–${formatRateDate(to, withYear)}`
}

export const nightsWord = (count: number) => (count === 1 ? '1 night' : `${count} nights`)

// Rooms left on a night as shown: rooms, less those out of order, less those booked.
export function roomsLeft(rooms: number, outOfOrder: number, booked: number, limit = 0) {
  const sellable = rooms - outOfOrder
  return { left: sellable - booked, bookable: sellable - booked + limit }
}

// Ready rooms are offered first: clean or inspected.
export const isReady = (status: RoomStatus) => status !== 'dirty'

// How the Room move dialog orders rooms of one type: ready first (inspected, then clean), then
// dirty, then by floor and number.
const STATUS_ORDER: Record<RoomStatus, number> = { inspected: 0, clean: 1, dirty: 2 }
export function compareRoomOptions(
  a: { status: RoomStatus; floor: number; number: string },
  b: { status: RoomStatus; floor: number; number: string },
  byStatus: boolean,
): number {
  if (byStatus && STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  }
  if (a.floor !== b.floor) return a.floor - b.floor
  return a.number.localeCompare(b.number, 'en', { numeric: true })
}
