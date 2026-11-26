// Room types and rooms: field rules, room numbering and the "Add rooms by floor" expansion
// (spec: docs/specs/stage-1-room-types-and-rooms.md). Pure, so the builder's preview and the API
// number rooms exactly the same way.
import { z } from 'zod'

export const ROOM_BEDS = ['king', 'queen', 'double', 'twin', 'single'] as const
export const roomBedSchema = z.enum(ROOM_BEDS)
export type RoomBed = z.infer<typeof roomBedSchema>

export const FRONT_OFFICE_STATUSES = ['vacant', 'occupied'] as const
export const frontOfficeStatusSchema = z.enum(FRONT_OFFICE_STATUSES)
export type FrontOfficeStatus = z.infer<typeof frontOfficeStatusSchema>

// out_of_order and out_of_service are only set from brick 7 (housekeeping and OOO).
export const HOUSEKEEPING_STATUSES = [
  'clean',
  'inspected',
  'dirty',
  'out_of_order',
  'out_of_service',
] as const
export const housekeepingStatusSchema = z.enum(HOUSEKEEPING_STATUSES)
export type HousekeepingStatus = z.infer<typeof housekeepingStatusSchema>

// "Add rooms by floor" and bulk actions take at most this many rooms in one go.
export const MAX_ROOMS_PER_BATCH = 500

export const ROOM_FEATURE_SUGGESTIONS = [
  'City view',
  'Ocean view',
  'Pool view',
  'Near lift',
  'Quiet side',
  'Bathtub',
  'Balcony',
] as const

export const ROOM_TYPE_AMENITY_SUGGESTIONS = [
  'AC',
  'Wi-Fi',
  'Smart TV',
  'Work desk',
  'Kettle',
  'Safe',
  'Minibar',
] as const

// Up to 10 capital letters, digits or hyphens: 412, G01, PH-2. Typed in any case.
export const roomNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{1,10}$/, 'Use up to 10 letters, digits or hyphens, like 412 or PH-2')

export const roomTypeCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,6}$/, 'Use 2 to 6 capital letters or digits, like DLK')

// 0 is the ground floor; minus numbers are basements.
export const floorSchema = z
  .number()
  .int('Enter a whole floor number')
  .min(-9, 'Floors go down to -9')
  .max(199, 'Floors go up to 199')

// A feature or amenity chip: trimmed, single-spaced, short.
const chip = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Enter a word or two').max(40, 'Keep it under 40 characters'))

// Chips are unique case-insensitively; the first spelling wins.
function uniqueChips(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const chipListSchema = z.array(chip).max(30, 'Up to 30').transform(uniqueChips)

// Floor 4, 1 → "401"; floor 11, 1 → "1101"; ground floor → "G01".
export function roomNumberFor(floor: number, n: number): string {
  const digits = String(n).padStart(2, '0')
  return floor === 0 ? `G${digits}` : `${floor}${digits}`
}

export function floorLabel(floor: number): string {
  if (floor === 0) return 'Ground'
  if (floor < 0) return `Basement ${-floor}`
  return String(floor)
}

// Natural order for room numbers: shorter first, so 1014 comes before 1101 and 99 before 101.
export function compareRoomNumbers(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length
  return a < b ? -1 : a > b ? 1 : 0
}

// One line of the builder: a room type, floors from–to and numbers on each floor from–to. The
// builder covers floors 0 and up; basements are added one room at a time.
export const floorLineSchema = z
  .object({
    roomType: z.string().min(1, 'Choose a room type'),
    floorFrom: z.number().int().min(0, 'Start at the ground floor (0) or above').max(199),
    floorTo: z.number().int().min(0).max(199),
    numberFrom: z.number().int().min(1, 'Numbers start at 01').max(99, 'Numbers go up to 99'),
    numberTo: z.number().int().min(1).max(99, 'Numbers go up to 99'),
  })
  .refine((line) => line.floorTo >= line.floorFrom, {
    path: ['floorTo'],
    message: 'That floor is below the first floor.',
  })
  .refine((line) => line.numberTo >= line.numberFrom, {
    path: ['numberTo'],
    message: 'That number is below the first number.',
  })
export type FloorLine = z.infer<typeof floorLineSchema>

export type PlannedRoom = { number: string; floor: number; roomType: string }

// Every room the lines describe, in floor then number order, plus numbers that two lines both make
// (the preview flags those and the Create button stays disabled until they're fixed).
export function expandFloorLines(lines: readonly FloorLine[]): {
  rooms: PlannedRoom[]
  duplicates: string[]
} {
  const rooms: PlannedRoom[] = []
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const line of lines) {
    for (let floor = line.floorFrom; floor <= line.floorTo; floor++) {
      for (let n = line.numberFrom; n <= line.numberTo; n++) {
        const number = roomNumberFor(floor, n)
        if (seen.has(number)) duplicates.add(number)
        seen.add(number)
        rooms.push({ number, floor, roomType: line.roomType })
      }
    }
  }
  rooms.sort((a, b) => a.floor - b.floor || compareRoomNumbers(a.number, b.number))
  return { rooms, duplicates: [...duplicates].sort(compareRoomNumbers) }
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])

// A code suggestion from a type's name: the first word's first letter and next consonant, then
// each later word's initial. Deluxe King → DLK, Standard Queen → STQ, Presidential Suite → PRS.
export function suggestCode(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const [first, ...rest] = words
  if (!first) return ''
  const consonant = [...first.slice(1)].find((ch) => !VOWELS.has(ch)) ?? first[1] ?? ''
  let code = `${first[0]}${consonant}${rest.map((word) => word[0]).join('')}`
  if (code.length < 3 && rest.length === 0) code = first.slice(0, 3)
  return code.slice(0, 6)
}
