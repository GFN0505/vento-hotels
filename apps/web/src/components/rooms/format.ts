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

// Room type colours, in order. Rose is left out: it means a problem (a clash) everywhere else.
const TONES = [
  { chip: 'bg-pri-soft text-pri-ink ring-pri-line', swatch: 'bg-pri' },
  { chip: 'bg-bl-bg text-bl ring-bl-dot/40', swatch: 'bg-bl-dot' },
  { chip: 'bg-em-bg text-em ring-em-dot/40', swatch: 'bg-em-dot' },
  { chip: 'bg-am-bg text-am ring-am-dot/40', swatch: 'bg-am-dot' },
  { chip: 'bg-sl-bg text-sl ring-sl-dot/50', swatch: 'bg-sl-dot' },
] as const

export type Tone = (typeof TONES)[number]

export function toneAt(index: number): Tone {
  return TONES[((index % TONES.length) + TONES.length) % TONES.length] ?? TONES[0]
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
