// Calendar dates (stay dates, business dates, due dates) are plain `YYYY-MM-DD` strings with no time
// and no time zone (CLAUDE.md non-negotiable 12). Maths here uses UTC midnight internally so
// daylight-saving and the machine's time zone can never shift a night.
import { z } from 'zod'

export const calendarDateSchema = z.iso.date()
export type CalendarDate = string

const DAY_MS = 86_400_000

function toUtcMs(date: CalendarDate): number {
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(ms) || !calendarDateSchema.safeParse(date).success) {
    throw new RangeError(`Not a calendar date: ${date}`)
  }
  return ms
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10)
}

// Number of nights between arrival and departure. A day use (same date) is 0 nights.
export function nightsBetween(arrival: CalendarDate, departure: CalendarDate): number {
  return Math.round((toUtcMs(departure) - toUtcMs(arrival)) / DAY_MS)
}

export const stayDatesSchema = z
  .object({ arrival: calendarDateSchema, departure: calendarDateSchema })
  .refine((stay) => stay.departure >= stay.arrival, {
    message: 'Departure must be on or after arrival',
    path: ['departure'],
  })

// The calendar date in a property's time zone (default Africa/Lagos) at a given instant.
export function calendarDateIn(timeZone: string, at: Date = new Date()): CalendarDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

// The UTC offset of a time zone at an instant, in milliseconds (Lagos: +1 hour).
function offsetMs(timeZone: string, at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at))
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return local - (at - (at % 60_000))
}

// The instant a wall-clock time happens on a calendar date in a time zone: "the hotel's check-in
// time on the arrival day" (14:00 on 9 Dec 2026 in Lagos is 13:00 UTC).
export function instantAt(date: CalendarDate, time: string, timeZone: string): Date {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  const wall = toUtcMs(date) + hours * 3_600_000 + minutes * 60_000
  const first = wall - offsetMs(timeZone, wall)
  // A second pass settles the rare wall time near a daylight-saving change.
  return new Date(wall - offsetMs(timeZone, first))
}
