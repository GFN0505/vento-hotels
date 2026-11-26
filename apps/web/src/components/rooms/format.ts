// Words and colours for rooms screens: bed names, counts, and a colour per room type so the
// builder's preview, its legend and the tables agree. Tokens only (design system).
import type { RoomBed, RoomTypeView } from '@vento/shared'

export const BED_LABELS: Record<RoomBed, string> = {
  king: 'King',
  queen: 'Queen',
  double: 'Double',
  twin: 'Twin',
  single: 'Single',
}

export const BED_OPTIONS = Object.entries(BED_LABELS).map(([value, label]) => ({ value, label }))

export function bedLabel(type: Pick<RoomTypeView, 'bed' | 'sofaBed'>): string {
  return `${BED_LABELS[type.bed]}${type.sofaBed ? ' + sofa bed' : ''}`
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

// Room type colours. Rose is left out: it means a problem (a clash) everywhere else.
const TONES = [
  { chip: 'bg-pri-soft text-pri-ink ring-pri-line', swatch: 'bg-pri' },
  { chip: 'bg-tl-bg text-tl ring-tl-dot/40', swatch: 'bg-tl-dot' },
  { chip: 'bg-am-bg text-am ring-am-dot/40', swatch: 'bg-am-dot' },
  { chip: 'bg-bl-bg text-bl ring-bl-dot/40', swatch: 'bg-bl-dot' },
  { chip: 'bg-fu-bg text-fu ring-fu-dot/40', swatch: 'bg-fu-dot' },
  { chip: 'bg-em-bg text-em ring-em-dot/40', swatch: 'bg-em-dot' },
  { chip: 'bg-sl-bg text-sl ring-sl-dot/50', swatch: 'bg-sl-dot' },
] as const

export type Tone = (typeof TONES)[number]

export function toneAt(index: number): Tone {
  return TONES[((index % TONES.length) + TONES.length) % TONES.length] ?? TONES[0]
}

// Each type keeps its colour for good: the order types were created in (ids are UUID v7, so they
// sort by creation), not the display order, which people can change.
export function toneIndexes(types: readonly { id: string }[]): Map<string, number> {
  return new Map([...types].sort((a, b) => (a.id < b.id ? -1 : 1)).map((t, i) => [t.id, i]))
}

// "Room 412", "Rooms 301, 302 and 303", "Rooms 301, 302, 303 and 5 more". Numbers not loaded yet
// (rooms picked with "Select all in this view") are empty strings and count towards "more".
export function roomNames(numbers: readonly string[]): string {
  const known = numbers.filter(Boolean)
  if (numbers.length === 1 && known[0]) return `Room ${known[0]}`
  const shown = known.slice(0, 3)
  const more = numbers.length - shown.length
  if (shown.length === 0) return `${numbers.length} rooms`
  if (more > 0) return `Rooms ${shown.join(', ')} and ${more} more`
  return `Rooms ${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`
}

// The `data.code` of a rooms API error (ROOM_ERROR_CODES), when there is one.
export function errorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data: unknown }).data
    if (data && typeof data === 'object' && 'code' in data) {
      const code = (data as { code: unknown }).code
      return typeof code === 'string' ? code : undefined
    }
  }
  return undefined
}

// The `data.key` of a rooms API error: which new room type in the builder it's about.
export function errorKey(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data: unknown }).data
    if (data && typeof data === 'object' && 'key' in data) {
      const key = (data as { key: unknown }).key
      return typeof key === 'string' ? key : undefined
    }
  }
  return undefined
}

export const NEEDS_CONNECTION = 'Needs a connection'

// "Floor 4", "Ground floor", "Basement 1".
export function floorName(floor: number): string {
  if (floor === 0) return 'Ground floor'
  if (floor < 0) return `Basement ${-floor}`
  return `Floor ${floor}`
}

// What the rooms table shows under Features: accessible first, then the hotel's own words, then
// the rooms it connects to.
export function featureLine(room: {
  accessible: boolean
  features: readonly string[]
  connectingRooms: readonly { number: string }[]
}): string {
  const parts = [...(room.accessible ? ['Accessible'] : []), ...room.features]
  if (room.connectingRooms.length > 0) {
    parts.push(`connecting ${room.connectingRooms.map((r) => r.number).join(', ')}`)
  }
  return parts.join(' · ')
}
