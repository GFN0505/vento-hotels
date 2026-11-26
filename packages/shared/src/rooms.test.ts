import { describe, expect, it } from 'vitest'
import {
  chipListSchema,
  compareRoomNumbers,
  expandFloorLines,
  floorLabel,
  floorLineSchema,
  roomNumberFor,
  roomNumberSchema,
  roomTypeCodeSchema,
  suggestCode,
} from './rooms.ts'

const line = (
  roomType: string,
  floorFrom: number,
  floorTo: number,
  numberFrom = 1,
  numberTo = 14,
) => ({ roomType, floorFrom, floorTo, numberFrom, numberTo })

describe('room numbers', () => {
  it('numbers rooms as floor plus two digits, with G for the ground floor', () => {
    expect(roomNumberFor(4, 1)).toBe('401')
    expect(roomNumberFor(11, 1)).toBe('1101')
    expect(roomNumberFor(0, 1)).toBe('G01')
    expect(roomNumberFor(3, 14)).toBe('314')
  })

  it('accepts typed numbers in any case and refuses spaces and symbols', () => {
    expect(roomNumberSchema.parse(' ph-2 ')).toBe('PH-2')
    expect(roomNumberSchema.safeParse('4 12').success).toBe(false)
    expect(roomNumberSchema.safeParse('ABCDEFGHIJK').success).toBe(false)
  })

  it('sorts naturally, so 1014 comes before 1101', () => {
    expect(['1101', '1014', '99', '401'].sort(compareRoomNumbers)).toEqual([
      '99',
      '401',
      '1014',
      '1101',
    ])
  })

  it('shows floor 0 as Ground and minus floors as basements', () => {
    expect(floorLabel(0)).toBe('Ground')
    expect(floorLabel(-1)).toBe('Basement 1')
    expect(floorLabel(7)).toBe('7')
  })
})

describe('Add rooms by floor', () => {
  it('expands lines into every room, floor by floor', () => {
    const { rooms, duplicates } = expandFloorLines([line('EXK', 5, 6), line('JRS', 11, 11, 1, 8)])
    expect(rooms).toHaveLength(36)
    expect(rooms[0]).toEqual({ number: '501', floor: 5, roomType: 'EXK' })
    expect(rooms.at(-1)).toEqual({ number: '1108', floor: 11, roomType: 'JRS' })
    expect(duplicates).toEqual([])
  })

  it('flags numbers two lines both make', () => {
    const { duplicates } = expandFloorLines([line('STQ', 4, 4, 1, 5), line('DLK', 4, 4, 5, 9)])
    expect(duplicates).toEqual(['405'])
  })

  it('explains a floor or number range that runs backwards', () => {
    const floors = floorLineSchema.safeParse(line('STQ', 6, 5))
    expect(floors.error?.issues[0]?.message).toBe('That floor is below the first floor.')
    const numbers = floorLineSchema.safeParse(line('STQ', 1, 1, 14, 1))
    expect(numbers.error?.issues[0]?.message).toBe('That number is below the first number.')
  })
})

describe('room type codes and chips', () => {
  it('suggests a code from the name', () => {
    expect(suggestCode('Deluxe King')).toBe('DLK')
    expect(suggestCode('Standard Queen')).toBe('STQ')
    expect(suggestCode('Penthouse')).toBe('PEN')
    expect(suggestCode('')).toBe('')
    expect(
      roomTypeCodeSchema.safeParse(suggestCode('Presidential Suite with Lagoon View')).success,
    ).toBe(true)
  })

  it('upper-cases codes and refuses ones that are too short', () => {
    expect(roomTypeCodeSchema.parse('exk')).toBe('EXK')
    expect(roomTypeCodeSchema.safeParse('D').success).toBe(false)
  })

  it('tidies chips and drops repeats whatever their case', () => {
    expect(chipListSchema.parse(['  City   view', 'city view', 'Bathtub'])).toEqual([
      'City view',
      'Bathtub',
    ])
  })
})
