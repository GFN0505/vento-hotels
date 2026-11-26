import type { RoomTypeView } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { checkDraft, checkLine, type DraftType, type Line, lineNotes, plan } from './builder-model'

const line = (change: Partial<Line> = {}): Line => ({
  key: 'l1',
  typeKey: 'dlk',
  floorFrom: '4',
  floorTo: '4',
  numberFrom: '01',
  numberTo: '14',
  ...change,
})

const draft = (change: Partial<DraftType> = {}): DraftType => ({
  key: 'd1',
  name: 'Deluxe King',
  code: 'DLK',
  codeEdited: false,
  bed: 'king',
  sofaBed: false,
  guests: '3',
  ...change,
})

const saved = { name: 'Standard Queen', code: 'STQ', archivedAt: null } as RoomTypeView

describe('checkLine', () => {
  it('reads a floor line as typed', () => {
    expect(checkLine(line()).value).toMatchObject({ floorFrom: 4, numberFrom: 1, numberTo: 14 })
  })

  it('ignores a line with nothing in it', () => {
    expect(checkLine(line({ floorFrom: '', floorTo: '', numberFrom: '', numberTo: '' }))).toEqual(
      {},
    )
  })

  it('says when the floors or numbers run backwards', () => {
    expect(checkLine(line({ floorFrom: '6', floorTo: '5' })).floors).toBe(
      'That floor is below the first floor.',
    )
    expect(checkLine(line({ numberFrom: '14', numberTo: '01' })).numbers).toBe(
      'That number is below the first number.',
    )
  })

  it('asks for a room type and for missing numbers', () => {
    expect(checkLine(line({ typeKey: '' })).type).toBe('Choose a room type')
    expect(checkLine(line({ numberTo: '' })).numbers).toBe('Enter the numbers, like 01 to 14')
  })
})

describe('checkDraft', () => {
  it('accepts a new type with a free name and code', () => {
    expect(checkDraft(draft(), [saved], [])).toEqual({})
  })

  it('names the type that already uses the name or code', () => {
    expect(checkDraft(draft({ name: 'standard queen' }), [saved], []).name).toBe(
      'standard queen already exists at this hotel.',
    )
    expect(checkDraft(draft({ code: 'STQ' }), [saved], []).code).toBe(
      'Code STQ is used by Standard Queen.',
    )
  })
})

describe('plan', () => {
  const values = [
    checkLine(line()).value,
    checkLine(line({ floorFrom: '5', floorTo: '5' })).value,
  ].filter((v) => v !== undefined)

  it('counts every planned room, minus ones left out or already there', () => {
    const result = plan(values, new Map([['402', null]]), new Map([['401', false]]))
    expect(result.chips).toHaveLength(28)
    expect(result.toCreate).toHaveLength(26)
    expect(result.takenCount).toBe(1)
    expect(result.leftOut).toBe(1)
  })

  it('moves a room to another type when its chip is changed', () => {
    const result = plan(values, new Map([['508', 'jrs']]), new Map())
    expect(result.toCreate.find((chip) => chip.number === '508')?.typeKey).toBe('jrs')
  })

  it('marks numbers two lines both make', () => {
    const twice = [...values, ...values.slice(0, 1)]
    const result = plan(twice, new Map(), new Map())
    expect(result.duplicates).toContain('401')
    expect(result.toCreate.some((chip) => chip.number === '401')).toBe(false)
  })
})

describe('lineNotes', () => {
  it('names the line a line overlaps and counts numbers that already exist', () => {
    const a = { key: 'a', value: checkLine(line({ floorFrom: '11', floorTo: '11' })).value }
    const b = {
      key: 'b',
      value: checkLine(line({ floorFrom: '11', floorTo: '11', numberTo: '10' })).value,
    }
    const notes = lineNotes([a, b], new Map([['1114', false]]))
    expect(notes.get('a')).toBe('Overlaps line 2 (1101–1110) · 1 already exists, skipped')
    expect(notes.get('b')).toBe('Overlaps line 1 (1101–1110)')
  })
})
