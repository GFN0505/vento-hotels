import { describe, expect, it } from 'vitest'
import { filterOptions } from './use-combobox'

const OPTIONS = [
  { value: 'Africa/Lagos', label: 'Africa/Lagos · WAT', group: 'Common' },
  { value: 'Europe/London', label: 'Europe/London · GMT', group: 'Common' },
  { value: 'Eti-Osa', label: 'Eti-Osa' },
]

describe('filterOptions', () => {
  it('keeps every option, in order, until something is typed', () => {
    expect(filterOptions(OPTIONS, '  ').map((o) => o.value)).toEqual([
      'Africa/Lagos',
      'Europe/London',
      'Eti-Osa',
    ])
  })

  it('finds options by any part of their label, whatever the case', () => {
    expect(filterOptions(OPTIONS, 'lagos').map((o) => o.value)).toEqual(['Africa/Lagos'])
    expect(filterOptions(OPTIONS, 'ETI').map((o) => o.value)).toEqual(['Eti-Osa'])
    expect(filterOptions(OPTIONS, 'abuja')).toEqual([])
  })
})
