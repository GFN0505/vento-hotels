// How devices read on screen: what each kind is for, and when one was last used.
import { DEVICE_KINDS, type DeviceKind } from '@vento/shared'

export const KIND_OPTIONS = (Object.keys(DEVICE_KINDS) as DeviceKind[]).map((kind) => ({
  value: kind,
  label: DEVICE_KINDS[kind].label,
}))

export function lastSeen(iso: string | null): string {
  if (!iso) return 'Not used yet'
  const date = new Date(iso)
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 2) return 'Just now'
  if (minutes < 60) return `${minutes} minutes ago`
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function idleTime(kind: DeviceKind): string {
  const seconds = DEVICE_KINDS[kind].idleSeconds
  return seconds < 120 ? `${seconds} seconds` : `${seconds / 60} minutes`
}

const KIND_CODE: Record<DeviceKind, string> = { front_desk: 'FD', pos: 'POS', housekeeping: 'HK' }

// A short code for a hotel, for example device names: "Kora Abuja" → ABJ, "Kora Victoria Island"
// → VI. The group's brand (the first word) is left out when there's more after it.
export function hotelCode(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  const rest = words.length > 1 ? words.slice(1) : words
  if (rest.length > 1)
    return rest
      .map((word) => word[0]?.toUpperCase())
      .join('')
      .slice(0, 3)
  const word = (rest[0] ?? '').toUpperCase()
  const consonants = word.slice(1).replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, '')
  return (word.slice(0, 1) + consonants).slice(0, 3)
}

// "e.g. FD-ABJ-01": the placeholder for a new device's name, from what it's for and where.
export function exampleName(kind: DeviceKind, hotelName: string | undefined): string {
  return `e.g. ${KIND_CODE[kind]}-${hotelName ? hotelCode(hotelName) : 'VI'}-01`
}
