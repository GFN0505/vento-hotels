// The pure part of "Add rooms by floor": checking type and floor lines as typed, and turning them
// into the preview (numbering comes from expandFloorLines in @vento/shared, as on the API).
import {
  expandFloorLines,
  type FloorLine,
  floorLineSchema,
  MAX_ROOMS_PER_BATCH,
  type RoomBed,
  type RoomTypeView,
  roomTypeCodeSchema,
} from '@vento/shared'

export type DraftType = {
  key: string
  name: string
  code: string
  // Once the person types a code, the name stops suggesting one.
  codeEdited: boolean
  bed: RoomBed
  sofaBed: boolean
  guests: string
}

export type Line = {
  key: string
  typeKey: string
  floorFrom: string
  floorTo: string
  numberFrom: string
  numberTo: string
}

export type TypeOption = { key: string; name: string; toneIndex: number; saved: boolean }

export type LineCheck = {
  value?: FloorLine
  type?: string | undefined
  floors?: string | undefined
  numbers?: string | undefined
}

const whole = (text: string) => (/^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : Number.NaN)

export function checkLine(line: Line): LineCheck {
  const blank = [line.floorFrom, line.floorTo, line.numberFrom, line.numberTo].every(
    (v) => !v.trim(),
  )
  if (blank) return {}
  const values = {
    roomType: line.typeKey,
    floorFrom: whole(line.floorFrom),
    floorTo: whole(line.floorTo),
    numberFrom: whole(line.numberFrom),
    numberTo: whole(line.numberTo),
  }
  const result: LineCheck = {}
  if (!line.typeKey) result.type = 'Choose a room type'
  if (Number.isNaN(values.floorFrom) || Number.isNaN(values.floorTo)) {
    result.floors = 'Enter the floors, like 3 to 6'
  }
  if (Number.isNaN(values.numberFrom) || Number.isNaN(values.numberTo)) {
    result.numbers = 'Enter the numbers, like 01 to 14'
  }
  if (result.type || result.floors || result.numbers) return result
  const parsed = floorLineSchema.safeParse(values)
  if (parsed.success) return { value: parsed.data }
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? '')
    if (field.startsWith('floor')) result.floors ??= issue.message
    else if (field.startsWith('number')) result.numbers ??= issue.message
    else result.type ??= issue.message
  }
  return result
}

export type DraftCheck = { name?: string | undefined; code?: string | undefined; guests?: string }

export function checkDraft(
  draft: DraftType,
  existing: readonly RoomTypeView[],
  others: readonly DraftType[],
): DraftCheck {
  const result: DraftCheck = {}
  const name = draft.name.trim()
  const sameName = (n: string) => n.trim().toLowerCase() === name.toLowerCase()
  if (!name) result.name = 'Enter a name'
  else if (name.length > 60) result.name = 'Keep the name under 60 characters'
  else if (
    existing.some((t) => !t.archivedAt && sameName(t.name)) ||
    others.some((d) => sameName(d.name))
  ) {
    result.name = `${name} already exists at this hotel.`
  }
  const code = roomTypeCodeSchema.safeParse(draft.code)
  if (!code.success) result.code = code.error.issues[0]?.message
  else {
    const saved = existing.find((t) => t.code === code.data)
    const usedBy =
      saved?.name ?? others.find((d) => d.code.trim().toUpperCase() === code.data)?.name
    if (usedBy) {
      result.code = `Code ${code.data} is used by ${usedBy}${saved?.archivedAt ? ', which is archived' : ''}.`
    }
  }
  const guests = whole(draft.guests)
  if (!(guests >= 1 && guests <= 20)) result.guests = 'Enter 1 to 20 guests'
  return result
}

export type PlannedChip = {
  number: string
  floor: number
  // The type it will get, or null when left out.
  typeKey: string | null
  taken?: 'active' | 'archived' | undefined
  duplicate: boolean
}

export function plan(
  values: readonly FloorLine[],
  overrides: ReadonlyMap<string, string | null>,
  taken: ReadonlyMap<string, boolean>,
) {
  const { rooms, duplicates } = expandFloorLines(values)
  const clash = new Set(duplicates)
  const chips: PlannedChip[] = rooms.map((room) => {
    const archived = taken.get(room.number)
    return {
      number: room.number,
      floor: room.floor,
      typeKey: overrides.has(room.number) ? (overrides.get(room.number) ?? null) : room.roomType,
      taken: archived === undefined ? undefined : archived ? 'archived' : 'active',
      duplicate: clash.has(room.number),
    }
  })
  const toCreate = chips.filter((chip) => chip.typeKey && !chip.taken && !chip.duplicate)
  return {
    chips,
    duplicates,
    toCreate,
    tooMany: toCreate.length > MAX_ROOMS_PER_BATCH,
    takenCount: chips.filter((chip) => chip.taken).length,
    leftOut: chips.filter((chip) => !chip.typeKey).length,
  }
}
