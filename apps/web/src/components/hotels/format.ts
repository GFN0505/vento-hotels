// How hotels read on screen: where they are, their status, dates, time zones, and what archiving
// one does (spec: stage-1-hotels-and-companies.md, "UI copy").
import type { ArchivePreview, Property } from '@vento/shared'

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

const at = (date: string) => new Date(`${date}T00:00:00Z`)

// "25 Nov 2026"
export function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(at(date))
}

// "Wed 25 Nov 2026"
export function dayLabel(date: string): string {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' })
  return `${weekday.format(at(date))} ${dateLabel(date)}`
}

// "Victoria Island · Lagos"
export function hotelWhere(hotel: Pick<Property, 'area' | 'state'>): string {
  return [hotel.area, hotel.state].filter(Boolean).join(' · ')
}

// Hotels created in onboarding have a state but no street, area or LGA yet.
export function addressMissing(hotel: Pick<Property, 'addressLine1' | 'area' | 'lga'>): boolean {
  return !hotel.addressLine1 || !hotel.area || !hotel.lga
}

export type Tone = 'emerald' | 'slate'

export function hotelStatus(hotel: Pick<Property, 'status'>): { label: string; tone: Tone } {
  if (hotel.status === 'live') return { label: 'Live', tone: 'emerald' }
  if (hotel.status === 'archived') return { label: 'Archived', tone: 'slate' }
  return { label: 'Setting up', tone: 'slate' }
}

// "Africa/Lagos · WAT". Nigerian English names the zones the way people say them.
export function timeZoneLabel(timeZone: string): string {
  try {
    const name = new Intl.DateTimeFormat('en-NG', { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value
    return name ? `${timeZone} · ${name}` : timeZone
  } catch {
    return timeZone
  }
}

// What the archive dialog says will happen, one sentence each (spec: "Archive dialog").
export function archiveSummary(preview: ArchivePreview): string[] {
  const lines = [
    'It leaves the hotel switch and every list.',
    `Its ${plural(preview.rooms, 'room')}, history and reports are kept.`,
  ]
  if (preview.devices > 0) {
    lines.push(
      preview.devices === 1
        ? '1 device is signed out and revoked.'
        : `${preview.devices} devices are signed out and revoked.`,
    )
  }
  if (preview.peopleOnlyHere > 0) {
    lines.push(
      preview.peopleOnlyHere === 1
        ? '1 person works only here and will have no hotel until you give them another.'
        : `${preview.peopleOnlyHere} people work only here and will have no hotel until you give them another.`,
    )
  }
  if (preview.invitationsOnlyHere > 0) {
    lines.push(
      preview.invitationsOnlyHere === 1
        ? '1 invite for this hotel alone is cancelled.'
        : `${preview.invitationsOnlyHere} invites for this hotel alone are cancelled.`,
    )
  }
  return lines
}
