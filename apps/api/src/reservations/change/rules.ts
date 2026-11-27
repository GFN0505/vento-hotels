// Which changes a reservation allows (the spec's table) and the inventory a change moves: the old
// nights released and the new ones taken as net counts per row, so a kept night isn't touched.
import {
  addDays,
  allowedActions,
  calendarDateIn,
  formatRateDate,
  nightsBetween,
} from '@vento/shared'
import { type Access, can, requireFeature } from '../../tenancy/access.ts'
import type { BookingHotel } from '../context.ts'
import { noPermission } from '../errors.ts'
import { keyOf, type NightKey } from '../locks.ts'
import { arrivalPassed, CHANGE_ONLY, notArrivedYet, notChangeable } from './errors.ts'
import type { Loaded } from './load.ts'

const endedMessage = (loaded: Loaded, timeZone: string) => {
  const r = loaded.reservation
  const on = r.endedAt ? formatRateDate(calendarDateIn(timeZone, r.endedAt)) : ''
  return r.status === 'no_show'
    ? `This booking was marked no-show on ${on}.`
    : `This booking was cancelled on ${on}.`
}

export function requireAllowed(
  loaded: Loaded,
  hotel: BookingHotel,
  action: 'modify' | 'cancel' | 'no_show',
) {
  const r = loaded.reservation
  const allowed = allowedActions(r.status, r.arrival, hotel.businessDate)
  if (allowed.blocked === 'ended') throw notChangeable(endedMessage(loaded, hotel.timeZone))
  if (allowed.blocked === 'in_house') {
    throw notChangeable('This guest is in house. In-house changes come with check-in.')
  }
  if (action === 'no_show') {
    if (!allowed.noShow) throw notArrivedYet(r.number, r.arrival)
    return
  }
  if (!allowed[action]) throw arrivalPassed(r.arrival)
}

export function blockedMessage(loaded: Loaded, hotel: BookingHotel, mode: 'cancel' | 'no_show') {
  try {
    requireAllowed(loaded, hotel, mode)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Not allowed'
  }
}

export const nightKeysOf = (stay: { roomTypeId: string; arrival: string; departure: string }) =>
  Array.from({ length: nightsBetween(stay.arrival, stay.departure) }, (_, i) => ({
    roomTypeId: stay.roomTypeId,
    date: addDays(stay.arrival, i),
  }))

// Net rooms per inventory row: −1 for each old night, +1 for each new one; kept nights cancel out
// and are left out, so their rows aren't written.
export function netCounts(before: NightKey[], after: NightKey[]): Map<string, number> {
  const net = new Map<string, number>()
  for (const key of before) net.set(keyOf(key), (net.get(keyOf(key)) ?? 0) - 1)
  for (const key of after) net.set(keyOf(key), (net.get(keyOf(key)) ?? 0) + 1)
  for (const [key, count] of net) if (count === 0) net.delete(key)
  return net
}

export const releaseCounts = (keys: NightKey[]) => netCounts(keys, [])

// Changing, cancelling and marking no-show: the front_desk feature and reservation.manage.
export function requireChange(access: Access): void {
  requireFeature(access, 'front_desk')
  if (!can(access, 'reservation.manage')) throw noPermission(CHANGE_ONLY)
}
